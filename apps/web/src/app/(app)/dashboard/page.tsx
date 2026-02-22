'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ConfidenceBadge } from '@/components/VerificationTrail';
import { getConfidenceDisplay } from '@/lib/confidence';

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

interface SelectedDomain {
  id: string;
  name: string;
  slug: string;
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
  selectedDomains?: SelectedDomain[];
  isFiltered?: boolean;
  filterType?: 'sourceList' | 'domains' | null;
}

interface Domain {
  id: string;
  name: string;
  slug: string;
}

interface TopicFilter {
  topic: string;
  count?: number;
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

// ConfidenceBadge moved to @/components/VerificationTrail

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
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');

  // Redirect to login if auth check completes and no user
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/dashboard');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    // Don't fetch data until auth is verified and user exists
    if (authLoading || !user) return;
    
    async function fetchData() {
      try {
        // Build content URL with filters
        let contentUrl = `${API_URL}/api/v1/intelligence?limit=30&minConfidence=40`;
        if (selectedDomain) {
          contentUrl += `&domain=${selectedDomain}`;
        }
        if (selectedTopic) {
          contentUrl += `&topic=${encodeURIComponent(selectedTopic)}`;
        }

        // Use credentials: 'include' to send HttpOnly session cookie
        const [statsRes, contentRes, domainsRes, topicsRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/stats`, { credentials: 'include' }),
          fetch(contentUrl, { credentials: 'include' }),
          fetch(`${API_URL}/api/v1/domains`, { credentials: 'include' }),
          fetch(`${API_URL}/api/search/topics`, { credentials: 'include' }),
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
        if (topicsRes.ok) {
          const data = await topicsRes.json();
          setTopics(data.data?.topics || []);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [authLoading, user, selectedDomain, selectedTopic]);
  
  // Sort content based on selected option - MUST be before any early returns
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

  // Show loading while auth is being verified or redirecting
  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-argus-500"></div>
      </div>
    );
  }

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
        
        {/* Active Filter Indicator */}
        {stats?.activeSourceList ? (
          <a 
            href={`/sources/lists/${stats.activeSourceList.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition border border-green-300 dark:border-green-700"
          >
            <span className="text-green-500 text-lg">●</span>
            <span className="font-medium">Filtered by: {stats.activeSourceList.name}</span>
            <span className="text-xs opacity-70">(click to manage)</span>
          </a>
        ) : stats?.selectedDomains && stats.selectedDomains.length > 0 ? (
          <a 
            href="/settings"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition border border-blue-300 dark:border-blue-700"
          >
            <span className="text-blue-500 text-lg">●</span>
            <span className="font-medium">
              Domain filter: {stats.selectedDomains.length} selected
            </span>
            <span className="text-xs opacity-70">(click to change)</span>
          </a>
        ) : user ? (
          <a 
            href="/sources/manage"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition text-sm"
          >
            📋 Create a source list to filter your feed
          </a>
        ) : null}
      </div>
      
      {/* Domain Filter Banner (only shown when domain filter active, not source list) */}
      {!stats?.activeSourceList && stats?.selectedDomains && stats.selectedDomains.length > 0 ? (
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏷️</span>
            <div>
              <p className="font-semibold">Domain Filter Active</p>
              <p className="text-sm opacity-90">
                Showing: {stats.selectedDomains.map(d => d.name).join(', ')}
              </p>
            </div>
          </div>
          <a 
            href="/settings"
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition"
          >
            Change Domains →
          </a>
        </div>
      ) : null}

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
          subtitle={`${getConfidenceDisplay(stats?.content?.averageConfidence || 0).label} avg confidence`}
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-semibold">Recent Intelligence</h2>
          
          {/* Dual Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Source Region Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">Source:</label>
              <select
                value={selectedDomain}
                onChange={(e) => { setSelectedDomain(e.target.value); setLoading(true); }}
                className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-argus-500 focus:border-transparent"
              >
                <option value="">All Sources</option>
                {domains.map((d) => (
                  <option key={d.id} value={d.slug}>{d.name}</option>
                ))}
              </select>
            </div>
            
            {/* Article Topic Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">About:</label>
              <select
                value={selectedTopic}
                onChange={(e) => { setSelectedTopic(e.target.value); setLoading(true); }}
                className="text-sm border border-purple-300 dark:border-purple-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">All Topics</option>
                {topics.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            
            {/* Clear Filters */}
            {(selectedDomain || selectedTopic) && (
              <button
                onClick={() => { setSelectedDomain(''); setSelectedTopic(''); setLoading(true); }}
                className="text-sm text-red-500 hover:text-red-600 px-2"
              >
                ✕ Clear
              </button>
            )}
            
            <SortDropdown value={sortBy} onChange={setSortBy} />
          </div>
        </div>
        
        {/* Active Filters Display */}
        {(selectedDomain || selectedTopic) && (
          <div className="flex items-center gap-2 mb-4 text-sm">
            <span className="text-slate-500">Filtering:</span>
            {selectedDomain && (
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                📍 Source: {domains.find(d => d.slug === selectedDomain)?.name || selectedDomain}
              </span>
            )}
            {selectedTopic && (
              <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                🏷️ About: {selectedTopic}
              </span>
            )}
          </div>
        )}
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
                  <ConfidenceBadge score={item.confidenceScore || 0} contentId={item.id} />
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
