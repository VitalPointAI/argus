'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface PackageConfig {
  name: string;
  priceUsdc: number;
  durationDays: number;
  description: string;
}

export default function BecomeSourcePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [codename, setCodename] = useState('');
  const [bio, setBio] = useState('');
  const [packages, setPackages] = useState<PackageConfig[]>([]);

  async function handleSubmit() {
    if (!codename.trim()) {
      setError('Please enter a codename');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/humint-feed/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          codename: codename.trim(),
          bio: bio.trim() || undefined,
          packages: packages.length > 0 ? packages : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to register');
      }

      // Success! Redirect to compose page
      router.push('/humint/compose?welcome=1');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function addPackage() {
    setPackages([...packages, { 
      name: '', 
      priceUsdc: 5, 
      durationDays: 30, 
      description: '' 
    }]);
  }

  function updatePackage(index: number, field: keyof PackageConfig, value: string | number) {
    const newPackages = [...packages];
    newPackages[index] = { ...newPackages[index], [field]: value };
    setPackages(newPackages);
  }

  function removePackage(index: number) {
    setPackages(packages.filter((_, i) => i !== index));
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-2">Become a Source</h1>
          <p className="text-gray-400">
            Share intelligence securely. Get paid directly. Stay anonymous.
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className={`w-3 h-3 rounded-full transition-colors ${
                s === step ? 'bg-emerald-500' : s < step ? 'bg-emerald-700' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Steps */}
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Choose Your Codename
                </label>
                <input
                  type="text"
                  value={codename}
                  onChange={(e) => setCodename(e.target.value)}
                  placeholder="e.g., ShadowHawk, NightOwl, GhostRecon"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-emerald-500 text-white placeholder-gray-500"
                  maxLength={30}
                />
                <p className="mt-2 text-sm text-gray-500">
                  This is your public identity. Choose wisely - it can't be changed.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Bio (Optional)
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="What kind of intel do you provide? Region? Domain expertise?"
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-emerald-500 text-white placeholder-gray-500 resize-none"
                  maxLength={500}
                />
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!codename.trim()}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-medium transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Subscription Packages</h2>
                <p className="text-sm text-gray-400 mb-4">
                  Create custom packages for your subscribers. Set your own prices and durations.
                </p>

                <div className="space-y-3">
                  {packages.map((pkg, i) => (
                    <div key={i} className="p-4 bg-gray-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <input
                          type="text"
                          value={pkg.name}
                          onChange={(e) => updatePackage(i, 'name', e.target.value)}
                          placeholder="Package name"
                          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          onClick={() => removePackage(i)}
                          className="ml-2 p-2 text-gray-400 hover:text-red-400"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500">Price (USDC)</label>
                          <input
                            type="number"
                            value={pkg.priceUsdc}
                            onChange={(e) => updatePackage(i, 'priceUsdc', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-emerald-500"
                            min={0}
                            step={0.01}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500">Duration (days)</label>
                          <input
                            type="number"
                            value={pkg.durationDays}
                            onChange={(e) => updatePackage(i, 'durationDays', parseInt(e.target.value) || 30)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-emerald-500"
                            min={1}
                            max={365}
                          />
                        </div>
                      </div>
                      <input
                        type="text"
                        value={pkg.description}
                        onChange={(e) => updatePackage(i, 'description', e.target.value)}
                        placeholder="What do subscribers get?"
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  ))}

                  <button
                    onClick={addPackage}
                    className="w-full py-3 border-2 border-dashed border-gray-700 hover:border-emerald-500 rounded-xl text-gray-400 hover:text-emerald-400 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Package
                  </button>
                </div>

                {packages.length === 0 && (
                  <p className="text-sm text-gray-500 text-center mt-4">
                    No packages yet. You can add them later or post free content only.
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-medium transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-medium transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold mb-2">Ready to Go</h2>
                <p className="text-gray-400 mb-6">
                  Your identity is protected. All content is end-to-end encrypted.
                </p>
              </div>

              <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Codename</span>
                  <span className="font-medium">{codename}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Packages</span>
                  <span className="text-emerald-400">
                    {packages.length === 0 ? 'Free only' : `${packages.length} package${packages.length > 1 ? 's' : ''}`}
                  </span>
                </div>
                {packages.length > 0 && (
                  <div className="pt-2 border-t border-gray-700 space-y-2">
                    {packages.map((pkg, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-400">{pkg.name || 'Unnamed'}</span>
                        <span className="text-emerald-400">${pkg.priceUsdc} / {pkg.durationDays}d</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-xs text-gray-500 text-center">
                By continuing, you agree to our Terms of Service and Privacy Policy.
                Your wallet address is never publicly linked to your codename.
              </div>

              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm text-center">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {loading ? 'Creating...' : 'Create Source'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Benefits */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center text-sm">
          <div className="p-4 bg-gray-900/50 rounded-xl">
            <div className="text-2xl mb-2">🔐</div>
            <div className="text-gray-400">E2E Encrypted</div>
          </div>
          <div className="p-4 bg-gray-900/50 rounded-xl">
            <div className="text-2xl mb-2">💸</div>
            <div className="text-gray-400">Direct Payments</div>
          </div>
          <div className="p-4 bg-gray-900/50 rounded-xl">
            <div className="text-2xl mb-2">👻</div>
            <div className="text-gray-400">Stay Anonymous</div>
          </div>
        </div>
      </div>
    </div>
  );
}
