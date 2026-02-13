'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface OneClickPaymentProps {
  amountUsdc: number;
  recipientNear: string; // Creator's NEAR wallet
  onSuccess: (txHash: string) => void;
  onCancel: () => void;
}

interface Quote {
  quoteId: string;
  depositAddress: string;
  amountIn: string;
  amountOut: string;
  deadline: string;
  estimatedTimeMs?: number;
}

const PAYMENT_TOKENS = [
  { id: 'usdc-near', label: 'USDC (NEAR)', icon: '💵' },
  { id: 'near', label: 'NEAR', icon: '🔷' },
  { id: 'usdc-eth', label: 'USDC (Ethereum)', icon: '💎' },
  { id: 'usdc-arb', label: 'USDC (Arbitrum)', icon: '🔵' },
  { id: 'usdc-base', label: 'USDC (Base)', icon: '🔘' },
];

export default function OneClickPayment({ 
  amountUsdc, 
  recipientNear, 
  onSuccess, 
  onCancel 
}: OneClickPaymentProps) {
  const [selectedToken, setSelectedToken] = useState('usdc-near');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'select' | 'quote' | 'waiting' | 'success'>('select');

  const getQuote = async () => {
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/api/marketplace/payment/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amountUsdc,
          recipientNear,
          originToken: selectedToken,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setQuote(data.quote);
        setStatus('quote');
      } else {
        setError(data.error || 'Failed to get quote');
      }
    } catch (err) {
      setError('Failed to connect to payment service');
    } finally {
      setLoading(false);
    }
  };

  const startPolling = () => {
    if (!quote) return;
    setStatus('waiting');
    setPolling(true);
  };

  useEffect(() => {
    if (!polling || !quote) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/marketplace/payment/status/${quote.quoteId}`, {
          credentials: 'include',
        });
        const data = await res.json();
        
        if (data.status === 'SUCCESS') {
          setPolling(false);
          setStatus('success');
          onSuccess(data.txHash || quote.quoteId);
        } else if (data.status === 'FAILED' || data.status === 'REFUNDED') {
          setPolling(false);
          setError(data.error || 'Payment failed');
          setStatus('select');
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [polling, quote]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {status === 'select' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-2">Pay with:</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_TOKENS.map((token) => (
                <button
                  key={token.id}
                  onClick={() => setSelectedToken(token.id)}
                  className={`p-3 rounded-lg border-2 text-left transition ${
                    selectedToken === token.id
                      ? 'border-argus-600 bg-argus-50 dark:bg-argus-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="text-xl mr-2">{token.icon}</span>
                  <span className="text-sm font-medium">{token.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={getQuote}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-argus-600 text-white rounded-lg hover:bg-argus-700 disabled:opacity-50"
            >
              {loading ? 'Getting Quote...' : `Pay $${amountUsdc.toFixed(2)}`}
            </button>
          </div>
        </>
      )}

      {status === 'quote' && quote && (
        <>
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-500">You Pay:</span>
              <span className="font-bold">{quote.amountIn}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Creator Receives:</span>
              <span className="font-bold text-green-600">${amountUsdc.toFixed(2)} USDC</span>
            </div>
            {quote.estimatedTimeMs && (
              <div className="flex justify-between">
                <span className="text-slate-500">Est. Time:</span>
                <span>~{Math.ceil(quote.estimatedTimeMs / 60000)} min</span>
              </div>
            )}
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
              Send payment to this address:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-white dark:bg-slate-800 rounded text-xs break-all">
                {quote.depositAddress}
              </code>
              <button
                onClick={() => copyToClipboard(quote.depositAddress)}
                className="px-3 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-700"
              >
                Copy
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStatus('select')}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Back
            </button>
            <button
              onClick={startPolling}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              I've Sent Payment
            </button>
          </div>
        </>
      )}

      {status === 'waiting' && (
        <div className="text-center py-8">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <h3 className="text-lg font-semibold mb-2">Waiting for Payment</h3>
          <p className="text-slate-500 text-sm">
            Checking for your deposit... This may take a few minutes.
          </p>
          <button
            onClick={onCancel}
            className="mt-4 text-sm text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      )}

      {status === 'success' && (
        <div className="text-center py-8">
          <div className="text-4xl mb-4">✅</div>
          <h3 className="text-lg font-semibold text-green-600 mb-2">Payment Successful!</h3>
          <p className="text-slate-500 text-sm">
            Your Access Pass is being minted...
          </p>
        </div>
      )}
    </div>
  );
}
