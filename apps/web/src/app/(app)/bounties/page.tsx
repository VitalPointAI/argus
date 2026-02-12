'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface Bounty {
  id: string;
  title: string;
  description: string;
  domains: string[];
  regions: string[];
  category: string;
  rewardUsdc: number;
  minSourceReputation: number;
  status: string;
  reviewStatus: string;
  expiresAt: string | null;
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
  description: string;
  autoApprove: boolean;
}

interface BountyStats {
  total: number;
  open: number;
  claimed: number;
  paid: number;
  totalRewardOpen: number;
  avgReward: string;
}

export default function BountiesPage() {
  const { user, token } = useAuth();
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [stats, setStats] = useState<BountyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('open');
  const [regionFilter, setRegionFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  
  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    domains: '',
    regions: '',
    rewardUsdc: 25,
    minSourceReputation: 50,
    expiresInDays: 7,
    anonymous: false,
    // NEW: Required for legal compliance
    category: 'general',
    intendedUse: '',
    legalAttestation: false,
  });

  useEffect(() => {
    fetchBounties();
    fetchStats();
    fetchCategories();
  }, [statusFilter, regionFilter, domainFilter, sortBy]);

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/api/bounties/categories`);
      const data = await res.json();
      if (data.success) {
        setCategories(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  };

  const fetchBounties = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (regionFilter) params.set('region', regionFilter);
      if (domainFilter) params.set('domain', domainFilter);
      params.set('sort', sortBy);
      
      const res = await fetch(`${API_URL}/api/bounties?${params}`);
      const data = await res.json();
      
      if (data.success) {
        setBounties(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch bounties:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/bounties/stats/summary`);
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Please log in to create a bounty');
      return;
    }
    
    // Validate legal attestation
    if (!formData.legalAttestation) {
      setError('You must agree to the legal attestation to post a bounty');
      return;
    }
    
    // Validate intended use
    if (formData.intendedUse.length < 20) {
      setError('Please provide a more detailed intended use statement (at least 20 characters)');
      return;
    }
    
    setCreating(true);
    setError('');
    
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + formData.expiresInDays);
      
      const res = await fetch(`${API_URL}/api/bounties`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          domains: formData.domains.split(',').map(d => d.trim()).filter(Boolean),
          regions: formData.regions.split(',').map(r => r.trim()).filter(Boolean),
          rewardUsdc: formData.rewardUsdc,
          minSourceReputation: formData.minSourceReputation,
          expiresAt: expiresAt.toISOString(),
          anonymous: formData.anonymous,
          // NEW fields
          category: formData.category,
          intendedUse: formData.intendedUse,
          legalAttestation: formData.legalAttestation,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        // Show different message based on review status
        const message = data.message || 'Bounty created successfully!';
        setSuccessMessage(message);
        setShowCreateForm(false);
        setFormData({
          title: '',
          description: '',
          domains: '',
          regions: '',
          rewardUsdc: 25,
          minSourceReputation: 50,
          expiresInDays: 7,
          anonymous: false,
          category: 'general',
          intendedUse: '',
          legalAttestation: false,
        });
        fetchBounties();
        fetchStats();
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setError(data.error || 'Failed to create bounty');
      }
    } catch (err) {
      setError('Failed to create bounty');
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString();
  };

  const daysUntil = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const days = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      open: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      claimed: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
      paid: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      expired: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
      cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    };
    return styles[status] || styles.open;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="text-3xl">📋</span>
            Intel Job Board
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1">
            Post requests for specific intelligence • Offer rewards to HUMINT sources
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg transition"
        >
          {showCreateForm ? 'Cancel' : '+ Post Bounty'}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.open}</div>
            <div className="text-xs text-slate-500">Open Bounties</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-argus-600">${stats.totalRewardOpen.toFixed(0)}</div>
            <div className="text-xs text-slate-500">Total Rewards</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.paid}</div>
            <div className="text-xs text-slate-500">Fulfilled</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-slate-600">${stats.avgReward}</div>
            <div className="text-xs text-slate-500">Avg Reward</div>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
          <button onClick={() => setError('')} className="float-right">×</button>
        </div>
      )}
      
      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg">
          {successMessage}
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4">Post Intel Request</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="What intel do you need?"
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Description *</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                rows={4}
                placeholder="Detailed requirements, context, what evidence you need..."
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
              />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Regions</label>
                <input
                  type="text"
                  value={formData.regions}
                  onChange={(e) => setFormData({ ...formData, regions: e.target.value })}
                  placeholder="e.g., tehran, ukraine, lagos"
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                />
                <p className="text-xs text-slate-500 mt-1">Comma-separated</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Domains</label>
                <input
                  type="text"
                  value={formData.domains}
                  onChange={(e) => setFormData({ ...formData, domains: e.target.value })}
                  placeholder="e.g., military, politics, protests"
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                />
                <p className="text-xs text-slate-500 mt-1">Comma-separated</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Reward (USDC) *</label>
                <input
                  type="number"
                  min="1"
                  value={formData.rewardUsdc}
                  onChange={(e) => setFormData({ ...formData, rewardUsdc: parseInt(e.target.value) || 0 })}
                  required
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Min Reputation</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.minSourceReputation}
                  onChange={(e) => setFormData({ ...formData, minSourceReputation: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Expires In</label>
                <select
                  value={formData.expiresInDays}
                  onChange={(e) => setFormData({ ...formData, expiresInDays: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                >
                  <option value="1">1 day</option>
                  <option value="3">3 days</option>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                </select>
              </div>
            </div>
            
            {/* Intended Use - REQUIRED */}
            <div>
              <label className="block text-sm font-medium mb-1">Intended Use *</label>
              <textarea
                value={formData.intendedUse}
                onChange={(e) => setFormData({ ...formData, intendedUse: e.target.value })}
                required
                rows={3}
                placeholder="Explain how you plan to use this intelligence. E.g., 'For a research report on regional stability' or 'To inform investment decisions in the energy sector'"
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
              />
              <p className="text-xs text-slate-500 mt-1">Be specific about your use case. This helps us ensure requests are legitimate.</p>
            </div>
            
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.anonymous}
                  onChange={(e) => setFormData({ ...formData, anonymous: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Post anonymously (your identity won't be linked to this bounty)</span>
              </label>
            </div>
            
            {/* Legal Attestation - REQUIRED */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={formData.legalAttestation}
                  onChange={(e) => setFormData({ ...formData, legalAttestation: e.target.checked })}
                  required
                  className="rounded mt-1"
                />
                <div className="text-sm">
                  <span className="font-medium text-amber-800 dark:text-amber-200">Legal Attestation (Required)</span>
                  <p className="text-amber-700 dark:text-amber-300 mt-1">
                    I attest that this intelligence request will NOT be used for:
                  </p>
                  <ul className="list-disc list-inside text-amber-600 dark:text-amber-400 mt-1 space-y-1">
                    <li>Harassment, stalking, or targeting individuals</li>
                    <li>Obtaining personal/private information about individuals</li>
                    <li>Illegal activities or circumventing the law</li>
                    <li>Market manipulation or insider trading</li>
                    <li>Any purpose that could cause harm to individuals or groups</li>
                  </ul>
                  <p className="text-amber-700 dark:text-amber-300 mt-2">
                    I understand that violations may result in account termination and potential legal action.
                  </p>
                </div>
              </label>
            </div>
            
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !user}
                className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Post Bounty'}
              </button>
            </div>
            
            {!user && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                ⚠️ You need to <a href="/login" className="underline">log in</a> to post a bounty.
              </p>
            )}
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
            >
              <option value="open">Open</option>
              <option value="claimed">Claimed</option>
              <option value="paid">Fulfilled</option>
              <option value="all">All</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Region</label>
            <input
              type="text"
              placeholder="e.g., iran"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Domain</label>
            <input
              type="text"
              placeholder="e.g., military"
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
            >
              <option value="recent">Most Recent</option>
              <option value="reward">Highest Reward</option>
              <option value="expiring">Expiring Soon</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bounties List */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading bounties...</div>
      ) : bounties.length > 0 ? (
        <div className="space-y-4">
          {bounties.map((bounty) => (
            <div key={bounty.id} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <h3 className="font-semibold text-lg text-slate-900 dark:text-white">
                      {bounty.title}
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(bounty.status)}`}>
                      {bounty.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                    {bounty.description}
                  </p>
                </div>
                <div className="text-right sm:text-left shrink-0">
                  <div className="text-2xl font-bold text-green-600">${bounty.rewardUsdc}</div>
                  <div className="text-xs text-slate-500">USDC reward</div>
                </div>
              </div>
              
              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-3">
                {bounty.category && (
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs font-medium">
                    {bounty.category.replace(/_/g, ' ')}
                  </span>
                )}
                {bounty.regions.map((region) => (
                  <span key={region} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                    📍 {region}
                  </span>
                ))}
                {bounty.domains.map((domain) => (
                  <span key={domain} className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs">
                    {domain}
                  </span>
                ))}
              </div>
              
              {/* Meta */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>Min rep: {bounty.minSourceReputation}+</span>
                <span>Posted: {formatDate(bounty.createdAt)}</span>
                {bounty.expiresAt && (
                  <span className={daysUntil(bounty.expiresAt) <= 2 ? 'text-red-500' : ''}>
                    Expires: {daysUntil(bounty.expiresAt)}d
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg shadow">
          <div className="text-4xl mb-4">📋</div>
          <h3 className="text-lg font-semibold mb-2">No Bounties Found</h3>
          <p className="text-slate-500">
            {statusFilter !== 'open' 
              ? 'Try changing your filters'
              : 'Be the first to post an intel request!'}
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 sm:p-6 text-sm">
        <h3 className="font-semibold mb-3">💡 How Bounties Work</h3>
        <ul className="space-y-2 text-slate-600 dark:text-slate-400">
          <li>• <strong>Post a request:</strong> Describe what intel you need and offer a reward</li>
          <li>• <strong>Legal attestation:</strong> Confirm your request won't be used for harm</li>
          <li>• <strong>Review process:</strong> Some categories are auto-approved; others reviewed within 24h</li>
          <li>• <strong>HUMINT sources claim:</strong> Sources with matching expertise claim your bounty</li>
          <li>• <strong>Review & pay:</strong> Approve the submission and release payment</li>
          <li>• <strong>Anonymous option:</strong> Post without linking your identity</li>
        </ul>
        
        <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
          <p className="text-amber-700 dark:text-amber-300">
            <strong>⚠️ Prohibited requests:</strong> Personal information, home addresses, stalking-related intel, 
            doxxing, or any request that could facilitate harm to individuals. These will be automatically rejected.
          </p>
        </div>
      </div>
    </div>
  );
}
