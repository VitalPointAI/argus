'use client';

import React, { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface Change {
  url: string;
  domain: string;
  source: string;
  contentId: string;
  description: string;
  significance: 'high' | 'medium' | 'low';
}

interface Forecast {
  event: string;
  reasoning: string;
  timeframe: 'near' | 'mid' | 'long';
  confidence: number;
  probability: number;
}

interface SourceInfo {
  id: string;
  url: string;
  title: string;
  domain: string;
  source: string;
}

interface BriefingData {
  id: string;
  type: string;
  summary: string;
  changes: Change[];
  forecasts: Forecast[];
  contentIds: (string | { sources: SourceInfo[] })[];
  generatedAt: string;
  deliveredAt: string | null;
}

interface StatsData {
  content?: {
    total: number;
    last24h: number;
    verified: number;
    averageConfidence: number;
  };
  sources?: number;
  domains?: number;
}

// Convert markdown to clean formatted JSX
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    // Skip metadata lines
    if (trimmed.startsWith('Type:') || trimmed.startsWith('Sources:') || trimmed.startsWith('Confidence:')) return;
    
    // Headers
    if (trimmed.startsWith('###')) {
      elements.push(
        <h4 key={i} className="font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-2">
          {trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '')}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('##')) {
      elements.push(
        <h3 key={i} className="font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-2">
          {trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '')}
        </h3>
      );
      return;
    }
    
    // Bold section headers like **KEY THEMES:**
    if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      elements.push(
        <p key={i} className="font-semibold text-slate-700 dark:text-slate-300 mt-3">
          {trimmed.replace(/\*\*/g, '')}
        </p>
      );
      return;
    }
    
    // Regular paragraphs - convert inline bold/italic
    let content = trimmed
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    elements.push(
      <p 
        key={i} 
        className="text-slate-600 dark:text-slate-300 leading-relaxed mb-2"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  });
  
  return elements;
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    morning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    evening: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    alert: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    weekly: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  };
  
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[type] || 'bg-slate-100 text-slate-600'}`}>
      {type.charAt(0).toUpperCase() + type.slice(1)} Briefing
    </span>
  );
}

function SignificanceBadge({ significance }: { significance: string }) {
  const colors: Record<string, string> = {
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
    low: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors[significance] || colors.low}`}>
      {significance.toUpperCase()}
    </span>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: number | string; subtitle: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
      <div className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</div>
    </div>
  );
}

// Known paywall domains
const PAYWALL_DOMAINS = ['nytimes.com', 'wsj.com', 'washingtonpost.com', 'ft.com', 'economist.com', 'bloomberg.com', 'theatlantic.com', 'newyorker.com', 'foreignpolicy.com', 'foreignaffairs.com', 'thetimes.co.uk', 'telegraph.co.uk', 'businessinsider.com', 'medium.com'];

function isPaywalled(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return PAYWALL_DOMAINS.some(d => hostname.includes(d));
  } catch { return false; }
}

function getArchiveLinks(url: string) {
  return {
    archiveIs: `https://archive.is/newest/${encodeURIComponent(url)}`,
    archiveOrg: `https://web.archive.org/web/2/${url}`,
    '12ft': `https://12ft.io/${url}`,
  };
}

