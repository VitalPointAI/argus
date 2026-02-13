'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

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
  categoryCount?: number;
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'subscribers' | 'revenue' | 'rating'>('subscribers');
  const [limit, setLimit] = useState(25);

  useEffect(() => {
    fetchLeaderboard();
  }, [sortBy, limit]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/analytics/leaderboard?sort=${sortBy}&limit=${limit}`);
      const data = await res.json();
      if (data.success) setLeaderboard(data.data);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', bg: 'bg-gradient-to-r from-yellow-400 to-amber-500', text: 'text-white' };
    if (rank === 2) return { emoji: '🥈', bg: 'bg-gradient-to-r from-slate-300 to-slate-400', text: 'text-white' };
    if (rank === 3) return { emoji: '🥉', bg: 'bg-gradient-to-r from-amber-600 to-amber-700', text: 'text-white' };
    return { emoji: `#${rank}`, bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-300' };
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              🏆 Source List Leaderboard
            </h1>
            <p className="text-slate-500 mt-1 text-sm sm:text-base">
              Top performing curated intelligence feeds
            </p>
          </div>
          <Link 
            href="/analytics"
            className="text-argus-600 hover:text-argus-700 text-sm font-medium flex items-center gap-1"
          >
            📊 View Analytics
          </Link>
        </div>
      </div>

      {/* Sort Controls - Mobile Optimized */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <span className="text-sm text-slate-500 self-center hidden sm:block">Sort by:</span>
          {(['subscribers', 'revenue', 'rating'] as const).map((sort) => (
            <button
              key={sort}
              onClick={() => setSortBy(sort)}
              className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-full transition-all ${
                sortBy === sort
                  ? 'bg-argus-600 text-white shadow-md'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-argus-300 hover:bg-argus-50 dark:hover:bg-slate-700'
              }`}
            >
              {sort === 'subscribers' && '👥'}
              {sort === 'revenue' && '💰'}
              {sort === 'rating' && '⭐'}
              <span className="ml-1 sm:ml-2 capitalize">{sort}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-slate-500">Loading leaderboard...</div>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 sm:p-12 text-center">
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-xl font-semibold mb-2">No Source Lists Yet</h3>
          <p className="text-slate-500 mb-6">Be the first to create a curated intelligence feed!</p>
          <Link 
            href="/sources/manage"
            className="inline-flex items-center px-6 py-3 bg-argus-600 text-white rounded-full font-medium hover:bg-argus-700 transition"
          >
            Create Source List →
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">
                    Rank
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Source List
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Creator
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    👥 Subscribers
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    💰 Revenue
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    ⭐ Rating
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {leaderboard.map((item) => {
                  const rankStyle = getRankDisplay(item.rank);
                  return (
                    <tr 
                      key={item.id} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${rankStyle.bg} ${rankStyle.text} font-bold text-sm`}>
                          {item.rank <= 3 ? rankStyle.emoji : item.rank}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <Link 
                          href={`/marketplace/source-lists/${item.id}`}
                          className="group"
                        >
                          <div className="font-semibold text-slate-900 dark:text-white group-hover:text-argus-600 transition">
                            {item.name}
                          </div>
                          {item.description && (
                            <div className="text-sm text-slate-500 mt-0.5 line-clamp-1 max-w-md">
                              {item.description}
                            </div>
                          )}
                        </Link>
                        {item.isMarketplaceListed && (
                          <span className="inline-flex items-center mt-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                            ✓ Listed
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-slate-600 dark:text-slate-400">
                          {item.creatorName || 'Anonymous'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <span className={`font-bold ${sortBy === 'subscribers' ? 'text-argus-600' : 'text-slate-700 dark:text-slate-300'}`}>
                          {formatNumber(item.totalSubscribers || 0)}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <span className={`font-bold ${sortBy === 'revenue' ? 'text-green-600' : 'text-slate-700 dark:text-slate-300'}`}>
                          ${(item.totalRevenueUsdc || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className={`font-bold ${sortBy === 'rating' ? 'text-amber-500' : 'text-slate-700 dark:text-slate-300'}`}>
                            {(item.avgRating || 0).toFixed(1)}
                          </span>
                          <span className="text-amber-400">★</span>
                          <span className="text-slate-400 text-sm">({item.ratingCount || 0})</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="lg:hidden space-y-3">
            {leaderboard.map((item) => {
              const rankStyle = getRankDisplay(item.rank);
              return (
                <Link
                  key={item.id}
                  href={`/marketplace/source-lists/${item.id}`}
                  className="block bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md hover:border-argus-300 transition-all"
                >
                  <div className="flex items-start gap-3">
                    {/* Rank Badge */}
                    <span className={`flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full ${rankStyle.bg} ${rankStyle.text} font-bold text-sm`}>
                      {item.rank <= 3 ? rankStyle.emoji : item.rank}
                    </span>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                            {item.name}
                          </h3>
                          <p className="text-sm text-slate-500 mt-0.5">
                            by {item.creatorName || 'Anonymous'}
                          </p>
                        </div>
                        {item.isMarketplaceListed && (
                          <span className="flex-shrink-0 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                            Listed
                          </span>
                        )}
                      </div>
                      
                      {/* Stats Row */}
                      <div className="flex items-center gap-4 mt-3 text-sm">
                        <div className={`${sortBy === 'subscribers' ? 'text-argus-600 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
                          👥 {formatNumber(item.totalSubscribers || 0)}
                        </div>
                        <div className={`${sortBy === 'revenue' ? 'text-green-600 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
                          💰 ${(item.totalRevenueUsdc || 0).toFixed(0)}
                        </div>
                        <div className={`flex items-center gap-0.5 ${sortBy === 'rating' ? 'text-amber-500 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
                          ⭐ {(item.avgRating || 0).toFixed(1)}
                          <span className="text-slate-400 text-xs">({item.ratingCount || 0})</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Load More */}
          {leaderboard.length >= limit && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setLimit(limit + 25)}
                className="px-6 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium hover:border-argus-300 hover:bg-argus-50 dark:hover:bg-slate-700 transition"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}

      {/* Create CTA */}
      <div className="mt-8 py-8 border-t border-slate-200 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Want to climb the leaderboard?</h3>
            <p className="text-sm text-slate-500">Create your own curated source list and start earning</p>
          </div>
          <Link 
            href="/sources/manage"
            className="px-6 py-3 bg-argus-600 text-white rounded-full font-medium hover:bg-argus-700 transition shadow-md hover:shadow-lg"
          >
            Create Source List
          </Link>
        </div>
      </div>
    </div>
  );
}
