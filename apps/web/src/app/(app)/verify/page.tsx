'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getConfidenceDisplay } from '@/lib/confidence';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface TrailStep {
  type: string;
  label: string;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
  scoreContribution: number;
  details?: Record<string, any>;
}

interface TrailData {
  contentId: string;
  contentTitle: string;
  finalConfidenceScore: number;
  confidenceLevel: string;
  steps: TrailStep[];
  summary: {
    positiveFactors: string[];
    negativeFactors: string[];
    recommendation: string;
  };
  comparison: {
    sourceAverage: number;
    domainAverage: number;
    percentileRank: number;
  };
}

interface ContentLookup {
  id: string;
  title: string;
  url: string;
  confidenceScore: number;
  sourceName?: string;
}

function ImpactIcon({ impact }: { impact: string }) {
  if (impact === 'positive') {
    return <span className="text-green-500 text-lg">↑</span>;
  } else if (impact === 'negative') {
    return <span className="text-red-500 text-lg">↓</span>;
  }
  return <span className="text-slate-400 text-lg">→</span>;
}

function StepTypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    source: '📰',
    ground_truth: '✅',
    claim: '📝',
    cross_reference: '🔗',
    credibility: '🔍',
    bias: '⚖️',
  };
  return <span className="text-xl">{icons[type] || '•'}</span>;
}