function DevelopmentCard({ change }: { change: Change }) {
  const [showArchive, setShowArchive] = useState(false);
  const paywalled = isPaywalled(change.url);
  const archives = getArchiveLinks(change.url);

  return (
    <div className={`rounded-lg border p-4 transition-all hover:shadow-md ${
      change.significance === 'high' 
        ? 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50' 
        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed">
            {change.description}
          </p>
          <div className="flex items-center flex-wrap gap-2 mt-3">
            <span className="text-xs px-2 py-0.5 bg-argus-100 dark:bg-argus-900/30 text-argus-700 dark:text-argus-400 rounded font-medium">
              {change.domain}
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <SignificanceBadge significance={change.significance} />
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              via {change.source}
            </span>
            
            {/* Source links */}
            <div className="ml-auto flex items-center gap-2 relative">
              <a
                href={change.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 text-xs font-medium rounded-lg bg-argus-600 hover:bg-argus-700 text-white transition-colors flex items-center gap-1.5"
              >
                <span>📰</span> Read{paywalled ? ' (paywall)' : ''} ↗
              </a>
              
              {/* Archive dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowArchive(!showArchive)}
                  className="px-2 py-1 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  title="Archive links (bypass paywall)"
                >
                  🔓
                </button>
                {showArchive && (
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-10 min-w-[160px]">
                    <a
                      href={archives.archiveIs}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                    >
                      📦 Archive.is
                    </a>
                    <a
                      href={archives.archiveOrg}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                    >
                      🏛️ Archive.org
                    </a>
                    <a
                      href={archives['12ft']}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                    >
                      🪜 12ft.io
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourcesList({ sources }: { sources: SourceInfo[] }) {
  if (!sources || sources.length === 0) return null;
  
  // Group by domain
  const byDomain = sources.reduce((acc, src) => {
    if (!acc[src.domain]) acc[src.domain] = [];
    acc[src.domain].push(src);
    return acc;
  }, {} as Record<string, SourceInfo[]>);

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span>📚</span> All Sources ({sources.length})
      </h3>
      <div className="space-y-4">
        {Object.entries(byDomain).map(([domain, domainSources]) => (
          <div key={domain}>
            <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{domain}</h4>
            <div className="space-y-2">
              {domainSources.map((src) => (
                <a
                  key={src.id}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block py-2 px-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-argus-400 dark:hover:border-argus-500 transition-colors group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-700 dark:text-slate-300 group-hover:text-argus-600 dark:group-hover:text-argus-400 line-clamp-1">
                      {src.title}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {src.source} ↗
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BriefingContent({ briefing }: { briefing: BriefingData }) {
  // Extract sources from contentIds
  const sources: SourceInfo[] = [];
  briefing.contentIds?.forEach(item => {
    if (typeof item === 'object' && 'sources' in item) {
      sources.push(...item.sources);
    }
  });

  // Parse executive summary from the summary field
  const summaryLines = briefing.summary.split('\n');
  const execSummaryStart = summaryLines.findIndex(l => l.includes('Executive Briefing') || l.includes('Key Developments'));
  const execSummary = execSummaryStart >= 0 
    ? summaryLines.slice(execSummaryStart).join('\n').replace(/^#+\s*Executive Briefing\s*\n?/, '').replace(/^\*\*Key Developments:\*\*\s*\n?/, '')
    : briefing.summary;

  // Count by significance
  const highCount = briefing.changes?.filter(c => c.significance === 'high').length || 0;
  const mediumCount = briefing.changes?.filter(c => c.significance === 'medium').length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-argus-50 to-white dark:from-argus-900/20 dark:to-slate-800 rounded-2xl shadow-lg border border-argus-200 dark:border-argus-800/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-argus-200/50 dark:border-argus-800/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <TypeBadge type={briefing.type} />
            <div className="flex items-center gap-2 text-sm">
              {highCount > 0 && (
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded font-medium">
                  {highCount} high priority
                </span>
              )}
              {mediumCount > 0 && (
                <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded font-medium">
                  {mediumCount} medium
                </span>
              )}
            </div>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            <span>{new Date(briefing.generatedAt).toLocaleString()}</span>
            {briefing.deliveredAt && (
              <span className="ml-2 text-green-600 dark:text-green-400">✓ Delivered</span>
            )}
          </div>
        </div>
        
        <div className="p-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <span>📋</span> Executive Summary
          </h2>
          <div className="prose prose-slate dark:prose-invert prose-sm max-w-none">
            {renderMarkdown(execSummary)}
          </div>
        </div>
      </div>

      {/* Key Developments */}
      {briefing.changes && briefing.changes.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <span>🔥</span> Key Developments
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
              ({briefing.changes.length} stories)
            </span>
          </h2>
          <div className="grid gap-3">
            {briefing.changes.map((change, i) => (
              <DevelopmentCard key={i} change={change} />
            ))}
          </div>
        </div>
      )}

      {/* Forecasts Link */}
      {briefing.forecasts && briefing.forecasts.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <a 
            href="/predictions" 
            className="flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔮</span>
              <div>
                <span className="font-medium text-slate-900 dark:text-white group-hover:text-argus-600 dark:group-hover:text-argus-400 transition-colors">
                  {briefing.forecasts.length} Predictions Generated
                </span>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  View AI-generated forecasts based on this briefing
                </p>
              </div>
            </div>
            <span className="text-argus-600 dark:text-argus-400 text-xl">→</span>
          </a>
        </div>
      )}

      {/* Sources */}
      <SourcesList sources={sources} />
    </div>
  );
}

function BriefingHistoryCard({ briefing, onSelect, isSelected }: { 
  briefing: BriefingData; 
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
  const date = new Date(briefing.generatedAt);
  const changeCount = briefing.changes?.length || 0;
  const highCount = briefing.changes?.filter(c => c.significance === 'high').length || 0;
  
  return (
    <button
      onClick={() => onSelect(briefing.id)}
      className={`w-full text-left p-4 rounded-lg border transition-all hover:shadow-md ${
        isSelected 
          ? 'border-argus-500 bg-argus-50 dark:bg-argus-900/20 ring-2 ring-argus-500/30' 
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-argus-300'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <TypeBadge type={briefing.type} />
        {briefing.deliveredAt && (
          <span className="text-xs text-green-600 dark:text-green-400">✓</span>
        )}
      </div>
      <div className="text-sm font-medium text-slate-900 dark:text-white">
        {date.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric',
        })}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs">
        <span className="text-slate-600 dark:text-slate-400">
          {changeCount} stories
        </span>
        {highCount > 0 && (
          <span className="text-red-600 dark:text-red-400">
            ({highCount} high)
          </span>
        )}
      </div>
    </button>
  );
}

