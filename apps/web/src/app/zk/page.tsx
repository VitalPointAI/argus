'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface ProofResult {
  type: 'location' | 'reputation' | 'rotation';
  proof: any;
  publicSignals: string[];
  claim?: string;
  success: boolean;
  error?: string;
}

export default function ZKProofsPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'location' | 'reputation' | 'info'>('info');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProofResult | null>(null);
  
  // Location proof state
  const [actualLat, setActualLat] = useState('');
  const [actualLon, setActualLon] = useState('');
  const [targetLat, setTargetLat] = useState('');
  const [targetLon, setTargetLon] = useState('');
  const [maxDistance, setMaxDistance] = useState('50');
  
  // Reputation proof state
  const [publicKey, setPublicKey] = useState('');
  const [threshold, setThreshold] = useState('70');

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

          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 md:col-span-2 border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <h4 className="font-medium text-amber-800 dark:text-amber-200">Development Status</h4>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  ZK circuits are currently in mock mode. Proofs are simulated for testing.
                  Production deployment requires compiled Circom circuits.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Location Proof Tab */}
      {activeTab === 'location' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Generate Location Proof</h3>
            <p className="text-sm text-slate-500 mb-4">
              Prove you were within a certain distance of a location without revealing your exact coordinates.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Your Actual Location</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Latitude"
                    value={actualLat}
                    onChange={(e) => setActualLat(e.target.value)}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                  />
                  <input
                    type="text"
                    placeholder="Longitude"
                    value={actualLon}
                    onChange={(e) => setActualLon(e.target.value)}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                  />
                </div>
                <button
                  onClick={useCurrentLocation}
                  className="mt-2 text-sm text-argus-600 hover:text-argus-700"
                >
                  📍 Use my current location
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Target Location (to prove proximity to)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Target Latitude"
                    value={targetLat}
                    onChange={(e) => setTargetLat(e.target.value)}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                  />
                  <input
                    type="text"
                    placeholder="Target Longitude"
                    value={targetLon}
                    onChange={(e) => setTargetLon(e.target.value)}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Example: Kiev is approximately 50.4501, 30.5234
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Max Distance (km)</label>
                <input
                  type="number"
                  value={maxDistance}
                  onChange={(e) => setMaxDistance(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                />
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
            <strong>Status:</strong> Mock mode (circuits not compiled)<br/>
            <strong>API:</strong> <code>/api/zk/*</code>
          </div>
        </div>
      </div>
    </div>
  );
}
