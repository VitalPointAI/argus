'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface BriefingData {
  id: string;
  type: string;
  summary: string;
  changes: any[];
  forecasts: any[];
  generatedAt: string;
  deliveredAt: string | null;
}

interface ParsedBriefing {
  metadata: {
    type: string;
    sources: string;
    confidence: number;
  };
  verified: DevelopmentItem[];
  unverified: DevelopmentItem[];
  citations: Citation[];
}

interface DevelopmentItem {
  text: string;
  source: string;
  confidence: number;
}

interface Citation {
  title: string;
  source: string;
  url?: string;
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

function parseBriefingSummary(summary: string): ParsedBriefing {
  const result: ParsedBriefing = {
    metadata: { type: '', sources: '', confidence: 0 },
    verified: [],
    unverified: [],
    citations: [],
  };

  // Remove markdown dividers
  const content = summary.replace(/^---\n?|\n?---$/g, '').trim();
  
  // Extract metadata
  const typeMatch = content.match(/Type:\s*(\w+)/);
  const sourcesMatch = content.match(/Sources:\s*(\d+)\s*articles?/);
  const confidenceMatch = content.match(/Confidence:\s*(\d+)%/);
  
  if (typeMatch) result.metadata.type = typeMatch[1];
  if (sourcesMatch) result.metadata.sources = sourcesMatch[1];
  if (confidenceMatch) result.metadata.confidence = parseInt(confidenceMatch[1]);

  // Extract verified developments
  const verifiedSection = content.match(/\*\*VERIFIED DEVELOPMENTS\*\*\n([\s\S]*?)(?=\n\*\*(?:UNVERIFIED|CITATIONS)|$)/);
  if (verifiedSection) {
    const items = verifiedSection[1].match(/• (.+?) \(([^)]+)\) \[(\d+)%\]/g) || [];
    result.verified = items.map(item => {
      const match = item.match(/• (.+?) \(([^)]+)\) \[(\d+)%\]/);
      return match ? {
        text: match[1],
        source: match[2],
        confidence: parseInt(match[3]),
      } : { text: item, source: '', confidence: 0 };
    });
  }

  // Extract unverified reports
  const unverifiedSection = content.match(/\*\*UNVERIFIED REPORTS\*\*[^\n]*\n([\s\S]*?)(?=\n\*\*CITATIONS|$)/);
  if (unverifiedSection) {
    const items = unverifiedSection[1].match(/• ⚠ (.+?) \(([^)]+)\) \[(\d+)%\]/g) || [];
    result.unverified = items.map(item => {
      const match = item.match(/• ⚠ (.+?) \(([^)]+)\) \[(\d+)%\]/);
      return match ? {
        text: match[1],
        source: match[2],
        confidence: parseInt(match[3]),
      } : { text: item, source: '', confidence: 0 };
    });
  }

  // Extract citations
  const citationsSection = content.match(/\*\*CITATIONS\*\*\n([\s\S]*?)$/);
  if (citationsSection) {
    const items = citationsSection[1].match(/• "([^"]+)" - ([^-\n]+) - (URL|https?:\/\/[^\s]+)/g) || [];
    result.citations = items.map(item => {
      const match = item.match(/• "([^"]+)" - ([^-]+) - (URL|https?:\/\/[^\s]+)/);
      return match ? {
        title: match[1].trim(),
        source: match[2].trim(),
        url: match[3] === 'URL' ? undefined : match[3].trim(),
      } : { title: item, source: '' };
    });
  }

  return result;
}

