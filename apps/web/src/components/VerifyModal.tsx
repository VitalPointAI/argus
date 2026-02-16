'use client';

import React, { useState, useEffect } from 'react';
import { getConfidenceDisplay } from '@/lib/confidence';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface VerificationResult {
  url: string;
  title?: string;
  confidence: number;
  verificationStatus: string;
  crossReferences: {
    source: string;
    title: string;
    url: string;
    agrees: boolean;
  }[];
  biasAnalysis?: {
    rating: string;
    indicators: string[];
  };
  sourceReliability?: {
    name: string;
    score: number;
    articlesAnalyzed: number;
  };
  note?: string;
}

interface VerifyModalProps {
  url: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function VerifyModal({ url, isOpen, onClose }: VerifyModalProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && url) {
      verifyUrl(url);
    }
  }, [isOpen, url]);

  const verifyUrl = async (urlToVerify: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const res = await fetch(`${API_URL}/api/verification/deep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: urlToVerify }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || 'Verification failed');
      }
    } catch (err) {
      setError('Failed to verify URL. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-argus-600 to-argus-700 text-white p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              🔍 Source Verification
            </h2>
            <p className="text-argus-100 text-xs mt-1 break-all line-clamp-1">{url}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-argus-500 border-t-transparent mx-auto mb-3"></div>
              <p className="text-slate-500">Analyzing source...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-3">⚠️</div>
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={() => verifyUrl(url)}
                className="mt-3 px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg text-sm"
              >
                Try Again
              </button>
            </div>
          ) : result ? (
            <div className="space-y-4">
              {/* Title */}
              {result.title && (
                <h3 className="font-semibold text-slate-800 dark:text-white">
                  {result.title}
                </h3>
              )}

              {/* Confidence Score */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <div>
                  <span className="font-medium text-slate-700 dark:text-slate-200">Confidence</span>
                  <p className="text-xs text-slate-500">{result.verificationStatus}</p>
                </div>
                <div className={`text-lg font-bold px-3 py-1 rounded-lg ${getConfidenceDisplay(result.confidence).bgClass}`}>
                  {getConfidenceDisplay(result.confidence).emoji} {getConfidenceDisplay(result.confidence).label}
                </div>
              </div>

              {/* Note if URL not in database */}
              {result.note && (
                <p className="text-xs text-slate-500 italic">{result.note}</p>
              )}

              {/* Source Reliability */}
              {result.sourceReliability && (
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      Source: <strong>{result.sourceReliability.name}</strong>
                    </span>
                    <span className={`text-sm font-medium px-2 py-0.5 rounded ${getConfidenceDisplay(result.sourceReliability.score).bgClass}`}>
                      {getConfidenceDisplay(result.sourceReliability.score).emoji} {getConfidenceDisplay(result.sourceReliability.score).label}
                    </span>
                  </div>
                  {result.sourceReliability.articlesAnalyzed > 0 && (
                    <p className="text-xs text-slate-500 mt-1">
                      Based on {result.sourceReliability.articlesAnalyzed} articles
                    </p>
                  )}
                </div>
              )}

              {/* Cross References */}
              {result.crossReferences && result.crossReferences.length > 0 && (
                <div>
                  <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-2 text-sm">Cross-References</h4>
                  <div className="space-y-2">
                    {result.crossReferences.map((ref, i) => (
                      <a
                        key={i}
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-slate-700 dark:text-slate-200">{ref.source}</span>
                          <p className="text-xs text-slate-500 truncate">{ref.title}</p>
                        </div>
                        <span className={`ml-2 shrink-0 ${ref.agrees ? 'text-green-600' : 'text-red-600'}`}>
                          {ref.agrees ? '✓ Confirms' : '✗ Contradicts'}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Bias Analysis */}
              {result.biasAnalysis && result.biasAnalysis.rating && (
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-600">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-slate-700 dark:text-slate-200">Bias:</span>
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs">
                      {result.biasAnalysis.rating}
                    </span>
                  </div>
                  {result.biasAnalysis.indicators && result.biasAnalysis.indicators.length > 0 && (
                    <ul className="text-xs text-slate-500 space-y-0.5">
                      {result.biasAnalysis.indicators.slice(0, 3).map((indicator, i) => (
                        <li key={i}>• {indicator}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-3 flex justify-end gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
          >
            Open Source ↗
          </a>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-argus-600 hover:bg-argus-700 text-white rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
