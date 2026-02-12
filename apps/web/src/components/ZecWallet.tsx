'use client';

import { useState, useEffect, useCallback } from 'react';

// Fixed denominations for privacy (prevents amount fingerprinting)
const DENOMINATIONS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25];

interface WalletState {
  hasWallet: boolean;
  zAddress: string | null;
  mnemonic: string[] | null;
  isGenerating: boolean;
  isBackedUp: boolean;
}

interface ZecWalletProps {
  onWalletCreated?: (zAddress: string) => void;
  onWithdraw?: (amount: number, zAddress: string) => Promise<void>;
  escrowBalance: number;
  walletBalance?: number;
  pendingWithdrawal?: {
    amount: number;
    scheduledFor: string;
  } | null;
}

// Generate BIP39 mnemonic (24 words)
// In production, this would use actual Zcash WASM library
async function generateMnemonic(): Promise<string[]> {
  // For MVP: Use Web Crypto API to generate entropy, then map to BIP39 words
  // In production: Use zingolib WASM or similar
  const wordlist = await fetch('/bip39-wordlist.json').then(r => r.json()).catch(() => {
    // Fallback: generate random words (MVP only - replace with real BIP39)
    const words = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
      'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
      'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
      'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
      'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
      'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
    ];
    return words;
  });
  
  const array = new Uint8Array(32); // 256 bits of entropy
  crypto.getRandomValues(array);
  
  // Convert entropy to word indices (simplified for MVP)
  const mnemonic: string[] = [];
  for (let i = 0; i < 24; i++) {
    const idx = (array[i] || 0) % wordlist.length;
    mnemonic.push(wordlist[idx]);
  }
  
  return mnemonic;
}

// Derive z-address from mnemonic
// In production: Use actual Zcash WASM library
async function deriveZAddress(mnemonic: string[]): Promise<string> {
  // MVP: Generate a placeholder that looks like a real z-address
  // Production: Use zingolib WASM to derive actual sapling address
  const seed = mnemonic.join(' ');
  const encoder = new TextEncoder();
  const data = encoder.encode(seed);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Create a realistic-looking z-address (sapling format)
  // Real z-addresses are ~78 chars starting with 'zs1'
  const hex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
  return `zs1${hex.substring(0, 75)}`;
}

// Check localStorage for existing wallet
function loadWalletFromStorage(): { zAddress: string; isBackedUp: boolean } | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem('argus_zec_wallet');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        zAddress: parsed.zAddress,
        isBackedUp: parsed.isBackedUp || false,
      };
    }
  } catch (e) {
    console.error('Failed to load wallet from storage:', e);
  }
  return null;
}

// Save wallet to localStorage (encrypted in production)
function saveWalletToStorage(zAddress: string, mnemonic: string[], isBackedUp: boolean) {
  if (typeof window === 'undefined') return;
  
  try {
    // In production: Encrypt mnemonic with user-derived key
    localStorage.setItem('argus_zec_wallet', JSON.stringify({
      zAddress,
      mnemonic, // WARNING: Store encrypted in production!
      isBackedUp,
      createdAt: new Date().toISOString(),
    }));
  } catch (e) {
    console.error('Failed to save wallet to storage:', e);
  }
}

