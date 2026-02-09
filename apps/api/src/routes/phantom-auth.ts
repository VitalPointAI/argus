/**
 * Phantom Auth Routes for Hono
 * 
 * Bridges the Express-based @vitalpoint/near-phantom-auth to Hono
 */

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { 
  getPhantomAuth, 
  isPhantomAuthInitialized,
  type PhantomUser,
  type PhantomSession 
} from '../services/auth/phantom-auth';

const phantomRoutes = new Hono();

// Debug route - test if phantomRoutes are working
phantomRoutes.get('/ping', (c) => {
  return c.json({ pong: true, timestamp: Date.now() });
});

// ============================================
// Helper to check initialization
// ============================================

function checkPhantomInitialized(): boolean {
  return isPhantomAuthInitialized();
}

// ============================================
// Registration
// ============================================

// NATO phonetic alphabet for codename generation
const NATO_ALPHABET = [
  'ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL',
  'INDIA', 'JULIET', 'KILO', 'LIMA', 'MIKE', 'NOVEMBER', 'OSCAR', 'PAPA',
  'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO', 'UNIFORM', 'VICTOR', 'WHISKEY',
  'XRAY', 'YANKEE', 'ZULU'
];

function generateCodename(): string {
  const word = NATO_ALPHABET[Math.floor(Math.random() * NATO_ALPHABET.length)];
  const num = Math.floor(Math.random() * 100);
  return `${word}-${num}`;
}

/**
 * POST /phantom/register/start
 * Start passkey registration
 */
phantomRoutes.post('/register/start', async (c) => {
  if (!checkPhantomInitialized()) {
    return c.json({ error: 'Phantom Auth not initialized' }, 503);
  }

  try {
    const auth = getPhantomAuth();
    
    // Generate a temp user ID for this registration attempt
    const tempUserId = crypto.randomUUID();
    
    // Generate codename for this user
    const codename = generateCodename();
    
    const { challengeId, options } = await auth.passkeyManager.startRegistration(
      tempUserId,
      codename // Use codename as display name
    );
    
    return c.json({
      challengeId,
      options,
      codename,
    });
  } catch (error) {
    console.error('[PhantomAuth] Registration start error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    return c.json({ 
      error: 'Registration failed',
      debug: { message: errMsg, stack: errStack?.split('\n').slice(0, 5) }
    }, 500);
  }
});

/**
 * POST /phantom/register/finish
 * Complete passkey registration
 */
phantomRoutes.post('/register/finish', async (c) => {
  if (!checkPhantomInitialized()) { return c.json({ error: 'Phantom Auth not initialized' }, 503); }

  try {
    const auth = getPhantomAuth();
    const body = await c.req.json();
    const { challengeId, response, codename } = body;

    if (!challengeId || !response || !codename) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Verify passkey - returns passkey data but doesn't save (user doesn't exist yet)
    const { verified, passkeyData, tempUserId } = await auth.passkeyManager.finishRegistration(
      challengeId,
      response
    );

    if (!verified || !passkeyData || !tempUserId) {
      return c.json({ error: 'Passkey verification failed' }, 400);
    }

    // Create NEAR account via MPC
    const mpcAccount = await auth.mpcManager.createAccount(tempUserId);

    // Create user first (so foreign key works)
    const user = await auth.db.createUser({
      codename,
      nearAccountId: mpcAccount.nearAccountId,
      mpcPublicKey: mpcAccount.mpcPublicKey,
      derivationPath: mpcAccount.derivationPath,
    });

    // Now create passkey (user exists, foreign key is valid)
    await auth.db.createPasskey({
      credentialId: passkeyData.credentialId,
      userId: user.id,
      publicKey: passkeyData.publicKey,
      counter: passkeyData.counter,
      deviceType: passkeyData.deviceType,
      backedUp: passkeyData.backedUp,
      transports: passkeyData.transports,
    });

    // Create session
    const session = await auth.db.createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ipAddress: c.req.header('x-forwarded-for') || undefined,
      userAgent: c.req.header('user-agent') || undefined,
    });

    // Set session cookie
    setCookie(c, 'phantom_session', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return c.json({
      success: true,
      codename: user.codename,
      nearAccountId: user.nearAccountId,
    });
  } catch (error) {
    console.error('[PhantomAuth] Registration finish error:', error);
    return c.json({ error: 'Registration failed' }, 500);
  }
});

// ============================================
// Authentication
// ============================================

/**
 * POST /phantom/login/start
 * Start passkey authentication
 */
