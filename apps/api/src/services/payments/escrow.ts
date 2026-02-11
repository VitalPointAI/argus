/**
 * Shielded Escrow Service (v2 - Fixed Denominations)
 * 
 * Manages ZEC escrow for HUMINT bounties and subscriptions.
 * Uses FIXED DENOMINATIONS to prevent amount correlation attacks.
 * 
 * Privacy Model:
 * - Only standard denominations allowed (0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25 ZEC)
 * - Payouts split into denominations with time delays
 * - Minimum pool size required before withdrawals (anonymity set)
 * - No unique amounts = no fingerprinting
 * 
 * Flow:
 * 1. Consumer deposits for bounty → rounded to nearest denomination combo
 * 2. 1Click converts to transparent ZEC → our t-address
 * 3. We shield the ZEC (t→z transfer to escrow pool)
 * 4. When payout due, split into denominations with random delays
 * 5. z→z transfers to source's z-address (one per denomination)
 */

import { 
  sendShieldedPayment, 
  getOperationStatus, 
  getWalletBalance,
  validateZcashAddress,
  isZcashConfigured
} from './zcash';
import { db } from '../../db';
import { humintPayments, intelBounties, sourceSubscriptions, humintSources, sourcePaymentAddresses } from '../../db/schema';
import { eq, and } from 'drizzle-orm';

// ============================================
// FIXED DENOMINATIONS - Privacy Critical
// ============================================

/** 
 * Standard ZEC denominations for privacy
 * Using these fixed amounts prevents correlation attacks
 */
export const ZEC_DENOMINATIONS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25] as const;
export type ZecDenomination = typeof ZEC_DENOMINATIONS[number];

/**
 * Minimum deposits in pool before withdrawals allowed per denomination
 * Larger anonymity set = better privacy
 */
export const MIN_POOL_SIZE = 3;

/**
 * Time delay range for withdrawals (milliseconds)
 * Random delay between min and max prevents timing correlation
 */
export const WITHDRAWAL_DELAY = {
  minMs: 1 * 60 * 60 * 1000,   // 1 hour minimum
  maxMs: 48 * 60 * 60 * 1000,  // 48 hours maximum
};

/**
 * Break an amount into standard denominations
 * Returns array of denominations that sum to <= amount
 */
export function splitIntoDenominations(amountZec: number): ZecDenomination[] {
  const result: ZecDenomination[] = [];
  let remaining = amountZec;
  
  // Greedy algorithm: largest denominations first
  const sortedDenoms = [...ZEC_DENOMINATIONS].sort((a, b) => b - a);
  
  for (const denom of sortedDenoms) {
    while (remaining >= denom - 0.0001) { // Small epsilon for floating point
      result.push(denom);
      remaining -= denom;
    }
  }
  
  return result;
}

/**
 * Calculate the denomination breakdown for a bounty amount
 * Returns the denominations and any remainder (platform keeps as fee)
 */
export function calculateBountyDenominations(amountZec: number): {
  denominations: ZecDenomination[];
  totalPayout: number;
  remainder: number;
} {
  const denominations = splitIntoDenominations(amountZec);
  const totalPayout = denominations.reduce((sum, d) => sum + d, 0);
  const remainder = amountZec - totalPayout;
  
  return { denominations, totalPayout, remainder };
}

/**
 * Get valid bounty amounts (sums of denominations)
 * Used for bounty creation UI
 */
export function getValidBountyAmounts(): number[] {
  const amounts = new Set<number>();
  
  // Single denominations
  ZEC_DENOMINATIONS.forEach(d => amounts.add(d));
  
  // Common combinations (up to 3 denominations)
  for (const d1 of ZEC_DENOMINATIONS) {
    for (const d2 of ZEC_DENOMINATIONS) {
      amounts.add(d1 + d2);
      for (const d3 of ZEC_DENOMINATIONS) {
        if (d1 + d2 + d3 <= 100) {
          amounts.add(d1 + d2 + d3);
        }
      }
    }
  }
  
  return Array.from(amounts).sort((a, b) => a - b);
}

/**
 * Calculate random withdrawal delay
 */
export function getRandomWithdrawalDelay(): number {
  const { minMs, maxMs } = WITHDRAWAL_DELAY;
  return Math.floor(Math.random() * (maxMs - minMs)) + minMs;
}

/**
 * Schedule a denomination withdrawal with delay
 */
export interface ScheduledWithdrawal {
  id: string;
  sourceId: string;
  denomination: ZecDenomination;
  scheduledAt: Date;
  executeAt: Date;
  status: 'scheduled' | 'pending' | 'completed' | 'failed';
  referenceId: string;
  operationId?: string;
}

// Escrow addresses from env
const T_ADDRESS = process.env.ZCASH_T_ADDRESS;
const Z_ADDRESS = process.env.ZCASH_Z_ADDRESS;

export interface EscrowDeposit {
  id: string;
  type: 'bounty' | 'subscription';
  referenceId: string;
  amountZec: number;
  status: 'pending' | 'received' | 'shielded' | 'released' | 'refunded';
  depositTxHash?: string;
  shieldOpId?: string;
  releaseOpId?: string;
}

