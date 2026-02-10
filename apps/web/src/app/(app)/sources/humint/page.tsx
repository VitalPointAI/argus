'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface HumintSource {
  codename: string;
  bio: string | null;
  domains: string[];
  regions: string[];
  eventTypes: string[];
  reputationScore: number;
  totalSubmissions: number;
  verifiedCount: number;
  subscriberCount: number;
  subscriptionPriceUsdc: number | null;
  isAcceptingSubscribers: boolean;
  lastActiveAt: string | null;
}

export default function HumintSourcesPage() {
  const { user } = useAuth();
  const [sources, setSources] = useState<HumintSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [regionFilter, setRegionFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [minReputation, setMinReputation] = useState('');
  const [sortBy, setSortBy] = useState('reputation');

  useEffect(() => {
    fetchSources();
  }, [regionFilter, domainFilter, minReputation, sortBy]);

  const fetchSources = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (regionFilter) params.set('regions', regionFilter);
      if (domainFilter) params.set('domains', domainFilter);
      if (minReputation) params.set('minReputation', minReputation);
      params.set('sort', sortBy);
      
      const res = await fetch(`${API_URL}/api/humint/sources?${params}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      const data = await res.json();
      
      if (data.success) {
        setSources(data.data);
      } else {
        setError(data.error || 'Failed to load sources');
      }
    } catch (err) {
      setError('Failed to load sources');
    } finally {
      setLoading(false);
    }
  };

  const getReputationColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getReputationBg = (score: number) => {
    if (score >= 80) return 'bg-green-100 dark:bg-green-900/30';
    if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
    if (score >= 40) return 'bg-orange-100 dark:bg-orange-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="text-4xl">🎭</span>
            HUMINT Sources
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Anonymous human intelligence sources • Crowd-verified • Privacy-first
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/sources"
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            ← All Sources
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Region</label>
            <input
              type="text"
              placeholder="e.g., tehran, iran"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Domain</label>
            <input
              type="text"
              placeholder="e.g., military, politics"
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Min Reputation</label>
            <select
              value={minReputation}
              onChange={(e) => setMinReputation(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
            >
              <option value="">Any</option>
              <option value="50">50+</option>
              <option value="70">70+</option>
              <option value="80">80+</option>
              <option value="90">90+</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
            >
              <option value="reputation">Reputation</option>
              <option value="recent">Recent Activity</option>
              <option value="subscribers">Subscribers</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-slate-500">Loading sources...</div>
        </div>
      )}

      {/* Sources Grid */}
      {!loading && sources.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sources.map((source) => (
            <Link
              key={source.codename}
              href={`/sources/humint/${source.codename}`}
              className="bg-white dark:bg-slate-800 rounded-lg shadow hover:shadow-lg transition p-6 block"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {source.codename}
                  </h3>
                  {source.bio && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                      {source.bio}
                    </p>
                  )}
                </div>
                <div className={`px-3 py-1 rounded-full text-sm font-bold ${getReputationBg(source.reputationScore)} ${getReputationColor(source.reputationScore)}`}>
                  ⭐ {source.reputationScore}
                </div>
              </div>

              {/* Coverage */}
              <div className="space-y-2 mb-4">
                {source.regions.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">📍</span>
                    <span className="text-slate-600 dark:text-slate-400">
                      {source.regions.slice(0, 3).map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')}
                      {source.regions.length > 3 && ` +${source.regions.length - 3}`}
                    </span>
                  </div>
                )}
                {source.domains.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">📂</span>
                    <span className="text-slate-600 dark:text-slate-400">
                      {source.domains.slice(0, 3).map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
                      {source.domains.length > 3 && ` +${source.domains.length - 3}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 text-center border-t border-slate-100 dark:border-slate-700 pt-4">
                <div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white">
                    {source.totalSubmissions}
                  </div>
                  <div className="text-xs text-slate-500">Posts</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {source.totalSubmissions > 0 
                      ? Math.round((source.verifiedCount / source.totalSubmissions) * 100)
                      : 0}%
                  </div>
                  <div className="text-xs text-slate-500">Verified</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white">
                    {source.subscriberCount}
                  </div>
                  <div className="text-xs text-slate-500">Subs</div>
                </div>
              </div>

              {/* Subscription Price */}
              {source.isAcceptingSubscribers && source.subscriptionPriceUsdc && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-center">
                  <span className="px-3 py-1 bg-argus-100 dark:bg-argus-900/30 text-argus-700 dark:text-argus-300 rounded-full text-sm font-medium">
                    💰 {source.subscriptionPriceUsdc} USDC/mo
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && sources.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg shadow">
          <div className="text-4xl mb-4">🎭</div>
          <h3 className="text-lg font-semibold mb-2">No HUMINT Sources Found</h3>
          <p className="text-slate-500 dark:text-slate-400">
            {regionFilter || domainFilter || minReputation
              ? 'Try adjusting your filters'
              : 'Be the first to register as an anonymous intelligence source'}
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 text-sm">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <span>🔒</span> Privacy-First Intelligence Network
        </h3>
        <ul className="space-y-2 text-slate-600 dark:text-slate-400">
          <li>• <strong>Anonymous:</strong> Sources use codenames, real identity never stored</li>
          <li>• <strong>Crowd-verified:</strong> Consumers rate intel, building source reputation</li>
          <li>• <strong>Crypto payments:</strong> Earn USDC for valuable intel via NEAR</li>
          <li>• <strong>Zero-trust:</strong> Content hashes prove authenticity</li>
        </ul>
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <p className="text-slate-500">
            <strong>Become a source:</strong> Requires anonymous wallet login (not email/OAuth). 
            This ensures your real identity is never known to the platform.
          </p>
        </div>
      </div>
    </div>
  );
}
