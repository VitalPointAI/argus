'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

type SortOption = 'date' | 'confidence' | 'domain';

interface ActiveSourceList {
  id: string;
  name: string;
}

interface ContentItem {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  fetchedAt: string;
  confidenceScore: number;
  source?: { name: string };
  domain?: { name: string; slug: string };
}

interface Stats {
  content?: {
    total: number;
    last24h: number;
    verified: number;
    averageConfidence: number;
  };
  sources?: number;
  domains?: number;
  activeSourceList?: ActiveSourceList | null;
  isFiltered?: boolean;
}

interface Domain {
  id: string;
  name: string;
  slug: string;
}

function StatCard({ title, value, subtitle }: { title: string; value: number; subtitle: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
      <div className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
        {value.toLocaleString()}
      </div>
      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</div>
    </div>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                score >= 40 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  
  return (
    <span className={`px-2 py-1 rounded text-sm font-medium ${color}`}>
      {score}%
    </span>
  );
}

function SortDropdown({ value, onChange }: { value: SortOption; onChange: (v: SortOption) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-slate-500 dark:text-slate-400">Sort by:</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortOption)}
        className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-argus-500 focus:border-transparent"
      >
        <option value="date">Date (newest)</option>
        <option value="confidence">Confidence (highest)</option>
        <option value="domain">Domain (A-Z)</option>
      </select>
    </div>
  );
}

export default function Dashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('date');

  useEffect(() => {
    async function fetchData() {
      const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      try {
        const [statsRes, contentRes, domainsRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/stats`, { headers }),
          fetch(`${API_URL}/api/v1/intelligence?limit=20&minConfidence=50`, { headers }),
          fetch(`${API_URL}/api/v1/domains`, { headers }),
        ]);

        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data.data);
        }
        if (contentRes.ok) {
          const data = await contentRes.json();
          setContent(data.data || []);
        }
        if (domainsRes.ok) {
          const data = await domainsRes.json();
          setDomains(data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token]);

  // Sort content based on selected option
  const sortedContent = useMemo(() => {
    const items = [...content];
    switch (sortBy) {
      case 'date':
        return items.sort((a, b) => 
          new Date(b.publishedAt || b.fetchedAt).getTime() - new Date(a.publishedAt || a.fetchedAt).getTime()
        );
      case 'confidence':
        return items.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
      case 'domain':
        return items.sort((a, b) => 
          (a.domain?.name || '').localeCompare(b.domain?.name || '')
        );
      default:
        return items;
    }
  }, [content, sortBy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-argus-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Strategic Intelligence Dashboard
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Real-time OSINT with verification and confidence scoring
          </p>
        </div>
        
        {/* Active Source List Indicator */}
        {stats?.activeSourceList ? (
          <a 
            href={`/sources/lists/${stats.activeSourceList.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-argus-100 dark:bg-argus-900/30 text-argus-700 dark:text-argus-300 rounded-lg hover:bg-argus-200 dark:hover:bg-argus-800 transition"
          >
            <span className="text-green-500">●</span>
            Filtered: <span className="font-medium">{stats.activeSourceList.name}</span>
            <span className="text-xs text-slate-500">(click to change)</span>
          </a>
        ) : token ? (
          <a 
            href="/sources"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition text-sm"
          >
            📋 Create a source list to filter
          </a>
        ) : null}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Articles"
          value={stats?.content?.total || 0}
          subtitle={`${stats?.content?.last24h || 0} in last 24h`}
        />
        <StatCard
          title="Verified"
          value={stats?.content?.verified || 0}
          subtitle={`${stats?.content?.averageConfidence || 0}% avg confidence`}
        />
        <StatCard
          title="Sources"
          value={stats?.sources || 0}
          subtitle="Active feeds"
        />
        <StatCard
          title="Domains"
          value={stats?.domains || 0}
          subtitle="Strategic areas"
        />
      </div>

      {/* Domain Overview */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Domains</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {domains.slice(0, 20).map((domain: Domain) => (
            <a
              key={domain.id}
              href={`/domains/${domain.slug}`}
              className="bg-slate-50 dark:bg-slate-700 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition"
            >
              <div className="font-medium text-sm">{domain.name}</div>
              <div className="text-xs text-slate-500">{domain.slug}</div>
            </a>
          ))}
        </div>
      </div>

      {/* Recent Intelligence */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Intelligence</h2>
          <SortDropdown value={sortBy} onChange={setSortBy} />
        </div>
        <div className="space-y-4">
          {sortedContent.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-center py-8">
              No intelligence articles found
            </p>
          ) : (
            sortedContent.map((item: ContentItem) => (
              <article key={item.id} className="border-b border-slate-100 dark:border-slate-700 pb-4 last:border-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-argus-600 dark:hover:text-argus-400">
                      {item.title}
                    </a>
                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                      <span>{item.source?.name || 'Unknown'}</span>
                      <span>•</span>
                      <span>{item.domain?.name || 'Uncategorized'}</span>
                      <span>•</span>
                      <span>{new Date(item.publishedAt || item.fetchedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <ConfidenceBadge score={item.confidenceScore || 0} />
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