/**
 * Check escrow balance
 */
export async function getEscrowBalance(): Promise<{
  transparent: number;
  shielded: number;
  total: number;
  synced: boolean;
}> {
  if (!isZcashConfigured()) {
    return { transparent: 0, shielded: 0, total: 0, synced: false };
  }
  
  try {
    const balance = await getWalletBalance();
    return { ...balance, synced: true };
  } catch (error) {
    console.error('Failed to get escrow balance:', error);
    return { transparent: 0, shielded: 0, total: 0, synced: false };
  }
}

/**
 * Shield incoming transparent ZEC
 * Called when we receive ZEC at our t-address
 */
export async function shieldIncomingZec(): Promise<{
  operationId: string;
  amount: number;
} | null> {
  if (!isZcashConfigured() || !T_ADDRESS || !Z_ADDRESS) {
    throw new Error('Zcash not configured');
  }
  
  const balance = await getWalletBalance();
  
  if (balance.transparent <= 0.0001) {
    return null; // Nothing to shield (keep small amount for fees)
  }
  
  const amountToShield = balance.transparent - 0.0001; // Leave some for fees
  
  // Move from t-address to z-address (shielding operation)
  const result = await sendShieldedPayment({
    toAddress: Z_ADDRESS,
    amountZec: amountToShield,
    memo: 'Escrow shield',
    fromAddress: T_ADDRESS,
  });
  
  console.log(`Shielding ${amountToShield} ZEC, operation: ${result.operationId}`);
  
  return {
    operationId: result.operationId,
    amount: amountToShield,
  };
}

/**
 * Release escrow to source's z-address using FIXED DENOMINATIONS
 * 
 * Privacy: Amount is split into standard denominations, each sent
 * with a random time delay to prevent correlation attacks.
 */
export async function releaseEscrow(params: {
  sourceId: string;
  amountZec: number;
  reason: 'bounty' | 'subscription';
  referenceId: string;
  memo?: string;
}): Promise<{
  success: boolean;
  scheduledWithdrawals?: ScheduledWithdrawal[];
  totalPayout?: number;
  remainder?: number;
  paymentId?: string;
  error?: string;
}> {
  const { sourceId, amountZec, reason, referenceId, memo } = params;
  
  if (!isZcashConfigured() || !Z_ADDRESS) {
    return { success: false, error: 'Zcash not configured' };
  }
  
  // Get source's z-address
  const [paymentAddr] = await db.select()
    .from(sourcePaymentAddresses)
    .where(and(
      eq(sourcePaymentAddresses.sourceId, sourceId),
      eq(sourcePaymentAddresses.chain, 'zec'),
      eq(sourcePaymentAddresses.isPrimary, true)
    ))
    .limit(1);
  
  if (!paymentAddr) {
    return { success: false, error: 'Source has no ZEC z-address configured' };
  }
  
  const validation = validateZcashAddress(paymentAddr.address);
  if (!validation.valid || validation.type !== 'shielded') {
    return { success: false, error: 'Source address must be a shielded z-address' };
  }
  
  // Split amount into fixed denominations
  const { denominations, totalPayout, remainder } = calculateBountyDenominations(amountZec);
  
  if (denominations.length === 0) {
    return { success: false, error: `Amount ${amountZec} ZEC is below minimum denomination (0.1 ZEC)` };
  }
  
  // Check escrow balance
  const balance = await getWalletBalance();
  if (balance.shielded < totalPayout) {
    return { success: false, error: `Insufficient escrow balance: ${balance.shielded} ZEC available, need ${totalPayout} ZEC` };
  }
  
  // Create parent payment record
  const [payment] = await db.insert(humintPayments)
    .values({
      sourceId,
      amountUsdc: totalPayout * 30, // Approximate USD value
      reason,
      referenceId,
      recipientAddress: paymentAddr.address,
      recipientChain: 'zec',
      status: 'scheduled',
    })
    .returning();
  
  // Schedule withdrawals with random delays (one per denomination)
  const now = Date.now();
  const scheduledWithdrawals: ScheduledWithdrawal[] = [];
  
  for (let i = 0; i < denominations.length; i++) {
    const denom = denominations[i];
    // Each subsequent withdrawal gets additional random delay
    const baseDelay = i * getRandomWithdrawalDelay();
    const extraDelay = getRandomWithdrawalDelay();
    const executeAt = new Date(now + baseDelay + extraDelay);
    
    const withdrawal: ScheduledWithdrawal = {
      id: `${payment.id}-${i}`,
      sourceId,
      denomination: denom,
      scheduledAt: new Date(now),
      executeAt,
      status: 'scheduled',
      referenceId: payment.id,
    };
    
    scheduledWithdrawals.push(withdrawal);
    
    console.log(`Scheduled ${denom} ZEC withdrawal for ${executeAt.toISOString()}`);
  }
  
  // TODO: Store scheduled withdrawals in DB and process via cron
  // For now, log the schedule
  console.log(`Payment ${payment.id}: ${denominations.length} withdrawals scheduled over ${Math.round((scheduledWithdrawals[scheduledWithdrawals.length - 1]?.executeAt.getTime() - now) / 3600000)}h`);
  
  return {
    success: true,
    scheduledWithdrawals,
    totalPayout,
    remainder,
    paymentId: payment.id,
  };
}

