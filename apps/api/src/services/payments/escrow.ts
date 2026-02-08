/**
 * Shielded Escrow Service
 * 
 * Manages ZEC escrow for HUMINT bounties and subscriptions.
 * 
 * Flow:
 * 1. Consumer deposits USDC/etc for bounty or subscription
 * 2. 1Click converts to transparent ZEC → our t-address
 * 3. We shield the ZEC (t→z transfer to escrow pool)
 * 4. When payout due, z→z transfer to source's z-address
 * 5. If refund needed, z→z back to consumer's z-address (or unshield + refund)
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
 * Release escrow to source's z-address
 */
export async function releaseEscrow(params: {
  sourceId: string;
  amountZec: number;
  reason: 'bounty' | 'subscription';
  referenceId: string;
  memo?: string;
}): Promise<{
  success: boolean;
  operationId?: string;
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
  
  // Check escrow balance
  const balance = await getWalletBalance();
  if (balance.shielded < amountZec) {
    return { success: false, error: `Insufficient escrow balance: ${balance.shielded} ZEC available` };
  }
  
  // Create payment record
  const [payment] = await db.insert(humintPayments)
    .values({
      sourceId,
      amountUsdc: amountZec * 30, // Approximate USD value (ZEC ~$30)
      reason,
      referenceId,
      recipientAddress: paymentAddr.address,
      recipientChain: 'zec',
      status: 'pending',
    })
    .returning();
  
  try {
    // Send shielded payment
    const result = await sendShieldedPayment({
      toAddress: paymentAddr.address,
      amountZec,
      memo: memo || `Argus ${reason} payout`,
    });
    
    // Update payment record
    await db.update(humintPayments)
      .set({
        status: 'processing',
        oneClickQuoteId: result.operationId,
      })
      .where(eq(humintPayments.id, payment.id));
    
    return {
      success: true,
      operationId: result.operationId,
      paymentId: payment.id,
    };
  } catch (error) {
    await db.update(humintPayments)
      .set({
        status: 'failed',
        errorMessage: String(error),
      })
      .where(eq(humintPayments.id, payment.id));
    
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
 * Process bounty fulfillment
 */
export async function processBountyPayout(bountyId: string): Promise<{
  success: boolean;
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
  const zecPrice = 30; // TODO: Get live price
  const amountZec = bounty.rewardUsdc / zecPrice;
  
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
        status: 'paid',
        paymentTxHash: result.operationId,
      })
      .where(eq(intelBounties.id, bountyId));
  }
  
  return result;
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
