/**
 * OPSEC Onboarding API Routes
 * 
 * Guides HUMINT sources through secure registration
 */

import { Hono } from 'hono';
import {
  generateChecklist,
  getPaymentRecommendation,
  OPSEC_GUIDES,
  RiskProfile,
} from '../services/humint/opsec-onboarding';
import { validateZcashAddress, isZcashConfigured, PAYMENT_PRIVACY_LEVELS } from '../services/payments/zcash';
import { validateAddress, SUPPORTED_CHAINS } from '../services/payments/one-click';

const opsec = new Hono();

// ============================================
// OPSEC Guides (Public, no auth needed)
// ============================================

// Get all OPSEC guides
opsec.get('/guides', (c) => {
  return c.json({
    success: true,
    data: OPSEC_GUIDES,
  });
});

// Get specific guide
opsec.get('/guides/:topic', (c) => {
  const { topic } = c.req.param();
  const guide = OPSEC_GUIDES[topic as keyof typeof OPSEC_GUIDES];
  
  if (!guide) {
    return c.json({ success: false, error: 'Guide not found' }, 404);
  }
  
  return c.json({ success: true, data: guide });
});

// ============================================
// Risk Assessment
// ============================================

// Get checklist based on risk profile
opsec.post('/assess', async (c) => {
  try {
    const profile = await c.req.json() as RiskProfile;
    
    // Validate profile
    if (!profile.threatLevel || !profile.location || !profile.consequences) {
      return c.json({ success: false, error: 'Incomplete risk profile' }, 400);
    }
    
    const checklist = generateChecklist(profile);
    const paymentRec = getPaymentRecommendation(profile);
    
    return c.json({
      success: true,
      data: {
        threatLevel: profile.threatLevel,
        checklist,
        paymentRecommendation: paymentRec,
        guides: {
          walletCreation: OPSEC_GUIDES.wallet_creation,
          commonMistakes: OPSEC_GUIDES.common_mistakes,
          ...(profile.location === 'hostile' && { 
            hostileEnvironment: OPSEC_GUIDES.hostile_environment 
          }),
        },
      },
    });
  } catch (error) {
    console.error('Risk assessment error:', error);
    return c.json({ success: false, error: 'Assessment failed' }, 500);
  }
});

// ============================================
// Payment Privacy Info
// ============================================

// Get payment privacy levels
opsec.get('/payment-privacy', (c) => {
  return c.json({
    success: true,
    data: {
      levels: PAYMENT_PRIVACY_LEVELS,
      guide: OPSEC_GUIDES.payment_privacy,
      zcashConfigured: isZcashConfigured(),
    },
  });
});

// Get payment options sorted by privacy
opsec.get('/payment-options', (c) => {
  const options = [
    {
      id: 'zec-shielded',
      name: 'Zcash Shielded (z-address)',
      chain: 'zec',
      privacyLevel: 5,
      description: 'Maximum privacy. Sender, receiver, and amount are all hidden.',
      addressFormat: 'zs1... (78 characters)',
      configured: isZcashConfigured(), // Requires direct ZEC wallet, not 1Click
      recommended: true,
      note: 'Requires direct ZEC payout (z-address). Contact support for setup.',
    },
    {
      id: 'zec-transparent',
      name: 'Zcash via 1Click (t-address)',
      chain: 'zec',
      privacyLevel: 2,
      description: 'ZEC payout via NEAR Intents. Uses transparent addresses - visible on blockchain.',
      addressFormat: 't1... or t3... (35 characters)',
      configured: true,
      recommended: false,
      warning: '⚠️ Transparent ZEC is like Bitcoin - chain analysis possible. Use z-address for privacy.',
    },
    {
      id: 'xmr',
      name: 'Monero',
      chain: 'xmr',
      privacyLevel: 4,
      description: 'Very strong privacy by default.',
      addressFormat: '4... or 8... (95 characters)',
      configured: false, // Not yet implemented
      recommended: true,
      note: 'Coming soon - Monero integration pending',
    },
    ...SUPPORTED_CHAINS.filter(c => !['near', 'zec'].includes(c.id)).map(chain => ({
      id: chain.id,
      name: chain.name,
      chain: chain.id,
      privacyLevel: ['btc', 'ltc'].includes(chain.id) ? 2 : 1,
      description: `Transparent blockchain. Chain analysis possible.`,
      configured: true,
      recommended: false,
      warning: '⚠️ Not recommended for high-risk sources',
    })),
  ].sort((a, b) => b.privacyLevel - a.privacyLevel);
  
  return c.json({ success: true, data: options });
});

// ============================================
// Address Validation with Privacy Warning
// ============================================

opsec.post('/validate-address', async (c) => {
  try {
    const { address, chain } = await c.req.json();
    
    if (!address || !chain) {
      return c.json({ success: false, error: 'Address and chain required' }, 400);
    }
    
    let result: {
      valid: boolean;
      type?: string;
      privacyLevel: number;
      warning?: string;
      recommendation?: string;
    };
    
    // Special handling for Zcash
    if (chain === 'zec') {
      const zcashResult = validateZcashAddress(address);
      result = {
        valid: zcashResult.valid,
        type: zcashResult.type,
        privacyLevel: zcashResult.type === 'shielded' ? 5 : 2,
        warning: zcashResult.warning,
        recommendation: zcashResult.type === 'transparent' 
          ? 'Use a z-address (starting with zs1) for privacy'
          : undefined,
      };
    } else {
      // Other chains via 1Click
      const isValid = validateAddress(address, chain);
      const privacyLevel = PAYMENT_PRIVACY_LEVELS[chain as keyof typeof PAYMENT_PRIVACY_LEVELS]?.level || 1;
      
      result = {
        valid: isValid,
        privacyLevel,
        warning: privacyLevel <= 2 
          ? `⚠️ ${chain.toUpperCase()} transactions are visible on the blockchain and can be traced with chain analysis.`
          : undefined,
        recommendation: privacyLevel <= 2
          ? 'Consider using ZEC shielded (z-address) for better privacy'
          : undefined,
      };
    }
    
    return c.json({
      success: true,
      data: {
        address,
        chain,
        ...result,
      },
    });
  } catch (error) {
    console.error('Address validation error:', error);
    return c.json({ success: false, error: 'Validation failed' }, 500);
  }
});

// ============================================
// Connection Safety Check
// ============================================

// Check if user is connecting safely (Tor, VPN, etc.)
opsec.get('/connection-check', (c) => {
  const headers = c.req.header();
  const ip = headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown';
  
  // Check for Tor exit nodes (simplified - real implementation would check against Tor exit list)
  const isTor = ip.includes('.onion') || headers['x-tor-user'] === 'true';
  
  // Check for common VPN/proxy headers
  const hasProxy = !!(
    headers['x-forwarded-for'] ||
    headers['via'] ||
    headers['x-proxy-id']
  );
  
  // WARNING: This is informational only - sophisticated adversaries can spoof headers
  return c.json({
    success: true,
    data: {
      ip: ip.split(',')[0].trim(), // First IP in chain
      isTor,
      hasProxy,
      recommendation: !isTor && !hasProxy
        ? '⚠️ Consider using Tor Browser for better anonymity'
        : '✓ Connection appears to be proxied',
      warning: 'This check is informational only. Use Tor Browser for best protection.',
    },
  });
});

export default opsec;
