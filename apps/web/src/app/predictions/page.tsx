'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface Forecast {
  event: string;
  reasoning: string;
  timeframe: 'near' | 'mid' | 'long';
  confidence: number;
  probability: number;
  briefingId?: string;
  briefingDate?: string;
}

interface BriefingData {
  id: string;
  type: string;
  forecasts: Forecast[];
  generatedAt: string;
}

function TimeframeBadge({ timeframe }: { timeframe: string }) {
  const config: Record<string, { label: string; color: string }> = {
    near: { label: '1-7 days', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    mid: { label: '1-4 weeks', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    long: { label: '1-3 months', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  };
  
  const { label, color } = config[timeframe] || config.mid;
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function ProbabilityBar({ probability }: { probability: number }) {
  const color = probability >= 70 ? 'bg-green-500' : probability >= 40 ? 'bg-yellow-500' : 'bg-slate-400';
  
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${probability}%` }}
        />
      </div>
      <span className="text-sm font-bold text-slate-700 dark:text-slate-300 w-12 text-right">
        {probability}%
      </span>
    </div>
  );
}

function PredictionCard({ forecast, index }: { forecast: Forecast; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-lg transition-shadow">
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="text-3xl opacity-80">🔮</div>
          <div className="flex-1">
            <p className="text-slate-800 dark:text-slate-200 font-medium text-lg leading-relaxed">
              {forecast.event}
            </p>
            
            <div className="mt-4">
              <ProbabilityBar probability={forecast.probability} />
            </div>

            <div className="flex items-center flex-wrap gap-3 mt-4">
              <TimeframeBadge timeframe={forecast.timeframe} />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Confidence: {forecast.confidence}%
              </span>
              {forecast.briefingDate && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Generated: {new Date(forecast.briefingDate).toLocaleDateString()}
                </span>
              )}
            </div>

            {forecast.reasoning && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-3 text-sm text-argus-600 dark:text-argus-400 hover:underline flex items-center gap-1"
              >
                {expanded ? '▼ Hide reasoning' : '▶ Show reasoning'}
              </button>
            )}

            {expanded && forecast.reasoning && (
              <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {forecast.reasoning}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterButton({ 
  label, 
  active, 
  onClick 
}: { 
  label: string; 
  active: boolean; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active 
          ? 'bg-argus-600 text-white' 
          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
      }`}
    >
      {label}
    </button>
  );
}

export default function PredictionsPage() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframeFilter, setTimeframeFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'probability' | 'date'>('probability');

  useEffect(() => {
    async function fetchForecasts() {
      try {
        // Fetch recent briefings and extract forecasts
        const res = await fetch(`${API_URL}/api/v1/briefings?limit=20`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            const allForecasts: Forecast[] = [];
            
            for (const briefing of data.data as BriefingData[]) {
              if (briefing.forecasts && briefing.forecasts.length > 0) {
                for (const forecast of briefing.forecasts) {
                  allForecasts.push({
                    ...forecast,
                    briefingId: briefing.id,
                    briefingDate: briefing.generatedAt,
                  });
                }
              }
            }
            
            setForecasts(allForecasts);
          }
        }
      } catch (error) {
        console.error('Failed to fetch forecasts:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchForecasts();
  }, []);

  // Filter and sort
  const filteredForecasts = forecasts
    .filter(f => !timeframeFilter || f.timeframe === timeframeFilter)
    .sort((a, b) => {
      if (sortBy === 'probability') {
        return b.probability - a.probability;
      }
      return new Date(b.briefingDate || 0).getTime() - new Date(a.briefingDate || 0).getTime();
    });

  // Stats
  const nearCount = forecasts.filter(f => f.timeframe === 'near').length;
  const midCount = forecasts.filter(f => f.timeframe === 'mid').length;
  const longCount = forecasts.filter(f => f.timeframe === 'long').length;
  const avgProbability = forecasts.length > 0 
    ? Math.round(forecasts.reduce((sum, f) => sum + f.probability, 0) / forecasts.length)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-argus-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center pb-4">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white flex items-center justify-center gap-3">
          <span>🔮</span> Predictions
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2 text-lg">
          AI-generated forecasts based on intelligence analysis
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
          These are speculative predictions, not verified intelligence
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-center">
          <div className="text-3xl font-bold text-slate-900 dark:text-white">{forecasts.length}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Total Predictions</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-center">
          <div className="text-3xl font-bold text-red-600 dark:text-red-400">{nearCount}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Near-term (1-7d)</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-center">
          <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{midCount}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Mid-term (1-4w)</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-center">
          <div className="text-3xl font-bold text-argus-600 dark:text-argus-400">{avgProbability}%</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Avg Probability</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap gap-2">
          <FilterButton 
            label="All" 
            active={!timeframeFilter} 
            onClick={() => setTimeframeFilter(null)} 
          />
          <FilterButton 
            label="Near-term" 
            active={timeframeFilter === 'near'} 
            onClick={() => setTimeframeFilter('near')} 
          />
          <FilterButton 
            label="Mid-term" 
            active={timeframeFilter === 'mid'} 
            onClick={() => setTimeframeFilter('mid')} 
          />
          <FilterButton 
            label="Long-term" 
            active={timeframeFilter === 'long'} 
            onClick={() => setTimeframeFilter('long')} 
          />
        </div>
        
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'probability' | 'date')}
          className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200"
        >
          <option value="probability">Sort by Probability</option>
          <option value="date">Sort by Date</option>
        </select>
      </div>

      {/* Predictions List */}
      {filteredForecasts.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
          <div className="text-6xl mb-4">🔮</div>
          <h2 className="text-xl font-semibold mb-2 text-slate-900 dark:text-white">No Predictions Yet</h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Predictions are generated from intelligence briefings. 
            Check back after the next briefing cycle.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredForecasts.map((forecast, i) => (
            <PredictionCard key={`${forecast.briefingId}-${i}`} forecast={forecast} index={i} />
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300">
        <strong>⚠️ Disclaimer:</strong> These predictions are AI-generated based on current intelligence 
        and should not be used as the sole basis for decisions. Probability scores reflect model confidence, 
        not guaranteed outcomes. Always verify with multiple sources.
      </div>
    </div>
  );
}
