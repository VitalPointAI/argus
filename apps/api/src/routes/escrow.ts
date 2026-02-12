import { Hono } from 'hono';
import { db } from '../db';
import { 
  humintSources, 
  humintEscrowBalances, 
  humintWithdrawalQueue,
  humintEscrowTransactions,
  sourcePaymentAddresses
} from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { processWithdrawals, getPayoutStatus } from '../services/payments/zec-payout-worker';

const app = new Hono();

// Fixed denominations for privacy
const DENOMINATIONS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25];

// Helper: Calculate denominations for an amount
function calculateDenominations(amount: number): number[] {
  const result: number[] = [];
  let remaining = amount;
  
  const sortedDenoms = [...DENOMINATIONS].sort((a, b) => b - a);
  
  for (const denom of sortedDenoms) {
    while (remaining >= denom - 0.001) {
      result.push(denom);
      remaining -= denom;
      remaining = Math.round(remaining * 1000) / 1000;
    }
  }
  
  return result;
}

// Helper: Generate random delay (1-48 hours in ms)
function randomDelay(): number {
  const minHours = 1;
  const maxHours = 48;
  const hours = Math.random() * (maxHours - minHours) + minHours;
  return hours * 60 * 60 * 1000;
}

// Get escrow balance for authenticated HUMINT source
app.get('/balance', async (c) => {
  const sourceId = c.get('humintSourceId');
  if (!sourceId) {
    return c.json({ success: false, error: 'Not authenticated as HUMINT source' }, 401);
  }
  
  try {
    // Get or create escrow balance
    let [balance] = await db
      .select()
      .from(humintEscrowBalances)
      .where(eq(humintEscrowBalances.sourceId, sourceId));
    
    if (!balance) {
      // Create new balance record
      [balance] = await db
        .insert(humintEscrowBalances)
        .values({ sourceId })
        .returning();
    }
    
    // Get pending withdrawal if any
    const [pendingWithdrawal] = await db
      .select()
      .from(humintWithdrawalQueue)
      .where(and(
        eq(humintWithdrawalQueue.sourceId, sourceId),
        eq(humintWithdrawalQueue.status, 'pending')
      ))
      .limit(1);
    
    // Get z-address if set
    const [zAddressRecord] = await db
      .select()
      .from(sourcePaymentAddresses)
      .where(and(
        eq(sourcePaymentAddresses.sourceId, sourceId),
        sql`${sourcePaymentAddresses.address} LIKE 'zs1%'`
      ))
      .limit(1);
    
    return c.json({
      success: true,
      data: {
        escrowBalance: balance.balanceZec,
        totalEarned: balance.totalEarnedZec,
        totalWithdrawn: balance.totalWithdrawnZec,
        hasWallet: !!zAddressRecord,
        zAddress: zAddressRecord?.address || null,
        pendingWithdrawal: pendingWithdrawal ? {
          id: pendingWithdrawal.id,
          amount: pendingWithdrawal.amountZec,
          scheduledFor: pendingWithdrawal.scheduledFor,
          status: pendingWithdrawal.status,
        } : null,
      },
    });
  } catch (error) {
    console.error('Failed to get escrow balance:', error);
    return c.json({ success: false, error: 'Failed to get balance' }, 500);
  }
});

// Get transaction history
app.get('/transactions', async (c) => {
  const sourceId = c.get('humintSourceId');
  if (!sourceId) {
    return c.json({ success: false, error: 'Not authenticated as HUMINT source' }, 401);
  }
  
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');
  
  try {
    const transactions = await db
      .select()
      .from(humintEscrowTransactions)
      .where(eq(humintEscrowTransactions.sourceId, sourceId))
      .orderBy(sql`${humintEscrowTransactions.createdAt} DESC`)
      .limit(limit)
      .offset(offset);
    
    return c.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    console.error('Failed to get transactions:', error);
    return c.json({ success: false, error: 'Failed to get transactions' }, 500);
  }
});

