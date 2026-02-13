import { Hono } from 'hono';
import { db } from '../db';
import { sourceListPackages, sourceListSubscriptions, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { getPaymentQuote, getPaymentStatus, submitDeposit, USDC_TOKEN_IDS } from '../services/payments/one-click';
// TODO: Re-enable when near-api-js ESM issue is fixed
// import { mintAccessPass } from '../services/near/source-list-nft';
import { getMarketplaceFeePercent } from '../services/platform/settings';

const payments = new Hono();

// Platform treasury address for receiving payments
const PLATFORM_TREASURY = process.env.PLATFORM_TREASURY_ADDRESS || 'argus-intel.near';

interface PendingPayment {
  depositAddress: string;
  packageId: string;
  userId: string;
  amountUsdc: number;
  creatorShare: number;
  platformShare: number;
  createdAt: Date;
  expiresAt: Date;
}

// In-memory store for pending payments (should be Redis in production)
const pendingPayments = new Map<string, PendingPayment>();

/**
 * Get a payment quote for subscribing to a package
 */
payments.post('/quote', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const { packageId, paymentToken = 'USDC' } = await c.req.json();

    if (!packageId) {
      return c.json({ success: false, error: 'Package ID required' }, 400);
    }

    // Get package details
    const [pkg] = await db
      .select()
      .from(sourceListPackages)
      .where(eq(sourceListPackages.id, packageId))
      .limit(1);

    if (!pkg) {
      return c.json({ success: false, error: 'Package not found' }, 404);
    }

    if (!pkg.isActive) {
      return c.json({ success: false, error: 'Package is not available' }, 400);
    }

    // Check supply
    if (pkg.maxSupply && pkg.mintedCount >= pkg.maxSupply) {
      return c.json({ success: false, error: 'Package sold out' }, 400);
    }

    // Free packages don't need payment
    if (pkg.priceUsdc === 0) {
      return c.json({
        success: true,
        quote: {
          quoteId: 'free',
          depositAddress: null,
          amountIn: '0',
          amountOut: '0',
          deadline: new Date(Date.now() + 3600000).toISOString(),
          estimatedTimeMs: 0,
          isFree: true,
        },
      });
    }

    // Get dynamic platform fee from settings
    const feePercent = await getMarketplaceFeePercent();
    const platformShare = pkg.priceUsdc * (feePercent / 100);
    const creatorShare = pkg.priceUsdc - platformShare;

    // Get user's NEAR address for refunds
    const [user] = await db
      .select({ nearAccountId: users.nearAccountId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const refundAddress = user?.nearAccountId || PLATFORM_TREASURY;

    // Get quote from 1Click
    const quote = await getPaymentQuote({
      amountUsdc: pkg.priceUsdc,
      recipientAddress: PLATFORM_TREASURY, // We receive, then split
      recipientChain: 'near',
      refundAddress,
      dry: false,
    });

    // Store pending payment
    if (quote.depositAddress) {
      pendingPayments.set(quote.depositAddress, {
        depositAddress: quote.depositAddress,
        packageId,
        userId,
        amountUsdc: pkg.priceUsdc,
        creatorShare,
        platformShare,
        createdAt: new Date(),
        expiresAt: new Date(quote.deadline || Date.now() + 3600000),
      });
    }

    return c.json({
      success: true,
      quote: {
        quoteId: quote.quoteId,
        depositAddress: quote.depositAddress,
        depositMemo: quote.depositMemo,
        amountIn: quote.amountIn,
        amountOut: quote.amountOut,
        deadline: quote.deadline,
        estimatedTimeMs: quote.estimatedTimeMs,
      },
    });
  } catch (error: any) {
    console.error('Quote error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Check payment status
 */
payments.get('/status', async (c) => {
  try {
    const depositAddress = c.req.query('depositAddress');
    const memo = c.req.query('memo');

    if (!depositAddress) {
      return c.json({ success: false, error: 'Deposit address required' }, 400);
    }

    const status = await getPaymentStatus(depositAddress, memo);
    return c.json({ success: true, ...status });
  } catch (error: any) {
    console.error('Status check error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Submit deposit notification (speeds up processing)
 */
payments.post('/deposit', async (c) => {
  try {
    const { txHash, depositAddress, memo } = await c.req.json();

    if (!txHash || !depositAddress) {
      return c.json({ success: false, error: 'txHash and depositAddress required' }, 400);
    }

    const result = await submitDeposit({ txHash, depositAddress, memo });
    return c.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Deposit submit error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Webhook for 1Click payment completion (if configured)
 * Called when payment is confirmed
 */
payments.post('/webhook/1click', async (c) => {
  try {
    const payload = await c.req.json();
    const { depositAddress, status, txHash, amountOut } = payload;

    if (status !== 'SUCCESS') {
      console.log('1Click webhook: non-success status', status);
      return c.json({ received: true });
    }

    // Find pending payment
    const pending = pendingPayments.get(depositAddress);
    if (!pending) {
      console.warn('1Click webhook: unknown deposit address', depositAddress);
      return c.json({ received: true });
    }

    // Complete the subscription
    await completeSubscription(pending, txHash);
    pendingPayments.delete(depositAddress);

    return c.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Complete subscription after successful payment
 */
async function completeSubscription(pending: PendingPayment, txHash: string): Promise<string> {
  // Get package and list details
  const [pkg] = await db
    .select()
    .from(sourceListPackages)
    .where(eq(sourceListPackages.id, pending.packageId))
    .limit(1);

  if (!pkg) {
    throw new Error('Package not found');
  }

  // Get user details
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, pending.userId))
    .limit(1);

  // Calculate expiration
  let expiresAt = null;
  if (pkg.durationDays) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + pkg.durationDays);
  }

  // Create subscription
  const [subscription] = await db
    .insert(sourceListSubscriptions)
    .values({
      userId: pending.userId,
      listId: pkg.listId,
      packageId: pending.packageId,
      expiresAt,
      paymentTxHash: txHash,
      paymentToken: 'USDC',
      amountPaid: pending.amountUsdc,
      status: 'active',
    })
    .returning();

  // Increment minted count
  await db
    .update(sourceListPackages)
    .set({ mintedCount: pkg.mintedCount + 1 })
    .where(eq(sourceListPackages.id, pending.packageId));

  // TODO: Mint NFT access pass when near-api-js ESM issue is fixed
  // if (user?.nearAccountId) {
  //   try {
  //     await mintAccessPass({
  //       listId: pkg.listId,
  //       subscriberAccount: user.nearAccountId,
  //       packageId: pending.packageId,
  //     });
  //     console.log(`Minted access pass for ${user.nearAccountId} on list ${pkg.listId}`);
  //   } catch (e) {
  //     console.error('NFT mint failed (subscription still active):', e);
  //   }
  // }

  return subscription.id;
}

export { payments, completeSubscription, pendingPayments };
