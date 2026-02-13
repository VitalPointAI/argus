'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface SourceListListing {
  id: string;
  name: string;
  description: string;
  marketplaceDescription: string;
  marketplaceImageCid: string | null;
  domainName: string | null;
  creatorName: string;
  totalSubscribers: number;
  avgRating: number;
  ratingCount: number;
  minPackagePrice: number | null;
}

interface Subscription {
  id: string;
  sourceListId: string;
  listName: string;
  packageName: string;
  expiresAt: string | null;
  status: string;
}

interface MarketplaceSettings {
  feePercent: number;
  enabled: boolean;
}

export default function MarketplacePage() {
  const { user } = useAuth();
  const [featuredListings, setFeaturedListings] = useState<SourceListListing[]>([]);
  const [mySubscriptions, setMySubscriptions] = useState<Subscription[]>([]);
  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      // Fetch marketplace settings
      const settingsRes = await fetch(`${API_URL}/api/marketplace/settings`);
      const settingsData = await settingsRes.json();
      if (settingsData.success) {
        setSettings(settingsData.data);
      }

      // Fetch featured/popular listings
      const listingsRes = await fetch(`${API_URL}/api/marketplace/listings?sort=popular&limit=6`);
      const listingsData = await listingsRes.json();
      if (listingsData.success) {
        setFeaturedListings(listingsData.data);
      }

      // Fetch user's subscriptions
      if (user) {
        const subsRes = await fetch(`${API_URL}/api/marketplace/my-subscriptions`, {
          credentials: 'include',
        });
        const subsData = await subsRes.json();
        if (subsData.success) {
          setMySubscriptions(subsData.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch marketplace data:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <span key={i} className={i <= rating ? 'text-yellow-400' : 'text-slate-300'}>
          ★
        </span>
      );
    }
    return stars;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500">Loading marketplace...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-argus-600 via-purple-600 to-indigo-700 rounded-2xl p-8 text-white">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold mb-4">
            🛒 Intelligence Marketplace
          </h1>
          <p className="text-xl text-white/90 mb-6">
            Subscribe to curated source lists from expert analysts. 
            Get Access Passes with instant delivery.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/marketplace/source-lists"
              className="px-6 py-3 bg-white text-argus-700 font-semibold rounded-lg hover:bg-white/90 transition"
            >
              Browse All Lists →
            </Link>
            <Link
              href="/sources/manage"
              className="px-6 py-3 bg-white/20 text-white font-semibold rounded-lg hover:bg-white/30 transition border border-white/30"
            >
              Sell Your Lists
            </Link>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">📋</div>
          <h3 className="font-semibold text-lg mb-2">Curated Sources</h3>
          <p className="text-slate-500 text-sm">
            Expert analysts curate and maintain high-quality source lists across domains
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">🎫</div>
          <h3 className="font-semibold text-lg mb-2">Access Passes</h3>
          <p className="text-slate-500 text-sm">
            Subscribe with any token - get a pass that grants access to latest content
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">💰</div>
          <h3 className="font-semibold text-lg mb-2">Direct Payments</h3>
          <p className="text-slate-500 text-sm">
            {settings ? `${100 - settings.feePercent}%` : '95%'} goes directly to creators. No middlemen.
          </p>
        </div>
      </div>

      {/* My Subscriptions */}
      {user && mySubscriptions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">My Subscriptions</h2>
            <Link
              href="/marketplace/my-subscriptions"
              className="text-argus-600 hover:text-argus-700 text-sm"
            >
              View All →
            </Link>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mySubscriptions.slice(0, 3).map((sub) => (
              <Link
                key={sub.id}
                href={`/sources/lists/${sub.sourceListId}`}
                className="bg-white dark:bg-slate-800 rounded-lg p-4 hover:shadow-lg transition border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">{sub.listName}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    sub.status === 'active' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {sub.status}
                  </span>
                </div>
                <div className="text-sm text-slate-500">
                  {sub.packageName}
                  {sub.expiresAt && (
                    <span className="ml-2">
                      · Expires {new Date(sub.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Featured Listings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Popular Source Lists</h2>
          <Link
            href="/marketplace/source-lists"
            className="text-argus-600 hover:text-argus-700 text-sm"
          >
            Browse All →
          </Link>
        </div>
        
        {featuredListings.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredListings.map((listing) => (
              <Link
                key={listing.id}
                href={`/marketplace/source-lists/${listing.id}`}
                className="bg-white dark:bg-slate-800 rounded-lg shadow hover:shadow-lg transition overflow-hidden group"
              >
                {/* Image */}
                <div className="aspect-video bg-gradient-to-br from-argus-500 to-argus-700 relative">
                  {listing.marketplaceImageCid ? (
                    <img
                      src={`https://ipfs.io/ipfs/${listing.marketplaceImageCid}`}
                      alt={listing.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-white/50 text-6xl">
                      📋
                    </div>
                  )}
                  {listing.domainName && (
                    <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 text-white text-xs rounded">
                      {listing.domainName}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-semibold text-lg group-hover:text-argus-600 transition line-clamp-1">
                    {listing.name}
                  </h3>
                  
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    {renderStars(Math.round(listing.avgRating))}
                    <span className="text-slate-500">({listing.ratingCount})</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">{listing.totalSubscribers} subscribers</span>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                    <div className="text-sm text-slate-500">
                      by {listing.creatorName}
                    </div>
                    <div className="font-semibold text-argus-600">
                      {listing.minPackagePrice !== null 
                        ? `From $${listing.minPackagePrice.toFixed(2)}`
                        : 'Free'}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-lg p-8 text-center">
            <div className="text-4xl mb-4">🚀</div>
            <h3 className="text-lg font-semibold mb-2">Marketplace Coming Soon</h3>
            <p className="text-slate-500 mb-4">
              Be the first to list your curated source collection!
            </p>
            <Link
              href="/sources/manage"
              className="inline-block px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg transition"
            >
              Create a Listing
            </Link>
          </div>
        )}
      </div>

      {/* For Creators CTA */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl p-8 border border-purple-200 dark:border-purple-800">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold text-purple-900 dark:text-purple-100 mb-2">
              💰 Monetize Your Expertise
            </h2>
            <p className="text-purple-700 dark:text-purple-300">
              Turn your curated source lists into recurring revenue. 
              Set your own prices, get paid instantly in USDC.
            </p>
          </div>
          <Link
            href="/sources/manage"
            className="shrink-0 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition text-center"
          >
            Start Selling →
          </Link>
        </div>
      </div>

      {/* Stats Footer */}
      {settings && (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 text-center text-sm text-slate-500">
          Platform fee: {settings.feePercent}% · Creators receive: {100 - settings.feePercent}% · 
          Payments converted to USDC via 1Click
        </div>
      )}
    </div>
  );
}