function ConfidenceBadge({ confidence, size = 'sm' }: { confidence: number; size?: 'sm' | 'md' | 'lg' }) {
  const getColor = (conf: number) => {
    if (conf >= 80) return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', ring: 'ring-green-500/30' };
    if (conf >= 60) return { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', ring: 'ring-yellow-500/30' };
    return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', ring: 'ring-red-500/30' };
  };
  
  const colors = getColor(confidence);
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ${colors.bg} ${colors.text} ${colors.ring} ${sizeClasses[size]}`}>
      <span className="font-bold">{confidence}%</span>
    </span>
  );
}

function FactVerificationModal({ 
  item, 
  isOpen, 
  onClose 
}: { 
  item: DevelopmentItem; 
  isOpen: boolean; 
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const getConfidenceLevel = (conf: number) => {
    if (conf >= 80) return { label: 'High Confidence', color: 'text-green-600', icon: '✓' };
    if (conf >= 60) return { label: 'Medium Confidence', color: 'text-yellow-600', icon: '!' };
    return { label: 'Low Confidence', color: 'text-red-600', icon: '⚠' };
  };

  const level = getConfidenceLevel(item.confidence);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Fact Verification</h3>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
        
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
          <p className="text-slate-700 dark:text-slate-300">{item.text}</p>
        </div>

        <div className="grid gap-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Confidence Score</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-3 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${
                      item.confidence >= 80 ? 'bg-green-500' : 
                      item.confidence >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${item.confidence}%` }}
                  />
                </div>
                <span className={`font-bold ${level.color}`}>{item.confidence}%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-2xl ${level.color}`}>{level.icon}</span>
            <span className={`font-medium ${level.color}`}>{level.label}</span>
          </div>

          <div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Source Attribution</div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-argus-100 dark:bg-argus-900/30 text-argus-700 dark:text-argus-400 rounded text-sm font-medium">
                {item.source}
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-600">
            Verification based on source reputation, cross-referencing, and content analysis.
          </div>
        </div>
      </div>
    </div>
  );
}

function DevelopmentCard({ 
  item, 
  isUnverified = false 
}: { 
  item: DevelopmentItem; 
  isUnverified?: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div 
        className={`group rounded-lg p-4 border cursor-pointer transition-all hover:shadow-md ${
          isUnverified 
            ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50 hover:border-amber-300' 
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-argus-300'
        }`}
        onClick={() => setShowModal(true)}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed">
              {isUnverified && <span className="text-amber-500 mr-1">⚠</span>}
              {item.text}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-argus-600 dark:text-argus-400 font-medium">
                {item.source}
              </span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <ConfidenceBadge confidence={item.confidence} />
              <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                Click for details →
              </span>
            </div>
          </div>
        </div>
      </div>
      <FactVerificationModal item={item} isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
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

function CitationsList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span>📚</span> Sources & Citations
      </h3>
      <div className="grid gap-2">
        {citations.map((citation, i) => (
          <div 
            key={i} 
            className="flex items-center justify-between py-2 px-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-argus-300 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm text-slate-700 dark:text-slate-300 line-clamp-1">
                {citation.title}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                — {citation.source}
              </span>
            </div>
            {citation.url && citation.url !== 'URL' && (
              <a 
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-argus-600 hover:text-argus-700 dark:text-argus-400 dark:hover:text-argus-300 text-sm"
                onClick={e => e.stopPropagation()}
              >
                Open ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BriefingsPage() {
  const [latest, setLatest] = useState<BriefingData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsed, setParsed] = useState<ParsedBriefing | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [latestRes, statsRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/briefings/latest`, { cache: 'no-store' }),
          fetch(`${API_URL}/api/v1/stats`, { cache: 'no-store' }),
        ]);

        if (latestRes.ok) {
          const latestData = await latestRes.json();
          if (latestData.success && latestData.data) {
            setLatest(latestData.data);
            setParsed(parseBriefingSummary(latestData.data.summary));
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-argus-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center pb-4">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Intelligence Briefings
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2 text-lg">
          AI-verified summaries of strategic intelligence
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

      {/* Latest Briefing */}
      {latest && parsed ? (
        <div className="space-y-6">
          {/* Executive Summary Card */}
          <div className="bg-gradient-to-br from-argus-50 to-white dark:from-argus-900/20 dark:to-slate-800 rounded-2xl shadow-lg border border-argus-200 dark:border-argus-800/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-argus-200/50 dark:border-argus-800/30 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <TypeBadge type={latest.type} />
                <ConfidenceBadge confidence={parsed.metadata.confidence} size="md" />
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                <span className="font-medium">{parsed.metadata.sources} sources</span>
                <span className="mx-2">•</span>
                <span>{new Date(latest.generatedAt).toLocaleString()}</span>
                {latest.deliveredAt && (
                  <span className="ml-2 text-green-600 dark:text-green-400">✓ Delivered</span>
                )}
              </div>
            </div>
            
            <div className="p-6">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                <span>📋</span> Executive Summary
              </h2>
              <div className="prose prose-slate dark:prose-invert prose-sm max-w-none">
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  This {parsed.metadata.type} briefing covers {parsed.metadata.sources} sources with an overall 
                  confidence score of <strong>{parsed.metadata.confidence}%</strong>. 
                  {parsed.verified.length > 0 && (
                    <> Contains <strong>{parsed.verified.length} verified developments</strong> and </>
                  )}
                  {parsed.unverified.length > 0 && (
                    <><strong>{parsed.unverified.length} unverified reports</strong> requiring additional confirmation.</>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Verified Developments */}
          {parsed.verified.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <span className="text-green-500">✓</span> Verified Developments
              </h2>
              <div className="grid gap-3">
                {parsed.verified.map((item, i) => (
                  <DevelopmentCard key={i} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* Unverified Reports */}
          {parsed.unverified.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <span className="text-amber-500">⚠</span> Unverified Reports
                <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                  (confidence &lt; 70%)
                </span>
              </h2>
              <div className="grid gap-3">
                {parsed.unverified.map((item, i) => (
                  <DevelopmentCard key={i} item={item} isUnverified />
                ))}
              </div>
            </div>
          )}

          {/* Citations */}
          <CitationsList citations={parsed.citations} />

          {/* Key Changes (from API) */}
          {latest.changes && latest.changes.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <span>🔄</span> Key Changes
              </h3>
              <div className="space-y-3">
                {latest.changes.map((change: any, i: number) => (
                  <div key={i} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-argus-600 dark:text-argus-400 px-2 py-0.5 bg-argus-100 dark:bg-argus-900/30 rounded">
                        {change.domain}
                      </span>
                      {change.significance && (
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          change.significance === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          change.significance === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                        }`}>
                          {change.significance}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 text-sm">{change.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Forecasts */}
          {latest.forecasts && latest.forecasts.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <span>🔮</span> Forecasts
              </h3>
              <div className="space-y-3">
                {latest.forecasts.map((forecast: any, i: number) => (
                  <div key={i} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                    <p className="text-slate-700 dark:text-slate-300 text-sm">
                      {forecast.prediction || forecast}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
          <div className="text-6xl mb-4">📋</div>
          <h2 className="text-xl font-semibold mb-2 text-slate-900 dark:text-white">No Briefings Yet</h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Briefings are generated from verified intelligence. 
            Use the API to generate morning or evening briefings.
          </p>
          <div className="mt-6 text-sm text-slate-400">
            <code className="bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-lg font-mono">
              POST /api/briefings/generate
            </code>
          </div>
        </div>
      )}

      {/* Briefing Types Explanation */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="font-semibold mb-4 text-slate-900 dark:text-white">Briefing Types</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="flex gap-3 items-start">
            <TypeBadge type="morning" />
            <span className="text-slate-600 dark:text-slate-400">
              Comprehensive overnight intelligence summary
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <TypeBadge type="evening" />
            <span className="text-slate-600 dark:text-slate-400">
              End-of-day developments and changes
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <TypeBadge type="alert" />
            <span className="text-slate-600 dark:text-slate-400">
              Urgent breaking developments
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <TypeBadge type="weekly" />
            <span className="text-slate-600 dark:text-slate-400">
              Weekly trend analysis and forecasts
            </span>
          </div>
        </div>
      </div>

      {/* API Usage */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-semibold mb-4 text-slate-900 dark:text-white">Generate Briefings via API</h3>
        <div className="space-y-4 text-sm">
          <div>
            <div className="font-medium text-slate-700 dark:text-slate-300 mb-2">Generate Morning Briefing:</div>
            <code className="block bg-slate-100 dark:bg-slate-700 px-4 py-3 rounded-lg text-xs font-mono overflow-x-auto">
              curl -X POST https://argus.vitalpoint.ai/api/briefings/generate \<br/>
              &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br/>
              &nbsp;&nbsp;-d &apos;&#123;&quot;type&quot;: &quot;morning&quot;&#125;&apos;
            </code>
          </div>
          <div>
            <div className="font-medium text-slate-700 dark:text-slate-300 mb-2">Get Latest Briefing:</div>
            <code className="block bg-slate-100 dark:bg-slate-700 px-4 py-3 rounded-lg text-xs font-mono">
              curl https://argus.vitalpoint.ai/api/v1/briefings/latest
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
