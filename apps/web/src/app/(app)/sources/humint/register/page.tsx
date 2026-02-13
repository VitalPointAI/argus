'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

const AVAILABLE_DOMAINS = [
  'geopolitics', 'military', 'economics', 'technology', 'cyber',
  'energy', 'climate', 'health', 'terrorism', 'organized-crime',
  'politics', 'social-unrest', 'migration', 'infrastructure'
];

const AVAILABLE_REGIONS = [
  'north-america', 'south-america', 'europe', 'middle-east', 
  'africa', 'south-asia', 'east-asia', 'southeast-asia', 
  'central-asia', 'oceania', 'arctic', 'global'
];

export default function HumintSourceRegistrationPage() {
  const { user, isHumint, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [bio, setBio] = useState('');
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [subscriptionPrice, setSubscriptionPrice] = useState('');
  const [acceptingSubscribers, setAcceptingSubscribers] = useState(true);
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Redirect if not a HUMINT user
    if (!authLoading && (!isHumint || user?.type !== 'humint')) {
      router.push('/sources/humint');
    }
  }, [authLoading, isHumint, user, router]);

  const toggleDomain = (domain: string) => {
    setSelectedDomains(prev => 
      prev.includes(domain) 
        ? prev.filter(d => d !== domain)
        : [...prev, domain]
    );
  };

  const toggleRegion = (region: string) => {
    setSelectedRegions(prev => 
      prev.includes(region) 
        ? prev.filter(r => r !== region)
        : [...prev, region]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedDomains.length === 0) {
      setError('Please select at least one domain');
      return;
    }
    if (selectedRegions.length === 0) {
      setError('Please select at least one region');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/humint/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bio: bio.trim() || null,
          domains: selectedDomains,
          regions: selectedRegions,
          subscriptionPriceUsdc: subscriptionPrice ? parseFloat(subscriptionPrice) : null,
          isAcceptingSubscribers: acceptingSubscribers,
        }),
      });

      const data = await res.json();

      if (data.success) {
        router.push(`/sources/humint/${user?.codename}`);
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (err) {
      setError('Failed to register. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!isHumint || user?.type !== 'humint') {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link href="/sources/humint" className="text-argus-600 hover:text-argus-700 text-sm mb-4 inline-block">
          ← Back to HUMINT Sources
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <span className="text-4xl">🎭</span>
          Complete Your Source Profile
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Welcome, <strong className="text-purple-600">{user.codename}</strong>! 
          Fill out your profile to start sharing intelligence.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Bio <span className="text-slate-400">(optional)</span>
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Brief description of your expertise and coverage areas..."
            rows={3}
            maxLength={500}
            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-purple-500 outline-none"
          />
          <p className="text-xs text-slate-500 mt-1">{bio.length}/500 characters</p>
        </div>

        {/* Domains */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Intelligence Domains <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-slate-500 mb-3">Select areas you can provide intelligence on</p>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_DOMAINS.map((domain) => (
              <button
                key={domain}
                type="button"
                onClick={() => toggleDomain(domain)}
                className={`px-3 py-1.5 rounded-full text-sm transition ${
                  selectedDomains.includes(domain)
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {domain.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Regions */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Coverage Regions <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-slate-500 mb-3">Select regions you have insight into</p>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_REGIONS.map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => toggleRegion(region)}
                className={`px-3 py-1.5 rounded-full text-sm transition ${
                  selectedRegions.includes(region)
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                📍 {region.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Subscription Settings */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
          <h3 className="font-medium mb-4">Subscription Settings</h3>
          
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={acceptingSubscribers}
                onChange={(e) => setAcceptingSubscribers(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">Accept subscribers to my intel feed</span>
            </label>

            {acceptingSubscribers && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Monthly Subscription Price (USDC)
                </label>
                <input
                  type="number"
                  value={subscriptionPrice}
                  onChange={(e) => setSubscriptionPrice(e.target.value)}
                  placeholder="e.g., 10 (leave empty for free)"
                  min="0"
                  step="0.01"
                  className="w-full max-w-xs px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Leave empty to offer free subscriptions
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500">
            Your identity ({user.codename}) remains anonymous
          </p>
          <button
            type="submit"
            disabled={submitting || selectedDomains.length === 0 || selectedRegions.length === 0}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg disabled:opacity-50 transition"
          >
            {submitting ? 'Registering...' : 'Complete Registration'}
          </button>
        </div>
      </form>
    </div>
  );
}
