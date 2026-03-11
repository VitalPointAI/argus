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

interface LLMConfig {
  provider: 'near-ai' | 'anthropic';
  model: string;
  apiKeyMasked: string;
  oauthConnected: boolean;
}

interface OAuthStatus {
  connected: boolean;
  tokenExpiresAt: string | null;
  provider: string;
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
  
  // LLM Config state
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: 'near-ai',
    model: 'deepseek-ai/DeepSeek-V3.1',
    apiKeyMasked: '',
    oauthConnected: false,
  });
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus>({
    connected: false,
    tokenExpiresAt: null,
    provider: 'anthropic',
  });
  const [newApiKey, setNewApiKey] = useState('');
  const [newOAuthToken, setNewOAuthToken] = useState('');
  const [savingLLM, setSavingLLM] = useState(false);

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
      const fetchOpts = { credentials: 'include' as RequestCredentials };
      
      const [statsRes, usersRes, settingsRes, llmRes, oauthRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/stats`, fetchOpts),
        fetch(`${API_URL}/api/admin/users`, fetchOpts),
        fetch(`${API_URL}/api/admin/settings`, fetchOpts),
        fetch(`${API_URL}/api/admin/llm/config`, fetchOpts),
        fetch(`${API_URL}/api/admin/oauth/status`, fetchOpts),
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
      
      // Load LLM config
      if (llmRes.ok) {
        const llmData = await llmRes.json();
        if (llmData.success) {
          setLlmConfig(llmData.data);
        }
      }
      
      // Load OAuth status
      if (oauthRes.ok) {
        const oauthData = await oauthRes.json();
        if (oauthData.success) {
          setOauthStatus(oauthData.data);
        }
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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

  const saveLLMConfig = async () => {
    setSavingLLM(true);
    try {
      const body: Record<string, any> = {
        provider: llmConfig.provider,
        model: llmConfig.model,
      };
      if (newApiKey) {
        body.apiKey = newApiKey;
      }
      
      const res = await fetch(`${API_URL}/api/admin/llm/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      
      const data = await res.json();
      if (data.success) {
        setActionMessage('LLM configuration saved');
        setNewApiKey('');
        // Refresh config
        const llmRes = await fetch(`${API_URL}/api/admin/llm/config`, { credentials: 'include' });
        if (llmRes.ok) {
          const llmData = await llmRes.json();
          if (llmData.success) setLlmConfig(llmData.data);
        }
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch {
      setActionMessage('Failed to save LLM config');
    } finally {
      setSavingLLM(false);
      setTimeout(() => setActionMessage(''), 3000);
    }
  };

  const saveOAuthToken = async () => {
    if (!newOAuthToken.trim()) {
      setActionMessage('Error: Please enter an OAuth token');
      return;
    }
    
    setSavingLLM(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: newOAuthToken }),
      });
      
      const data = await res.json();
      if (data.success) {
        setActionMessage('OAuth token saved successfully');
        setNewOAuthToken('');
        setOauthStatus({ ...oauthStatus, connected: true });
        setLlmConfig({ ...llmConfig, oauthConnected: true });
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch {
      setActionMessage('Failed to save OAuth token');
    } finally {
      setSavingLLM(false);
      setTimeout(() => setActionMessage(''), 3000);
    }
  };

  const disconnectOAuth = async () => {
    if (!confirm('Disconnect Anthropic OAuth? You will need to reconnect or use an API key.')) return;
    
    setSavingLLM(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/oauth/disconnect`, {
        method: 'POST',
        credentials: 'include',
      });
      
      const data = await res.json();
      if (data.success) {
        setActionMessage('OAuth disconnected');
        setOauthStatus({ ...oauthStatus, connected: false });
        setLlmConfig({ ...llmConfig, oauthConnected: false });
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch {
      setActionMessage('Failed to disconnect OAuth');
    } finally {
      setSavingLLM(false);
      setTimeout(() => setActionMessage(''), 3000);
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

      {/* Tabs - scrollable on mobile */}
      <div className="max-w-7xl mx-auto px-4 mt-6">
        <div className="flex gap-2 border-b border-slate-700 overflow-x-auto pb-px scrollbar-hide">
          {(['overview', 'users', 'sources', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium capitalize whitespace-nowrap flex-shrink-0 ${
                activeTab === tab
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === 'overview' ? '📊 Overview' : 
               tab === 'users' ? '👥 Users' :
               tab === 'sources' ? '🔗 Sources' : '⚙️ Settings'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'overview' && stats && (
          <div className="space-y-6">
            {/* Stats Grid - responsive */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <StatCard label="Users" value={stats.totals.users} />
              <StatCard label="Sources" value={stats.totals.sources} />
              <StatCard label="Articles" value={stats.totals.articles.toLocaleString()} />
              <StatCard label="Briefings" value={stats.totals.briefings} />
              <StatCard label="Domains" value={stats.totals.domains} />
            </div>

            {/* Activity */}
            <div className="bg-slate-800 rounded-lg p-4 sm:p-6">
              <h2 className="text-lg font-semibold mb-4">Activity</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <div className="space-y-4 sm:space-y-6">
            <h2 className="text-lg font-semibold">Platform Settings</h2>
            
            {/* LLM Configuration */}
            <div className="bg-slate-800 rounded-lg p-4 sm:p-6">
              <h3 className="text-md font-semibold mb-4 flex items-center gap-2">
                🤖 LLM Configuration
              </h3>
              
              <div className="space-y-4">
                {/* Provider Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Provider
                  </label>
                  <select
                    value={llmConfig.provider}
                    onChange={(e) => setLlmConfig(prev => ({
                      ...prev,
                      provider: e.target.value as 'near-ai' | 'anthropic',
                      model: e.target.value === 'near-ai' ? 'deepseek-ai/DeepSeek-V3.1' : 'claude-sonnet-4-20250514',
                    }))}
                    className="w-full max-w-xs px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  >
                    <option value="near-ai">Near AI Cloud (DeepSeek V3.1)</option>
                    <option value="anthropic">Anthropic (Claude)</option>
                  </select>
                </div>
                
                {/* Model Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Model
                  </label>
                  <input
                    type="text"
                    value={llmConfig.model}
                    onChange={(e) => setLlmConfig(prev => ({
                      ...prev,
                      model: e.target.value
                    }))}
                    placeholder={llmConfig.provider === 'near-ai' ? 'deepseek-ai/DeepSeek-V3.1' : 'claude-sonnet-4-20250514'}
                    className="w-full max-w-md px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  />
                  {llmConfig.provider === 'anthropic' && (
                    <p className="text-slate-400 text-sm mt-1">
                      e.g., claude-sonnet-4-20250514, claude-opus-4-20250514
                    </p>
                  )}
                </div>
                
                {/* API Key (for both providers) */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    API Key
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="password"
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      placeholder={llmConfig.apiKeyMasked || 'Enter new API key'}
                      className="w-full max-w-md px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                    {llmConfig.apiKeyMasked && (
                      <span className="text-slate-400 text-sm self-center">
                        Current: {llmConfig.apiKeyMasked}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm mt-1">
                    {llmConfig.provider === 'near-ai' 
                      ? 'Get API key from cloud.near.ai'
                      : 'Get API key from console.anthropic.com'}
                  </p>
                </div>
                
                {/* Anthropic OAuth Section */}
                {llmConfig.provider === 'anthropic' && (
                  <div className="mt-6 pt-4 border-t border-slate-700">
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <span className="text-orange-400">⚡</span>
                      Anthropic OAuth (Optional)
                    </h4>
                    
                    {oauthStatus.connected ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                          <span className="text-green-400 font-medium">OAuth Connected</span>
                        </div>
                        {oauthStatus.tokenExpiresAt && (
                          <p className="text-slate-400 text-sm">
                            Expires: {new Date(oauthStatus.tokenExpiresAt).toLocaleString()}
                          </p>
                        )}
                        <button
                          onClick={disconnectOAuth}
                          disabled={savingLLM}
                          className="px-4 py-2 bg-red-900 hover:bg-red-800 rounded text-sm text-red-300 disabled:opacity-50"
                        >
                          Disconnect OAuth
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-slate-400 text-sm">
                          Paste an OAuth token from <code className="bg-slate-700 px-1 rounded">claude login</code> or <code className="bg-slate-700 px-1 rounded">claude setup-token</code>
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="password"
                            value={newOAuthToken}
                            onChange={(e) => setNewOAuthToken(e.target.value)}
                            placeholder="sk-ant-oat-..."
                            className="w-full max-w-md px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white font-mono text-sm"
                          />
                          <button
                            onClick={saveOAuthToken}
                            disabled={savingLLM || !newOAuthToken.trim()}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded text-sm disabled:opacity-50"
                          >
                            Save Token
                          </button>
                        </div>
                        <p className="text-slate-500 text-xs">
                          OAuth tokens start with <code className="bg-slate-700 px-1 rounded">sk-ant-oat</code> and don&apos;t auto-renew.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Save LLM Config Button */}
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <button
                    onClick={saveLLMConfig}
                    disabled={savingLLM}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:opacity-50"
                  >
                    {savingLLM ? 'Saving...' : 'Save LLM Configuration'}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Marketplace Settings */}
            <div className="bg-slate-800 rounded-lg p-4 sm:p-6">
              <h3 className="text-md font-semibold mb-4 flex items-center gap-2">
                🛒 Marketplace Settings
              </h3>
              
              <div className="space-y-4">
                {/* Platform Fee */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Platform Fee (%)
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
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
                      className="w-full sm:w-32 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                    <span className="text-slate-400 text-sm">
                      Fee taken from each transaction
                    </span>
                  </div>
                </div>

                {/* Min Withdrawal */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Minimum Withdrawal (USDC)
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={platformSettings.min_withdrawal_usdc || 10}
                      onChange={(e) => setPlatformSettings(prev => ({
                        ...prev,
                        min_withdrawal_usdc: parseFloat(e.target.value)
                      }))}
                      className="w-full sm:w-32 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                    <span className="text-slate-400 text-sm">
                      Min amount creators can withdraw
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
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
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
                  {savingSettings ? 'Saving...' : 'Save Marketplace Settings'}
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
