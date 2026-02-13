'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface Stats {
  totals: {
    users: number;
    sources: number;
    articles: number;
    briefings: number;
    domains: number;
  };
  activity: {
    articlesLast24h: number;
    articlesLast7d: number;
    activeSourcesLast24h: number;
  };
  timestamp: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
}

export default function AdminPage() {
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'sources' | 'settings'>('overview');
  const [actionMessage, setActionMessage] = useState('');
  const [platformSettings, setPlatformSettings] = useState<Record<string, any>>({});
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
        return;
      }
      // Only standard users can be admins
      if (user.type !== 'standard' || !user.isAdmin) {
        setError('Admin access required');
        setLoading(false);
        return;
      }
      fetchData();
    }
  }, [user, authLoading, router]);

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [statsRes, usersRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/stats`, { headers }),
        fetch(`${API_URL}/api/admin/users`, { headers }),
        fetch(`${API_URL}/api/admin/settings`, { headers }),
      ]);

      if (!statsRes.ok || !usersRes.ok) {
        throw new Error('Failed to fetch admin data');
      }

      const statsData = await statsRes.json();
      const usersData = await usersRes.json();
      const settingsData = await settingsRes.json();

      setStats(statsData.data);
      setUsers(usersData.data);
      if (settingsData.success) {
        // Convert to simpler format
        const settings: Record<string, any> = {};
        for (const [key, val] of Object.entries(settingsData.data || {})) {
          settings[key] = (val as any).value;
        }
        setPlatformSettings(settings);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const toggleAdmin = async (userId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isAdmin: !currentStatus }),
      });

      const data = await res.json();
      if (data.success) {
        setUsers(users.map(u => u.id === userId ? { ...u, isAdmin: !currentStatus } : u));
        setActionMessage(`User ${currentStatus ? 'demoted from' : 'promoted to'} admin`);
        setTimeout(() => setActionMessage(''), 3000);
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch {
      setActionMessage('Failed to update user');
    }
  };

  const deleteUser = async (userId: string, email: string) => {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;

    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        setUsers(users.filter(u => u.id !== userId));
        setActionMessage('User deleted');
        setTimeout(() => setActionMessage(''), 3000);
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch {
      setActionMessage('Failed to delete user');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">{error}</div>
          <Link href="/" className="text-blue-400 hover:underline">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-slate-400 hover:text-slate-200">
              ← Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-blue-400">Admin Panel</h1>
          </div>
          <div className="text-sm text-slate-400">
            Logged in as <span className="text-slate-200">{user?.type === 'standard' ? user.name : user?.codename}</span>
          </div>
        </div>
      </header>

      {/* Action message */}
      {actionMessage && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className={`p-3 rounded ${actionMessage.startsWith('Error') ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`}>
            {actionMessage}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 mt-6">
        <div className="flex gap-2 border-b border-slate-700">
          {(['overview', 'users', 'sources', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium capitalize ${
                activeTab === tab
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'overview' && stats && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard label="Users" value={stats.totals.users} />
              <StatCard label="Sources" value={stats.totals.sources} />
              <StatCard label="Articles" value={stats.totals.articles.toLocaleString()} />
              <StatCard label="Briefings" value={stats.totals.briefings} />
              <StatCard label="Domains" value={stats.totals.domains} />
            </div>

            {/* Activity */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Activity</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-2xl font-bold text-blue-400">
                    {stats.activity.articlesLast24h}
                  </div>
                  <div className="text-sm text-slate-400">Articles (24h)</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">
                    {stats.activity.articlesLast7d}
                  </div>
                  <div className="text-sm text-slate-400">Articles (7d)</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-400">
                    {stats.activity.activeSourcesLast24h}
                  </div>
                  <div className="text-sm text-slate-400">Active Sources (24h)</div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/sources/manage"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                >
                  Manage Sources
                </Link>
                <Link
                  href="/briefings"
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm"
                >
                  View Briefings
                </Link>
                <a
                  href="https://docs.argus.vitalpoint.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm"
                >
                  Documentation ↗
                </a>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="bg-slate-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Role</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Joined</th>
                  <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-700/50">
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3 text-slate-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          u.isAdmin ? 'bg-purple-900 text-purple-300' : 'bg-slate-600 text-slate-300'
                        }`}
                      >
                        {u.isAdmin ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {u.id !== user?.id && (
                        <>
                          <button
                            onClick={() => toggleAdmin(u.id, u.isAdmin)}
                            className="text-xs px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded"
                          >
                            {u.isAdmin ? 'Demote' : 'Promote'}
                          </button>
                          <button
                            onClick={() => deleteUser(u.id, u.email)}
                            className="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 rounded text-red-300"
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {u.id === user?.id && (
                        <span className="text-xs text-slate-500">(you)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'sources' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Global Sources</h2>
              <Link
                href="/sources/manage"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
              >
                Manage All Sources
              </Link>
            </div>
            <p className="text-slate-400">
              Source management is available in the{' '}
              <Link href="/sources/manage" className="text-blue-400 hover:underline">
                Sources Manager
              </Link>
              . Admin features include bulk operations, global source promotion, and user source oversight.
            </p>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Platform Settings</h2>
            
            {/* Marketplace Settings */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-md font-semibold mb-4 flex items-center gap-2">
                🛒 Marketplace Settings
              </h3>
              
              <div className="space-y-4">
                {/* Platform Fee */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Platform Fee (%)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={platformSettings.marketplace_fee_percent || 5}
                      onChange={(e) => setPlatformSettings(prev => ({
                        ...prev,
                        marketplace_fee_percent: parseFloat(e.target.value)
                      }))}
                      className="w-32 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                    <span className="text-slate-400 text-sm">
                      Fee taken from each marketplace transaction
                    </span>
                  </div>
                </div>

                {/* Min Withdrawal */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Minimum Withdrawal (USDC)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={platformSettings.min_withdrawal_usdc || 10}
                      onChange={(e) => setPlatformSettings(prev => ({
                        ...prev,
                        min_withdrawal_usdc: parseFloat(e.target.value)
                      }))}
                      className="w-32 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                    <span className="text-slate-400 text-sm">
                      Minimum amount creators can withdraw
                    </span>
                  </div>
                </div>

                {/* Platform Wallet */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Platform Wallet
                  </label>
                  <input
                    type="text"
                    value={platformSettings.platform_wallet || 'argus-intel.near'}
                    onChange={(e) => setPlatformSettings(prev => ({
                      ...prev,
                      platform_wallet: e.target.value
                    }))}
                    placeholder="account.near"
                    className="w-full max-w-md px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  />
                  <p className="text-slate-400 text-sm mt-1">
                    NEAR wallet that receives platform fees
                  </p>
                </div>

                {/* Marketplace Enabled */}
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={platformSettings.marketplace_enabled !== false}
                      onChange={(e) => setPlatformSettings(prev => ({
                        ...prev,
                        marketplace_enabled: e.target.checked
                      }))}
                      className="w-5 h-5 rounded"
                    />
                    <span className="text-sm font-medium text-slate-300">
                      Marketplace Enabled
                    </span>
                  </label>
                  <p className="text-slate-400 text-sm mt-1 ml-8">
                    When disabled, new subscriptions are paused
                  </p>
                </div>
              </div>

              {/* Save Button */}
              <div className="mt-6 pt-4 border-t border-slate-700">
                <button
                  onClick={async () => {
                    setSavingSettings(true);
                    try {
                      const res = await fetch(`${API_URL}/api/admin/settings`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify(platformSettings),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setActionMessage('Settings saved successfully');
                        setTimeout(() => setActionMessage(''), 3000);
                      } else {
                        setActionMessage(`Error: ${data.error}`);
                      }
                    } catch {
                      setActionMessage('Failed to save settings');
                    } finally {
                      setSavingSettings(false);
                    }
                  }}
                  disabled={savingSettings}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:opacity-50"
                >
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>

            {/* Current Settings Summary */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-md font-semibold mb-4">Current Configuration</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-2xl font-bold text-blue-400">
                    {platformSettings.marketplace_fee_percent || 5}%
                  </div>
                  <div className="text-sm text-slate-400">Platform Fee</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">
                    ${platformSettings.min_withdrawal_usdc || 10}
                  </div>
                  <div className="text-sm text-slate-400">Min Withdrawal</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-400">
                    {(100 - (platformSettings.marketplace_fee_percent || 5))}%
                  </div>
                  <div className="text-sm text-slate-400">Creator Payout</div>
                </div>
                <div>
                  <div className={`text-2xl font-bold ${platformSettings.marketplace_enabled !== false ? 'text-green-400' : 'text-red-400'}`}>
                    {platformSettings.marketplace_enabled !== false ? 'ON' : 'OFF'}
                  </div>
                  <div className="text-sm text-slate-400">Marketplace</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-slate-400">{label}</div>
    </div>
  );
}
