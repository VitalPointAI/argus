'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

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
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const urlToVerify = searchParams.get('url');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (urlToVerify) {
      verifyUrl(urlToVerify);
    }
  }, [urlToVerify]);

  const verifyUrl = async (url: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_URL}/api/verification/deep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url }),
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

  const getConfidenceDisplay = (score: number) => {
    if (score >= 70) return { label: 'High', emoji: '🟢', color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400' };
    if (score >= 40) return { label: 'Medium', emoji: '🟡', color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400' };
    return { label: 'Low', emoji: '🔴', color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400' };
  };

  if (!urlToVerify) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold mb-4">Verify a Source</h1>
        <p className="text-slate-500 mb-6">
          Enter a URL to verify its credibility and cross-reference with other sources.
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
            🔍 Source Verification
          </h1>
          <p className="text-argus-100 text-sm mt-1 break-all">{urlToVerify}</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-argus-500 border-t-transparent mx-auto mb-4"></div>
              <p className="text-slate-500">Analyzing source...</p>
              <p className="text-sm text-slate-400 mt-2">Cross-referencing with trusted sources</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">⚠️</div>
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={() => verifyUrl(urlToVerify)}
                className="mt-4 px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg"
              >
                Try Again
              </button>
            </div>
          ) : result ? (
            <div className="space-y-6">
              {/* Confidence Score */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <div>
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200">Confidence Level</h3>
                  <p className="text-sm text-slate-500">{result.verificationStatus}</p>
                </div>
                <div className={`text-2xl font-bold px-4 py-2 rounded-lg ${getConfidenceDisplay(result.confidence).color}`}>
                  {getConfidenceDisplay(result.confidence).emoji} {getConfidenceDisplay(result.confidence).label}
                </div>
              </div>

              {/* Source Reliability */}
              {result.sourceReliability && (
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-600">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Source Reliability</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">{result.sourceReliability.name}</span>
                    <span className={`font-medium px-2 py-1 rounded ${getConfidenceDisplay(result.sourceReliability.score).color}`}>
                      {getConfidenceDisplay(result.sourceReliability.score).emoji} {getConfidenceDisplay(result.sourceReliability.score).label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Based on {result.sourceReliability.articlesAnalyzed} articles analyzed
                  </p>
                </div>
              )}

              {/* Cross References */}
              {result.crossReferences && result.crossReferences.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-3">Cross-References</h3>
                  <div className="space-y-2">
                    {result.crossReferences.map((ref, i) => (
                      <a
                        key={i}
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                      >
                        <div>
                          <span className="font-medium text-slate-700 dark:text-slate-200">{ref.source}</span>
                          <p className="text-sm text-slate-500 line-clamp-1">{ref.title}</p>
                        </div>
                        <span className={ref.agrees ? 'text-green-600' : 'text-red-600'}>
                          {ref.agrees ? '✓ Confirms' : '✗ Contradicts'}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Bias Analysis */}
              {result.biasAnalysis && (
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-600">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Bias Analysis</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-sm">
                      {result.biasAnalysis.rating}
                    </span>
                  </div>
                  {result.biasAnalysis.indicators.length > 0 && (
                    <ul className="text-sm text-slate-500 space-y-1">
                      {result.biasAnalysis.indicators.map((indicator, i) => (
                        <li key={i}>• {indicator}</li>
                      ))}
                    </ul>
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
