'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ImageUpload from '@/components/ImageUpload';

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
  createdAt: string;
}

interface SourceList {
  id: string;
  name: string;
  description: string;
  marketplaceDescription?: string;
  marketplaceImageCid?: string;
}

const DURATION_OPTIONS = [
  { value: '30', label: '1 Month' },
  { value: '90', label: '3 Months' },
  { value: '365', label: '1 Year' },
  { value: '', label: 'Lifetime' },
];

export default function PackageBuilderPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const listId = params.listId as string;

  const [list, setList] = useState<SourceList | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Listing settings state
  const [listingSettings, setListingSettings] = useState({
    marketplaceDescription: '',
    marketplaceImageCid: '',
  });
  const [savingListing, setSavingListing] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    priceUsdc: '',
    durationDays: '30',
    benefits: [''],
    maxSupply: '',
    imageCid: '',
  });

  useEffect(() => {
    fetchData();
  }, [listId]);

  const fetchData = async () => {
    try {
      // Fetch list info
      const listRes = await fetch(`${API_URL}/api/sources/lists/${listId}`, {
        credentials: 'include',
      });
      const listData = await listRes.json();
      if (listData.success) {
        setList(listData.data);
        setListingSettings({
          marketplaceDescription: listData.data.marketplaceDescription || '',
          marketplaceImageCid: listData.data.marketplaceImageCid || '',
        });
      }

      // Fetch packages
      const pkgRes = await fetch(`${API_URL}/api/marketplace/lists/${listId}/packages`, {
        credentials: 'include',
      });
      const pkgData = await pkgRes.json();
      if (pkgData.success) {
        setPackages(pkgData.data);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      priceUsdc: '',
      durationDays: '30',
      benefits: [''],
      maxSupply: '',
      imageCid: '',
    });
    setEditingId(null);
    setError('');
  };

  const handleEdit = (pkg: Package) => {
    setFormData({
      name: pkg.name,
      description: pkg.description || '',
      priceUsdc: pkg.priceUsdc.toString(),
      durationDays: pkg.durationDays?.toString() || '',
      benefits: pkg.benefits.length > 0 ? pkg.benefits : [''],
      maxSupply: pkg.maxSupply?.toString() || '',
      imageCid: pkg.imageCid || '',
    });
    setEditingId(pkg.id);
    setShowForm(true);
  };

  const handleAddBenefit = () => {
    setFormData(prev => ({
      ...prev,
      benefits: [...prev.benefits, ''],
    }));
  };

  const handleRemoveBenefit = (index: number) => {
    setFormData(prev => ({
      ...prev,
      benefits: prev.benefits.filter((_, i) => i !== index),
    }));
  };

  const handleBenefitChange = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      benefits: prev.benefits.map((b, i) => i === index ? value : b),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        priceUsdc: parseFloat(formData.priceUsdc),
        durationDays: formData.durationDays ? parseInt(formData.durationDays) : null,
        benefits: formData.benefits.filter(b => b.trim()),
        maxSupply: formData.maxSupply ? parseInt(formData.maxSupply) : null,
        imageCid: formData.imageCid || null,
      };

      let res;
      if (editingId) {
        res = await fetch(`${API_URL}/api/marketplace/packages/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_URL}/api/marketplace/lists/${listId}/packages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (data.success) {
        fetchData();
        setShowForm(false);
        resetForm();
      } else {
        setError(data.error || 'Failed to save package');
      }
    } catch (err) {
      setError('Failed to save package');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (pkgId: string) => {
    if (!confirm('Are you sure you want to deactivate this package?')) return;

    try {
      const res = await fetch(`${API_URL}/api/marketplace/packages/${pkgId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const formatDuration = (days: number | null) => {
    if (days === null) return 'Lifetime';
    if (days === 30) return '1 Month';
    if (days === 90) return '3 Months';
    if (days === 365) return '1 Year';
    return `${days} Days`;
  };

  const saveListingSettings = async () => {
    setSavingListing(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/marketplace/listings/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(listingSettings),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage('Listing settings saved!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(data.error || 'Failed to save listing settings');
      }
    } catch (err) {
      setError('Failed to save listing settings');
    } finally {
      setSavingListing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Source List Not Found</h2>
        <Link href="/sources/manage" className="text-argus-600 hover:underline">
          ← Back to My Sources
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/sources/lists/${listId}`}
            className="text-slate-500 hover:text-argus-600 text-sm"
          >
            ← Back to {list.name}
          </Link>
          <h1 className="text-2xl font-bold mt-2">Subscription Packages</h1>
          <p className="text-slate-500">Create subscription tiers for your source list</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg transition"
        >
          {showForm ? 'Cancel' : '+ Create Package'}
        </button>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg">
          {successMessage}
        </div>
      )}

      {/* Listing Settings */}
      <details className="bg-white dark:bg-slate-800 rounded-lg shadow">
        <summary className="px-6 py-4 cursor-pointer font-semibold flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg">
          <span>📋 Listing Settings</span>
          <span className="text-sm text-slate-500 font-normal">Cover image & description</span>
        </summary>
        <div className="px-6 pb-6 space-y-4 border-t border-slate-100 dark:border-slate-700 pt-4">
          <ImageUpload
            value={listingSettings.marketplaceImageCid}
            onChange={(cid) => setListingSettings(prev => ({ ...prev, marketplaceImageCid: cid }))}
            label="Cover Image"
            helpText="This image appears in the marketplace browse view."
          />
          
          <div>
            <label className="block text-sm font-medium mb-1">Marketplace Description</label>
            <textarea
              value={listingSettings.marketplaceDescription}
              onChange={(e) => setListingSettings(prev => ({ ...prev, marketplaceDescription: e.target.value }))}
              placeholder="Describe your source list for potential subscribers..."
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
            />
            <p className="text-xs text-slate-500 mt-1">
              This description is shown in the marketplace listing. Make it compelling!
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveListingSettings}
              disabled={savingListing}
              className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg disabled:opacity-50 transition"
            >
              {savingListing ? 'Saving...' : 'Save Listing Settings'}
            </button>
          </div>
        </div>
      </details>

      {/* Package Form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Package' : 'Create New Package'}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-1">Package Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Premium Monthly"
                required
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
              />
            </div>

            {/* Free Tier Toggle */}
            <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <input
                type="checkbox"
                id="freeTier"
                checked={formData.priceUsdc === '0'}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  priceUsdc: e.target.checked ? '0' : '' 
                }))}
                className="w-5 h-5 rounded text-argus-600"
              />
              <label htmlFor="freeTier" className="flex-1">
                <span className="font-medium">Free Tier</span>
                <p className="text-sm text-slate-500">
                  Users get a free Access Pass for analytics tracking. Great for building audience!
                </p>
              </label>
              <span className="text-2xl">🎁</span>
            </div>

            {/* Price & Duration */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Price (USDC) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.priceUsdc}
                  onChange={(e) => setFormData(prev => ({ ...prev, priceUsdc: e.target.value }))}
                  placeholder="9.99"
                  required
                  disabled={formData.priceUsdc === '0'}
                  className={`w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 ${formData.priceUsdc === '0' ? 'opacity-50' : ''}`}
                />
                {formData.priceUsdc === '0' && (
                  <p className="text-sm text-green-600 mt-1">✓ Free - users only pay gas fees</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Duration</label>
                <select
                  value={formData.durationDays}
                  onChange={(e) => setFormData(prev => ({ ...prev, durationDays: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                >
                  {DURATION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="What subscribers get with this package..."
                rows={2}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
              />
            </div>

            {/* Benefits */}
            <div>
              <label className="block text-sm font-medium mb-1">Benefits</label>
              {formData.benefits.map((benefit, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={benefit}
                    onChange={(e) => handleBenefitChange(i, e.target.value)}
                    placeholder="e.g., Daily updates"
                    className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                  />
                  {formData.benefits.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBenefit(i)}
                      className="px-3 text-red-500 hover:text-red-700"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddBenefit}
                className="text-sm text-argus-600 hover:text-argus-700"
              >
                + Add benefit
              </button>
            </div>

            {/* Max Supply */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Max Supply <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="number"
                min="1"
                value={formData.maxSupply}
                onChange={(e) => setFormData(prev => ({ ...prev, maxSupply: e.target.value }))}
                placeholder="Leave empty for unlimited"
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
              />
            </div>

            {/* Access Pass Image */}
            <ImageUpload
              value={formData.imageCid}
              onChange={(cid) => setFormData(prev => ({ ...prev, imageCid: cid }))}
              label="Access Pass Image"
              helpText="This image appears on the subscriber's Access Pass."
            />

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editingId ? 'Update Package' : 'Create Package'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Existing Packages */}
      {packages.length > 0 ? (
        <div className="space-y-4">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className={`bg-white dark:bg-slate-800 rounded-lg shadow p-4 ${
                !pkg.isActive ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">{pkg.name}</h3>
                    {!pkg.isActive && (
                      <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded">
                        Inactive
                      </span>
                    )}
                    {pkg.durationDays === null && (
                      <span className="px-2 py-0.5 bg-argus-100 text-argus-700 text-xs rounded">
                        Lifetime
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-argus-600 mt-1">
                    ${pkg.priceUsdc.toFixed(2)}
                    <span className="text-sm font-normal text-slate-500 ml-2">
                      / {formatDuration(pkg.durationDays)}
                    </span>
                  </div>
                  {pkg.description && (
                    <p className="text-slate-500 text-sm mt-2">{pkg.description}</p>
                  )}
                  {pkg.benefits && pkg.benefits.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {pkg.benefits.map((b, i) => (
                        <li key={i} className="text-sm text-slate-600 flex items-center gap-2">
                          <span className="text-green-500">✓</span> {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
                    <span>{pkg.mintedCount} sold</span>
                    {pkg.maxSupply && (
                      <span>{pkg.maxSupply - pkg.mintedCount} remaining</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(pkg)}
                    className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  {pkg.isActive && (
                    <button
                      onClick={() => handleDelete(pkg.id)}
                      className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
                    >
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !showForm ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-8 text-center">
          <div className="text-4xl mb-4">📦</div>
          <h3 className="text-lg font-semibold mb-2">No packages yet</h3>
          <p className="text-slate-500 mb-4">
            Create subscription packages to start selling access to your source list
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg"
          >
            Create Your First Package
          </button>
        </div>
      ) : null}

      {/* Marketplace Preview Link */}
      {packages.some(p => p.isActive) && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">
                ✅ Your list is live on the marketplace!
              </p>
              <p className="text-sm text-green-600 mt-1">
                Subscribers can now purchase access to your source list.
              </p>
            </div>
            <Link
              href={`/marketplace/source-lists/${listId}`}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
            >
              View Listing →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
