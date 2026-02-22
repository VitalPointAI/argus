'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface Region {
  id: string;
  label: string;
}

interface Perspective {
  region: string;
  regionLabel: string;
  articleCount: number;
  summary: string;
  keyPoints: string[];
  tone: string;
  emphasis: string[];
}

interface TopicAnalysis {
  topic: string;
  totalArticles: number;
  perspectives: Perspective[];
  divergenceLevel: 'none' | 'partial' | 'strong';
  divergenceAnalysis: string;
  truthAssessment: string;
  recommendations: string;
}

interface PropagandaBriefing {
  title: string;
  generatedAt: string;
  hoursAnalyzed: number;
  topicsAnalyzed: TopicAnalysis[];
  overallFindings: string;
  markdownContent: string;
}

const DIVERGENCE_STYLES = {
  none: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', emoji: '✅' },
  partial: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', emoji: '⚠️' },
  strong: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', emoji: '🚨' },
};

const TONE_COLORS: Record<string, string> = {
  positive: 'text-green-600',
  negative: 'text-red-600',
  neutral: 'text-slate-600',
  mixed: 'text-purple-600',
};

export default function PropagandaBriefingPage() {
  const { user, loading: authLoading } = useAuth();
  const [regions, setRegions] = useState<Region[]>([]);
  const [briefing, setBriefing] = useState<PropagandaBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Options
  const [hoursBack, setHoursBack] = useState(48);
  const [maxTopics, setMaxTopics] = useState(5);
  const [specificTopic, setSpecificTopic] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [region1, setRegion1] = useState('');
  const [region2, setRegion2] = useState('');
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  // Fetch available regions
  useEffect(() => {
    fetch(`${API_URL}/api/briefings/propaganda/regions`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setRegions(data.data.regions);
        }
      })
      .catch(console.error);
  }, []);

  const generateBriefing = async () => {
    setLoading(true);
    setError('');
    setBriefing(null);

    try {
      const endpoint = compareMode 
        ? `${API_URL}/api/briefings/propaganda/compare`
        : `${API_URL}/api/briefings/propaganda`;
      
      const body = compareMode
        ? { region1, region2, hoursBack, maxTopics, topic: specificTopic || undefined }
        : { hoursBack, maxTopics, topic: specificTopic || undefined };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      
      if (data.success) {
        setBriefing(data.data);
      } else {
        setError(data.error || 'Failed to generate briefing');
      }
    } catch (err) {
      setError('Failed to generate briefing');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-argus-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            🔍 Propaganda Analysis
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1">
            Compare regional narratives and identify propaganda patterns
          </p>
        </div>
        <a href="/briefings" className="text-argus-600 hover:text-argus-700 text-sm">
          ← Back to Briefings
        </a>
      </div>

      {/* Options Panel */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 sm:p-6">
        <h2 className="font-semibold mb-4">Analysis Options</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Time Period</label>
            <select
              value={hoursBack}
              onChange={(e) => setHoursBack(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
            >
              <option value={24}>Last 24 hours</option>
              <option value={48}>Last 48 hours</option>
              <option value={72}>Last 72 hours</option>
              <option value={168}>Last week</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Topics to Analyze</label>
            <select
              value={maxTopics}
              onChange={(e) => setMaxTopics(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
              disabled={!!specificTopic}
            >
              <option value={3}>3 random topics</option>
              <option value={5}>5 random topics</option>
              <option value={10}>10 random topics</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Or Specific Topic</label>
            <input
              type="text"
              value={specificTopic}
              onChange={(e) => setSpecificTopic(e.target.value)}
              placeholder="e.g., China, Taiwan, Ukraine..."
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
            />
            <p className="text-xs text-slate-500 mt-1">Leave empty for random selection</p>
          </div>
          
          <div className="lg:col-span-2">
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={compareMode}
                onChange={(e) => setCompareMode(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm font-medium">Compare specific regions</span>
            </label>
            
            {compareMode && (
              <div className="flex gap-2">
                <select
                  value={region1}
                  onChange={(e) => setRegion1(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                >
                  <option value="">Select Region 1</option>
                  {regions.map(r => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
                <span className="self-center text-slate-500">vs</span>
                <select
                  value={region2}
                  onChange={(e) => setRegion2(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                >
                  <option value="">Select Region 2</option>
                  {regions.map(r => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        
        <button
          onClick={generateBriefing}
          disabled={loading || (compareMode && (!region1 || !region2))}
          className="px-6 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span> Analyzing...
            </span>
          ) : (
            '🔍 Generate Analysis'
          )}
        </button>
        
        {error && (
          <div className="mt-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {briefing && (
        <div className="space-y-6">
          {/* Overview */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 sm:p-6">
            <h2 className="text-xl font-semibold mb-2">{briefing.title}</h2>
            <p className="text-sm text-slate-500 mb-4">
              Generated: {new Date(briefing.generatedAt).toLocaleString()} | 
              Period: {briefing.hoursAnalyzed}h | 
              Topics: {briefing.topicsAnalyzed.length}
            </p>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <h3 className="font-medium mb-2">Executive Summary</h3>
              <p className="text-slate-700 dark:text-slate-300">{briefing.overallFindings}</p>
            </div>
          </div>

          {/* Divergence Overview Table */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
            <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold">Divergence Overview</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Topic</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Regions</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Divergence</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Articles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {briefing.topicsAnalyzed.map((topic) => {
                    const style = DIVERGENCE_STYLES[topic.divergenceLevel];
                    return (
                      <tr 
                        key={topic.topic} 
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                        onClick={() => setExpandedTopic(expandedTopic === topic.topic ? null : topic.topic)}
                      >
                        <td className="px-4 py-3 font-medium">{topic.topic}</td>
                        <td className="px-4 py-3 text-sm">
                          {topic.perspectives.map(p => p.regionLabel.split(' ')[0]).join(' ')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-sm ${style.bg} ${style.text}`}>
                            {style.emoji} {topic.divergenceLevel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {topic.totalArticles}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed Analysis */}
          {briefing.topicsAnalyzed.map((topic) => {
            const style = DIVERGENCE_STYLES[topic.divergenceLevel];
            const isExpanded = expandedTopic === topic.topic;
            
            return (
              <div key={topic.topic} className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
                <button
                  onClick={() => setExpandedTopic(isExpanded ? null : topic.topic)}
                  className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-sm ${style.bg} ${style.text}`}>
                      {style.emoji}
                    </span>
                    <h3 className="font-semibold text-lg">{topic.topic}</h3>
                    <span className="text-sm text-slate-500">({topic.totalArticles} articles)</span>
                  </div>
                  <span className="text-2xl text-slate-400">{isExpanded ? '−' : '+'}</span>
                </button>
                
                {isExpanded && (
                  <div className="px-4 sm:px-6 pb-6 space-y-4">
                    {/* Regional Perspectives */}
                    <div className="grid gap-4 md:grid-cols-2">
                      {topic.perspectives.map((p) => (
                        <div key={p.region} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">{p.regionLabel}</h4>
                            <span className={`text-sm ${TONE_COLORS[p.tone] || 'text-slate-600'}`}>
                              {p.tone}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{p.summary}</p>
                          {p.keyPoints.length > 0 && (
                            <div className="mt-2">
                              <div className="text-xs font-medium text-slate-500 mb-1">Key Points:</div>
                              <ul className="text-sm space-y-1">
                                {p.keyPoints.map((kp, i) => (
                                  <li key={i} className="flex items-start gap-1">
                                    <span className="text-slate-400">•</span>
                                    <span>{kp}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {p.emphasis.length > 0 && (
                            <div className="mt-2 text-xs text-slate-500">
                              <span className="font-medium">Emphasis:</span> {p.emphasis.join(', ')}
                            </div>
                          )}
                          <div className="mt-2 text-xs text-slate-400">
                            {p.articleCount} articles analyzed
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Analysis */}
                    <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                      <div>
                        <h4 className="font-medium text-sm mb-1">Divergence Analysis</h4>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">{topic.divergenceAnalysis}</p>
                      </div>
                      <div>
                        <h4 className="font-medium text-sm mb-1">Truth Assessment</h4>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">{topic.truthAssessment}</p>
                      </div>
                      <div>
                        <h4 className="font-medium text-sm mb-1">Recommendations</h4>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">{topic.recommendations}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!briefing && !loading && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-8 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold mb-2">Ready to Analyze</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Generate a propaganda analysis to compare how different regions report on the same topics.
            Identify narrative divergences and assess truth proximity.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {regions.slice(0, 6).map(r => (
              <span key={r.id} className="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-sm">
                {r.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
