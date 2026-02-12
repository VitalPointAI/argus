'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProofGenerator } from '@/components/ProofGenerator';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface ProofRequirement {
  template: string;
  params: Record<string, any>;
  description: string;
  required: boolean;
  weight: number;
}

interface Bounty {
  id: string;
  title: string;
  description: string;
  domains: string[];
  regions: string[];
  category: string;
  rewardUsdc: number;
  proofRequirements: ProofRequirement[];
  status: string;
}

export default function ClaimBountyPage() {
  const params = useParams();
  const router = useRouter();
  const bountyId = params.id as string;
  
  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'info' | 'intel' | 'proofs' | 'submit' | 'success'>('info');
  
  // Intel submission form
  const [intelForm, setIntelForm] = useState({
    title: '',
    body: '',
    locationRegion: '',
    eventTag: '',
    summary: '',
  });
  
  const [proofs, setProofs] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);

  useEffect(() => {
    fetchBounty();
  }, [bountyId]);

  const fetchBounty = async () => {
    try {
      const res = await fetch(`${API_URL}/api/bounties/${bountyId}`);
      const data = await res.json();
      
      if (data.success) {
        setBounty(data.data);
        // Pre-fill title from bounty
        setIntelForm(prev => ({
          ...prev,
          title: `Response to: ${data.data.title}`,
        }));
      } else {
        setError(data.error || 'Failed to load bounty');
      }
    } catch (err) {
      setError('Failed to load bounty');
    } finally {
      setLoading(false);
    }
  };

  const handleProofsGenerated = (generatedProofs: any[]) => {
    setProofs(generatedProofs);
    setStep('submit');
  };

  const handleSubmit = async () => {
    if (!bounty) return;
    
    setSubmitting(true);
    setError('');
    
    try {
      // In production, this would use the source's authenticated session
      // For now, we'll need a sourceId from somewhere (cookie, session, etc.)
      const sourceId = localStorage.getItem('humint_source_id');
      
      if (!sourceId) {
        setError('Please log in as a HUMINT source to submit intel');
        setSubmitting(false);
        return;
      }

      const res = await fetch(`${API_URL}/api/feed/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceId,
          title: intelForm.title,
          body: intelForm.body,
          summary: intelForm.summary,
          locationRegion: intelForm.locationRegion,
          eventTag: intelForm.eventTag,
          fulfillsBountyId: bountyId,
          visibility: 'subscribers',
          proofs: proofs.map(p => ({
            requirementIndex: p.requirementIndex,
            proofType: p.proofType,
            proofData: p.proofData,
            publicInputs: p.publicInputs,
          })),
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSubmitResult(data);
        setStep('success');
      } else {
        setError(data.error || 'Submission failed');
        if (data.proofResults) {
          // Show which proofs failed
          const failed = data.proofResults.filter((r: any) => !r.verified);
          setError(`Proof verification failed: ${failed.map((f: any) => f.message).join(', ')}`);
        }
      }
    } catch (err) {
      setError('Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="text-center text-slate-500">Loading bounty...</div>
      </div>
    );
  }

  if (!bounty) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
          {error || 'Bounty not found'}
        </div>
        <Link href="/bounties" className="text-argus-600 hover:underline mt-4 inline-block">
          ← Back to bounties
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-6">
        <Link href="/bounties" className="text-argus-600 hover:underline text-sm">
          ← Back to bounties
        </Link>
        <h1 className="text-2xl font-bold mt-2">Fulfill Bounty</h1>
        <p className="text-slate-600 dark:text-slate-400">
          Submit intel to fulfill this bounty request
        </p>
      </div>

      {/* Bounty Summary */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{bounty.title}</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1">{bounty.description}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-600">${bounty.rewardUsdc}</div>
            <div className="text-xs text-slate-500">USDC reward</div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 mt-4">
          <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs">
            {bounty.category}
          </span>
          {bounty.regions?.map(r => (
            <span key={r} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
              📍 {r}
            </span>
          ))}
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center mb-8 space-x-4">
        {['info', 'intel', 'proofs', 'submit'].map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s 
                ? 'bg-argus-600 text-white'
                : ['info', 'intel', 'proofs', 'submit'].indexOf(step) > i
                ? 'bg-green-500 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
            }`}>
              {['info', 'intel', 'proofs', 'submit'].indexOf(step) > i ? '✓' : i + 1}
            </div>
            {i < 3 && (
              <div className={`w-12 h-0.5 ${
                ['info', 'intel', 'proofs', 'submit'].indexOf(step) > i 
                  ? 'bg-green-500' 
                  : 'bg-slate-200 dark:bg-slate-700'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-lg mb-6">
          {error}
          <button onClick={() => setError('')} className="float-right">×</button>
        </div>
      )}

      {/* Step: Info */}
      {step === 'info' && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">📋 Proof Requirements</h3>
          
          {bounty.proofRequirements && bounty.proofRequirements.length > 0 ? (
            <>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                This bounty requires you to provide zero-knowledge proofs to verify your intel.
                You'll need to prepare the following:
              </p>
              
              <div className="space-y-3 mb-6">
                {bounty.proofRequirements.map((req, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      req.required 
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-400'
                    }`}>
                      {req.required ? 'Required' : 'Optional'}
                    </span>
                    <div>
                      <div className="font-medium">{req.description}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Type: {req.template} • Weight: {req.weight}/10
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              This bounty has no specific proof requirements. You can submit intel directly.
            </p>
          )}

          <button
            onClick={() => setStep('intel')}
            className="w-full py-3 bg-argus-600 hover:bg-argus-700 text-white rounded-lg"
          >
            Continue to Intel Submission →
          </button>
        </div>
      )}

      {/* Step: Intel */}
      {step === 'intel' && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">📝 Write Your Intel</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                value={intelForm.title}
                onChange={(e) => setIntelForm(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Intel Content *</label>
              <textarea
                value={intelForm.body}
                onChange={(e) => setIntelForm(prev => ({ ...prev, body: e.target.value }))}
                rows={8}
                placeholder="Describe your intelligence in detail. Include what you observed, context, and any relevant information..."
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Summary (for feed preview)</label>
              <textarea
                value={intelForm.summary}
                onChange={(e) => setIntelForm(prev => ({ ...prev, summary: e.target.value }))}
                rows={2}
                placeholder="Brief summary that will appear in feed listings..."
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Region</label>
                <input
                  type="text"
                  value={intelForm.locationRegion}
                  onChange={(e) => setIntelForm(prev => ({ ...prev, locationRegion: e.target.value }))}
                  placeholder="e.g., Tehran, Ukraine"
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Event Type</label>
                <input
                  type="text"
                  value={intelForm.eventTag}
                  onChange={(e) => setIntelForm(prev => ({ ...prev, eventTag: e.target.value }))}
                  placeholder="e.g., military, protest"
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setStep('info')}
              className="px-6 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep(bounty.proofRequirements?.length > 0 ? 'proofs' : 'submit')}
              disabled={!intelForm.body}
              className="flex-1 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg disabled:opacity-50"
            >
              {bounty.proofRequirements?.length > 0 ? 'Continue to Proofs →' : 'Review & Submit →'}
            </button>
          </div>
        </div>
      )}

      {/* Step: Proofs */}
      {step === 'proofs' && bounty.proofRequirements && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">🔐 Generate Proofs</h3>
          
          <ProofGenerator 
            requirements={bounty.proofRequirements}
            onProofsGenerated={handleProofsGenerated}
          />
          
          <button
            onClick={() => setStep('intel')}
            className="mt-4 px-6 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            ← Back to Intel
          </button>
        </div>
      )}

      {/* Step: Submit */}
      {step === 'submit' && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">✓ Review & Submit</h3>
          
          <div className="space-y-4 mb-6">
            <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <div className="font-medium">{intelForm.title}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                {intelForm.body.substring(0, 200)}...
              </div>
            </div>
            
            {proofs.length > 0 && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="font-medium text-green-700 dark:text-green-300">
                  ✓ {proofs.length} proof(s) ready
                </div>
                <ul className="text-sm text-green-600 dark:text-green-400 mt-2 space-y-1">
                  {proofs.map((p, i) => (
                    <li key={i}>• {bounty.proofRequirements[p.requirementIndex]?.description}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setStep(bounty.proofRequirements?.length > 0 ? 'proofs' : 'intel')}
              className="px-6 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : '🚀 Submit Intel & Claim Bounty'}
            </button>
          </div>
        </div>
      )}

      {/* Step: Success */}
      {step === 'success' && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-8 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h3 className="text-2xl font-bold mb-2">Intel Submitted!</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Your intel has been published to your feed. The bounty poster has been notified.
          </p>
          
          {submitResult?.data && (
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 text-left mb-6">
              <div className="text-sm text-slate-500">Feed Item ID:</div>
              <div className="font-mono text-sm">{submitResult.data.id}</div>
            </div>
          )}
          
          <div className="flex gap-3 justify-center">
            <Link
              href="/bounties"
              className="px-6 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Browse More Bounties
            </Link>
            <Link
              href="/sources/humint"
              className="px-6 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg"
            >
              View My Feed
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