function ConfidenceMeter({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-500' :
                score >= 60 ? 'bg-yellow-500' :
                score >= 40 ? 'bg-orange-500' : 'bg-red-500';
  
  return (
    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
      <div
        className={`h-3 rounded-full transition-all ${color}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const urlToVerify = searchParams.get('url');
  
  const [lookupLoading, setLookupLoading] = useState(false);
  const [content, setContent] = useState<ContentLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [notInDatabase, setNotInDatabase] = useState(false);
  
  const [trail, setTrail] = useState<TrailData | null>(null);
  const [trailLoading, setTrailLoading] = useState(false);
  const [trailError, setTrailError] = useState<string | null>(null);
  
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepResult, setDeepResult] = useState<any>(null);
  const [deepError, setDeepError] = useState<string | null>(null);
  
  const [displayScore, setDisplayScore] = useState<number>(50);

  // Step 1: Look up content by URL
  useEffect(() => {
    if (urlToVerify) {
      lookupContent(urlToVerify);
    }
  }, [urlToVerify]);

  const lookupContent = async (url: string) => {
    setLookupLoading(true);
    setLookupError(null);
    setNotInDatabase(false);
    
    try {
      // Look up content by URL from our database
      const res = await fetch(`${API_URL}/api/verification/deep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url }),
      });
      
      const data = await res.json();
      
      if (data.success && data.data) {
        // Check if it's in our database (has a contentId vs just URL analysis)
        if (data.data.note?.includes('not in database') || !data.data.contentId) {
          setNotInDatabase(true);
          setDisplayScore(data.data.confidence || 50);
          // Still show basic info
          setContent({
            id: '',
            title: data.data.title || `Article from ${new URL(url).hostname}`,
            url: url,
            confidenceScore: data.data.confidence || 50,
            sourceName: data.data.sourceReliability?.name,
          });
        } else {
          // Content is in database - we can do full verification
          const contentId = data.data.contentId;
          setContent({
            id: contentId,
            title: data.data.title,
            url: data.data.url || url,
            confidenceScore: data.data.confidence || 50,
            sourceName: data.data.sourceReliability?.name,
          });
          setDisplayScore(data.data.confidence || 50);
          // Auto-load the verification trail
          loadTrail(contentId);
        }
      } else {
        setLookupError(data.error || 'Failed to look up URL');
      }
    } catch (err) {
      setLookupError('Failed to connect to verification service');
    } finally {
      setLookupLoading(false);
    }
  };

  const loadTrail = async (contentId: string) => {
    if (!contentId) return;
    
    setTrailLoading(true);
    setTrailError(null);
    
    try {
      const res = await fetch(`${API_URL}/api/verification/trail/${contentId}`, {
        credentials: 'include',
      });
      const data = await res.json();
      
      if (data.success) {
        setTrail(data.data);
        if (data.data.finalConfidenceScore !== undefined) {
          setDisplayScore(data.data.finalConfidenceScore);
        }
      } else {
        setTrailError(data.error || 'Failed to load verification trail');
      }
    } catch (e) {
      setTrailError('Failed to connect to API');
    } finally {
      setTrailLoading(false);
    }
  };

  const runDeepVerification = async () => {
    if (!content?.id) return;
    
    setDeepLoading(true);
    setDeepError(null);
    
    try {
      const res = await fetch(`${API_URL}/api/verification/deep/${content.id}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      
      if (data.success) {
        setDeepResult(data.data);
        // Refresh trail with new data
        if (data.data.trail) {
          setTrail(data.data.trail);
          if (data.data.trail.finalConfidenceScore !== undefined) {
            setDisplayScore(data.data.trail.finalConfidenceScore);
          }
        }
      } else {
        setDeepError(data.error || 'Deep verification failed');
      }
    } catch (e) {
      setDeepError('Failed to run deep verification');
    } finally {
      setDeepLoading(false);
    }
  };

  const confidenceDisplay = getConfidenceDisplay(displayScore);

  if (!urlToVerify) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-6xl mb-4">🔬</div>
        <h1 className="text-2xl font-bold mb-4">Deep Source Verification</h1>
        <p className="text-slate-500 mb-6">
          Enter a URL to run comprehensive verification: claim extraction, cross-referencing, and bias analysis.
        </p>
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const url = formData.get('url') as string;
            if (url) {
              window.location.href = `/verify?url=${encodeURIComponent(url)}`;
            }
          }}
          className="flex gap-2"
        >
          <input
            type="url"
            name="url"
            placeholder="https://..."
            className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
            required
          />
          <button
            type="submit"
            className="px-6 py-3 bg-argus-600 hover:bg-argus-700 text-white rounded-lg font-medium"
          >
            Verify
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/briefings" className="text-argus-600 hover:underline text-sm">
        ← Back to Briefings
      </Link>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-argus-600 to-argus-700 text-white p-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            🔬 Deep Source Verification
          </h1>
          <p className="text-argus-100 text-sm mt-1 break-all">{urlToVerify}</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {lookupLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-argus-500 border-t-transparent mx-auto mb-4"></div>
              <p className="text-slate-500">Looking up source...</p>
            </div>
          ) : lookupError ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">⚠️</div>
              <p className="text-red-600 dark:text-red-400">{lookupError}</p>
              <button
                onClick={() => lookupContent(urlToVerify)}
                className="mt-4 px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg"
              >
                Try Again
              </button>
            </div>
          ) : content ? (
            <div className="space-y-6">
              {/* Article Info */}
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  {content.title}
                </h2>
                {content.sourceName && (
                  <p className="text-sm text-slate-500">Source: {content.sourceName}</p>
                )}
              </div>

              {/* Confidence Score */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-700 dark:text-slate-200">Confidence Score</span>
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">{displayScore}%</span>
                  </div>
                  <ConfidenceMeter score={displayScore} />
                </div>
                <div className={`px-4 py-2 rounded-lg text-lg font-bold ${confidenceDisplay.bgClass}`}>
                  {confidenceDisplay.emoji} {confidenceDisplay.label}
                </div>
              </div>

              {/* Not in database notice */}
              {notInDatabase && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                    <strong>⚠️ Limited verification available.</strong> This URL is not in our database. 
                    The score shown is based on source reputation only. For full verification including 
                    claim extraction and cross-referencing, the article needs to be in our feed.
                  </p>
                </div>
              )}

              {/* Verification Trail Loading */}
              {trailLoading && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-argus-500 border-t-transparent mx-auto mb-4"></div>
                  <p className="text-slate-500">Loading verification trail...</p>
                </div>
              )}

              {trailError && (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-lg">
                  {trailError}
                </div>
              )}

              {/* Verification Trail */}
              {trail && (
                <div className="space-y-6">
                  {/* Steps */}
                  <div>
                    <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-3">
                      📊 How this score was calculated:
                    </h4>
                    <div className="space-y-3">
                      {trail.steps.map((step, idx) => (
                        <div 
                          key={idx}
                          className={`flex items-start gap-3 p-3 rounded-lg ${
                            step.impact === 'positive' ? 'bg-green-50 dark:bg-green-900/20' :
                            step.impact === 'negative' ? 'bg-red-50 dark:bg-red-900/20' :
                            'bg-slate-50 dark:bg-slate-700/50'
                          }`}
                        >
                          <StepTypeIcon type={step.type} />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {step.label}
                              </span>
                              <div className="flex items-center gap-2">
                                <ImpactIcon impact={step.impact} />
                                <span className={`text-sm font-medium ${
                                  step.scoreContribution > 0 ? 'text-green-600 dark:text-green-400' :
                                  step.scoreContribution < 0 ? 'text-red-600 dark:text-red-400' :
                                  'text-slate-500'
                                }`}>
                                  {step.scoreContribution > 0 ? '+' : ''}{step.scoreContribution}
                                </span>
                              </div>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                              {step.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                    <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-3">
                      📋 Summary
                    </h4>
                    
                    {trail.summary.positiveFactors.length > 0 && (
                      <div className="mb-3">
                        <span className="text-green-600 dark:text-green-400 text-sm font-medium">✓ Positive factors:</span>
                        <ul className="mt-1 space-y-1">
                          {trail.summary.positiveFactors.map((f, i) => (
                            <li key={i} className="text-sm text-slate-600 dark:text-slate-400 pl-4">• {f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {trail.summary.negativeFactors.length > 0 && (
                      <div className="mb-3">
                        <span className="text-red-600 dark:text-red-400 text-sm font-medium">✗ Concerns:</span>
                        <ul className="mt-1 space-y-1">
                          {trail.summary.negativeFactors.map((f, i) => (
                            <li key={i} className="text-sm text-slate-600 dark:text-slate-400 pl-4">• {f}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="bg-argus-50 dark:bg-argus-900/30 p-3 rounded-lg mt-3">
                      <span className="text-sm font-medium text-argus-700 dark:text-argus-300">
                        💡 Recommendation:
                      </span>
                      <p className="text-sm text-argus-600 dark:text-argus-400 mt-1">
                        {trail.summary.recommendation}
                      </p>
                    </div>
                  </div>

                  {/* Comparison */}
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                    <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-3">
                      📈 Comparison
                    </h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                        <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                          {trail.comparison.sourceAverage}%
                        </div>
                        <div className="text-xs text-slate-500">Source Average</div>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                        <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                          {trail.comparison.domainAverage}%
                        </div>
                        <div className="text-xs text-slate-500">Domain Average</div>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                        <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                          {trail.comparison.percentileRank}%
                        </div>
                        <div className="text-xs text-slate-500">Percentile</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Deep Verification Section */}
              {content.id && !notInDatabase && (
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <button
                    onClick={runDeepVerification}
                    disabled={deepLoading}
                    className="w-full py-3 px-4 bg-argus-600 hover:bg-argus-700 disabled:bg-argus-400 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
                  >
                    {deepLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        Running Deep Verification...
                      </>
                    ) : deepResult ? (
                      <>
                        🔄 Re-run Deep Verification
                      </>
                    ) : (
                      <>
                        🔬 Run Deep Verification
                      </>
                    )}
                  </button>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
                    Extracts claims from the article, cross-references with other sources, and analyzes for bias
                  </p>
                </div>
              )}

              {deepError && (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-lg">
                  {deepError}
                </div>
              )}

              {/* Deep Verification Results */}
              {deepResult && (
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
                  <h4 className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 text-lg">
                    🔬 Deep Verification Results
                  </h4>

                  {/* Full Text Status */}
                  {deepResult.fullTextFetched && (
                    <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 p-3 rounded-lg text-sm">
                      ✓ Full article text fetched ({deepResult.bodyLength?.toLocaleString()} characters)
                    </div>
                  )}
                  
                  {/* Claims */}
                  {deepResult.claims?.factualClaims?.length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <h5 className="font-medium text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                        📝 Extracted Claims ({deepResult.claims.factualClaims.length})
                      </h5>
                      <ul className="space-y-3">
                        {deepResult.claims.factualClaims.map((claim: any, i: number) => (
                          <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2 p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-600">
                            <span className={`shrink-0 px-2 py-1 rounded text-xs font-medium ${
                              claim.status === 'verified' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                              claim.status === 'contradicted' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                              claim.status === 'partially_verified' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                            }`}>
                              {claim.status || 'unverified'}
                            </span>
                            <div className="flex-1">
                              <span className="block">{claim.claim}</span>
                              {claim.confidence && (
                                <span className="text-xs text-slate-400 mt-1">Confidence: {claim.confidence}%</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Credibility Indicators */}
                  {deepResult.claims?.credibilityIndicators && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <h5 className="font-medium text-slate-800 dark:text-slate-200 mb-2">
                        🔍 Credibility Indicators
                      </h5>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {Object.entries(deepResult.claims.credibilityIndicators).map(([key, value]: [string, any]) => (
                          <div key={key} className="flex justify-between p-2 bg-white dark:bg-slate-800 rounded">
                            <span className="text-slate-600 dark:text-slate-400 capitalize">{key.replace(/_/g, ' ')}:</span>
                            <span className={`font-medium ${
                              value === true || value === 'yes' ? 'text-green-600' :
                              value === false || value === 'no' ? 'text-red-600' :
                              'text-slate-800 dark:text-slate-200'
                            }`}>
                              {typeof value === 'boolean' ? (value ? '✓' : '✗') : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cross-Reference */}
                  {deepResult.crossReference && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <h5 className="font-medium text-slate-800 dark:text-slate-200 mb-3">
                        🔗 Cross-Reference Results
                      </h5>
                      <div className="grid grid-cols-4 gap-2 text-center text-sm">
                        <div className="bg-white dark:bg-slate-800 rounded p-2">
                          <div className="text-xl font-bold text-green-600">{deepResult.crossReference.verified || 0}</div>
                          <div className="text-xs text-slate-500">Verified</div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded p-2">
                          <div className="text-xl font-bold text-yellow-600">{deepResult.crossReference.partiallyVerified || 0}</div>
                          <div className="text-xs text-slate-500">Partial</div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded p-2">
                          <div className="text-xl font-bold text-slate-500">{deepResult.crossReference.unverified || 0}</div>
                          <div className="text-xs text-slate-500">Unverified</div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded p-2">
                          <div className="text-xl font-bold text-red-600">{deepResult.crossReference.contradicted || 0}</div>
                          <div className="text-xs text-slate-500">Contradicted</div>
                        </div>
                      </div>
                      {deepResult.crossReference.overallConfidence && (
                        <div className="mt-3 text-center">
                          <span className="text-sm text-slate-500">Overall Cross-Reference Confidence:</span>
                          <span className="ml-2 font-bold text-slate-800 dark:text-slate-200">{deepResult.crossReference.overallConfidence}%</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bias Analysis */}
                  {deepResult.bias && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <h5 className="font-medium text-slate-800 dark:text-slate-200 mb-3">
                        ⚖️ Bias Analysis
                      </h5>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-white dark:bg-slate-800 rounded p-2">
                          <span className="text-slate-500">Political Lean:</span>
                          <span className="ml-2 font-medium text-slate-800 dark:text-slate-200">{deepResult.bias.politicalBias || 'Neutral'}</span>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded p-2">
                          <span className="text-slate-500">Bias Score:</span>
                          <span className="ml-2 font-medium text-slate-800 dark:text-slate-200">{deepResult.bias.overallBiasScore || 0}/100</span>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded p-2">
                          <span className="text-slate-500">Emotional Level:</span>
                          <span className="ml-2 font-medium text-slate-800 dark:text-slate-200">{deepResult.bias.emotionalLevel || 'Low'}</span>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded p-2">
                          <span className="text-slate-500">Sensationalism:</span>
                          <span className="ml-2 font-medium text-slate-800 dark:text-slate-200">{deepResult.bias.sensationalismLevel || 'Low'}</span>
                        </div>
                      </div>
                      {deepResult.bias.indicators?.length > 0 && (
                        <div className="mt-3">
                          <span className="text-sm text-slate-500">Detected indicators:</span>
                          <ul className="mt-1 space-y-1">
                            {deepResult.bias.indicators.map((ind: string, i: number) => (
                              <li key={i} className="text-sm text-slate-600 dark:text-slate-400 pl-4">• {ind}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {deepResult.bias.summary && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-3 italic border-t border-slate-200 dark:border-slate-600 pt-2">
                          {deepResult.bias.summary}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Final Recommendation */}
                  {deepResult.recommendation && (
                    <div className="bg-argus-50 dark:bg-argus-900/30 p-4 rounded-lg">
                      <span className="text-sm font-medium text-argus-700 dark:text-argus-300">
                        💡 Final Recommendation:
                      </span>
                      <p className="text-argus-600 dark:text-argus-400 mt-1">
                        {deepResult.recommendation}
                      </p>
                      {deepResult.finalConfidence !== undefined && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-sm text-argus-600 dark:text-argus-400">Final Confidence:</span>
                          <span className="font-bold text-argus-700 dark:text-argus-300">{deepResult.finalConfidence}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-argus-500 border-t-transparent"></div>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
