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
  domainSlug: string | null;
  creatorName: string;
  totalSubscribers: number;
  avgRating: number;
  ratingCount: number;
  itemCount: number;
  minPackagePrice: number | null;
  createdAt: string;
}

const SORT_OPTIONS = [
  { value: 'popular', label: 'Most Popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
];

export default function SourceListMarketplacePage() {
  const { user } = useAuth();
  const [listings, setListings] = useState<SourceListListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('popular');
  const [domain, setDomain] = useState('');
  const [domains, setDomains] = useState<{ slug: string; name: string }[]>([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 20, offset: 0 });

  useEffect(() => {
    fetchDomains();
    fetchListings();
  }, [sort, domain]);

  const fetchDomains = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/domains`);
      const data = await res.json();
      if (data.data) {
        setDomains(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch domains:', err);
    }
  };

  const fetchListings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort,
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
      });
      if (domain) params.set('domain', domain);
      if (search) params.set('search', search);

      const res = await fetch(`${API_URL}/api/marketplace/listings?${params}`);
      const data = await res.json();
      
      if (data.success) {
        setListings(data.data);
        setPagination(data.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch listings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchListings();
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="text-4xl">🛒</span>
            Source List Marketplace
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Subscribe to curated intelligence feeds from expert analysts
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/sources/manage"
            className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg transition"
          >
            Sell Your Lists →
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search source lists..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-argus-500 outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg transition"
              >
                Search
              </button>
            </div>
          </form>

          {/* Domain Filter */}
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-argus-500 outline-none"
          >
            <option value="">All Domains</option>
            {domains.map((d) => (
              <option key={d.slug} value={d.slug}>{d.name}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-argus-500 outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-slate-500">Loading listings...</div>
        </div>
      ) : listings.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-8 text-center">
          <div className="text-4xl mb-4">📭</div>
          <h3 className="text-lg font-semibold mb-2">No listings found</h3>
          <p className="text-slate-500 mb-4">
            {search ? 'Try a different search term' : 'Be the first to list your source collection!'}
          </p>
          <Link
            href="/sources/manage"
            className="inline-block px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg transition"
          >
            Create a Listing
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
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
                <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                  {listing.marketplaceDescription || listing.description || 'No description'}
                </p>

                {/* Stats */}
                <div className="flex items-center gap-4 mt-3 text-sm">
                  <div className="flex items-center gap-1">
                    {renderStars(Math.round(listing.avgRating))}
                    <span className="text-slate-500 ml-1">({listing.ratingCount})</span>
                  </div>
                  <div className="text-slate-500">
                    {listing.totalSubscribers} subscribers
                  </div>
                </div>

                {/* Price & Creator */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                  <div className="text-sm text-slate-500">
                    by {listing.creatorName}
                  </div>
                  <div className={`font-semibold ${!listing.minPackagePrice || parseFloat(String(listing.minPackagePrice)) === 0 ? 'text-green-600' : 'text-argus-600'}`}>
                    {!listing.minPackagePrice || parseFloat(String(listing.minPackagePrice)) === 0
                      ? '🎁 Free'
                      : `From $${parseFloat(String(listing.minPackagePrice)).toFixed(2)}`}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPagination(p => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
            disabled={pagination.offset === 0}
            className="px-4 py-2 border border-slate-300 rounded-lg disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-slate-500">
            {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
          </span>
          <button
            onClick={() => setPagination(p => ({ ...p, offset: p.offset + p.limit }))}
            disabled={pagination.offset + pagination.limit >= pagination.total}
            className="px-4 py-2 border border-slate-300 rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
