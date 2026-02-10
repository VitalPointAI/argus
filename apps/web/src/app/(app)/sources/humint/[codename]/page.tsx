'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface Submission {
  id: string;
  title: string;
  locationRegion: string | null;
  locationCountry: string | null;
  eventTag: string | null;
  verificationStatus: string;
  verifiedCount: number;
  submittedAt: string;
}

interface HumintSource {
  codename: string;
  bio: string | null;
  domains: string[];
  regions: string[];
  eventTypes: string[];
  reputationScore: number;
  totalSubmissions: number;
  verifiedCount: number;
  contradictedCount: number;
  subscriberCount: number;
  subscriptionPriceUsdc: number | null;
  isAcceptingSubscribers: boolean;
  createdAt: string;
  lastActiveAt: string | null;
  recentSubmissions: Submission[];
}

export default function HumintSourceProfilePage() {
  const { codename } = useParams();
  const { user } = useAuth();
  const [source, setSource] = useState<HumintSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeSuccess, setSubscribeSuccess] = useState('');

  useEffect(() => {
    if (codename) {
      fetchSource();
    }
  }, [codename]);

  const fetchSource = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/humint/sources/${codename}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      const data = await res.json();
      
      if (data.success) {
        setSource(data.data);
      } else {
        setError(data.error || 'Source not found');
      }
    } catch (err) {
      setError('Failed to load source');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!token) {
      setError('Please log in to subscribe');
      return;
    }
    
    setSubscribing(true);
    try {
      const res = await fetch(`${API_URL}/api/humint/sources/${codename}/subscribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ months: 1 }),
      });
      const data = await res.json();
      
      if (data.success) {
        setSubscribeSuccess(`Subscribed until ${new Date(data.data.expiresAt).toLocaleDateString()}`);
        fetchSource();
      } else {
        setError(data.error || 'Subscription failed');
      }
    } catch (err) {
      setError('Subscription failed');
    } finally {
      setSubscribing(false);
    }
  };

  const getReputationColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      verified: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      contradicted: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      disputed: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
      unverified: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
    };
    return styles[status] || styles.unverified;
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500">Loading source...</div>
      </div>
    );
  }

  if (error || !source) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <div className="text-4xl mb-4">🎭</div>
        <h1 className="text-2xl font-bold mb-4">Source Not Found</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">{error || 'This source does not exist'}</p>
        <Link
          href="/sources/humint"
          className="px-6 py-3 bg-argus-600 hover:bg-argus-700 text-white rounded-lg inline-block"
        >
          View All Sources
        </Link>
      </div>
    );
  }

  const verifiedRatio = source.totalSubmissions > 0
    ? Math.round((source.verifiedCount / source.totalSubmissions) * 100)
    : 0;
  
  const accountAge = Math.floor((Date.now() - new Date(source.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back Link */}
      <Link
        href="/sources/humint"
        className="text-sm text-argus-600 hover:text-argus-700 dark:text-argus-400 flex items-center gap-1"
      >
        ← Back to HUMINT Sources
      </Link>

      {/* Profile Header */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          {/* Left: Identity */}
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-3xl">
                🎭
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {source.codename}
                </h1>
                <div className={`text-lg font-semibold ${getReputationColor(source.reputationScore)}`}>
                  ⭐ {source.reputationScore}/100 Reputation
                </div>
              </div>
            </div>
            
            {source.bio && (
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                {source.bio}
              </p>
            )}

            {/* Coverage Tags */}
            <div className="space-y-3">
              {source.regions.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-slate-500">📍 Regions:</span>
                  {source.regions.map((region) => (
                    <span
                      key={region}
                      className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-sm"
                    >
                      {region.charAt(0).toUpperCase() + region.slice(1)}
                    </span>
                  ))}
                </div>
              )}
              {source.domains.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-slate-500">📂 Domains:</span>
                  {source.domains.map((domain) => (
                    <span
                      key={domain}
                      className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-sm"
                    >
                      {domain.charAt(0).toUpperCase() + domain.slice(1)}
                    </span>
                  ))}
                </div>
              )}
              {source.eventTypes.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-slate-500">📡 Events:</span>
                  {source.eventTypes.map((event) => (
                    <span
                      key={event}
                      className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-sm"
                    >
                      {event.charAt(0).toUpperCase() + event.slice(1)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Stats & Actions */}
          <div className="md:w-64 space-y-4">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <div className="text-2xl font-bold">{source.totalSubmissions}</div>
                <div className="text-xs text-slate-500">Posts</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <div className="text-2xl font-bold text-green-600">{verifiedRatio}%</div>
                <div className="text-xs text-slate-500">Verified</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <div className="text-2xl font-bold">{source.subscriberCount}</div>
                <div className="text-xs text-slate-500">Subscribers</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <div className="text-2xl font-bold">{accountAge}d</div>
                <div className="text-xs text-slate-500">Active</div>
              </div>
            </div>

            {/* Subscription */}
            {source.isAcceptingSubscribers && (
              <div className="bg-argus-50 dark:bg-argus-900/20 rounded-lg p-4 text-center">
                <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  Subscription
                </div>
                <div className="text-xl font-bold text-argus-700 dark:text-argus-300 mb-3">
                  {source.subscriptionPriceUsdc} USDC/mo
                </div>
                {subscribeSuccess ? (
                  <div className="text-green-600 dark:text-green-400 text-sm">
                    ✓ {subscribeSuccess}
                  </div>
                ) : (
                  <button
                    onClick={handleSubscribe}
                    disabled={subscribing || !user}
                    className="w-full px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg disabled:opacity-50 transition"
                  >
                    {subscribing ? 'Subscribing...' : 'Subscribe'}
                  </button>
                )}
              </div>
            )}

            {/* Tip Button */}
            <button
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center justify-center gap-2"
            >
              💵 Send Tip
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
          <button onClick={() => setError('')} className="float-right">×</button>
        </div>
      )}

      {/* Recent Submissions */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold">Recent Intel</h2>
        </div>
        
        {source.recentSubmissions.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {source.recentSubmissions.map((submission) => (
              <div key={submission.id} className="px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-slate-900 dark:text-white">
                      {submission.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
                      {submission.locationRegion && (
                        <span>📍 {submission.locationRegion}</span>
                      )}
                      {submission.eventTag && (
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">
                          {submission.eventTag}
                        </span>
                      )}
                      <span>{formatDate(submission.submittedAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadge(submission.verificationStatus)}`}>
                      {submission.verificationStatus === 'verified' && '✓ '}
                      {submission.verificationStatus === 'contradicted' && '✗ '}
                      {submission.verificationStatus.charAt(0).toUpperCase() + submission.verificationStatus.slice(1)}
                    </span>
                    {submission.verifiedCount > 0 && (
                      <span className="text-xs text-slate-500">
                        {submission.verifiedCount} verified
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-slate-500">
            No submissions yet
          </div>
        )}
      </div>

      {/* Privacy Notice */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-sm text-slate-600 dark:text-slate-400">
        <strong>🔒 Privacy:</strong> This source's real identity is unknown to the platform. 
        Only their codename, public key, and submissions are stored. 
        Reputation is built through crowd verification.
      </div>
    </div>
  );
}
