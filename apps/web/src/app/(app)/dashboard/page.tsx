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
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  
  // Simple filter mode (legacy)
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  
  // Advanced filter mode
  const [advancedMode, setAdvancedMode] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [excludedTopics, setExcludedTopics] = useState<Set<string>>(new Set());
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [excludedDomains, setExcludedDomains] = useState<Set<string>>(new Set());
  const [customTopicQuery, setCustomTopicQuery] = useState('');

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
        
        if (advancedMode) {
          // Advanced mode: multiple topics/domains with include/exclude
          if (selectedTopics.size > 0) {
            contentUrl += `&topics=${encodeURIComponent(Array.from(selectedTopics).join(','))}`;
          }
          if (excludedTopics.size > 0) {
            contentUrl += `&excludeTopics=${encodeURIComponent(Array.from(excludedTopics).join(','))}`;
          }
          if (selectedDomains.size > 0) {
            contentUrl += `&domains=${encodeURIComponent(Array.from(selectedDomains).join(','))}`;
          }
          if (excludedDomains.size > 0) {
            contentUrl += `&excludeDomains=${encodeURIComponent(Array.from(excludedDomains).join(','))}`;
          }
          if (customTopicQuery.trim()) {
            contentUrl += `&topicQuery=${encodeURIComponent(customTopicQuery.trim())}`;
          }
        } else {
          // Simple mode: single topic/domain
          if (selectedDomain) {
            contentUrl += `&domain=${selectedDomain}`;
          }
          if (selectedTopic) {
            contentUrl += `&topic=${encodeURIComponent(selectedTopic)}`;
          }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, selectedDomain, selectedTopic, advancedMode, 
      // Convert sets to strings for dependency comparison
      Array.from(selectedTopics).join(','),
      Array.from(excludedTopics).join(','),
      Array.from(selectedDomains).join(','),
      Array.from(excludedDomains).join(','),
      customTopicQuery]);
  
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

      {/* Filter Intelligence Panel */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        {/* Mode Toggle */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Filter Intelligence</h2>
          <button
            onClick={() => {
              setAdvancedMode(!advancedMode);
              // Clear filters when switching modes
              if (!advancedMode) {
                setSelectedDomain('');
                setSelectedTopic('');
              } else {
                setSelectedTopics(new Set());
                setExcludedTopics(new Set());
                setSelectedDomains(new Set());
                setExcludedDomains(new Set());
                setCustomTopicQuery('');
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              advancedMode
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            {advancedMode ? '🔧 Advanced Mode' : '⚡ Simple Mode'}
          </button>
        </div>

        {advancedMode ? (
          /* Advanced Filter Mode */
          <div className="space-y-6">
            {/* Custom Topic Query */}
            <div>
              <label className="block text-sm font-medium mb-2">🔍 Custom Topic Search</label>
              <input
                type="text"
                value={customTopicQuery}
                onChange={(e) => setCustomTopicQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setLoading(true)}
                placeholder="Enter keywords to search in articles... (press Enter)"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
              />
            </div>
            
            {/* Include Topics */}
            <div>
              <label className="block text-sm font-medium mb-2">
                ✅ Include Topics <span className="text-slate-500 font-normal">(OR - match ANY)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {topics.slice(0, 20).map((topic) => (
                  <button
                    key={topic}
                    onClick={() => {
                      const newSet = new Set(selectedTopics);
                      if (newSet.has(topic)) newSet.delete(topic);
                      else newSet.add(topic);
                      setSelectedTopics(newSet);
                      setLoading(true);
                    }}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                      selectedTopics.has(topic)
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 ring-1 ring-green-500'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {selectedTopics.has(topic) ? '✓ ' : ''}{topic}
                  </button>
                ))}
                {topics.length > 20 && (
                  <button
                    onClick={() => setShowAllTopics(true)}
                    className="px-2 py-1 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-purple-600"
                  >
                    +{topics.length - 20} more
                  </button>
                )}
              </div>
            </div>
            
            {/* Exclude Topics */}
            <div>
              <label className="block text-sm font-medium mb-2">
                ❌ Exclude Topics <span className="text-slate-500 font-normal">(NOT - hide ALL matching)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {topics.slice(0, 20).map((topic) => (
                  <button
                    key={topic}
                    onClick={() => {
                      const newSet = new Set(excludedTopics);
                      if (newSet.has(topic)) newSet.delete(topic);
                      else newSet.add(topic);
                      setExcludedTopics(newSet);
                      setLoading(true);
                    }}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                      excludedTopics.has(topic)
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 ring-1 ring-red-500'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {excludedTopics.has(topic) ? '✗ ' : ''}{topic}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Include Sources */}
            <div>
              <label className="block text-sm font-medium mb-2">
                📡 Include Sources <span className="text-slate-500 font-normal">(OR - from ANY)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {domains.map((domain: Domain) => (
                  <button
                    key={domain.id}
                    onClick={() => {
                      const newSet = new Set(selectedDomains);
                      if (newSet.has(domain.slug)) newSet.delete(domain.slug);
                      else newSet.add(domain.slug);
                      setSelectedDomains(newSet);
                      setLoading(true);
                    }}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                      selectedDomains.has(domain.slug)
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {selectedDomains.has(domain.slug) ? '✓ ' : ''}{domain.name}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Exclude Sources */}
            <div>
              <label className="block text-sm font-medium mb-2">
                🚫 Exclude Sources <span className="text-slate-500 font-normal">(NOT - hide from these)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {domains.map((domain: Domain) => (
                  <button
                    key={domain.id}
                    onClick={() => {
                      const newSet = new Set(excludedDomains);
                      if (newSet.has(domain.slug)) newSet.delete(domain.slug);
                      else newSet.add(domain.slug);
                      setExcludedDomains(newSet);
                      setLoading(true);
                    }}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                      excludedDomains.has(domain.slug)
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 ring-1 ring-red-500'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {excludedDomains.has(domain.slug) ? '✗ ' : ''}{domain.name}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Active Filter Summary */}
            {(selectedTopics.size > 0 || excludedTopics.size > 0 || selectedDomains.size > 0 || excludedDomains.size > 0 || customTopicQuery) && (
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium">Active Query:</span>{' '}
                  {customTopicQuery && <span className="text-purple-600">"{customTopicQuery}"</span>}
                  {selectedTopics.size > 0 && (
                    <span className="text-green-600"> topics({Array.from(selectedTopics).join(' OR ')})</span>
                  )}
                  {excludedTopics.size > 0 && (
                    <span className="text-red-600"> NOT({Array.from(excludedTopics).join(', ')})</span>
                  )}
                  {selectedDomains.size > 0 && (
                    <span className="text-blue-600"> from({Array.from(selectedDomains).join(' OR ')})</span>
                  )}
                  {excludedDomains.size > 0 && (
                    <span className="text-red-600"> NOT from({Array.from(excludedDomains).join(', ')})</span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedTopics(new Set());
                    setExcludedTopics(new Set());
                    setSelectedDomains(new Set());
                    setExcludedDomains(new Set());
                    setCustomTopicQuery('');
                    setLoading(true);
                  }}
                  className="mt-2 text-xs text-red-500 hover:text-red-600"
                >
                  ✕ Clear all filters
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Simple Filter Mode */
          <>
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            {/* Source Filter */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">📡</span>
                <h3 className="font-semibold text-lg">Source</h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                Filter by where the news comes from (perspective)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => { setSelectedDomain(''); setLoading(true); }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    !selectedDomain 
                      ? 'bg-argus-100 dark:bg-argus-900/30 text-argus-700 dark:text-argus-300 ring-2 ring-argus-500' 
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  🌍 All Sources
                </button>
                {domains.slice(0, 11).map((domain: Domain) => (
                  <button
                    key={domain.id}
                    onClick={() => { setSelectedDomain(domain.slug); setLoading(true); }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition text-left ${
                      selectedDomain === domain.slug
                        ? 'bg-argus-100 dark:bg-argus-900/30 text-argus-700 dark:text-argus-300 ring-2 ring-argus-500' 
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {domain.name}
                  </button>
                ))}
              </div>
            </div>
          
          {/* Divider */}
          <div className="hidden lg:block w-px bg-slate-200 dark:bg-slate-700 self-stretch"></div>
          <div className="lg:hidden h-px bg-slate-200 dark:bg-slate-700"></div>
          
          {/* Topic Filter */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📰</span>
              <h3 className="font-semibold text-lg">Subject</h3>
              {topics.length > 20 && (
                <button
                  onClick={() => setShowAllTopics(true)}
                  className="ml-auto text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400"
                >
                  View all ({topics.length})
                </button>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Filter by what the article is about (topic)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => { setSelectedTopic(''); setLoading(true); }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  !selectedTopic 
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500' 
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                📋 All Subjects
              </button>
              {topics.slice(0, 19).map((topic) => (
                <button
                  key={topic}
                  onClick={() => { setSelectedTopic(topic); setLoading(true); }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition text-left ${
                    selectedTopic === topic
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500' 
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {topic}
                </button>
              ))}
              {topics.length > 19 && (
                <button
                  onClick={() => setShowAllTopics(true)}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition bg-slate-100 dark:bg-slate-700 text-purple-600 dark:text-purple-400 hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  + {topics.length - 19} more...
                </button>
              )}
            </div>
          </div>
          </div>
        
          {/* Current Filter Summary - Simple Mode */}
          {(selectedDomain || selectedTopic) && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="text-sm">
                <span className="text-slate-500">Showing: </span>
                <span className="font-medium">
                  {selectedDomain && selectedTopic ? (
                    <>{domains.find(d => d.slug === selectedDomain)?.name} sources reporting on {selectedTopic}</>
                  ) : selectedDomain ? (
                    <>All articles from {domains.find(d => d.slug === selectedDomain)?.name} sources</>
                  ) : (
                    <>All sources reporting on {selectedTopic}</>
                  )}
                </span>
              </div>
              <button
                onClick={() => { setSelectedDomain(''); setSelectedTopic(''); setLoading(true); }}
                className="text-sm text-red-500 hover:text-red-600 px-3 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                ✕ Clear filters
              </button>
            </div>
          )}
        </>
        )}
      </div>

      {/* Recent Intelligence */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-semibold">Recent Intelligence</h2>
            {(selectedDomain || selectedTopic) && (
              <p className="text-sm text-slate-500 mt-1">
                {selectedDomain && selectedTopic ? (
                  <>{domains.find(d => d.slug === selectedDomain)?.name} → {selectedTopic}</>
                ) : selectedDomain ? (
                  <>From: {domains.find(d => d.slug === selectedDomain)?.name}</>
                ) : (
                  <>About: {selectedTopic}</>
                )}
              </p>
            )}
          </div>
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
                  <ConfidenceBadge score={item.confidenceScore || 0} contentId={item.id} />
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      {/* All Topics Modal */}
      {showAllTopics && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold">📰 All Subjects ({topics.length})</h2>
              <button
                onClick={() => setShowAllTopics(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {topics.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => { 
                      setSelectedTopic(topic); 
                      setShowAllTopics(false);
                      setLoading(true); 
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition text-left ${
                      selectedTopic === topic
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500' 
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
