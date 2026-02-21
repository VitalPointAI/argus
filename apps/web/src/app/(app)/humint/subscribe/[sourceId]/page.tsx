'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface PackageInfo {
  id: string;
  name: string;
  priceUsdc: number;
  durationDays: number;
  description: string;
}

interface SourceInfo {
  id: string;
  codename: string;
  bio?: string;
  packages: PackageInfo[];
}

export default function SubscribePage({ params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = use(params);
  const router = useRouter();
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSource();
  }, [sourceId]);

  async function loadSource() {
    try {
      const res = await fetch(`/api/humint-feed/sources`, {
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        const found = data.sources?.find((s: SourceInfo) => s.id === sourceId);
        if (found) {
          setSource(found);
          // Default to first package
          if (found.packages?.length > 0) {
            setSelectedPackageId(found.packages[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load source:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubscribe() {
    if (!selectedPackageId) return;

    setSubscribing(true);
    setError(null);

    try {
      const res = await fetch('/api/humint-feed/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sourceId,
          packageId: selectedPackageId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Subscription failed');
      }

      const data = await res.json();
      
      // Redirect to payment page
      if (data.subscription?.paymentUrl) {
        window.location.href = data.subscription.paymentUrl;
      } else {
        router.push('/humint/feed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubscribing(false);
    }
  }

  const selectedPackage = source?.packages?.find(p => p.id === selectedPackageId);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!source) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Source Not Found</h1>
          <p className="text-gray-400 mb-4">This source doesn't exist or has been removed.</p>
          <Link href="/humint/feed" className="text-emerald-400 hover:underline">
            Back to Feed
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/humint/feed" className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">Subscribe</h1>
        </div>

        {/* Source Card */}
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-2xl font-bold">
              {source.codename.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{source.codename}</h2>
              {source.bio && (
                <p className="text-gray-400 text-sm mt-1">{source.bio}</p>
              )}
            </div>
          </div>
        </div>

        {/* Package Selection */}
        {source.packages && source.packages.length > 0 ? (
          <div className="space-y-3 mb-6">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Select Package</h3>
            {source.packages.map(pkg => (
              <button
                key={pkg.id}
                onClick={() => setSelectedPackageId(pkg.id)}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                  selectedPackageId === pkg.id 
                    ? 'border-emerald-500 bg-emerald-500/5' 
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-lg">{pkg.name}</span>
                  <div className="text-right">
                    <span className="text-xl font-bold">${pkg.priceUsdc}</span>
                    <span className="text-sm text-gray-400 ml-1">/ {pkg.durationDays} days</span>
                  </div>
                </div>
                <p className="text-sm text-gray-400">{pkg.description}</p>
                <p className="text-xs text-emerald-400 mt-2">Pay with any token via 1Click</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="mb-6 p-4 bg-gray-800 rounded-xl text-center">
            <p className="text-gray-400">This source hasn't created any subscription packages yet.</p>
            <p className="text-sm text-gray-500 mt-1">You can still view their free content.</p>
          </div>
        )}

        {/* Summary */}
        {selectedPackage && (
          <div className="bg-gray-900 rounded-xl p-4 mb-6 border border-gray-800">
            <div className="flex justify-between mb-2">
              <span className="text-gray-400">Package</span>
              <span className="font-medium">{selectedPackage.name}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-gray-400">Access Duration</span>
              <span className="font-medium">{selectedPackage.durationDays} days</span>
            </div>
            <div className="h-px bg-gray-800 my-3"></div>
            <div className="flex justify-between items-end">
              <div>
                <span className="text-lg">Total</span>
                <p className="text-xs text-gray-500">Pay with any token</p>
              </div>
              <span className="text-2xl font-bold text-emerald-400">${selectedPackage.priceUsdc}</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Subscribe Button */}
        {source.packages && source.packages.length > 0 && (
          <button
            onClick={handleSubscribe}
            disabled={subscribing || !selectedPackageId}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-semibold text-lg transition-colors flex items-center justify-center gap-2"
          >
            {subscribing && (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {subscribing ? 'Processing...' : 'Subscribe Now'}
          </button>
        )}

        {/* Info */}
        <p className="text-sm text-gray-500 text-center mt-4">
          You'll be redirected to complete payment. Cancel anytime.
        </p>
      </div>
    </div>
  );
}
