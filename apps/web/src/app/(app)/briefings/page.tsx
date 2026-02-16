'use client';

import React, { useState, useEffect } from 'react';
import ExecutiveBriefing from '@/components/ExecutiveBriefing';
import { useAuth } from '@/lib/auth';
import { getConfidenceDisplay } from '@/lib/confidence';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface SavedBriefing {
  id: string;
  title: string;
  type: string;
  content: string;
  createdAt: string;
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

function StatCard({ title, value, subtitle }: { title: string; value: number | string; subtitle: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle}</div>
    </div>
  );
}

export default function BriefingsPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [executiveBriefing, setExecutiveBriefing] = useState<any>(null);
  const [currentSavedBriefing, setCurrentSavedBriefing] = useState<SavedBriefing | null>(null);
  const [executiveHistory, setExecutiveHistory] = useState<SavedBriefing[]>([]);
  const [executiveLoading, setExecutiveLoading] = useState(false);
  const [executiveError, setExecutiveError] = useState<string | null>(null);
  const [generateFormat, setGenerateFormat] = useState<'executive' | 'summary'>('executive');

  // Fetch current saved executive briefing
  const fetchCurrentExecutive = async () => {
    try {
      const res = await fetch(`${API_URL}/api/briefings/executive/current`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      console.log('[Briefings] Current briefing:', data.data?.id);
      if (data.success && data.data) {
        setCurrentSavedBriefing(data.data);
        setExecutiveBriefing({
          title: data.data.title,
          markdownContent: data.data.content,
          savedAt: data.data.createdAt,
          briefingId: data.data.id,
        });
      }
    } catch (error) {
      console.error('Failed to fetch current briefing:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch executive briefing history
  const fetchExecutiveHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/briefings/executive/history?limit=20`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      console.log('[Briefings] History:', data.data?.length, 'items');
      if (data.success && data.data) {
        setExecutiveHistory(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch briefing history:', error);
    }
  };

  const generateExecutiveBriefing = async (format: 'executive' | 'summary' = 'executive') => {
    setExecutiveLoading(true);
    setExecutiveError(null);
    setGenerateFormat(format);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    
    try {
      const res = await fetch(`${API_URL}/api/briefings/executive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'morning',
          hoursBack: 14,
          includeTTS: false,
          format: format,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.success) {
        setExecutiveBriefing(data.data);
        if (data.data.saved) {
          setCurrentSavedBriefing({
            id: data.data.briefingId,
            title: data.data.title,
            type: format,
            content: data.data.markdownContent,
            createdAt: new Date().toISOString(),
          });
          fetchExecutiveHistory();
        }
      } else {
        setExecutiveError(data.error || 'Failed to generate briefing');
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setExecutiveError('Request timed out. The briefing is taking longer than expected.');
      } else {
        setExecutiveError(error.message || 'Failed to generate briefing');
      }
    } finally {
      setExecutiveLoading(false);
    }
  };

  // Load a specific briefing from history
  const loadHistoricalBriefing = async (id: string) => {
    console.log(`[Briefings] Loading historical briefing: ${id}`);
    setExecutiveLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/briefings/executive/${id}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      console.log(`[Briefings] Response for ${id}:`, data.success, data.data?.id);
      if (data.success && data.data) {
        setExecutiveBriefing({
          title: data.data.title,
          markdownContent: data.data.content,
          savedAt: data.data.createdAt,
          briefingId: data.data.id,
          isHistorical: true,
        });
      } else {
        console.error('[Briefings] Failed to load:', data.error);
      }
    } catch (error) {
      console.error('Failed to load briefing:', error);
    } finally {
      setExecutiveLoading(false);
    }
  };

  useEffect(() => {
    async function fetchData() {
      try {
        const statsRes = await fetch(`${API_URL}/api/v1/stats`, { cache: 'no-store' });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData.success) {
            setStats(statsData.data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    }
    fetchData();
    fetchCurrentExecutive();
    fetchExecutiveHistory();
  }, []);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header with Generate Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Intelligence Briefings
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            AI-curated summaries from your sources
          </p>
        </div>
        
        {/* Generate Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => generateExecutiveBriefing('summary')}
            disabled={executiveLoading}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {executiveLoading && generateFormat === 'summary' ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-500 border-t-transparent"></div>
            ) : (
              <span>📝</span>
            )}
            Generate Summary
          </button>
          <button
            onClick={() => generateExecutiveBriefing('executive')}
            disabled={executiveLoading}
            className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {executiveLoading && generateFormat === 'executive' ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            ) : (
              <span>📊</span>
            )}
            Generate Executive
          </button>
        </div>
      </div>

      {/* Platform Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            title="Articles"
            value={stats.content?.total || 0}
            subtitle={`${stats.content?.last24h || 0} in 24h`}
          />
          <StatCard
            title="Verified"
            value={stats.content?.verified || 0}
            subtitle={`${getConfidenceDisplay(stats.content?.averageConfidence || 0).label} confidence`}
          />
          <StatCard
            title="Sources"
            value={stats.sources || 0}
            subtitle="Active"
          />
          <StatCard
            title="Domains"
            value={stats.domains || 0}
            subtitle="Tracked"
          />
        </div>
      )}

      {/* Error Display */}
      {executiveError && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <div className="flex justify-between items-start">
            <div>
              <strong>Error:</strong> {executiveError}
            </div>
            <button 
              onClick={() => setExecutiveError(null)}
              className="text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* History Sidebar */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sticky top-4">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3 text-sm flex items-center gap-2">
              <span>📜</span> Previous Briefings
            </h3>
            {executiveHistory.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
                No history yet
              </p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {executiveHistory.map((item) => {
                  const date = new Date(item.createdAt);
                  const isActive = executiveBriefing?.briefingId === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => loadHistoricalBriefing(item.id)}
                      className={`w-full text-left p-3 rounded-lg text-sm transition ${
                        isActive 
                          ? 'bg-argus-100 dark:bg-argus-900/30 border border-argus-300 dark:border-argus-700'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-transparent'
                      }`}
                    >
                      <div className="font-medium text-slate-700 dark:text-slate-300">
                        {date.toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric',
                        })}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {date.toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                        })}
                        {item.type && (
                          <span className="ml-2 capitalize">• {item.type}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Main Briefing Content */}
        <div className="lg:col-span-3 order-1 lg:order-2">
          {/* Viewing indicator */}
          {executiveBriefing?.savedAt && !executiveLoading && (
            <div className="mb-4 flex items-center justify-between text-sm">
              <div className="text-slate-500 dark:text-slate-400">
                {executiveBriefing.isHistorical ? '📜 Viewing briefing from' : '📋 Latest briefing from'}{' '}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {new Date(executiveBriefing.savedAt).toLocaleString()}
                </span>
              </div>
              {executiveBriefing.isHistorical && currentSavedBriefing && (
                <button
                  onClick={() => {
                    setExecutiveBriefing({
                      title: currentSavedBriefing.title,
                      markdownContent: currentSavedBriefing.content,
                      savedAt: currentSavedBriefing.createdAt,
                      briefingId: currentSavedBriefing.id,
                    });
                  }}
                  className="text-argus-600 hover:text-argus-700 dark:text-argus-400 font-medium"
                >
                  ← Back to latest
                </button>
              )}
            </div>
          )}
          
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-argus-500 border-t-transparent"></div>
            </div>
          ) : executiveBriefing ? (
            <ExecutiveBriefing 
              briefing={executiveBriefing}
              onGenerate={() => generateExecutiveBriefing('executive')}
              loading={executiveLoading}
              hideGenerateCard={true}
            />
          ) : (
            /* No briefing yet - show welcome card */
            <div className="bg-gradient-to-br from-argus-50 to-white dark:from-argus-900/20 dark:to-slate-800 rounded-2xl shadow-lg border border-argus-200 dark:border-argus-800/50 p-8 text-center">
              <div className="text-6xl mb-4">📋</div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Welcome to Argus Briefings
              </h2>
              <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-6">
                Generate your first intelligence briefing to see AI-curated summaries from your sources.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => generateExecutiveBriefing('summary')}
                  disabled={executiveLoading}
                  className="px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  📝 Quick Summary
                </button>
                <button
                  onClick={() => generateExecutiveBriefing('executive')}
                  disabled={executiveLoading}
                  className="px-6 py-3 bg-argus-600 hover:bg-argus-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  📊 Full Executive Briefing
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Briefing Schedule Info */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-4">
            <span className="text-slate-500 dark:text-slate-400">Scheduled delivery:</span>
            <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs font-medium">
              🌅 5:00 AM
            </span>
            <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded text-xs font-medium">
              🌆 6:00 PM
            </span>
          </div>
          <a 
            href="/settings" 
            className="text-argus-600 hover:text-argus-700 dark:text-argus-400 font-medium"
          >
            Customize schedule →
          </a>
        </div>
      </div>
    </div>
  );
}
