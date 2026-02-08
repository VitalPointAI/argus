'use client';

import { useState } from 'react';

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

export function ConfidenceBadge({ 
  score, 
  contentId,
  clickable = true 
}: { 
  score: number; 
  contentId?: string;
  clickable?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [trail, setTrail] = useState<TrailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepResult, setDeepResult] = useState<any>(null);
  const [displayScore, setDisplayScore] = useState(score); // Track current score for syncing

  const color = displayScore >= 70 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                displayScore >= 40 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';

  const handleClick = async () => {
    if (!clickable || !contentId) return;
    
    setIsOpen(true);
    if (trail) return; // Already loaded
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_URL}/api/verification/trail/${contentId}`);
      const data = await res.json();
      
      if (data.success) {
        setTrail(data.data);
        // Sync displayed score with trail's calculated score
        if (data.data.finalConfidenceScore !== undefined) {
          setDisplayScore(data.data.finalConfidenceScore);
        }
      } else {
        setError(data.error || 'Failed to load verification trail');
      }
    } catch (e) {
      setError('Failed to connect to API');
    } finally {
      setLoading(false);
    }
  };

  const runDeepVerification = async () => {
    if (!contentId) return;
    
    setDeepLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_URL}/api/verification/deep/${contentId}`, {
        method: 'POST',
      });
      const data = await res.json();
      
      if (data.success) {
        setDeepResult(data.data);
        // Refresh the trail with new data
        setTrail(data.data.trail);
        // Sync the displayed score with the new verified score
        if (data.data.trail?.finalConfidenceScore !== undefined) {
          setDisplayScore(data.data.trail.finalConfidenceScore);
        }
      } else {
        setError(data.error || 'Deep verification failed');
      }
    } catch (e) {
      setError('Failed to run deep verification');
    } finally {
      setDeepLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`px-3 py-1.5 rounded text-sm font-medium min-w-[48px] min-h-[36px] ${color} ${clickable && contentId ? 'cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-argus-500 active:ring-2 active:ring-argus-500 transition shadow-sm hover:shadow' : ''}`}
        title={clickable && contentId ? 'Tap to see verification trail' : undefined}
      >
        {displayScore}%{clickable && contentId && <span className="ml-1 opacity-60">ⓘ</span>}
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black/50 transition-opacity"
              onClick={() => setIsOpen(false)}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full mx-auto p-6 z-10 max-h-[85vh] overflow-y-auto">
              {/* Close button */}
              <button
                onClick={() => setIsOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                Verification Trail
              </h2>

              {loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-argus-500 border-t-transparent"></div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-lg">
                  {error}
                </div>
              )}

              {trail && (
                <div className="space-y-6 text-left">
                  {/* Title & Score */}
                  <div>
                    <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
                      {trail.contentTitle}
                    </h3>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <ConfidenceMeter score={trail.finalConfidenceScore} />
                      </div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-white">
                        {trail.finalConfidenceScore}%
                      </div>
                      <span className={`px-2 py-1 rounded text-sm font-medium ${
                        trail.confidenceLevel === 'high' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        trail.confidenceLevel === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {trail.confidenceLevel}
                      </span>
                    </div>
                  </div>

                  {/* Steps */}
                  <div>
                    <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-3">
                      How this score was calculated:
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
                      Summary
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
                      Comparison
                    </h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                          {trail.comparison.sourceAverage}%
                        </div>
                        <div className="text-xs text-slate-500">Source Average</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                          {trail.comparison.domainAverage}%
                        </div>
                        <div className="text-xs text-slate-500">Domain Average</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                          {trail.comparison.percentileRank}%
                        </div>
                        <div className="text-xs text-slate-500">Percentile</div>
                      </div>
                    </div>
                  </div>

                  {/* Deep Verification Button */}
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
                      ) : (
                        <>
                          🔬 Run Deep Verification
                        </>
                      )}
                    </button>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
                      Extracts claims, cross-references with other sources, and analyzes bias
                    </p>
                  </div>

                  {/* Deep Verification Results */}
                  {deepResult && (
                    <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
                      <h4 className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        🔬 Deep Verification Results
                      </h4>
                      
                      {/* Claims */}
                      {deepResult.claims?.factualClaims?.length > 0 && (
                        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                          <h5 className="font-medium text-slate-800 dark:text-slate-200 mb-2">
                            📝 Extracted Claims ({deepResult.claims.factualClaims.length})
                          </h5>
                          <ul className="space-y-2">
                            {deepResult.claims.factualClaims.slice(0, 5).map((claim: any, i: number) => (
                              <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
                                <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
                                  claim.status === 'verified' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                  claim.status === 'contradicted' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                  'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                                }`}>
                                  {claim.status || 'unverified'}
                                </span>
                                <span>{claim.claim}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Cross-Reference */}
                      {deepResult.crossReference && (
                        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                          <h5 className="font-medium text-slate-800 dark:text-slate-200 mb-2">
                            🔗 Cross-Reference Results
                          </h5>
                          <div className="grid grid-cols-4 gap-2 text-center text-sm">
                            <div>
                              <div className="text-lg font-bold text-green-600">{deepResult.crossReference.verified || 0}</div>
                              <div className="text-xs text-slate-500">Verified</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-yellow-600">{deepResult.crossReference.partiallyVerified || 0}</div>
                              <div className="text-xs text-slate-500">Partial</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-slate-500">{deepResult.crossReference.unverified || 0}</div>
                              <div className="text-xs text-slate-500">Unverified</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-red-600">{deepResult.crossReference.contradicted || 0}</div>
                              <div className="text-xs text-slate-500">Contradicted</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bias */}
                      {deepResult.bias && (
                        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                          <h5 className="font-medium text-slate-800 dark:text-slate-200 mb-2">
                            ⚖️ Bias Analysis
                          </h5>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-slate-500">Political Lean:</span>
                              <span className="ml-2 font-medium text-slate-800 dark:text-slate-200">{deepResult.bias.politicalBias}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Bias Score:</span>
                              <span className="ml-2 font-medium text-slate-800 dark:text-slate-200">{deepResult.bias.overallBiasScore}/100</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Emotional:</span>
                              <span className="ml-2 font-medium text-slate-800 dark:text-slate-200">{deepResult.bias.emotionalLevel}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Sensationalism:</span>
                              <span className="ml-2 font-medium text-slate-800 dark:text-slate-200">{deepResult.bias.sensationalismLevel}</span>
                            </div>
                          </div>
                          {deepResult.bias.summary && (
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 italic">
                              {deepResult.bias.summary}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