phantomRoutes.post('/login/start', async (c) => {
  if (!checkPhantomInitialized()) { return c.json({ error: 'Phantom Auth not initialized' }, 503); }

  try {
    const auth = getPhantomAuth();
    const body = await c.req.json().catch(() => ({}));
    const { codename } = body;

    let userId: string | undefined;
    if (codename) {
      const user = await auth.db.getUserByCodename(codename);
      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }
      userId = user.id;
    }

    const { challengeId, options } = await auth.passkeyManager.startAuthentication(userId);

    return c.json({ challengeId, options });
  } catch (error) {
    console.error('[PhantomAuth] Login start error:', error);
    return c.json({ error: 'Login failed' }, 500);
  }
});

/**
 * POST /phantom/login/finish
 * Complete passkey authentication
 */
phantomRoutes.post('/login/finish', async (c) => {
  if (!checkPhantomInitialized()) { return c.json({ error: 'Phantom Auth not initialized' }, 503); }

  try {
    const auth = getPhantomAuth();
    const body = await c.req.json();
    const { challengeId, response } = body;

    if (!challengeId || !response) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const { verified, userId } = await auth.passkeyManager.finishAuthentication(
      challengeId,
      response
    );

    if (!verified || !userId) {
      return c.json({ error: 'Authentication failed' }, 401);
    }

    const user = await auth.db.getUserById(userId);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Create session
    const session = await auth.db.createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ipAddress: c.req.header('x-forwarded-for') || undefined,
      userAgent: c.req.header('user-agent') || undefined,
    });

    // Set session cookie
    setCookie(c, 'phantom_session', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return c.json({
      success: true,
      codename: user.codename,
    });
  } catch (error) {
    console.error('[PhantomAuth] Login finish error:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
});

/**
 * POST /phantom/logout
 * End session
 */
phantomRoutes.post('/logout', async (c) => {
  if (!checkPhantomInitialized()) { return c.json({ error: 'Phantom Auth not initialized' }, 503); }

  try {
    const auth = getPhantomAuth();
    const sessionId = getCookie(c, 'phantom_session');

    if (sessionId) {
      await auth.db.deleteSession(sessionId);
    }

    deleteCookie(c, 'phantom_session', { path: '/' });

    return c.json({ success: true });
  } catch (error) {
    console.error('[PhantomAuth] Logout error:', error);
    return c.json({ error: 'Logout failed' }, 500);
  }
});

/**
 * GET /phantom/session
 * Get current session
 */
phantomRoutes.get('/session', async (c) => {
  if (!checkPhantomInitialized()) { return c.json({ error: 'Phantom Auth not initialized' }, 503); }

  try {
    const auth = getPhantomAuth();
    const sessionId = getCookie(c, 'phantom_session');

    if (!sessionId) {
      return c.json({ authenticated: false });
    }

    const session = await auth.db.getSession(sessionId);
    if (!session || session.expiresAt < new Date()) {
      deleteCookie(c, 'phantom_session', { path: '/' });
      return c.json({ authenticated: false });
    }

    const user = await auth.db.getUserById(session.userId);
    if (!user) {
      return c.json({ authenticated: false });
    }

    return c.json({
      authenticated: true,
      codename: user.codename,
      nearAccountId: user.nearAccountId,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('[PhantomAuth] Session check error:', error);
    return c.json({ error: 'Session check failed' }, 500);
  }
});

// ============================================
// Recovery: Wallet
// ============================================

phantomRoutes.post('/recovery/wallet/link', async (c) => {
  if (!checkPhantomInitialized()) { return c.json({ error: 'Phantom Auth not initialized' }, 503); }

  try {
    const auth = getPhantomAuth();
    
    // Require authenticated session
    const sessionId = getCookie(c, 'phantom_session');
    if (!sessionId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const session = await auth.db.getSession(sessionId);
    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    if (!auth.walletRecovery) {
      return c.json({ error: 'Wallet recovery not enabled' }, 400);
    }

    const { challenge, expiresAt } = auth.walletRecovery.generateLinkChallenge();

    return c.json({
      challenge,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('[PhantomAuth] Wallet link error:', error);
    return c.json({ error: 'Failed to start wallet link' }, 500);
  }
});

phantomRoutes.post('/recovery/wallet/verify', async (c) => {
  if (!checkPhantomInitialized()) { return c.json({ error: 'Phantom Auth not initialized' }, 503); }

  try {
    const auth = getPhantomAuth();
    const body = await c.req.json();
    const { signature, challenge, walletAccountId } = body;

    if (!signature || !challenge || !walletAccountId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const sessionId = getCookie(c, 'phantom_session');
    if (!sessionId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const session = await auth.db.getSession(sessionId);
    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    if (!auth.walletRecovery) {
      return c.json({ error: 'Wallet recovery not enabled' }, 400);
    }

    const { verified } = auth.walletRecovery.verifyLinkSignature(signature, challenge);
    if (!verified) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const user = await auth.db.getUserById(session.userId);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Add wallet as recovery on-chain
    await auth.mpcManager.addRecoveryWallet(user.nearAccountId, walletAccountId);

    // Store reference (just that recovery is enabled, not the wallet ID)
    await auth.db.storeRecoveryData({
      userId: user.id,
      type: 'wallet',
      reference: 'enabled',
      createdAt: new Date(),
    });

    return c.json({
      success: true,
      message: 'Wallet linked for recovery',
    });
  } catch (error) {
    console.error('[PhantomAuth] Wallet verify error:', error);
    return c.json({ error: 'Failed to verify wallet' }, 500);
  }
});

// ============================================
// Recovery: IPFS
// ============================================

phantomRoutes.post('/recovery/ipfs/setup', async (c) => {
  if (!checkPhantomInitialized()) { return c.json({ error: 'Phantom Auth not initialized' }, 503); }

  try {
    const auth = getPhantomAuth();
    const body = await c.req.json();
    const { password } = body;

    if (!password) {
      return c.json({ error: 'Password required' }, 400);
    }

    const sessionId = getCookie(c, 'phantom_session');
    if (!sessionId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const session = await auth.db.getSession(sessionId);
    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    if (!auth.ipfsRecovery) {
      return c.json({ error: 'IPFS recovery not configured' }, 400);
    }

    // Validate password
    const validation = auth.ipfsRecovery.validatePassword(password);
    if (!validation.valid) {
      return c.json({
        error: 'Password too weak',
        details: validation.errors,
        strength: validation.strength,
      }, 400);
    }

    const user = await auth.db.getUserById(session.userId);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Create and pin backup
    const { cid } = await auth.ipfsRecovery.createRecoveryBackup(
      {
        userId: user.id,
        nearAccountId: user.nearAccountId,
        derivationPath: user.derivationPath,
        createdAt: Date.now(),
      },
      password
    );

    // Store CID reference
    await auth.db.storeRecoveryData({
      userId: user.id,
      type: 'ipfs',
      reference: cid,
      createdAt: new Date(),
    });

    return c.json({
      success: true,
      cid,
      message: 'Save this CID with your password. You need both to recover.',
    });
  } catch (error) {
    console.error('[PhantomAuth] IPFS setup error:', error);
    return c.json({ error: 'Failed to create backup' }, 500);
  }
});

phantomRoutes.post('/recovery/ipfs/recover', async (c) => {
  if (!checkPhantomInitialized()) { return c.json({ error: 'Phantom Auth not initialized' }, 503); }

  try {
    const auth = getPhantomAuth();
    const body = await c.req.json();
    const { cid, password } = body;

    if (!cid || !password) {
      return c.json({ error: 'CID and password required' }, 400);
    }

    if (!auth.ipfsRecovery) {
      return c.json({ error: 'IPFS recovery not configured' }, 400);
    }

    // Decrypt backup
    let payload;
    try {
      payload = await auth.ipfsRecovery.recoverFromBackup(cid, password);
    } catch {
      return c.json({ error: 'Invalid password or CID' }, 401);
    }

    // Find user
    const user = await auth.db.getUserById(payload.userId);
    if (!user) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Create session
    const session = await auth.db.createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ipAddress: c.req.header('x-forwarded-for') || undefined,
      userAgent: c.req.header('user-agent') || undefined,
    });

    // Set session cookie
    setCookie(c, 'phantom_session', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return c.json({
      success: true,
      codename: user.codename,
      message: 'Recovery successful. You can now register a new passkey.',
    });
  } catch (error) {
    console.error('[PhantomAuth] IPFS recovery error:', error);
    return c.json({ error: 'Recovery failed' }, 500);
  }
});

// ============================================
// Middleware Helper
// ============================================

/**
 * Get authenticated phantom user from request
 */
export async function getPhantomUser(c: any): Promise<PhantomUser | null> {
  if (!isPhantomAuthInitialized()) {
    return null;
  }

  try {
    const auth = getPhantomAuth();
    const sessionId = getCookie(c, 'phantom_session');

    if (!sessionId) {
      return null;
    }

    const session = await auth.db.getSession(sessionId);
    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    const user = await auth.db.getUserById(session.userId);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      codename: user.codename,
      nearAccountId: user.nearAccountId,
      mpcPublicKey: user.mpcPublicKey,
      derivationPath: user.derivationPath,
    };
  } catch {
    return null;
  }
}

/**
 * Middleware that requires phantom authentication
 */
export async function requirePhantomAuth(c: any, next: () => Promise<void>): Promise<Response | void> {
  const user = await getPhantomUser(c);
  if (!user) {
    return c.json({ error: 'Phantom authentication required' }, 401);
  }
  c.set('phantomUser', user);
  await next();
}

export default phantomRoutes;
