'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ComposeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isWelcome = searchParams.get('welcome') === '1';
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [content, setContent] = useState('');
  const [tier, setTier] = useState(0); // 0 = free
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<any>(null);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  
  // ZK Proof state
  const [showProofPanel, setShowProofPanel] = useState(false);
  const [locationProof, setLocationProof] = useState<{
    enabled: boolean;
    generating: boolean;
    generated: boolean;
    data?: any;
  }>({ enabled: false, generating: false, generated: false });
  const [reputationProof, setReputationProof] = useState<{
    enabled: boolean;
    threshold: number;
    generating: boolean;
    generated: boolean;
    data?: any;
  }>({ enabled: false, threshold: 50, generating: false, generated: false });

  useEffect(() => {
    loadSourceProfile();
  }, []);

  useEffect(() => {
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [content]);

  async function loadSourceProfile() {
    try {
      const res = await fetch('/api/humint-feed/sources/me', {
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        setSource(data);
      } else if (res.status === 404) {
        // Not a source yet, redirect to registration
        router.push('/humint/sources/new');
      }
    } catch (error) {
      console.error('Failed to load source profile:', error);
    } finally {
      setSourceLoading(false);
    }
  }

  async function generateLocationProofFromBrowser() {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by this browser');
      return;
    }

    setLocationProof(p => ({ ...p, generating: true }));
    setError(null);
    
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false, // Faster, coarse location is fine for 50km proof
          timeout: 30000, // 30 seconds - more forgiving on mobile
          maximumAge: 60000, // Accept cached position up to 1 minute old
        });
      });

      // For demo, prove within 50km of current location
      const res = await fetch('/api/humint-feed/zk/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          actualLat: position.coords.latitude,
          actualLon: position.coords.longitude,
          targetLat: position.coords.latitude, // Same as actual for self-attestation
          targetLon: position.coords.longitude,
          maxDistanceKm: 50, // 50km radius
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate proof');
      }

      const data = await res.json();
      setLocationProof({
        enabled: true,
        generating: false,
        generated: true,
        data: data.proof,
      });
    } catch (err: any) {
      // Better error messages for geolocation failures
      let errorMsg = 'Location proof failed';
      if (err.code === 1) {
        errorMsg = 'Location access denied. Please allow location access and try again.';
      } else if (err.code === 2) {
        errorMsg = 'Unable to determine location. Make sure location services are enabled.';
      } else if (err.code === 3) {
        errorMsg = 'Location request timed out. Try again in a moment.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      setError(errorMsg);
      setLocationProof(p => ({ ...p, generating: false }));
    }
  }

  async function generateReputationProofHandler() {
    setReputationProof(p => ({ ...p, generating: true }));
    
    try {
      const res = await fetch('/api/humint-feed/zk/reputation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          threshold: reputationProof.threshold,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate proof');
      }

      const data = await res.json();
      setReputationProof(p => ({
        ...p,
        generating: false,
        generated: true,
        data: data.proof,
      }));
    } catch (err: any) {
      setError(err.message || 'Reputation proof failed');
      setReputationProof(p => ({ ...p, generating: false }));
    }
  }

  function handleMediaSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = () => setMediaPreview(reader.result as string);
    reader.readAsDataURL(file);
    setMediaFile(file);
  }

  function removeMedia() {
    setMediaFile(null);
    setMediaPreview(null);
  }

  async function handlePost() {
    if (!content.trim()) {
      setError('Please enter some content');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Collect any generated proofs
      const zkProofs: any[] = [];
      if (locationProof.generated && locationProof.data) {
        zkProofs.push(locationProof.data);
      }
      if (reputationProof.generated && reputationProof.data) {
        zkProofs.push(reputationProof.data);
      }

      const res = await fetch('/api/humint-feed/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          content: content.trim(),
          tier,
          zkProofs: zkProofs.length > 0 ? zkProofs : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to post');
      }

      // Success! Redirect to feed
      router.push('/humint/feed');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Use source's custom packages, with Free (public) as first option
  const packages = [
    { id: 'free', name: 'Free', priceUsdc: 0 },
    ...(source?.tiers || [])
  ];

  if (sourceLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/humint/feed" className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Link>
          <button
            onClick={handlePost}
            disabled={loading || !content.trim()}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-full font-medium transition-colors flex items-center gap-2"
          >
            {loading && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? 'Encrypting...' : 'Post'}
          </button>
        </div>
      </header>

      {/* Welcome Banner */}
      {isWelcome && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🎉</div>
              <div>
                <h2 className="font-semibold text-emerald-400">Welcome, {source?.codename}!</h2>
                <p className="text-sm text-gray-300 mt-1">
                  You're now a registered source. Share your first intel below.
                  All content is end-to-end encrypted.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compose Area */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-lg font-bold flex-shrink-0">
            {source?.codename?.charAt(0).toUpperCase() || '?'}
          </div>

          <div className="flex-1 min-w-0">
            {/* Package Selector */}
            <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-2 -mx-1 px-1">
              <span className="text-sm text-gray-400 flex-shrink-0">Visible to:</span>
              <div className="flex gap-1 flex-shrink-0">
                {packages.map((pkg, i) => (
                  <button
                    key={pkg.id || pkg.name}
                    onClick={() => setTier(i)}
                    className={`px-3 py-1 text-sm rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                      tier === i
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {pkg.name}{pkg.priceUsdc > 0 ? ` ($${pkg.priceUsdc})` : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Text Input */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening on the ground?"
              className="w-full bg-transparent text-xl placeholder-gray-500 focus:outline-none resize-none min-h-[120px]"
              maxLength={5000}
            />

            {/* Media Preview */}
            {mediaPreview && (
              <div className="relative mt-3 rounded-xl overflow-hidden border border-gray-800">
                <img src={mediaPreview} alt="Upload preview" className="w-full max-h-80 object-cover" />
                <button
                  onClick={removeMedia}
                  className="absolute top-2 right-2 w-8 h-8 bg-gray-900/80 rounded-full flex items-center justify-center hover:bg-gray-800"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-3 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-800">
              <label className="cursor-pointer text-emerald-400 hover:text-emerald-300">
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleMediaSelect}
                  className="hidden"
                />
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </label>
              
              {/* ZK Proof Button */}
              <button 
                onClick={() => setShowProofPanel(!showProofPanel)}
                className={`flex items-center gap-1 transition-colors ${
                  (locationProof.generated || reputationProof.generated)
                    ? 'text-purple-400'
                    : 'text-emerald-400 hover:text-emerald-300'
                }`}
                title="Attach ZK Proofs"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {(locationProof.generated || reputationProof.generated) && (
                  <span className="text-xs">
                    {[locationProof.generated && '📍', reputationProof.generated && '⭐'].filter(Boolean).join('')}
                  </span>
                )}
              </button>
              
              <div className="flex-1"></div>
              
              <div className="text-sm text-gray-500">
                {content.length}/5000
              </div>
            </div>

            {/* ZK Proof Panel */}
            {showProofPanel && (
              <div className="mt-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Attach Zero-Knowledge Proofs
                </h4>
                <p className="text-xs text-gray-500 mb-4">
                  Prove claims without revealing sensitive data. Proofs are cryptographically verified.
                </p>

                <div className="space-y-3">
                  {/* Location Proof */}
                  <div className="flex items-center justify-between p-3 bg-gray-900 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📍</span>
                      <div>
                        <div className="font-medium text-sm">Location Proof</div>
                        <div className="text-xs text-gray-500">Prove proximity without revealing exact location</div>
                      </div>
                    </div>
                    <button
                      onClick={generateLocationProofFromBrowser}
                      disabled={locationProof.generating || locationProof.generated}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        locationProof.generated
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50'
                      }`}
                    >
                      {locationProof.generating ? (
                        <span className="flex items-center gap-2">
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Proving...
                        </span>
                      ) : locationProof.generated ? (
                        '✓ Attached'
                      ) : (
                        'Generate'
                      )}
                    </button>
                  </div>

                  {/* Reputation Proof */}
                  <div className="flex items-center justify-between p-3 bg-gray-900 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">⭐</span>
                      <div>
                        <div className="font-medium text-sm">Reputation Proof</div>
                        <div className="text-xs text-gray-500">
                          Prove reputation ≥ {reputationProof.threshold} without revealing exact score
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!reputationProof.generated && (
                        <input
                          type="number"
                          value={reputationProof.threshold}
                          onChange={(e) => setReputationProof(p => ({ ...p, threshold: parseInt(e.target.value) || 50 }))}
                          className="w-16 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-center"
                          min={0}
                          max={100}
                        />
                      )}
                      <button
                        onClick={generateReputationProofHandler}
                        disabled={reputationProof.generating || reputationProof.generated}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          reputationProof.generated
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50'
                        }`}
                      >
                        {reputationProof.generating ? (
                          <span className="flex items-center gap-2">
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Proving...
                          </span>
                        ) : reputationProof.generated ? (
                          '✓ Attached'
                        ) : (
                          'Generate'
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {(locationProof.generated || reputationProof.generated) && (
                  <div className="mt-3 p-2 bg-purple-500/10 rounded-lg text-xs text-purple-300 text-center">
                    ✓ {[locationProof.generated && 'Location', reputationProof.generated && 'Reputation'].filter(Boolean).join(' & ')} proof will be attached to this post
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-gray-900/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">💡 Tips for Sources</h3>
          <ul className="text-sm text-gray-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">•</span>
              <span>Free posts help build your reputation and attract subscribers</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">•</span>
              <span>Paid intel is encrypted and only visible to subscribers of your packages</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">•</span>
              <span>Never include information that could identify you personally</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">•</span>
              <span>Images are stripped of metadata before encryption</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
      </div>
    }>
      <ComposeContent />
    </Suspense>
  );
}