export default function BriefingsPage() {
  const [briefings, setBriefings] = useState<BriefingData[]>([]);
  const [selectedBriefing, setSelectedBriefing] = useState<BriefingData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [activeTab, setActiveTab] = useState<'latest' | 'history'>('latest');

  useEffect(() => {
    async function fetchData() {
      try {
        const [briefingsRes, statsRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/briefings?limit=20`, { cache: 'no-store' }),
          fetch(`${API_URL}/api/v1/stats`, { cache: 'no-store' }),
        ]);

        if (briefingsRes.ok) {
          const data = await briefingsRes.json();
          if (data.success && data.data) {
            setBriefings(data.data);
            if (data.data.length > 0) {
              setSelectedBriefing(data.data[0]);
            }
          }
        }

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData.success) {
            setStats(statsData.data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch briefing data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const handleSelectBriefing = async (id: string) => {
    const existing = briefings.find(b => b.id === id);
    if (existing) {
      setSelectedBriefing(existing);
      return;
    }
    
    setLoadingBriefing(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/briefings/${id}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setSelectedBriefing(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch briefing:', error);
    } finally {
      setLoadingBriefing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-argus-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center pb-4">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Intelligence Briefings
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2 text-lg">
          AI-curated summaries with source links and forecasts
        </p>
      </div>

      {/* Platform Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Articles"
            value={stats.content?.total || 0}
            subtitle={`${stats.content?.last24h || 0} in last 24h`}
          />
          <StatCard
            title="Verified"
            value={stats.content?.verified || 0}
            subtitle={`${stats.content?.averageConfidence || 0}% avg confidence`}
          />
          <StatCard
            title="Sources"
            value={stats.sources || 0}
            subtitle="Active feeds"
          />
          <StatCard
            title="Domains"
            value={stats.domains || 0}
            subtitle="Strategic areas"
          />
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('latest')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'latest'
              ? 'border-argus-500 text-argus-600 dark:text-argus-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Latest Briefing
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-argus-500 text-argus-600 dark:text-argus-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Briefing History ({briefings.length})
        </button>
      </div>

      {activeTab === 'history' ? (
        /* History View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* History List */}
          <div className="lg:col-span-1 space-y-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Past Briefings
            </h3>
            {briefings.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                No briefing history yet
              </p>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {briefings.map((briefing) => (
                  <BriefingHistoryCard 
                    key={briefing.id} 
                    briefing={briefing} 
                    onSelect={handleSelectBriefing}
                    isSelected={selectedBriefing?.id === briefing.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Selected Briefing Preview */}
          <div className="lg:col-span-2">
            {loadingBriefing ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-argus-500 border-t-transparent"></div>
              </div>
            ) : selectedBriefing ? (
              <BriefingContent briefing={selectedBriefing} />
            ) : (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-12 text-center">
                <p className="text-slate-500 dark:text-slate-400">
                  Select a briefing to view details
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Latest View */
        selectedBriefing ? (
          <BriefingContent briefing={selectedBriefing} />
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-xl font-semibold mb-2 text-slate-900 dark:text-white">No Briefings Yet</h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Briefings are generated from verified intelligence. 
              The next scheduled briefing will appear here.
            </p>
          </div>
        )
      )}

      {/* Briefing Types Explanation */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="font-semibold mb-4 text-slate-900 dark:text-white">Briefing Schedule</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="flex gap-3 items-start">
            <TypeBadge type="morning" />
            <span className="text-slate-600 dark:text-slate-400">
              5:00 AM EST — Overnight developments
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <TypeBadge type="evening" />
            <span className="text-slate-600 dark:text-slate-400">
              6:00 PM EST — End-of-day summary
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
