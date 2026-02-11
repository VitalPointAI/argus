'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

// ============================================
// HUMINT Source Settings Component
// ============================================
function HumintSettings({ user }: { user: { codename: string; nearAccountId?: string } }) {
  const { logout } = useAuth();
  const router = useRouter();
  const [nearBalance, setNearBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  useEffect(() => {
    if (user.nearAccountId) {
      fetchNearBalance();
    }
  }, [user.nearAccountId]);

  const fetchNearBalance = async () => {
    if (!user.nearAccountId) return;
    setLoadingBalance(true);
    try {
      // Query NEAR RPC for account balance
      const res = await fetch('https://rpc.mainnet.near.org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'dontcare',
          method: 'query',
          params: {
            request_type: 'view_account',
            finality: 'final',
            account_id: user.nearAccountId,
          },
        }),
      });
      const data = await res.json();
      if (data.result?.amount) {
        // Convert yoctoNEAR to NEAR (1 NEAR = 10^24 yoctoNEAR)
        const nearAmount = parseFloat(data.result.amount) / 1e24;
        setNearBalance(nearAmount.toFixed(4));
      }
    } catch (error) {
      console.error('Failed to fetch NEAR balance:', error);
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">Source Account</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8">
          Manage your anonymous HUMINT source identity
        </p>

        {/* Identity Card */}
        <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center text-3xl">
              🎭
            </div>
            <div>
              <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">CODENAME</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{user.codename}</p>
            </div>
          </div>

          <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">Account Type</span>
              <span className="text-sm font-medium text-purple-600 dark:text-purple-400">Anonymous Source</span>
            </div>
            <p className="text-xs text-slate-500">
              Your identity is protected. Only your codename is visible to others.
            </p>
          </div>
        </section>

        {/* NEAR Wallet */}
        <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <span>💎</span> NEAR Wallet
          </h2>

          {user.nearAccountId ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Account ID</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-slate-100 dark:bg-slate-700/50 px-3 py-2 rounded-lg text-sm font-mono text-slate-800 dark:text-slate-200 break-all">
                    {user.nearAccountId}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(user.nearAccountId!)}
                    className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition"
                    title="Copy"
                  >
                    📋
                  </button>
                </div>
              </div>

              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Balance</p>
                <div className="flex items-center gap-2">
                  {loadingBalance ? (
                    <div className="animate-pulse bg-slate-200 dark:bg-slate-700 h-8 w-24 rounded"></div>
                  ) : (
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {nearBalance !== null ? `${nearBalance} Ⓝ` : 'Unable to fetch'}
                    </p>
                  )}
                  <button
                    onClick={fetchNearBalance}
                    disabled={loadingBalance}
                    className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition"
                  >
                    🔄
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Receive payments for verified intel</p>
                <a
                  href={`https://nearblocks.io/address/${user.nearAccountId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-argus-600 hover:text-argus-500 dark:text-argus-400 dark:hover:text-argus-300 flex items-center gap-1"
                >
                  View on NearBlocks →
                </a>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-slate-600 dark:text-slate-400 mb-2">No NEAR account linked</p>
              <p className="text-sm text-slate-500">
                A NEAR account will be created when you submit your first intel report.
              </p>
            </div>
          )}
        </section>

        {/* Capabilities */}
        <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
            What You Can Do
          </h2>
          <ul className="space-y-3">
            <li className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <span className="text-green-500 dark:text-green-400">✓</span>
              Submit intelligence reports anonymously
            </li>
            <li className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <span className="text-green-500 dark:text-green-400">✓</span>
              Claim bounties for verified information
            </li>
            <li className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <span className="text-green-500 dark:text-green-400">✓</span>
              Build reputation under your codename
            </li>
            <li className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <span className="text-green-500 dark:text-green-400">✓</span>
              Receive direct tips in NEAR
            </li>
          </ul>

          <div className="mt-6">
            <Link
              href="/sources/humint"
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition"
            >
              Submit Intel Report →
            </Link>
          </div>
        </section>

        {/* Security Notice */}
        <section className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-500/30 rounded-xl p-6 mb-6">
          <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">🔐 Security Notice</h3>
          <ul className="text-sm text-yellow-700 dark:text-yellow-100/80 space-y-2">
            <li>• Your passkey is stored only on this device</li>
            <li>• If you lose access to this device, you cannot recover this account</li>
            <li>• Consider using the same device consistently for submissions</li>
            <li>• Never share your device with untrusted parties</li>
          </ul>
        </section>

        {/* Logout */}
        <div className="flex justify-between items-center">
          <Link
            href="/dashboard"
            className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition"
          >
            ← Back to Dashboard
          </Link>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-red-400 hover:text-red-300 transition"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Standard User Settings (existing code below)
// ============================================

// Add New Domain Form Component
function AddDomainForm({ onDomainAdded }: { onDomainAdded: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  const [newDomainDesc, setNewDomainDesc] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainName.trim()) return;

    setAdding(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_URL}/api/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newDomainName.trim(),
          description: newDomainDesc.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(`Domain "${data.data.name}" created!`);
        setNewDomainName('');
        setNewDomainDesc('');
        onDomainAdded();
        setTimeout(() => {
          setSuccess(null);
          setShowForm(false);
        }, 2000);
      } else {
        setError(data.error || 'Failed to create domain');
      }
    } catch (err) {
      setError('Failed to create domain');
    } finally {
      setAdding(false);
    }
  };

  if (!showForm) {
    return (
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setShowForm(true)}
          className="text-sm text-argus-600 hover:text-argus-700 dark:text-argus-400 flex items-center gap-1"
        >
          <span>➕</span> Add new domain
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
      <form onSubmit={handleAddDomain} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Domain Name *
          </label>
          <input
            type="text"
            value={newDomainName}
            onChange={(e) => setNewDomainName(e.target.value)}
            placeholder="e.g., Quantum Computing, Arctic Security"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-argus-500 focus:border-transparent"
            required
            minLength={2}
            maxLength={50}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Description (optional)
          </label>
          <input
            type="text"
            value={newDomainDesc}
            onChange={(e) => setNewDomainDesc(e.target.value)}
            placeholder="Brief description of this domain"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-argus-500 focus:border-transparent"
            maxLength={200}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {success && (
          <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={adding || !newDomainName.trim()}
            className="px-4 py-2 bg-argus-600 hover:bg-argus-700 disabled:bg-argus-400 text-white rounded-lg text-sm font-medium transition"
          >
            {adding ? 'Adding...' : 'Add Domain'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowForm(false);
              setNewDomainName('');
              setNewDomainDesc('');
              setError(null);
            }}
            className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// Telegram Connect Section Component
function TelegramSection({ token, onUpdate }: { token: string | null; onUpdate: () => void }) {
  const [status, setStatus] = useState<{ connected: boolean; chatId?: string; username?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectData, setConnectData] = useState<{ code: string; connectUrl: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      fetchStatus();
    }
  }, [token]);

  // Poll for connection status when waiting for user to connect
  useEffect(() => {
    if (!connectData || !token) return;

    const interval = setInterval(async () => {
      const res = await fetch(`${API_URL}/api/profile/telegram/status`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success && data.data.connected) {
        setStatus(data.data);
        setConnectData(null);
        onUpdate();
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [connectData, token]);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/profile/telegram/status`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setStatus(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch Telegram status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/profile/telegram/connect`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setConnectData(data.data);
      } else {
        setError(data.error || 'Failed to generate connect code');
      }
    } catch (err) {
      setError('Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Telegram? You will no longer receive briefings via Telegram.')) return;
    
    try {
      const res = await fetch(`${API_URL}/api/profile/telegram/disconnect`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setStatus({ connected: false });
        onUpdate();
      }
    } catch (err) {
      setError('Failed to disconnect');
    }
  };

  if (loading) {
    return (
      <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 mb-6">
        <div className="animate-pulse h-20 bg-slate-200 dark:bg-slate-700 rounded"></div>
      </section>
    );
  }

  return (
    <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 mb-6">
      <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">
        📱 Telegram Notifications
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Receive your personalized briefings directly in Telegram.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}

      {status?.connected ? (
        // Connected state
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white text-lg">
              ✓
            </div>
            <div>
              <p className="font-medium text-green-800 dark:text-green-400">Connected to Telegram</p>
              <p className="text-sm text-green-600 dark:text-green-500">
                {status.username ? `@${status.username}` : `Chat ID: ${status.chatId}`}
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-400">
            You'll receive briefings via <span className="font-medium">@argusbriefing_bot</span> at your scheduled delivery times.
          </p>

          <button
            onClick={handleDisconnect}
            className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            Disconnect Telegram
          </button>
        </div>
      ) : connectData ? (
        // Waiting for user to connect
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="font-medium text-blue-800 dark:text-blue-400 mb-2">
              Click the button below to connect:
            </p>
            <a
              href={connectData.connectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] hover:bg-[#0077b5] text-white rounded-lg font-medium transition"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
              </svg>
              Open in Telegram
            </a>
          </div>

          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
            <p>Or manually:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Open Telegram and find <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">@argusbriefing_bot</span></li>
              <li>Send: <span className="font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">/start {connectData.code}</span></li>
            </ol>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-argus-600 border-t-transparent"></div>
            Waiting for connection...
          </div>

          <button
            onClick={() => setConnectData(null)}
            className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        // Not connected state
        <div className="space-y-4">
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] hover:bg-[#0077b5] disabled:bg-slate-400 text-white rounded-lg font-medium transition"
          >
            {connecting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Connecting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                </svg>
                Connect Telegram
              </>
            )}
          </button>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Link your Telegram account to receive briefings via @argusbriefing_bot
          </p>
        </div>
      )}
    </section>
  );
}

interface NotificationEmails {
  addresses: string[];
  primary: string;
}

interface NotificationPreferences {
  notificationEmails?: NotificationEmails;
  email: {
    enabled: boolean;
    address?: string;
    briefings: {
      enabled: boolean;
      deliveryTimes: string[];
      timezone: string;
      domains: string[];
      format: 'executive' | 'summary' | 'full';
      includeAudio: boolean;
    };
    alerts: {
      enabled: boolean;
      minConfidence: number;
    };
    digest: {
      enabled: boolean;
      frequency: 'daily' | 'weekly' | 'never';
    };
  };
  telegram: {
    enabled: boolean;
    chatId?: string;
  };
  web: {
    darkMode: boolean;
    compactView: boolean;
  };
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  preferences: NotificationPreferences;
  trustScore: number;
  totalRatingsGiven: number;
  accurateRatings: number;
  createdAt: string;
}

export default function SettingsPage() {
  const { user, token, loading: authLoading, isHumint } = useAuth();
  const router = useRouter();

  // Show HUMINT-specific settings for source accounts
  if (!authLoading && user && isHumint) {
    const humintUser = user as { codename: string; nearAccountId?: string };
    return <HumintSettings user={humintUser} />;
  }
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [availableDomains, setAvailableDomains] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [notificationEmails, setNotificationEmails] = useState<NotificationEmails>({ addresses: [], primary: '' });
  const [newEmail, setNewEmail] = useState('');
  const [emailPrefs, setEmailPrefs] = useState<NotificationPreferences['email']>({
    enabled: false,
    address: '',
    briefings: { 
      enabled: true, 
      deliveryTimes: ['06:00'],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      domains: [],
      format: 'executive',
      includeAudio: false,
    },
    alerts: { enabled: false, minConfidence: 80 },
    digest: { enabled: false, frequency: 'weekly' },
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    // Token is now in HttpOnly cookie - no need to wait for it
    fetchProfile();
    fetchDomains();
  }, [user, authLoading]);

  const fetchDomains = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/domains`);
      const data = await res.json();
      if (data.success) {
        setAvailableDomains(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch domains:', error);
    }
  };

  const fetchProfile = async () => {
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setProfile(data.data);
        setName(data.data.name);
        if (data.data.preferences?.email) {
          setEmailPrefs(data.data.preferences.email);
        }
        if (data.data.preferences?.notificationEmails) {
          setNotificationEmails(data.data.preferences.notificationEmails);
        }
        setSelectedDomains(data.data.preferences?.domains?.selected || []);
      } else {
        setError(data.error || 'Failed to load profile');
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    setMessage(null);
    
    try {
      // Update name
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });

      // Update domain preferences
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/preferences/domains`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ selected: selectedDomains }),
      });

      // Update notification emails
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/preferences/notificationEmails`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(notificationEmails),
      });

      // Update email preferences
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/preferences/email`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(emailPrefs),
      });

      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      fetchProfile();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-argus-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 dark:text-slate-400 mb-4">{error || 'Failed to load profile'}</p>
          <button
            onClick={() => {
              setLoading(true);
              fetchProfile();
            }}
            className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-8">Settings</h1>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* Profile Section */}
        <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">Profile</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-argus-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={profile.email}
                disabled
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-400 cursor-not-allowed"
              />
              <p className="text-xs text-slate-500 mt-1">Contact support to change your email</p>
            </div>

            <div className="pt-2">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                <span className="font-medium">Trust Score:</span> {(profile.trustScore * 100).toFixed(0)}%
                <span className="mx-2">•</span>
                <span className="font-medium">Ratings Given:</span> {profile.totalRatingsGiven}
              </p>
            </div>
          </div>
        </section>

        {/* Notification Emails */}
        <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">
            📧 Notification Emails
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Add email addresses for receiving notifications. These can be different from your login email.
          </p>

          {/* Current emails */}
          <div className="space-y-2 mb-4">
            {/* Account email (always shown) */}
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="primaryEmail"
                  checked={!notificationEmails.primary || notificationEmails.primary === profile.email}
                  onChange={() => setNotificationEmails({ ...notificationEmails, primary: '' })}
                  className="w-4 h-4 text-argus-600 focus:ring-argus-500"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-white">{profile.email}</p>
                  <p className="text-xs text-slate-500">Account email (login)</p>
                </div>
              </div>
              {(!notificationEmails.primary || notificationEmails.primary === profile.email) && (
                <span className="text-xs bg-argus-100 dark:bg-argus-900/30 text-argus-700 dark:text-argus-400 px-2 py-1 rounded">
                  Primary
                </span>
              )}
            </div>

            {/* Additional notification emails */}
            {notificationEmails.addresses.map((email, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="primaryEmail"
                    checked={notificationEmails.primary === email}
                    onChange={() => setNotificationEmails({ ...notificationEmails, primary: email })}
                    className="w-4 h-4 text-argus-600 focus:ring-argus-500"
                  />
                  <p className="text-sm font-medium text-slate-800 dark:text-white">{email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {notificationEmails.primary === email && (
                    <span className="text-xs bg-argus-100 dark:bg-argus-900/30 text-argus-700 dark:text-argus-400 px-2 py-1 rounded">
                      Primary
                    </span>
                  )}
                  <button
                    onClick={() => {
                      const newAddresses = notificationEmails.addresses.filter((_, i) => i !== idx);
                      const newPrimary = notificationEmails.primary === email ? '' : notificationEmails.primary;
                      setNotificationEmails({ addresses: newAddresses, primary: newPrimary });
                    }}
                    className="text-red-500 hover:text-red-700 p-1"
                    title="Remove email"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add new email */}
          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Add another email address..."
              className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-argus-500 focus:border-transparent text-sm"
            />
            <button
              onClick={() => {
                if (newEmail && !notificationEmails.addresses.includes(newEmail) && newEmail !== profile.email) {
                  setNotificationEmails({
                    ...notificationEmails,
                    addresses: [...notificationEmails.addresses, newEmail],
                  });
                  setNewEmail('');
                }
              }}
              disabled={!newEmail || notificationEmails.addresses.includes(newEmail) || newEmail === profile.email}
              className="px-4 py-2 bg-argus-600 hover:bg-argus-700 disabled:bg-slate-400 text-white rounded-lg text-sm font-medium transition"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Select which email should receive notifications by clicking the radio button.
          </p>
        </section>

        {/* Domain Interests */}
        <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">
            🎯 Domain Interests
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Select the domains you want to follow. Your dashboard, briefings, and alerts will be filtered to these areas.
            {selectedDomains.length === 0 && ' Currently showing all domains.'}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {availableDomains.map((domain) => {
              const isSelected = selectedDomains.includes(domain.id);
              return (
                <button
                  key={domain.id}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedDomains(selectedDomains.filter(id => id !== domain.id));
                    } else {
                      setSelectedDomains([...selectedDomains, domain.id]);
                    }
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition text-left ${
                    isSelected
                      ? 'bg-argus-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {isSelected ? '✓ ' : ''}{domain.name}
                </button>
              );
            })}
          </div>

          {selectedDomains.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {selectedDomains.length} domain{selectedDomains.length !== 1 ? 's' : ''} selected
              </p>
              <button
                onClick={() => setSelectedDomains([])}
                className="text-sm text-argus-600 hover:text-argus-700 dark:text-argus-400"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Add New Domain */}
          <AddDomainForm onDomainAdded={fetchDomains} />
        </section>

        {/* Email Notifications */}
        <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
            Email Notifications
          </h2>

          <div className="space-y-6">
            {/* Master toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800 dark:text-white">Enable Email Notifications</p>
                <p className="text-sm text-slate-500">Receive briefings and alerts via email</p>
              </div>
              <button
                onClick={() => setEmailPrefs({ ...emailPrefs, enabled: !emailPrefs.enabled })}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  emailPrefs.enabled ? 'bg-argus-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  emailPrefs.enabled ? 'translate-x-8' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {emailPrefs.enabled && (
              <>
                {/* Show which email will receive notifications */}
                <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    <span className="font-medium">Sending to:</span>{' '}
                    <span className="text-slate-800 dark:text-white">
                      {notificationEmails.primary || profile.email}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Manage notification emails in the section above
                  </p>
                </div>

                {/* Briefings */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-slate-800 dark:text-white">Daily Briefings</p>
                      <p className="text-sm text-slate-500">AI-generated executive intelligence summaries</p>
                    </div>
                    <button
                      onClick={() => setEmailPrefs({
                        ...emailPrefs,
                        briefings: { ...emailPrefs.briefings, enabled: !emailPrefs.briefings.enabled }
                      })}
                      className={`relative w-14 h-7 rounded-full transition-colors ${
                        emailPrefs.briefings.enabled ? 'bg-argus-600' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        emailPrefs.briefings.enabled ? 'translate-x-8' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  {emailPrefs.briefings.enabled && (
                    <div className="ml-4 space-y-4">
                      {/* Delivery Times */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Delivery Times
                        </label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {(emailPrefs.briefings.deliveryTimes || ['06:00']).map((time, idx) => (
                            <div key={idx} className="flex items-center gap-1 bg-argus-100 dark:bg-argus-900/30 px-3 py-1 rounded-lg">
                              <input
                                type="time"
                                value={time}
                                onChange={(e) => {
                                  const times = [...(emailPrefs.briefings.deliveryTimes || ['06:00'])];
                                  times[idx] = e.target.value;
                                  setEmailPrefs({
                                    ...emailPrefs,
                                    briefings: { ...emailPrefs.briefings, deliveryTimes: times }
                                  });
                                }}
                                className="bg-transparent border-none text-sm text-argus-700 dark:text-argus-300 focus:outline-none"
                              />
                              {(emailPrefs.briefings.deliveryTimes || []).length > 1 && (
                                <button
                                  onClick={() => {
                                    const times = (emailPrefs.briefings.deliveryTimes || []).filter((_, i) => i !== idx);
                                    setEmailPrefs({
                                      ...emailPrefs,
                                      briefings: { ...emailPrefs.briefings, deliveryTimes: times }
                                    });
                                  }}
                                  className="text-red-500 hover:text-red-700 text-xs"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => {
                              const times = [...(emailPrefs.briefings.deliveryTimes || ['06:00']), '18:00'];
                              setEmailPrefs({
                                ...emailPrefs,
                                briefings: { ...emailPrefs.briefings, deliveryTimes: times }
                              });
                            }}
                            className="px-3 py-1 text-sm border border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:border-argus-500 text-slate-500 hover:text-argus-600"
                          >
                            + Add time
                          </button>
                        </div>
                        <p className="text-xs text-slate-500">Times shown in your local timezone</p>
                      </div>

                      {/* Format preference */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Briefing Format
                        </label>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { value: 'executive', label: '📊 Executive', desc: 'Structured sections with context' },
                            { value: 'summary', label: '📝 Summary', desc: 'Quick bullet points' },
                          ].map((format) => (
                            <button
                              key={format.value}
                              onClick={() => setEmailPrefs({
                                ...emailPrefs,
                                briefings: { ...emailPrefs.briefings, format: format.value as any }
                              })}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                (emailPrefs.briefings as any).format === format.value
                                  ? 'bg-argus-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                              }`}
                            >
                              {format.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Audio option */}
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="includeAudio"
                          checked={(emailPrefs.briefings as any).includeAudio || false}
                          onChange={(e) => setEmailPrefs({
                            ...emailPrefs,
                            briefings: { ...emailPrefs.briefings, includeAudio: e.target.checked } as any
                          })}
                          className="w-4 h-4 rounded border-slate-300 text-argus-600 focus:ring-argus-500"
                        />
                        <label htmlFor="includeAudio" className="text-sm text-slate-700 dark:text-slate-300">
                          🎧 Include audio version (podcast-style narration)
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Alerts */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-slate-800 dark:text-white">Breaking Alerts</p>
                      <p className="text-sm text-slate-500">Immediate notifications for high-confidence stories</p>
                    </div>
                    <button
                      onClick={() => setEmailPrefs({
                        ...emailPrefs,
                        alerts: { ...emailPrefs.alerts, enabled: !emailPrefs.alerts.enabled }
                      })}
                      className={`relative w-14 h-7 rounded-full transition-colors ${
                        emailPrefs.alerts.enabled ? 'bg-argus-600' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        emailPrefs.alerts.enabled ? 'translate-x-8' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  {emailPrefs.alerts.enabled && (
                    <div className="ml-4">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Minimum Confidence: {emailPrefs.alerts.minConfidence}%
                      </label>
                      <input
                        type="range"
                        min="50"
                        max="100"
                        value={emailPrefs.alerts.minConfidence}
                        onChange={(e) => setEmailPrefs({
                          ...emailPrefs,
                          alerts: { ...emailPrefs.alerts, minConfidence: parseInt(e.target.value) }
                        })}
                        className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-argus-600"
                      />
                    </div>
                  )}
                </div>

                {/* Weekly Digest */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-800 dark:text-white">Weekly Digest</p>
                      <p className="text-sm text-slate-500">Summary of the week's top stories</p>
                    </div>
                    <button
                      onClick={() => setEmailPrefs({
                        ...emailPrefs,
                        digest: { ...emailPrefs.digest, enabled: !emailPrefs.digest.enabled }
                      })}
                      className={`relative w-14 h-7 rounded-full transition-colors ${
                        emailPrefs.digest.enabled ? 'bg-argus-600' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        emailPrefs.digest.enabled ? 'translate-x-8' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Telegram Notifications */}
        <TelegramSection token={token} onUpdate={fetchProfile} />

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={saveProfile}
            disabled={saving}
            className="px-6 py-3 bg-argus-600 hover:bg-argus-700 disabled:bg-argus-400 text-white rounded-lg font-medium transition flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