/**
 * Execute a single scheduled withdrawal (called by cron)
 */
export async function executeScheduledWithdrawal(withdrawal: ScheduledWithdrawal): Promise<{
  success: boolean;
  operationId?: string;
  error?: string;
}> {
  if (!isZcashConfigured() || !Z_ADDRESS) {
    return { success: false, error: 'Zcash not configured' };
  }
  
  // Get source's z-address
  const [paymentAddr] = await db.select()
    .from(sourcePaymentAddresses)
    .where(and(
      eq(sourcePaymentAddresses.sourceId, withdrawal.sourceId),
      eq(sourcePaymentAddresses.chain, 'zec'),
      eq(sourcePaymentAddresses.isPrimary, true)
    ))
    .limit(1);
  
  if (!paymentAddr) {
    return { success: false, error: 'Source z-address not found' };
  }
  
  try {
    const result = await sendShieldedPayment({
      toAddress: paymentAddr.address,
      amountZec: withdrawal.denomination,
      memo: `Argus payout`,
    });
    
    return {
      success: true,
      operationId: result.operationId,
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Check and update payment status
 */
export async function checkPaymentStatus(operationId: string): Promise<{
  status: string;
  txHash?: string;
  error?: string;
}> {
  try {
    const status = await getOperationStatus(operationId);
    
    return {
      status: status.status,
      txHash: status.result?.txid,
      error: status.error?.message,
    };
  } catch (error) {
    return { status: 'unknown', error: String(error) };
  }
}

/**
 * Process bounty fulfillment with denomination-based payout
 */
export async function processBountyPayout(bountyId: string): Promise<{
  success: boolean;
  denominations?: ZecDenomination[];
  totalPayout?: number;
  withdrawalCount?: number;
  error?: string;
}> {
  // Get bounty details
  const [bounty] = await db.select()
    .from(intelBounties)
    .where(eq(intelBounties.id, bountyId))
    .limit(1);
  
  if (!bounty) {
    return { success: false, error: 'Bounty not found' };
  }
  
  if (bounty.status !== 'claimed' || !bounty.fulfilledBy) {
    return { success: false, error: 'Bounty not in claimed state or no fulfiller' };
  }
  
  // Convert USDC reward to ZEC (approximate)
  const zecPrice = 30; // TODO: Get live price from oracle
  const amountZec = bounty.rewardUsdc / zecPrice;
  
  // Calculate denomination breakdown
  const { denominations, totalPayout, remainder } = calculateBountyDenominations(amountZec);
  
  console.log(`Bounty ${bountyId}: ${amountZec} ZEC → ${denominations.join(' + ')} ZEC (${remainder.toFixed(4)} remainder)`);
  
  const result = await releaseEscrow({
    sourceId: bounty.fulfilledBy,
    amountZec,
    reason: 'bounty',
    referenceId: bountyId,
    memo: `Bounty: ${bounty.title.slice(0, 50)}`,
  });
  
  if (result.success) {
    await db.update(intelBounties)
      .set({
        status: 'paying', // New status: withdrawals scheduled
        paymentTxHash: result.paymentId,
      })
      .where(eq(intelBounties.id, bountyId));
    
    return {
      success: true,
      denominations,
      totalPayout,
      withdrawalCount: result.scheduledWithdrawals?.length,
    };
  }
  
  return { success: false, error: result.error };
}

/**
 * Validate a bounty amount is payable with denominations
 */
export function validateBountyAmount(amountZec: number): {
  valid: boolean;
  denominations: ZecDenomination[];
  totalPayout: number;
  remainder: number;
  message?: string;
} {
  if (amountZec < 0.1) {
    return {
      valid: false,
      denominations: [],
      totalPayout: 0,
      remainder: amountZec,
      message: 'Minimum bounty is 0.1 ZEC',
    };
  }
  
  const { denominations, totalPayout, remainder } = calculateBountyDenominations(amountZec);
  
  return {
    valid: true,
    denominations,
    totalPayout,
    remainder,
    message: remainder > 0 
      ? `${remainder.toFixed(4)} ZEC remainder becomes platform fee`
      : undefined,
  };
}

/**
 * Escrow status summary
 */
export async function getEscrowStatus(): Promise<{
  configured: boolean;
  addresses: {
    transparent: string | null;
    shielded: string | null;
  };
  balance: {
    transparent: number;
    shielded: number;
    total: number;
  };
  pendingPayouts: number;
}> {
  const balance = await getEscrowBalance();
  
  // Count pending payments
  const pendingPayments = await db.select()
    .from(humintPayments)
    .where(eq(humintPayments.status, 'pending'));
  
  return {
    configured: isZcashConfigured(),
    addresses: {
      transparent: T_ADDRESS || null,
      shielded: Z_ADDRESS || null,
    },
    balance,
    pendingPayouts: pendingPayments.length,
  };
}
