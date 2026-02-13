'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface OverviewStats {
  totals: {
    sourceLists: number;
    users: number;
    sources: number;
    articles: number;
    briefings: number;
    subscriptions: number;
    activeSubscriptions: number;
  };
  activity: {
    articlesLast24h: number;
    articlesLast7d: number;
  };
  revenue: {
    totalUsdc: number;
  };
}

interface LeaderboardItem {
  rank: number;
  id: string;
  name: string;
  description: string;
  totalSubscribers: number;
  totalRevenueUsdc: number;
  avgRating: number;
  ratingCount: number;
  creatorName: string;
  isMarketplaceListed: boolean;
}

interface TimeseriesPoint {
  date: string;
  count: number;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboardSort, setLeaderboardSort] = useState<'subscribers' | 'revenue' | 'rating'>('subscribers');
  const [timeseriesMetric, setTimeseriesMetric] = useState<'articles' | 'subscriptions' | 'users'>('articles');

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [leaderboardSort]);

  useEffect(() => {
    fetchTimeseries();
  }, [timeseriesMetric]);

  const fetchAnalytics = async () => {
    try {
      const [overviewRes, leaderboardRes, timeseriesRes] = await Promise.all([
        fetch(`${API_URL}/api/analytics/overview`),
        fetch(`${API_URL}/api/analytics/leaderboard?sort=subscribers&limit=10`),
        fetch(`${API_URL}/api/analytics/timeseries?metric=articles&days=30`),
      ]);

      const overviewData = await overviewRes.json();
      const leaderboardData = await leaderboardRes.json();
      const timeseriesData = await timeseriesRes.json();

      if (overviewData.success) setOverview(overviewData.data);
      if (leaderboardData.success) setLeaderboard(leaderboardData.data);
      if (timeseriesData.success) setTimeseries(timeseriesData.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/leaderboard?sort=${leaderboardSort}&limit=10`);
      const data = await res.json();
      if (data.success) setLeaderboard(data.data);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    }
  };

  const fetchTimeseries = async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/timeseries?metric=${timeseriesMetric}&days=30`);
      const data = await res.json();
      if (data.success) setTimeseries(data.data);
    } catch (error) {
      console.error('Failed to fetch timeseries:', error);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getMaxCount = () => Math.max(...timeseries.map(d => d.count), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">📊 Platform Analytics</h1>
        <p className="text-slate-500 mt-1">Real-time metrics and source list leaderboard</p>
      </div>

      {/* Overview Stats */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <StatCard 
            label="Source Lists" 
            value={overview.totals.sourceLists} 
            icon="📋" 
          />
          <StatCard 
            label="Users" 
            value={overview.totals.users} 
            icon="👥" 
          />
          <StatCard 
            label="Sources" 
            value={overview.totals.sources} 
            icon="🔗" 
          />
          <StatCard 
            label="Articles" 
            value={overview.totals.articles} 
            icon="📰" 
          />
          <StatCard 
            label="Subscriptions" 
            value={overview.totals.activeSubscriptions} 
            icon="🎫" 
            subtext={`${overview.totals.subscriptions} total`}
          />
          <StatCard 
            label="24h Articles" 
            value={overview.activity.articlesLast24h} 
            icon="⚡" 
          />
          <StatCard 
            label="Revenue" 
            value={`$${formatNumber(overview.revenue.totalUsdc)}`} 
            icon="💰" 
            isString
          />
        </div>
      )}

      {/* Charts Section */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Activity Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Activity Over Time</h2>
            <select
              value={timeseriesMetric}
              onChange={(e) => setTimeseriesMetric(e.target.value as any)}
              className="text-sm border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700"
            >
              <option value="articles">Articles Ingested</option>
              <option value="subscriptions">New Subscriptions</option>
              <option value="users">New Users</option>
            </select>
          </div>
          
          {/* Simple bar chart */}
          <div className="h-48 flex items-end gap-1">
            {timeseries.length > 0 ? (
              timeseries.slice(-30).map((point, i) => (
                <div
                  key={i}
                  className="flex-1 bg-argus-500 hover:bg-argus-600 rounded-t transition-all cursor-pointer group relative"
                  style={{ 
                    height: `${Math.max((point.count / getMaxCount()) * 100, 2)}%`,
                    minHeight: '4px'
                  }}
                  title={`${point.date}: ${point.count}`}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                    {new Date(point.date).toLocaleDateString()}: {point.count}
                  </div>
                </div>
              ))
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                No data available
              </div>
            )}
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Platform Health</h2>
          <div className="space-y-4">
            <ProgressStat 
              label="Active Sources" 
              value={overview?.totals.sources || 0}
              max={200}
              color="bg-green-500"
            />
            <ProgressStat 
              label="Weekly Articles" 
              value={overview?.activity.articlesLast7d || 0}
              max={10000}
              color="bg-blue-500"
            />
            <ProgressStat 
              label="Active Subscriptions" 
              value={overview?.totals.activeSubscriptions || 0}
              max={100}
              color="bg-purple-500"
            />
            <ProgressStat 
              label="Source Lists" 
              value={overview?.totals.sourceLists || 0}
              max={50}
              color="bg-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Leaderboard Link Card */}
      <Link 
        href="/leaderboard"
        className="block bg-gradient-to-r from-argus-600 to-argus-700 rounded-xl shadow-lg p-6 text-white hover:from-argus-700 hover:to-argus-800 transition-all group"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              🏆 Source List Leaderboard
            </h2>
            <p className="text-argus-100 mt-1">
              See top performing source lists ranked by subscribers, revenue & rating
            </p>
          </div>
          <span className="text-2xl group-hover:translate-x-1 transition-transform">→</span>
        </div>
        
        {/* Quick preview of top 3 */}
        {leaderboard.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {leaderboard.slice(0, 3).map((item, i) => (
              <span 
                key={item.id}
                className="inline-flex items-center gap-1 px-3 py-1 bg-white/20 rounded-full text-sm"
              >
                {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {item.name}
              </span>
            ))}
          </div>
        )}
      </Link>
    </div>
  );
}

// Stat Card Component
function StatCard({ 
  label, 
  value, 
  icon, 
  subtext,
  isString = false 
}: { 
  label: string; 
  value: number | string; 
  icon: string;
  subtext?: string;
  isString?: boolean;
}) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold">
        {isString ? value : formatNumber(value as number)}
      </div>
      {subtext && (
        <div className="text-xs text-slate-400 mt-1">{subtext}</div>
      )}
    </div>
  );
}

// Progress Stat Component
function ProgressStat({ 
  label, 
  value, 
  max, 
  color 
}: { 
  label: string; 
  value: number; 
  max: number;
  color: string;
}) {
  const percentage = Math.min((value / max) * 100, 100);
  
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="font-semibold">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
