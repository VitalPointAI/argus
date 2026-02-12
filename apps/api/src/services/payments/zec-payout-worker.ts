/**
 * ZEC Payout Worker
 * 
 * Processes time-delayed withdrawals from the queue.
 * Runs as a cron job every 5 minutes.
 */

import { db } from '../../db';
import { humintWithdrawalQueue } from '../../db/schema';
import { eq, and, lte, sql } from 'drizzle-orm';

// Zcash RPC configuration
const ZCASH_RPC_URL = process.env.ZCASH_RPC_URL || 'http://localhost:8232';
const ZCASH_RPC_USER = process.env.ZCASH_RPC_USER || 'zcashrpc';
const ZCASH_RPC_PASS = process.env.ZCASH_RPC_PASS || '';
const ZCASH_Z_ADDRESS = process.env.ZCASH_Z_ADDRESS || ''; // Our escrow z-address

// Minimum pool size before processing (for anonymity set)
const MIN_POOL_SIZE = 3;

interface ZcashRpcResponse {
  result: any;
  error: { code: number; message: string } | null;
  id: string;
}

async function zcashRpc(method: string, params: any[] = []): Promise<any> {
  const response = await fetch(ZCASH_RPC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${ZCASH_RPC_USER}:${ZCASH_RPC_PASS}`).toString('base64'),
    },
    body: JSON.stringify({
      jsonrpc: '1.0',
      id: 'argus',
      method,
      params,
    }),
  });
  
  const data: ZcashRpcResponse = await response.json();
  
  if (data.error) {
    throw new Error(`Zcash RPC error: ${data.error.message}`);
  }
  
  return data.result;
}

/**
 * Check if blockchain is synced enough to process transactions
 */
async function isBlockchainReady(): Promise<boolean> {
  try {
    const info = await zcashRpc('getblockchaininfo');
    // Consider ready if >99% synced
    return info.verificationprogress > 0.99;
  } catch (error) {
    console.error('Failed to check blockchain status:', error);
    return false;
  }
}

/**
 * Get balance of our escrow z-address
 */
async function getEscrowBalance(): Promise<number> {
  try {
    const balance = await zcashRpc('z_getbalance', [ZCASH_Z_ADDRESS]);
    return parseFloat(balance);
  } catch (error) {
    console.error('Failed to get escrow balance:', error);
    return 0;
  }
}

/**
 * Send shielded transaction
 */
async function sendShieldedTx(toAddress: string, amount: number): Promise<string> {
  // z_sendmany from our escrow to their address
  const operations = [{
    address: toAddress,
    amount: amount,
  }];
  
  // Returns operation ID
  const opId = await zcashRpc('z_sendmany', [
    ZCASH_Z_ADDRESS,
    operations,
    1, // minconf
    0.0001, // fee
  ]);
  
  // Wait for operation to complete
  let status = 'executing';
  let txId = '';
  
  while (status === 'executing') {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    
    const [op] = await zcashRpc('z_getoperationstatus', [[opId]]);
    status = op.status;
    
    if (status === 'success') {
      txId = op.result.txid;
    } else if (status === 'failed') {
      throw new Error(`Transaction failed: ${op.error?.message || 'Unknown error'}`);
    }
  }
  
  return txId;
}

/**
 * Process pending withdrawals that are due
 */
export async function processWithdrawals(): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  
  console.log('[ZEC Payout] Starting withdrawal processing...');
  
  // Check if blockchain is ready
  const ready = await isBlockchainReady();
  if (!ready) {
    console.log('[ZEC Payout] Blockchain not yet synced, skipping...');
    return { processed: 0, errors: ['Blockchain not synced'] };
  }
  
  // Check escrow balance
  const escrowBalance = await getEscrowBalance();
  console.log(`[ZEC Payout] Escrow balance: ${escrowBalance} ZEC`);
  
  // Get pending withdrawals that are due
  const pendingWithdrawals = await db
    .select()
    .from(humintWithdrawalQueue)
    .where(and(
      eq(humintWithdrawalQueue.status, 'pending'),
      lte(humintWithdrawalQueue.scheduledFor, new Date())
    ))
    .orderBy(humintWithdrawalQueue.scheduledFor)
    .limit(10); // Process up to 10 at a time
  
  console.log(`[ZEC Payout] Found ${pendingWithdrawals.length} due withdrawals`);
  
  // Check if we have enough withdrawals for anonymity
  if (pendingWithdrawals.length < MIN_POOL_SIZE) {
    console.log(`[ZEC Payout] Less than ${MIN_POOL_SIZE} withdrawals, waiting for more...`);
    return { processed: 0, errors: [] };
  }
  
  for (const withdrawal of pendingWithdrawals) {
    // Check if we have enough balance
    if (escrowBalance < withdrawal.amountZec) {
      const errMsg = `Insufficient escrow balance for withdrawal ${withdrawal.id}`;
      console.error(`[ZEC Payout] ${errMsg}`);
      errors.push(errMsg);
      continue;
    }
    
    try {
      // Mark as processing
      await db
        .update(humintWithdrawalQueue)
        .set({ 
          status: 'processing',
          processedAt: new Date(),
        })
        .where(eq(humintWithdrawalQueue.id, withdrawal.id));
      
      console.log(`[ZEC Payout] Processing withdrawal ${withdrawal.id}: ${withdrawal.amountZec} ZEC to ${withdrawal.recipientZAddress.substring(0, 20)}...`);
      
      // Parse denominations
      const denominations = typeof withdrawal.denominations === 'string' 
        ? JSON.parse(withdrawal.denominations) 
        : withdrawal.denominations;
      
      // Send each denomination as separate transaction (for mixing)
      const txIds: string[] = [];
      
      for (const denom of denominations as number[]) {
        // Add random delay between transactions (1-30 seconds)
        const delay = Math.random() * 29000 + 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        const txId = await sendShieldedTx(withdrawal.recipientZAddress, denom);
        txIds.push(txId);
        console.log(`[ZEC Payout] Sent ${denom} ZEC, txId: ${txId}`);
      }
      
      // Mark as completed
      await db
        .update(humintWithdrawalQueue)
        .set({
          status: 'completed',
          txIds: JSON.stringify(txIds),
          completedAt: new Date(),
        })
        .where(eq(humintWithdrawalQueue.id, withdrawal.id));
      
      processed++;
      console.log(`[ZEC Payout] Completed withdrawal ${withdrawal.id}`);
      
    } catch (error: any) {
      const errMsg = `Failed to process withdrawal ${withdrawal.id}: ${error.message}`;
      console.error(`[ZEC Payout] ${errMsg}`);
      errors.push(errMsg);
      
      // Mark as failed
      await db
        .update(humintWithdrawalQueue)
        .set({
          status: 'failed',
          errorMessage: error.message,
        })
        .where(eq(humintWithdrawalQueue.id, withdrawal.id));
    }
  }
  
  console.log(`[ZEC Payout] Finished. Processed: ${processed}, Errors: ${errors.length}`);
  return { processed, errors };
}

/**
 * Get payout worker status
 */
export async function getPayoutStatus(): Promise<{
  blockchainReady: boolean;
  escrowBalance: number;
  pendingCount: number;
  dueCount: number;
}> {
  const blockchainReady = await isBlockchainReady();
  const escrowBalance = blockchainReady ? await getEscrowBalance() : 0;
  
  const [{ pending, due }] = await db
    .select({
      pending: sql<number>`COUNT(*) FILTER (WHERE status = 'pending')`,
      due: sql<number>`COUNT(*) FILTER (WHERE status = 'pending' AND scheduled_for <= NOW())`,
    })
    .from(humintWithdrawalQueue);
  
  return {
    blockchainReady,
    escrowBalance,
    pendingCount: Number(pending),
    dueCount: Number(due),
  };
}
