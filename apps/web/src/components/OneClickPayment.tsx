'use client';

import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface OneClickPaymentProps {
  amountUsdc: number;
  packageId: string;
  listId: string;
  listName: string;
  onSuccess: (subscriptionId: string) => void;
  onCancel: () => void;
}

interface Quote {
  quoteId: string;
  depositAddress: string;
  depositMemo?: string;
  amountIn: string;
  amountOut: string;
  deadline: string;
  estimatedTimeMs: number;
}

type PaymentStatus = 'idle' | 'loading' | 'awaiting_deposit' | 'processing' | 'success' | 'failed';

export default function OneClickPayment({
  amountUsdc,
  packageId,
  listId,
  listName,
  onSuccess,
  onCancel,
}: OneClickPaymentProps) {
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentToken, setPaymentToken] = useState<'USDC' | 'NEAR'>('USDC');
  const [countdown, setCountdown] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  // Get quote on mount
  useEffect(() => {
    getQuote();
  }, [paymentToken]);

  // Poll for payment status
  useEffect(() => {
    if (status !== 'awaiting_deposit' || !quote) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/payments/status?depositAddress=${quote.depositAddress}`, {
          credentials: 'include',
        });
        const data = await res.json();

        if (data.status === 'SUCCESS') {
          setStatus('success');
          // Complete subscription
          completeSubscription(data.txHash);
        } else if (data.status === 'PROCESSING') {
          setStatus('processing');
        } else if (data.status === 'FAILED' || data.status === 'REFUNDED') {
          setStatus('failed');
          setError(data.error || 'Payment failed');
        }
      } catch (e) {
        console.error('Status check error:', e);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [status, quote]);

  // Countdown timer
  useEffect(() => {
    if (!quote?.deadline) return;
    
    const updateCountdown = () => {
      const remaining = Math.max(0, new Date(quote.deadline).getTime() - Date.now());
      setCountdown(Math.floor(remaining / 1000));
      
      if (remaining <= 0 && status === 'awaiting_deposit') {
        setStatus('failed');
        setError('Quote expired. Please try again.');
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [quote?.deadline, status]);

  const getQuote = async () => {
    setStatus('loading');
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/payments/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amountUsdc,
          packageId,
          paymentToken,
        }),
      });

      const data = await res.json();

      if (data.success && data.quote) {
        setQuote(data.quote);
        setStatus('awaiting_deposit');
      } else {
        setError(data.error || 'Failed to get quote');
        setStatus('failed');
      }
    } catch (e) {
      setError('Network error. Please try again.');
      setStatus('failed');
    }
  };

  const completeSubscription = async (txHash: string) => {
    try {
      const res = await fetch(`${API_URL}/api/marketplace/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          packageId,
          paymentTxHash: txHash,
          paymentToken,
          depositAddress: quote?.depositAddress,
        }),
      });

      const data = await res.json();

      if (data.success) {
        onSuccess(data.subscriptionId);
      } else {
        setError(data.error || 'Failed to activate subscription');
      }
    } catch (e) {
      setError('Failed to complete subscription');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatAmount = (amount: string, decimals: number = 6) => {
    return (parseInt(amount) / Math.pow(10, decimals)).toFixed(decimals > 6 ? 4 : 2);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold">Complete Payment</h3>
        <button
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
        >
          ×
        </button>
      </div>

      {/* Order Summary */}
      <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="font-medium">{listName}</p>
            <p className="text-sm text-slate-500">Access Pass</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-argus-600">${amountUsdc.toFixed(2)}</p>
            <p className="text-xs text-slate-500">USDC</p>
          </div>
        </div>
      </div>

      {/* Payment Status */}
      {status === 'loading' && (
        <div className="text-center py-8">
          <div className="animate-spin w-12 h-12 border-4 border-argus-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-500">Getting payment details...</p>
        </div>
      )}

      {status === 'awaiting_deposit' && quote && (
        <div className="space-y-4">
          {/* Token Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Pay with</label>
            <div className="flex gap-2">
              {(['USDC', 'NEAR'] as const).map((token) => (
                <button
                  key={token}
                  onClick={() => setPaymentToken(token)}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 transition ${
                    paymentToken === token
                      ? 'border-argus-600 bg-argus-50 dark:bg-argus-900/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-argus-300'
                  }`}
                >
                  <span className="font-medium">{token}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Deposit Address */}
          <div>
            <label className="block text-sm font-medium mb-2">Send to this address</label>
            <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-3 flex items-center gap-2">
              <code className="flex-1 text-sm break-all font-mono">
                {quote.depositAddress}
              </code>
              <button
                onClick={() => copyToClipboard(quote.depositAddress)}
                className="shrink-0 px-3 py-1 bg-argus-600 text-white rounded text-sm hover:bg-argus-700"
              >
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
            {quote.depositMemo && (
              <p className="mt-2 text-sm text-slate-500">
                Memo: <code className="bg-slate-200 dark:bg-slate-600 px-2 py-0.5 rounded">{quote.depositMemo}</code>
              </p>
            )}
          </div>

          {/* Amount */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-600">⚠️</span>
              <span className="font-medium text-amber-800 dark:text-amber-200">Exact amount required</span>
            </div>
            <p className="text-2xl font-bold text-amber-800 dark:text-amber-200">
              {formatAmount(quote.amountIn)} {paymentToken}
            </p>
            <p className="text-sm text-amber-600 mt-1">
              Send exactly this amount. Different amounts may be refunded.
            </p>
          </div>

          {/* Timer */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Time remaining</span>
            <span className={`font-mono font-bold ${countdown < 300 ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}`}>
              {formatTime(countdown)}
            </span>
          </div>

          {/* Instructions */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <h4 className="font-medium mb-2">How to pay</h4>
            <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
              <li>1. Copy the deposit address above</li>
              <li>2. Open your wallet (NEAR wallet, Exchange, etc.)</li>
              <li>3. Send exactly {formatAmount(quote.amountIn)} {paymentToken}</li>
              <li>4. Wait for confirmation (~30 seconds)</li>
            </ol>
          </div>

          {/* Powered by */}
          <div className="text-center text-xs text-slate-400 pt-2">
            Powered by NEAR Intents 1Click
          </div>
        </div>
      )}

      {status === 'processing' && (
        <div className="text-center py-8">
          <div className="animate-pulse text-6xl mb-4">⏳</div>
          <h4 className="text-lg font-bold mb-2">Payment Processing</h4>
          <p className="text-slate-500">
            We detected your payment! Finalizing your access pass...
          </p>
        </div>
      )}

      {status === 'success' && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">🎉</div>
          <h4 className="text-lg font-bold text-green-600 mb-2">Payment Successful!</h4>
          <p className="text-slate-500">
            Your access pass has been activated.
          </p>
        </div>
      )}

      {status === 'failed' && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">❌</div>
          <h4 className="text-lg font-bold text-red-600 mb-2">Payment Failed</h4>
          <p className="text-slate-500 mb-4">{error}</p>
          <button
            onClick={getQuote}
            className="px-6 py-2 bg-argus-600 text-white rounded-lg hover:bg-argus-700"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