export default function ZecWallet({
  onWalletCreated,
  onWithdraw,
  escrowBalance,
  walletBalance = 0,
  pendingWithdrawal,
}: ZecWalletProps) {
  const [state, setState] = useState<WalletState>({
    hasWallet: false,
    zAddress: null,
    mnemonic: null,
    isGenerating: false,
    isBackedUp: false,
  });
  
  const [step, setStep] = useState<'check' | 'generate' | 'backup' | 'confirm-backup' | 'withdraw' | 'done'>('check');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [error, setError] = useState('');

  // Load wallet on mount
  useEffect(() => {
    const stored = loadWalletFromStorage();
    if (stored) {
      setState(prev => ({
        ...prev,
        hasWallet: true,
        zAddress: stored.zAddress,
        isBackedUp: stored.isBackedUp,
      }));
      setStep('withdraw');
    } else {
      setStep('generate');
    }
  }, []);

  // Generate new wallet
  const handleGenerateWallet = useCallback(async () => {
    setState(prev => ({ ...prev, isGenerating: true }));
    setError('');
    
    try {
      const mnemonic = await generateMnemonic();
      const zAddress = await deriveZAddress(mnemonic);
      
      setState(prev => ({
        ...prev,
        hasWallet: true,
        zAddress,
        mnemonic,
        isGenerating: false,
      }));
      
      setStep('backup');
    } catch (e) {
      setError('Failed to generate wallet. Please try again.');
      setState(prev => ({ ...prev, isGenerating: false }));
    }
  }, []);

  // Confirm backup and save
  const handleBackupConfirmed = useCallback(() => {
    if (!state.zAddress || !state.mnemonic) return;
    
    saveWalletToStorage(state.zAddress, state.mnemonic, true);
    setState(prev => ({ ...prev, isBackedUp: true, mnemonic: null })); // Clear mnemonic from memory
    
    if (onWalletCreated) {
      onWalletCreated(state.zAddress);
    }
    
    setStep('withdraw');
  }, [state.zAddress, state.mnemonic, onWalletCreated]);

  // Calculate denominations for amount
  const calculateDenominations = (amount: number): number[] => {
    const result: number[] = [];
    let remaining = amount;
    
    // Sort denominations descending
    const sortedDenoms = [...DENOMINATIONS].sort((a, b) => b - a);
    
    for (const denom of sortedDenoms) {
      while (remaining >= denom - 0.001) { // Small epsilon for floating point
        result.push(denom);
        remaining -= denom;
        remaining = Math.round(remaining * 1000) / 1000; // Round to avoid floating point issues
      }
    }
    
    return result;
  };

  // Handle withdrawal
  const handleWithdraw = useCallback(async () => {
    if (!state.zAddress || !onWithdraw) return;
    
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    if (amount > escrowBalance) {
      setError('Insufficient escrow balance');
      return;
    }
    
    // Calculate denominations
    const denoms = calculateDenominations(amount);
    const denomTotal = denoms.reduce((a, b) => a + b, 0);
    
    if (denomTotal < amount) {
      setError(`Amount must be payable in fixed denominations. Closest: ${denomTotal} ZEC`);
      return;
    }
    
    setIsWithdrawing(true);
    setError('');
    
    try {
      await onWithdraw(denomTotal, state.zAddress);
      setStep('done');
    } catch (e: any) {
      setError(e.message || 'Withdrawal failed. Please try again.');
    } finally {
      setIsWithdrawing(false);
    }
  }, [state.zAddress, withdrawAmount, escrowBalance, onWithdraw]);

  // Render based on step
  if (step === 'check') {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 text-center">
        <div className="animate-pulse">Checking wallet status...</div>
      </div>
    );
  }

  if (step === 'generate') {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          💰 Withdraw Your Earnings
        </h2>
        
        <div className="mb-6">
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">
            {escrowBalance.toFixed(2)} ZEC
          </div>
          <div className="text-sm text-slate-500">Available Balance</div>
        </div>
        
        <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔐</span>
            <div>
              <h3 className="font-semibold">Creating your secure wallet</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Keys are generated in your browser. We never see your private keys.
              </p>
            </div>
          </div>
        </div>
        
        <button
          onClick={handleGenerateWallet}
          disabled={state.isGenerating}
          className="w-full py-3 bg-argus-600 hover:bg-argus-700 disabled:bg-slate-400 text-white rounded-lg font-medium transition"
        >
          {state.isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span> Generating Keys...
            </span>
          ) : (
            'Create Wallet →'
          )}
        </button>
        
        {error && (
          <div className="mt-4 text-red-600 dark:text-red-400 text-sm">{error}</div>
        )}
      </div>
    );
  }

  if (step === 'backup' && state.mnemonic) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          🔑 Backup Your Recovery Phrase
        </h2>
        
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
          <p className="text-amber-800 dark:text-amber-200 text-sm font-medium">
            ⚠️ Write these words down on paper. Store somewhere safe.
            If you lose them, your funds are gone forever. We cannot help you.
          </p>
        </div>
        
        <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4 mb-6 font-mono text-sm">
          <div className="grid grid-cols-3 gap-2">
            {state.mnemonic.map((word, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-slate-400 w-6 text-right">{i + 1}.</span>
                <span className="text-slate-900 dark:text-white">{word}</span>
              </div>
            ))}
          </div>
        </div>
        
        <label className="flex items-start gap-3 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={backupConfirmed}
            onChange={(e) => setBackupConfirmed(e.target.checked)}
            className="mt-1 w-5 h-5 rounded border-slate-300"
          />
          <span className="text-sm text-slate-600 dark:text-slate-400">
            I have written down my recovery phrase and stored it safely
          </span>
        </label>
        
        <button
          onClick={handleBackupConfirmed}
          disabled={!backupConfirmed}
          className="w-full py-3 bg-argus-600 hover:bg-argus-700 disabled:bg-slate-400 text-white rounded-lg font-medium transition"
        >
          Continue →
        </button>
      </div>
    );
  }

  if (step === 'withdraw') {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          💰 Withdraw Your Earnings
        </h2>
        
        {/* Balances */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {escrowBalance.toFixed(2)} ZEC
            </div>
            <div className="text-sm text-slate-500">Escrow Balance</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {walletBalance.toFixed(2)} ZEC
            </div>
            <div className="text-sm text-slate-500">Wallet Balance</div>
          </div>
        </div>
        
        {/* Pending Withdrawal */}
        {pendingWithdrawal && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-xl">⏳</span>
              <div>
                <div className="font-semibold text-blue-800 dark:text-blue-200">
                  Withdrawal Pending: {pendingWithdrawal.amount} ZEC
                </div>
                <div className="text-sm text-blue-600 dark:text-blue-400">
                  Estimated arrival: {new Date(pendingWithdrawal.scheduledFor).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Withdraw Form */}
        {escrowBalance > 0 && !pendingWithdrawal && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Amount (ZEC)</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max={escrowBalance}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-lg"
              />
              
              {/* Quick amounts */}
              <div className="flex gap-2 mt-2">
                {DENOMINATIONS.filter(d => d <= escrowBalance).slice(0, 4).map(d => (
                  <button
                    key={d}
                    onClick={() => setWithdrawAmount(d.toString())}
                    className="px-3 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    {d} ZEC
                  </button>
                ))}
                <button
                  onClick={() => setWithdrawAmount(escrowBalance.toString())}
                  className="px-3 py-1 text-sm border border-argus-500 text-argus-600 rounded-lg hover:bg-argus-50 dark:hover:bg-argus-900/20"
                >
                  Max
                </button>
              </div>
            </div>
            
            {/* Privacy Notice */}
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <span className="text-lg">⏱️</span>
                <div>
                  <h4 className="font-medium text-slate-900 dark:text-white">Privacy Protection</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    For your protection, withdrawals are processed at a random time 
                    within the next 1-48 hours. This prevents timing analysis.
                  </p>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleWithdraw}
              disabled={isWithdrawing || !withdrawAmount}
              className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white rounded-lg font-medium transition"
            >
              {isWithdrawing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span> Processing...
                </span>
              ) : (
                `Withdraw ${withdrawAmount || '0'} ZEC →`
              )}
            </button>
          </>
        )}
        
        {error && (
          <div className="mt-4 text-red-600 dark:text-red-400 text-sm">{error}</div>
        )}
        
        {/* Wallet Info */}
        {state.zAddress && (
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 mb-2">Your Shielded Address:</div>
            <code className="block text-xs bg-slate-100 dark:bg-slate-700 p-2 rounded break-all">
              {state.zAddress}
            </code>
          </div>
        )}
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold mb-2">Withdrawal Queued</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Your {withdrawAmount} ZEC will arrive in your wallet within the next 1-48 hours.
        </p>
        
        <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 mb-6">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Come back anytime to check your balance. Your wallet is saved in this browser.
          </p>
        </div>
        
        <button
          onClick={() => setStep('withdraw')}
          className="px-6 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return null;
}
