'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface ProofResult {
  type: 'location' | 'reputation' | 'rotation';
  proof: any;
  publicSignals: string[];
  claim?: string;
  success: boolean;
  error?: string;
  mock?: boolean;
}

interface ZKStatus {
  ready: boolean;
  circuits: string[];
  message: string;
}

export default function ZKProofsPage() {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'location' | 'reputation' | 'info'>('info');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProofResult | null>(null);
  const [zkStatus, setZkStatus] = useState<ZKStatus | null>(null);
  
  // Location proof state
  const [actualLat, setActualLat] = useState('');
  const [actualLon, setActualLon] = useState('');
  const [targetLat, setTargetLat] = useState('');
  const [targetLon, setTargetLon] = useState('');
  const [maxDistance, setMaxDistance] = useState('50');
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  
  // Reputation proof state
  const [publicKey, setPublicKey] = useState('');
  const [threshold, setThreshold] = useState('70');

  // Fetch ZK status on mount
  useEffect(() => {
    fetch(`${API_URL}/api/zk/status`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setZkStatus(data.data);
        }
      })
      .catch(err => console.error('Failed to fetch ZK status:', err));
  }, []);

  // Request user's location
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }
    
    setLocationLoading(true);
    setLocationError(null);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setActualLat(position.coords.latitude.toFixed(6));
        setActualLon(position.coords.longitude.toFixed(6));
        setLocationLoading(false);
      },
      (error) => {
        setLocationLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location permission denied. Please enable location access.');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location unavailable. Please try again.');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timed out. Please try again.');
            break;
          default:
            setLocationError('Failed to get location.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Initialize Leaflet map for target location selection
  useEffect(() => {
    if (activeTab !== 'location') return;
    
    // Dynamically load Leaflet
    const loadLeaflet = async () => {
      if (typeof window === 'undefined') return;
      
      // Load Leaflet CSS
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      
      // Load Leaflet JS
      if (!(window as any).L) {
        await new Promise<void>((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.onload = () => resolve();
          document.head.appendChild(script);
        });
      }
      
      const L = (window as any).L;
      const container = document.getElementById('target-map');
      if (!container || mapRef.current) return;
      
      // Initialize map centered on Europe/Middle East
      const map = L.map('target-map').setView([45, 30], 3);
      mapRef.current = map;
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);
      
      // Add click handler
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        setTargetLat(lat.toFixed(6));
        setTargetLon(lng.toFixed(6));
        
        // Update or create marker
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng]).addTo(map);
        }
      });
      
      setMapLoaded(true);
    };
    
    loadLeaflet();
    
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        setMapLoaded(false);
      }
    };
  }, [activeTab]);

  // Update marker when preset is clicked
  useEffect(() => {
    if (!mapRef.current || !targetLat || !targetLon) return;
    const L = (window as any).L;
    if (!L) return;
    
    const lat = parseFloat(targetLat);
    const lon = parseFloat(targetLon);
    
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
    } else {
      markerRef.current = L.marker([lat, lon]).addTo(mapRef.current);
    }
    
    mapRef.current.setView([lat, lon], 6);
  }, [targetLat, targetLon]);

  const generateLocationProof = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const res = await fetch(`${API_URL}/api/zk/location/prove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          actualLat: parseFloat(actualLat),
          actualLon: parseFloat(actualLon),
          targetLat: parseFloat(targetLat),
          targetLon: parseFloat(targetLon),
          maxDistanceKm: parseInt(maxDistance),
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setResult({
          type: 'location',
          proof: data.data.proof,
          publicSignals: data.data.publicSignals,
          claim: data.data.claim.statement,
          success: true,
          mock: data.data.mock,
        });
      } else {
        setResult({
          type: 'location',
          proof: null,
          publicSignals: [],
          success: false,
          error: data.error,
        });
      }
    } catch (err) {
      setResult({
        type: 'location',
        proof: null,
        publicSignals: [],
        success: false,
        error: 'Failed to generate proof',
      });
    } finally {
      setLoading(false);
    }
  };

  const generateReputationProof = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const res = await fetch(`${API_URL}/api/zk/reputation/prove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          publicKey,
          threshold: parseInt(threshold),
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setResult({
          type: 'reputation',
          proof: data.data.proof,
          publicSignals: data.data.publicSignals,
          claim: data.data.claim.statement,
          success: true,
        });
      } else {
        setResult({
          type: 'reputation',
          proof: null,
          publicSignals: [],
          success: false,
          error: data.error,
        });
      }
    } catch (err) {
      setResult({
        type: 'reputation',
        proof: null,
        publicSignals: [],
        success: false,
        error: 'Failed to generate proof',
      });
    } finally {
      setLoading(false);
    }
  };

  const useCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setActualLat(position.coords.latitude.toFixed(6));
          setActualLon(position.coords.longitude.toFixed(6));
        },
        (error) => {
          alert('Could not get location: ' + error.message);
        }
      );
    } else {
      alert('Geolocation is not supported by this browser');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <span className="text-4xl">🔐</span>
          Zero-Knowledge Proofs
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Prove claims without revealing sensitive information
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('info')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'info'
              ? 'text-argus-600 border-b-2 border-argus-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          ℹ️ Overview
        </button>
        <button
          onClick={() => setActiveTab('location')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'location'
              ? 'text-argus-600 border-b-2 border-argus-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          📍 Location Proof
        </button>
        <button
          onClick={() => setActiveTab('reputation')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'reputation'
              ? 'text-argus-600 border-b-2 border-argus-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          ⭐ Reputation Proof
        </button>
      </div>

      {/* Info Tab */}
      {activeTab === 'info' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>🤔</span> What are ZK Proofs?
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Zero-knowledge proofs let you prove something is true without revealing the underlying data.
            </p>
            <p className="text-slate-600 dark:text-slate-400">
              For example, prove you were within 50km of Kiev without revealing your exact coordinates.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>🎭</span> For HUMINT Sources
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              ZK proofs help protect source identity while adding credibility to intel:
            </p>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>• <strong>Location:</strong> Prove proximity to claimed events</li>
              <li>• <strong>Reputation:</strong> Prove track record without linking identity</li>
              <li>• <strong>Rotation:</strong> Change codename while preserving reputation</li>
            </ul>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg p-6 md:col-span-2">
            <h3 className="text-lg font-semibold mb-4">Supported Proof Types</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-4">
                <div className="text-2xl mb-2">📍</div>
                <h4 className="font-medium mb-1">Location Attestation</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Prove: "I was within X km of (lat, lon)"<br/>
                  Hidden: Exact coordinates
                </p>
              </div>
              <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-4">
                <div className="text-2xl mb-2">⭐</div>
                <h4 className="font-medium mb-1">Reputation Threshold</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Prove: "My reputation is ≥ threshold"<br/>
                  Hidden: Exact score
                </p>
              </div>
              <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-4">
                <div className="text-2xl mb-2">🔄</div>
                <h4 className="font-medium mb-1">Identity Rotation</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Prove: "I own old identity"<br/>
                  Hidden: Which old identity
                </p>
              </div>
            </div>
          </div>

          {zkStatus && (
            <div className={`rounded-lg p-4 md:col-span-2 border ${
              zkStatus.ready 
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            }`}>
              <div className="flex items-start gap-3">
                <span className="text-xl">{zkStatus.ready ? '✅' : '⚠️'}</span>
                <div>
                  <h4 className={`font-medium ${
                    zkStatus.ready 
                      ? 'text-green-800 dark:text-green-200'
                      : 'text-amber-800 dark:text-amber-200'
                  }`}>
                    {zkStatus.ready ? 'Production Ready' : 'Development Mode'}
                  </h4>
                  <p className={`text-sm ${
                    zkStatus.ready 
                      ? 'text-green-700 dark:text-green-300'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}>
                    {zkStatus.message}
                  </p>
                  {zkStatus.circuits.length > 0 && (
                    <p className="text-xs mt-1 opacity-75">
                      Compiled circuits: {zkStatus.circuits.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Location Proof Tab */}
      {activeTab === 'location' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Generate Location Proof</h3>
            <p className="text-sm text-slate-500 mb-4">
              Prove you are within a certain distance of a location without revealing your exact coordinates.
            </p>
            
            <div className="space-y-4">
              {/* Your Location - Auto-detected */}
              <div>
                <label className="block text-sm font-medium mb-1">Your Location</label>
                {actualLat && actualLon ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <span className="text-green-600">📍</span>
                    <span className="text-sm text-green-700 dark:text-green-300">
                      Location acquired (hidden for privacy)
                    </span>
                    <button
                      onClick={() => { setActualLat(''); setActualLon(''); }}
                      className="ml-auto text-xs text-green-600 hover:text-green-800"
                    >
                      Reset
                    </button>
                  </div>
                ) : locationError ? (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-700 dark:text-red-300">{locationError}</p>
                    <button
                      onClick={requestLocation}
                      className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : locationLoading ? (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <span className="animate-pulse">📍</span>
                    <span className="text-sm text-blue-700 dark:text-blue-300">
                      Acquiring location...
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={requestLocation}
                    className="w-full p-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:border-argus-500 hover:bg-argus-50 dark:hover:bg-argus-900/20 transition"
                  >
                    <span className="text-2xl">📍</span>
                    <p className="text-sm font-medium mt-1">Click to share your location</p>
                    <p className="text-xs text-slate-500">Required for proof generation</p>
                  </button>
                )}
              </div>

              {/* Target Location - Map picker */}
              <div>
                <label className="block text-sm font-medium mb-1">Target Location (to prove proximity to)</label>
                
                {/* Quick location presets */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {[
                    { name: 'Kyiv', lat: '50.4501', lon: '30.5234' },
                    { name: 'Moscow', lat: '55.7558', lon: '37.6173' },
                    { name: 'Beirut', lat: '33.8938', lon: '35.5018' },
                    { name: 'Tehran', lat: '35.6892', lon: '51.3890' },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => { setTargetLat(preset.lat); setTargetLon(preset.lon); }}
                      className={`px-2 py-1 text-xs rounded-full border transition ${
                        targetLat === preset.lat && targetLon === preset.lon
                          ? 'bg-argus-100 border-argus-500 text-argus-700'
                          : 'border-slate-300 hover:border-argus-400'
                      }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>

                {/* Map container */}
                <div 
                  id="target-map" 
                  className="h-48 bg-slate-100 dark:bg-slate-700 rounded-lg border border-slate-300 dark:border-slate-600 relative overflow-hidden"
                >
                  {/* Leaflet map will be mounted here */}
                  {!mapLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-sm text-slate-500">Loading map...</p>
                    </div>
                  )}
                </div>
                
                {targetLat && targetLon && (
                  <p className="mt-1 text-xs text-slate-500">
                    Selected: {parseFloat(targetLat).toFixed(4)}, {parseFloat(targetLon).toFixed(4)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Max Distance (km)</label>
                <input
                  type="number"
                  value={maxDistance}
                  onChange={(e) => setMaxDistance(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Proof will verify you are within this distance of the target
                </p>
              </div>

              <button
                onClick={generateLocationProof}
                disabled={loading || !actualLat || !actualLon || !targetLat || !targetLon}
                className="w-full px-4 py-2 bg-argus-600 text-white rounded-lg hover:bg-argus-700 transition disabled:opacity-50 font-medium"
              >
                {loading ? 'Generating...' : '🔐 Generate Proof'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Proof Result</h3>
            
            {!result && (
              <div className="text-center py-8 text-slate-400">
                <div className="text-4xl mb-2">🔒</div>
                <p>Generate a proof to see results</p>
              </div>
            )}

            {result && result.success && (
              <div className="space-y-4">
                <div className={`rounded-lg p-4 border ${
                  result.mock 
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                }`}>
                  <div className={`font-semibold flex items-center gap-2 ${
                    result.mock 
                      ? 'text-amber-800 dark:text-amber-200'
                      : 'text-green-800 dark:text-green-200'
                  }`}>
                    {result.mock ? '⚠️ Mock Proof Generated' : '✅ Real Proof Generated'}
                  </div>
                  <p className={`text-sm mt-1 ${
                    result.mock 
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-green-700 dark:text-green-300'
                  }`}>
                    {result.claim}
                    {result.mock && ' (Simulated - for testing only)'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Public Signals</label>
                  <pre className="text-xs bg-slate-100 dark:bg-slate-900 p-3 rounded-lg overflow-x-auto">
{JSON.stringify(result.publicSignals, null, 2)}
                  </pre>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Proof (truncated)</label>
                  <pre className="text-xs bg-slate-100 dark:bg-slate-900 p-3 rounded-lg overflow-x-auto max-h-32">
{JSON.stringify(result.proof, null, 2).slice(0, 300)}...
                  </pre>
                </div>
              </div>
            )}

            {result && !result.success && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="font-semibold text-red-800 dark:text-red-200">
                  ❌ Proof Failed
                </div>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  {result.error}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reputation Proof Tab */}
      {activeTab === 'reputation' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Generate Reputation Proof</h3>
            <p className="text-sm text-slate-500 mb-4">
              Prove your reputation meets a threshold without revealing your exact score.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Your Public Key</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 font-mono text-sm"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Your HUMINT source public key
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Threshold to Prove</label>
                <select
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                >
                  <option value="50">≥ 50 (Basic)</option>
                  <option value="70">≥ 70 (Established)</option>
                  <option value="80">≥ 80 (Trusted)</option>
                  <option value="90">≥ 90 (Elite)</option>
                </select>
              </div>

              <button
                onClick={generateReputationProof}
                disabled={loading || !publicKey}
                className="w-full px-4 py-2 bg-argus-600 text-white rounded-lg hover:bg-argus-700 transition disabled:opacity-50 font-medium"
              >
                {loading ? 'Generating...' : '🔐 Generate Proof'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Proof Result</h3>
            
            {!result && (
              <div className="text-center py-8 text-slate-400">
                <div className="text-4xl mb-2">⭐</div>
                <p>Generate a proof to see results</p>
              </div>
            )}

            {result && result.type === 'reputation' && result.success && (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="font-semibold text-green-800 dark:text-green-200 flex items-center gap-2">
                    ✅ Proof Generated
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    {result.claim}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Public Signals</label>
                  <pre className="text-xs bg-slate-100 dark:bg-slate-900 p-3 rounded-lg overflow-x-auto">
{JSON.stringify(result.publicSignals, null, 2)}
                  </pre>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    <strong>Note:</strong> This proof can be shared with verifiers. They can confirm your reputation meets the threshold without learning your exact score.
                  </p>
                </div>
              </div>
            )}

            {result && result.type === 'reputation' && !result.success && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="font-semibold text-red-800 dark:text-red-200">
                  ❌ Proof Failed
                </div>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  {result.error}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Technical Details */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 text-sm">
        <h3 className="font-semibold mb-3">Technical Details</h3>
        <div className="grid md:grid-cols-2 gap-4 text-slate-600 dark:text-slate-400">
          <div>
            <strong>Proof System:</strong> Groth16 (bn128 curve)<br/>
            <strong>Hash Function:</strong> Poseidon (ZK-friendly)<br/>
            <strong>Circuit Language:</strong> Circom 2.0
          </div>
          <div>
            <strong>Verification:</strong> On-chain or off-chain<br/>
            <strong>Status:</strong> {zkStatus?.ready ? '✅ Production (real proofs)' : '⚠️ Mock mode'}<br/>
            <strong>API:</strong> <code>/api/zk/*</code>
          </div>
        </div>
      </div>
    </div>
  );
}
