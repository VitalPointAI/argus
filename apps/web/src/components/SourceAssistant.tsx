'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface SourceAnalysis {
  sourceType: string;
  name: string;
  description: string;
  feedUrl?: string;
  websiteUrl?: string;
  youtubeChannelId?: string;
  suggestedDomain: string;
  confidence: number;
  notes: string;
}

interface Domain {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  onSourceAdded?: () => void;
}

const sourceTypeIcons: Record<string, string> = {
  rss: '📡',
  youtube_channel: '📺',
  youtube_playlist: '🎬',
  website: '🌐',
  twitter: '🐦',
  telegram: '✈️',
  unknown: '❓',
};

const sourceTypeLabels: Record<string, string> = {
  rss: 'RSS Feed',
  youtube_channel: 'YouTube Channel',
  youtube_playlist: 'YouTube Playlist',
  website: 'Website (Scraping)',
  twitter: 'Twitter/X',
  telegram: 'Telegram Channel',
  unknown: 'Unknown',
};

export default function SourceAssistant({ onSourceAdded }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<SourceAnalysis | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [matchedDomain, setMatchedDomain] = useState<Domain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [step, setStep] = useState<'input' | 'review' | 'done'>('input');

  const analyze = async () => {
    if (!input.trim()) return;
    
    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const res = await fetch(`${API_URL}/api/sources/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ input: input.trim() }),
      });

      const data = await res.json();

      if (data.success) {
        setAnalysis(data.data.analysis);
        setDomains(data.data.availableDomains);
        setMatchedDomain(data.data.matchedDomain);
        setSelectedDomain(data.data.matchedDomain?.id || '');
        setStep('review');
      } else {
        setError(data.error || 'Analysis failed');
      }
    } catch (err) {
      setError('Failed to analyze. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addSource = async () => {
    if (!analysis || !selectedDomain) return;

    setAdding(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/sources/from-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          analysis,
          domainId: selectedDomain,
          isGlobal: false, // User sources by default
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(data.data.message);
        setStep('done');
        onSourceAdded?.();
      } else {
        setError(data.error || 'Failed to add source');
      }
    } catch (err) {
      setError('Failed to add source. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const reset = () => {
    setInput('');
    setAnalysis(null);
    setSelectedDomain('');
    setMatchedDomain(null);
    setError(null);
    setSuccess(null);
    setStep('input');
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-argus-600 to-argus-700 text-white p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🤖</span>
          <div>
            <h2 className="text-lg font-semibold">AI Source Assistant</h2>
            <p className="text-argus-100 text-sm">Paste a URL or describe a source — I'll figure out the rest</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {step === 'input' && (
          <div className="space-y-4">
            {/* Input area */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                URL or Description
              </label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Examples:&#10;• https://feeds.washingtonpost.com/rss/world&#10;• https://www.youtube.com/@PBSNewsHour&#10;• I want to track DefenseNews articles about NATO&#10;• Add the RSS feed from Foreign Affairs magazine"
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-argus-500 focus:border-transparent resize-none"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={analyze}
              disabled={loading || !input.trim()}
              className="w-full px-6 py-3 bg-argus-600 hover:bg-argus-700 disabled:bg-slate-400 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  Analyzing...
                </>
              ) : (
                <>
                  🔍 Analyze Source
                </>
              )}
            </button>

            {/* Tips */}
            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 pt-2">
              <p><strong>Supported:</strong> RSS feeds, websites, YouTube channels</p>
              <p><strong>Coming soon:</strong> Twitter/X, Telegram channels</p>
            </div>
          </div>
        )}

        {step === 'review' && analysis && (
          <div className="space-y-6">
            {/* Analysis result */}
            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-3xl">{sourceTypeIcons[analysis.sourceType]}</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-lg">
                    {analysis.name}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {analysis.description}
                  </p>
                </div>
                <span className="text-xs bg-argus-100 dark:bg-argus-900/30 text-argus-700 dark:text-argus-400 px-2 py-1 rounded">
                  {(analysis.confidence * 100).toFixed(0)}% confident
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Type:</span>{' '}
                  <span className="text-slate-800 dark:text-white">{sourceTypeLabels[analysis.sourceType]}</span>
                </div>
                {analysis.feedUrl && (
                  <div className="col-span-2 truncate">
                    <span className="text-slate-500 dark:text-slate-400">Feed:</span>{' '}
                    <code className="text-xs bg-slate-200 dark:bg-slate-600 px-1 rounded">{analysis.feedUrl}</code>
                  </div>
                )}
                {analysis.websiteUrl && (
                  <div className="col-span-2 truncate">
                    <span className="text-slate-500 dark:text-slate-400">URL:</span>{' '}
                    <a href={analysis.websiteUrl} target="_blank" rel="noopener" className="text-argus-600 hover:underline text-xs">
                      {analysis.websiteUrl}
                    </a>
                  </div>
                )}
              </div>

              {analysis.notes && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded">
                  💡 {analysis.notes}
                </p>
              )}
            </div>

            {/* Domain selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Assign to Domain
                {matchedDomain && (
                  <span className="ml-2 text-xs text-argus-600">
                    (Suggested: {matchedDomain.name})
                  </span>
                )}
              </label>
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-argus-500 focus:border-transparent"
              >
                <option value="">Select a domain...</option>
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={reset}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              >
                ← Start Over
              </button>
              <button
                onClick={addSource}
                disabled={adding || !selectedDomain}
                className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
              >
                {adding ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Adding...
                  </>
                ) : (
                  <>
                    ✓ Add This Source
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Source Added!
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {success}
            </p>
            <button
              onClick={reset}
              className="px-6 py-3 bg-argus-600 hover:bg-argus-700 text-white rounded-lg font-medium transition"
            >
              Add Another Source
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
