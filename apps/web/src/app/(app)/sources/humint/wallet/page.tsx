'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ZecWallet from '@/components/ZecWallet';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface EscrowData {
  escrowBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  hasWallet: boolean;
  zAddress: string | null;
  pendingWithdrawal: {
    id: string;
    amount: number;
    scheduledFor: string;
    status: string;
  } | null;
}

interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amountZec: number;
  referenceType: string;
  balanceAfter: number;
  note: string;
  createdAt: string;
}

export default function HumintWalletPage() {
  const router = useRouter();
  const [escrowData, setEscrowData] = useState<EscrowData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch escrow balance and data
  const fetchEscrowData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/escrow/balance`, {
        credentials: 'include',
      });
      
      if (res.status === 401) {
        router.push('/register/source');
        return;
      }
      
      const data = await res.json();
      if (data.success) {
        setEscrowData(data.data);
      } else {
        setError(data.error || 'Failed to load balance');
      }
    } catch (err) {
      setError('Failed to connect to server');
    }
  }, [router]);

  // Fetch transaction history
  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/escrow/transactions?limit=10`, {
        credentials: 'include',
      });
      
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchEscrowData(), fetchTransactions()]).finally(() => {
      setLoading(false);
    });
  }, [fetchEscrowData, fetchTransactions]);

  // Handle wallet creation
  const handleWalletCreated = async (zAddress: string) => {
    try {
      const res = await fetch(`${API_URL}/api/escrow/wallet`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zAddress }),
      });
      
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error);
      }
      
      // Refresh data
      await fetchEscrowData();
    } catch (err: any) {
      setError(err.message || 'Failed to save wallet');
    }
  };

  // Handle withdrawal
  const handleWithdraw = async (amount: number, zAddress: string) => {
    const res = await fetch(`${API_URL}/api/escrow/withdraw`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, zAddress }),
    });
    
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error);
    }
    
    // Refresh data
    await Promise.all([fetchEscrowData(), fetchTransactions()]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-500">Loading wallet...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="text-3xl">💰</span>
            Wallet & Earnings
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Manage your ZEC escrow balance and withdrawals
          </p>
        </div>
        <Link
          href="/sources/humint"
          className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
        >
          ← Back
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Wallet Component */}
      {escrowData && (
        <ZecWallet
          escrowBalance={escrowData.escrowBalance}
          walletBalance={0} // Will be fetched from chain when synced
          pendingWithdrawal={escrowData.pendingWithdrawal}
          onWalletCreated={handleWalletCreated}
          onWithdraw={handleWithdraw}
        />
      )}

      {/* Stats */}
      {escrowData && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Lifetime Stats</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {escrowData.totalEarned.toFixed(2)} ZEC
              </div>
              <div className="text-sm text-slate-500">Total Earned</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">
                {escrowData.totalWithdrawn.toFixed(2)} ZEC
              </div>
              <div className="text-sm text-slate-500">Total Withdrawn</div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History */}
      {transactions.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xl ${tx.type === 'credit' ? 'text-green-500' : 'text-red-500'}`}>
                    {tx.type === 'credit' ? '↓' : '↑'}
                  </span>
                  <div>
                    <div className="font-medium text-slate-900 dark:text-white">
                      {tx.type === 'credit' ? 'Received' : 'Withdrawal'}
                    </div>
                    <div className="text-sm text-slate-500">
                      {tx.referenceType} • {new Date(tx.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className={`font-bold ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                  {tx.type === 'credit' ? '+' : '-'}{tx.amountZec.toFixed(2)} ZEC
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Privacy Info */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 text-sm">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <span>🔒</span> Privacy Protection
        </h3>
        <ul className="space-y-2 text-slate-600 dark:text-slate-400">
          <li>• <strong>Shielded transactions:</strong> All payouts use ZEC z-addresses (fully private)</li>
          <li>• <strong>Time delays:</strong> Random 1-48h delays prevent timing analysis</li>
          <li>• <strong>Fixed denominations:</strong> Amounts are split into standard sizes</li>
          <li>• <strong>No notifications:</strong> We never reach out to you externally</li>
          <li>• <strong>Client-side keys:</strong> Your wallet keys never leave your browser</li>
        </ul>
      </div>
    </div>
  );
}