// Register wallet z-address
app.post('/wallet', async (c) => {
  const sourceId = c.get('humintSourceId');
  if (!sourceId) {
    return c.json({ success: false, error: 'Not authenticated as HUMINT source' }, 401);
  }
  
  try {
    const { zAddress } = await c.req.json();
    
    // Validate z-address format (shielded addresses start with zs1)
    if (!zAddress || !zAddress.startsWith('zs1') || zAddress.length < 70) {
      return c.json({ 
        success: false, 
        error: 'Invalid shielded address. Must start with zs1 and be a valid Sapling address.' 
      }, 400);
    }
    
    // Check if address already exists for this source
    const existing = await db
      .select()
      .from(sourcePaymentAddresses)
      .where(and(
        eq(sourcePaymentAddresses.sourceId, sourceId),
        eq(sourcePaymentAddresses.address, zAddress)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      return c.json({ success: true, message: 'Address already registered' });
    }
    
    // Insert new address
    await db.insert(sourcePaymentAddresses).values({
      sourceId,
      address: zAddress,
      chain: 'zcash',
      isPrimary: true,
    });
    
    return c.json({ success: true, message: 'Wallet address registered' });
  } catch (error) {
    console.error('Failed to register wallet:', error);
    return c.json({ success: false, error: 'Failed to register wallet' }, 500);
  }
});

// Request withdrawal
app.post('/withdraw', async (c) => {
  const sourceId = c.get('humintSourceId');
  if (!sourceId) {
    return c.json({ success: false, error: 'Not authenticated as HUMINT source' }, 401);
  }
  
  try {
    const { amount, zAddress } = await c.req.json();
    
    // Validate amount
    if (!amount || amount <= 0) {
      return c.json({ success: false, error: 'Invalid amount' }, 400);
    }
    
    // Validate z-address
    if (!zAddress || !zAddress.startsWith('zs1') || zAddress.length < 70) {
      return c.json({ 
        success: false, 
        error: 'Invalid shielded address. Must start with zs1.' 
      }, 400);
    }
    
    // Check for existing pending withdrawal
    const [pendingWithdrawal] = await db
      .select()
      .from(humintWithdrawalQueue)
      .where(and(
        eq(humintWithdrawalQueue.sourceId, sourceId),
        eq(humintWithdrawalQueue.status, 'pending')
      ))
      .limit(1);
    
    if (pendingWithdrawal) {
      return c.json({ 
        success: false, 
        error: 'You already have a pending withdrawal. Please wait for it to complete.' 
      }, 400);
    }
    
    // Get escrow balance
    const [balance] = await db
      .select()
      .from(humintEscrowBalances)
      .where(eq(humintEscrowBalances.sourceId, sourceId));
    
    if (!balance || balance.balanceZec < amount) {
      return c.json({ 
        success: false, 
        error: `Insufficient balance. Available: ${balance?.balanceZec || 0} ZEC` 
      }, 400);
    }
    
    // Calculate denominations
    const denominations = calculateDenominations(amount);
    const denomTotal = denominations.reduce((a, b) => a + b, 0);
    
    if (denomTotal < amount * 0.99) { // Allow 1% tolerance
      return c.json({ 
        success: false, 
        error: `Amount cannot be fully represented in fixed denominations. Maximum: ${denomTotal} ZEC` 
      }, 400);
    }
    
    // Calculate scheduled time (random 1-48 hours from now)
    const scheduledFor = new Date(Date.now() + randomDelay());
    
    // Start transaction
    // Deduct from escrow balance
    const newBalance = balance.balanceZec - denomTotal;
    
    await db
      .update(humintEscrowBalances)
      .set({ 
        balanceZec: newBalance,
        totalWithdrawnZec: balance.totalWithdrawnZec + denomTotal,
        updatedAt: new Date(),
      })
      .where(eq(humintEscrowBalances.sourceId, sourceId));
    
    // Create withdrawal record
    const [withdrawal] = await db
      .insert(humintWithdrawalQueue)
      .values({
        sourceId,
        amountZec: denomTotal,
        denominations: JSON.stringify(denominations),
        recipientZAddress: zAddress,
        scheduledFor,
      })
      .returning();
    
    // Record transaction
    await db.insert(humintEscrowTransactions).values({
      sourceId,
      type: 'debit',
      amountZec: denomTotal,
      referenceType: 'withdrawal',
      referenceId: withdrawal.id,
      balanceAfter: newBalance,
      note: `Withdrawal queued for ${scheduledFor.toISOString()}`,
    });
    
    // Save z-address if not already saved
    const existingAddress = await db
      .select()
      .from(sourcePaymentAddresses)
      .where(and(
        eq(sourcePaymentAddresses.sourceId, sourceId),
        eq(sourcePaymentAddresses.address, zAddress)
      ))
      .limit(1);
    
    if (existingAddress.length === 0) {
      await db.insert(sourcePaymentAddresses).values({
        sourceId,
        address: zAddress,
        chain: 'zcash',
        isPrimary: true,
      });
    }
    
    return c.json({
      success: true,
      data: {
        withdrawalId: withdrawal.id,
        amount: denomTotal,
        denominations,
        scheduledFor: scheduledFor.toISOString(),
        estimatedArrival: scheduledFor.toLocaleDateString(),
      },
    });
  } catch (error) {
    console.error('Failed to process withdrawal:', error);
    return c.json({ success: false, error: 'Failed to process withdrawal' }, 500);
  }
});

// Get withdrawal status
app.get('/withdraw/:id', async (c) => {
  const sourceId = c.get('humintSourceId');
  if (!sourceId) {
    return c.json({ success: false, error: 'Not authenticated as HUMINT source' }, 401);
  }
  
  const withdrawalId = c.req.param('id');
  
  try {
    const [withdrawal] = await db
      .select()
      .from(humintWithdrawalQueue)
      .where(and(
        eq(humintWithdrawalQueue.id, withdrawalId),
        eq(humintWithdrawalQueue.sourceId, sourceId)
      ));
    
    if (!withdrawal) {
      return c.json({ success: false, error: 'Withdrawal not found' }, 404);
    }
    
    return c.json({
      success: true,
      data: {
        id: withdrawal.id,
        amount: withdrawal.amountZec,
        denominations: withdrawal.denominations,
        status: withdrawal.status,
        scheduledFor: withdrawal.scheduledFor,
        processedAt: withdrawal.processedAt,
        completedAt: withdrawal.completedAt,
        txIds: withdrawal.txIds,
        error: withdrawal.errorMessage,
      },
    });
  } catch (error) {
    console.error('Failed to get withdrawal:', error);
    return c.json({ success: false, error: 'Failed to get withdrawal' }, 500);
  }
});

// Admin: Credit escrow balance (for bounty payouts, etc.)
app.post('/credit', async (c) => {
  // This would be called internally when a bounty is fulfilled
  // Should be protected by admin auth or internal-only access
  
  const apiKey = c.req.header('X-Internal-Key');
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  
  try {
    const { sourceId, amount, referenceType, referenceId, note } = await c.req.json();
    
    if (!sourceId || !amount || amount <= 0) {
      return c.json({ success: false, error: 'Invalid sourceId or amount' }, 400);
    }
    
    // Get or create balance
    let [balance] = await db
      .select()
      .from(humintEscrowBalances)
      .where(eq(humintEscrowBalances.sourceId, sourceId));
    
    if (!balance) {
      [balance] = await db
        .insert(humintEscrowBalances)
        .values({ sourceId })
        .returning();
    }
    
    // Update balance
    const newBalance = balance.balanceZec + amount;
    
    await db
      .update(humintEscrowBalances)
      .set({
        balanceZec: newBalance,
        totalEarnedZec: balance.totalEarnedZec + amount,
        updatedAt: new Date(),
      })
      .where(eq(humintEscrowBalances.sourceId, sourceId));
    
    // Record transaction
    await db.insert(humintEscrowTransactions).values({
      sourceId,
      type: 'credit',
      amountZec: amount,
      referenceType,
      referenceId,
      balanceAfter: newBalance,
      note,
    });
    
    return c.json({
      success: true,
      data: { newBalance },
    });
  } catch (error) {
    console.error('Failed to credit escrow:', error);
    return c.json({ success: false, error: 'Failed to credit escrow' }, 500);
  }
});

// Admin: Get payout system status
app.get('/admin/status', async (c) => {
  const apiKey = c.req.header('X-Internal-Key');
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  
  try {
    const status = await getPayoutStatus();
    return c.json({ success: true, data: status });
  } catch (error) {
    console.error('Failed to get payout status:', error);
    return c.json({ success: false, error: 'Failed to get status' }, 500);
  }
});

// Admin: Manually trigger payout processing
app.post('/admin/process', async (c) => {
  const apiKey = c.req.header('X-Internal-Key');
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  
  try {
    const result = await processWithdrawals();
    return c.json({ success: true, data: result });
  } catch (error) {
    console.error('Failed to process payouts:', error);
    return c.json({ success: false, error: 'Failed to process payouts' }, 500);
  }
});

export default app;
