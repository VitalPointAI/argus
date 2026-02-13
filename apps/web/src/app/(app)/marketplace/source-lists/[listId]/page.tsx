'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import OneClickPayment from '@/components/OneClickPayment';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface Package {
  id: string;
  name: string;
  description: string;
  imageCid: string | null;
  priceUsdc: number;
  durationDays: number | null;
  benefits: string[];
  maxSupply: number | null;
  mintedCount: number;
  isActive: boolean;
}

interface Review {
  id: string;
  rating: number;
  reviewText: string;
  reviewerName: string;
  createdAt: string;
}

interface ListingDetails {
  id: string;
  name: string;
  description: string;
  marketplaceDescription: string;
  marketplaceImageCid: string | null;
  domainName: string | null;
  createdBy: string;
  creatorName: string;
  totalSubscribers: number;
  avgRating: number;
  ratingCount: number;
  itemCount: number;
  createdAt: string;
  packages: Package[];
  reviews: Review[];
}

interface AccessInfo {
  hasAccess: boolean;
  subscription: any;
  isOwner: boolean;
}

export default function SourceListDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const listId = params.listId as string;

  const [listing, setListing] = useState<ListingDetails | null>(null);
  const [accessInfo, setAccessInfo] = useState<AccessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);

  useEffect(() => {
    fetchListing();
    if (user) {
      checkAccess();
    }
  }, [listId, user]);

  const fetchListing = async () => {
    try {
      const res = await fetch(`${API_URL}/api/marketplace/listings/${listId}`);
      const data = await res.json();
      if (data.success) {
        setListing(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch listing:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkAccess = async () => {
    try {
      const res = await fetch(`${API_URL}/api/marketplace/access/${listId}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setAccessInfo(data);
      }
    } catch (err) {
      console.error('Failed to check access:', err);
    }
  };

  const handleSubscribe = async (pkg: Package) => {
    if (!user) {
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }
    setSelectedPackage(pkg);
    setShowSubscribeModal(true);
  };

  const confirmSubscription = async () => {
    if (!selectedPackage) return;
    
    setSubscribing(true);
    try {
      // TODO: Integrate 1Click payment here
      // For now, just create the subscription
      const res = await fetch(`${API_URL}/api/marketplace/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          packageId: selectedPackage.id,
          paymentTxHash: 'pending_1click_integration',
          paymentToken: 'USDC',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowSubscribeModal(false);
        checkAccess();
        alert('Subscription successful! You now have access to this source list.');
      } else {
        alert(data.error || 'Subscription failed');
      }
    } catch (err) {
      console.error('Subscription error:', err);
      alert('Failed to subscribe. Please try again.');
    } finally {
      setSubscribing(false);
    }
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <span key={i} className={`text-xl ${i <= rating ? 'text-yellow-400' : 'text-slate-300'}`}>
          ★
        </span>
      );
    }
    return stars;
  };

  const formatDuration = (days: number | null) => {
    if (days === null) return 'Lifetime';
    if (days === 30) return '1 Month';
    if (days === 90) return '3 Months';
    if (days === 365) return '1 Year';
    return `${days} Days`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Listing Not Found</h2>
        <Link href="/marketplace/source-lists" className="text-argus-600 hover:underline">
          ← Back to Marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Back Link */}
      <Link
        href="/marketplace/source-lists"
        className="inline-flex items-center text-slate-500 hover:text-argus-600 transition"
      >
        ← Back to Marketplace
      </Link>

      {/* Header */}
      <div className="grid md:grid-cols-2 gap-8">
        {/* Image */}
        <div className="aspect-video bg-gradient-to-br from-argus-500 to-argus-700 rounded-lg overflow-hidden">
          {listing.marketplaceImageCid ? (
            <img
              src={`https://ipfs.io/ipfs/${listing.marketplaceImageCid}`}
              alt={listing.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/50 text-8xl">
              📋
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <div className="flex items-start justify-between">
            <div>
              {listing.domainName && (
                <span className="px-2 py-1 bg-argus-100 text-argus-700 text-xs rounded mb-2 inline-block">
                  {listing.domainName}
                </span>
              )}
              <h1 className="text-3xl font-bold">{listing.name}</h1>
              <p className="text-slate-500 mt-1">by {listing.creatorName}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-1">
              {renderStars(Math.round(listing.avgRating))}
              <span className="text-slate-500 ml-2">
                {listing.avgRating.toFixed(1)} ({listing.ratingCount} reviews)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6 mt-4 text-sm text-slate-500">
            <div>{listing.totalSubscribers} subscribers</div>
            <div>{listing.itemCount} sources</div>
          </div>

          <p className="mt-6 text-slate-600 dark:text-slate-300">
            {listing.marketplaceDescription || listing.description}
          </p>

          {/* Access Status */}
          {accessInfo && (
            <div className="mt-6">
              {accessInfo.isOwner ? (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="font-medium text-blue-800 dark:text-blue-200">
                    ✏️ You own this source list
                  </p>
                  <Link
                    href={`/sources/lists/${listing.id}`}
                    className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                  >
                    Manage List →
                  </Link>
                </div>
              ) : accessInfo.hasAccess ? (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="font-medium text-green-800 dark:text-green-200">
                    ✅ You have access to this source list
                  </p>
                  {accessInfo.subscription?.expiresAt && (
                    <p className="text-sm text-green-600 mt-1">
                      Expires: {new Date(accessInfo.subscription.expiresAt).toLocaleDateString()}
                    </p>
                  )}
                  <Link
                    href={`/sources/lists/${listing.id}`}
                    className="text-sm text-green-600 hover:underline mt-1 inline-block"
                  >
                    View Sources →
                  </Link>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Packages */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Subscription Options</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {listing.packages.map((pkg) => {
            const isAvailable = !pkg.maxSupply || pkg.mintedCount < pkg.maxSupply;
            const hasAccess = accessInfo?.hasAccess || accessInfo?.isOwner;

            return (
              <div
                key={pkg.id}
                className={`bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden border-2 ${
                  pkg.durationDays === null ? 'border-argus-500' : 'border-transparent'
                }`}
              >
                {/* Package Image or Header */}
                <div className={`p-4 text-white ${pkg.priceUsdc === 0 ? 'bg-gradient-to-r from-green-600 to-green-700' : 'bg-gradient-to-r from-slate-700 to-slate-800'}`}>
                  <h3 className="text-xl font-bold">{pkg.name}</h3>
                  <div className="text-3xl font-bold mt-2">
                    {pkg.priceUsdc === 0 ? (
                      <>🎁 Free</>
                    ) : (
                      <>${pkg.priceUsdc.toFixed(2)}</>
                    )}
                    <span className="text-sm font-normal opacity-75">
                      {' '}/ {formatDuration(pkg.durationDays)}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  {pkg.description && (
                    <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
                      {pkg.description}
                    </p>
                  )}

                  {/* Benefits */}
                  {pkg.benefits && pkg.benefits.length > 0 && (
                    <ul className="space-y-2 mb-4">
                      {pkg.benefits.map((benefit, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-green-500">✓</span>
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Supply */}
                  {pkg.maxSupply && (
                    <div className="text-sm text-slate-500 mb-4">
                      {pkg.maxSupply - pkg.mintedCount} of {pkg.maxSupply} remaining
                    </div>
                  )}

                  {/* Subscribe Button */}
                  <button
                    onClick={() => handleSubscribe(pkg)}
                    disabled={!isAvailable || hasAccess}
                    className={`w-full py-3 rounded-lg font-semibold transition ${
                      hasAccess
                        ? 'bg-green-100 text-green-700 cursor-not-allowed'
                        : isAvailable
                        ? 'bg-argus-600 hover:bg-argus-700 text-white'
                        : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {hasAccess
                      ? 'Already Subscribed'
                      : isAvailable
                      ? 'Subscribe Now'
                      : 'Sold Out'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reviews */}
      {listing.reviews.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold mb-4">Reviews</h2>
          <div className="space-y-4">
            {listing.reviews.map((review) => (
              <div
                key={review.id}
                className="bg-white dark:bg-slate-800 rounded-lg shadow p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {renderStars(review.rating)}
                    <span className="font-medium">{review.reviewerName}</span>
                  </div>
                  <span className="text-sm text-slate-500">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {review.reviewText && (
                  <p className="text-slate-600 dark:text-slate-400">{review.reviewText}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subscribe Modal */}
      {showSubscribeModal && selectedPackage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          {selectedPackage.priceUsdc === 0 ? (
            // Free package - simple confirmation
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">Get Free Access Pass</h3>
              
              <div className="rounded-lg p-4 mb-4 bg-green-50 dark:bg-green-900/20">
                <div className="font-semibold">{selectedPackage.name}</div>
                <div className="text-2xl font-bold mt-1 text-green-600">🎁 Free</div>
                <div className="text-sm text-slate-500">
                  {formatDuration(selectedPackage.durationDays)} access
                </div>
              </div>

              <p className="text-slate-600 dark:text-slate-400 mb-4">
                Get your free Access Pass for <strong>{listing.name}</strong> and all future updates.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowSubscribeModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSubscription}
                  disabled={subscribing}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                >
                  {subscribing ? 'Activating...' : 'Get Access Pass'}
                </button>
              </div>
            </div>
          ) : (
            // Paid package - 1Click payment flow
            <div className="max-w-md w-full">
              <OneClickPayment
                amountUsdc={selectedPackage.priceUsdc}
                packageId={selectedPackage.id}
                listId={listing.id}
                listName={listing.name}
                onSuccess={(subscriptionId) => {
                  setShowSubscribeModal(false);
                  checkAccess();
                  // Show success message
                  alert('🎉 Payment successful! Your access pass has been activated.');
                }}
                onCancel={() => setShowSubscribeModal(false)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
