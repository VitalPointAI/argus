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

      {/* Leaderboard */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">🏆 Source List Leaderboard</h2>
              <p className="text-sm text-slate-500">Top performing source lists by {leaderboardSort}</p>
            </div>
            <div className="flex gap-2">
              {(['subscribers', 'revenue', 'rating'] as const).map((sort) => (
                <button
                  key={sort}
                  onClick={() => setLeaderboardSort(sort)}
                  className={`px-3 py-1 text-sm rounded-full transition ${
                    leaderboardSort === sort
                      ? 'bg-argus-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {sort === 'subscribers' ? '👥 Subscribers' : sort === 'revenue' ? '💰 Revenue' : '⭐ Rating'}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Rank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Source List</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Creator</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Subscribers</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Revenue</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {leaderboard.length > 0 ? (
                leaderboard.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-2xl ${
                        item.rank === 1 ? '' : item.rank === 2 ? '' : item.rank === 3 ? '' : 'text-slate-400'
                      }`}>
                        {item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `#${item.rank}`}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Link 
                        href={`/marketplace/source-lists/${item.id}`}
                        className="font-medium text-argus-600 hover:text-argus-700"
                      >
                        {item.name}
                      </Link>
                      {item.isMarketplaceListed && (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          Listed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                      {item.creatorName || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold">
                      {formatNumber(item.totalSubscribers || 0)}
                    </td>
                    <td className="px-6 py-4 text-right text-green-600 font-semibold">
                      ${(item.totalRevenueUsdc || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-amber-500">★</span> {(item.avgRating || 0).toFixed(1)}
                      <span className="text-slate-400 text-sm ml-1">({item.ratingCount || 0})</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No source lists yet. <Link href="/sources/manage" className="text-argus-600 hover:underline">Create one!</Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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
