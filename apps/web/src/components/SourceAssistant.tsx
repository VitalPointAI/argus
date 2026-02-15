'use client';

import { useState, useEffect } from 'react';
import { getConfidenceDisplay } from '@/lib/confidence';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface SourceAnalysis {
  sourceType: string;
  name: string;
  description: string;
  feedUrl?: string;
  websiteUrl?: string;
  youtubeChannelId?: string;
  suggestedDomains?: string[];
  suggestedDomain?: string;
  confidence: number;
  biases?: string[];
  biasDirection?: 'left' | 'right' | 'center' | 'unknown';
  disinfoRisk?: 'low' | 'medium' | 'high';
  notes: string;
}

interface FeedValidation {
  valid: boolean | null;
  message: string;
  feedInfo?: {
    title: string;
    description: string;
    itemCount: number;
  };
  sampleItems?: {
    title: string;
    link: string;
    pubDate: string | null;
    snippet: string;
  }[];
  // Fallback options when RSS fails
  canFallbackToScraping?: boolean;
  scrapePreview?: {
    title?: string;
    articleCount?: number;
  };
  fallbackSuggestion?: string;
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

const biasColors: Record<string, string> = {
  left: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  right: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  center: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  unknown: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
};

export default function SourceAssistant({ onSourceAdded }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<SourceAnalysis | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [step, setStep] = useState<'input' | 'review' | 'done'>('input');
  const [validation, setValidation] = useState<FeedValidation | null>(null);
  const [validating, setValidating] = useState(false);

  // Match suggested domain names to actual domain IDs
  useEffect(() => {
    if (analysis && domains.length > 0) {
      const suggestedNames = analysis.suggestedDomains || 
        (analysis.suggestedDomain ? [analysis.suggestedDomain] : []);
      
      const matchedIds = suggestedNames
        .map(name => {
          const match = domains.find(d => 
            d.name.toLowerCase() === name.toLowerCase() ||
            d.slug.toLowerCase() === name.toLowerCase().replace(/\s+/g, '-')
          );
          return match?.id;
        })
        .filter((id): id is string => !!id);
      
      if (matchedIds.length > 0) {
        setSelectedDomains(matchedIds);
      }
    }
  }, [analysis, domains]);

  const toggleDomain = (domainId: string) => {
    setSelectedDomains(prev => 
      prev.includes(domainId)
        ? prev.filter(id => id !== domainId)
        : [...prev, domainId]
    );
  };

  const switchToWebScraping = () => {
    if (!analysis) return;
    
    // Update the analysis to use website scraping instead of RSS
    setAnalysis({
      ...analysis,
      sourceType: 'website',
      feedUrl: undefined,
      notes: analysis.notes 
        ? `${analysis.notes} (Switched to web scraping - no RSS available)`
        : 'Using web scraping - RSS feed not available',
    });
    
    // Re-validate as website type
    const url = analysis.websiteUrl || analysis.feedUrl;
    if (url) {
      validateFeed(url, 'website');
    }
  };

  const validateFeed = async (url: string, type: string) => {
    setValidating(true);
    setValidation(null);
    
    try {
      const res = await fetch(`${API_URL}/api/sources/validate-feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url, type }),
      });

      const data = await res.json();
      
      if (data.success) {
        setValidation({
          valid: data.valid,
          message: data.message,
          feedInfo: data.feedInfo,
          sampleItems: data.sampleItems,
          canFallbackToScraping: data.canFallbackToScraping,
          scrapePreview: data.scrapePreview,
          fallbackSuggestion: data.fallbackSuggestion,
        });
      }
    } catch (err) {
      setValidation({
        valid: false,
        message: '❌ Failed to validate feed',
      });
    } finally {
      setValidating(false);
    }
  };

  const analyze = async () => {
    if (!input.trim()) return;
    
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setValidation(null);
    setSelectedDomains([]);

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
        setStep('review');
        
        // Auto-validate the feed
        const feedUrl = data.data.analysis.feedUrl || data.data.analysis.websiteUrl;
        if (feedUrl) {
          validateFeed(feedUrl, data.data.analysis.sourceType);
        }
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
    if (!analysis || selectedDomains.length === 0) return;

    setAdding(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/sources/from-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          analysis,
          domainIds: selectedDomains,
          domainId: selectedDomains[0], // Legacy compat
          isGlobal: false,
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
    setSelectedDomains([]);
    setError(null);
    setSuccess(null);
    setValidation(null);
    setStep('input');
  };

  // Get suggested domain names for highlighting
  const suggestedDomainNames = analysis?.suggestedDomains || 
    (analysis?.suggestedDomain ? [analysis.suggestedDomain] : []);
  
  const isDomainSuggested = (domain: Domain) => 
    suggestedDomainNames.some(name => 
      domain.name.toLowerCase() === name.toLowerCase() ||
      domain.slug.toLowerCase() === name.toLowerCase().replace(/\s+/g, '-')
    );

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
                <>🔍 Analyze Source</>
              )}
            </button>

            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 pt-2">
              <p><strong>Supported:</strong> RSS feeds, websites, YouTube channels</p>
              <p><strong>Coming soon:</strong> Twitter/X, Telegram channels</p>
            </div>
          </div>
        )}

        {step === 'review' && analysis && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Configuration */}
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <span className="text-xl">{sourceTypeIcons[analysis.sourceType]}</span>
                {analysis.name}
              </h3>
              
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {analysis.description}
              </p>

              {/* Bias & Confidence Row */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded ${getConfidenceDisplay(analysis.confidence).bgClass}`} title={getConfidenceDisplay(analysis.confidence).description}>
                  {getConfidenceDisplay(analysis.confidence).emoji} {getConfidenceDisplay(analysis.confidence).label}
                </span>
                {analysis.biasDirection && analysis.biasDirection !== 'unknown' && (
                  <span className={`text-xs px-2 py-1 rounded ${biasColors[analysis.biasDirection]}`}>
                    {analysis.biasDirection === 'left' ? '← Left-leaning' : 
                     analysis.biasDirection === 'right' ? 'Right-leaning →' : 
                     '⬌ Center'}
                  </span>
                )}
                {analysis.disinfoRisk && analysis.disinfoRisk !== 'low' && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    analysis.disinfoRisk === 'high' 
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' 
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                  }`}>
                    ⚠️ {analysis.disinfoRisk === 'high' ? 'High' : 'Medium'} disinfo risk
                  </span>
                )}
              </div>

              {/* Domain Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Assign to Domains
                  {suggestedDomainNames.length > 0 && (
                    <span className="ml-2 text-xs text-argus-600 font-normal">
                      (AI suggested: {suggestedDomainNames.join(', ')})
                    </span>
                  )}
                </label>
                <div className="flex flex-wrap gap-2">
                  {domains.map((domain) => {
                    const isSelected = selectedDomains.includes(domain.id);
                    const isSuggested = isDomainSuggested(domain);
                    return (
                      <button
                        key={domain.id}
                        onClick={() => toggleDomain(domain.id)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-argus-600 text-white shadow-sm'
                            : isSuggested
                            ? 'bg-argus-100 text-argus-700 dark:bg-argus-900/30 dark:text-argus-400 ring-2 ring-argus-400'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {isSelected && '✓ '}{domain.name}
                      </button>
                    );
                  })}
                </div>
                {selectedDomains.length === 0 && (
                  <p className="text-xs text-amber-600 mt-2">Select at least one domain</p>
                )}
              </div>

              {analysis.notes && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded">
                  💡 {analysis.notes}
                </p>
              )}

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}
            </div>

            {/* Right Column: Validation */}
            <div className="space-y-4">
              {/* Feed Info */}
              <div className="text-sm space-y-2">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Type:</span>{' '}
                  <span className="text-slate-800 dark:text-white">{sourceTypeLabels[analysis.sourceType]}</span>
                </div>
                {analysis.feedUrl && (
                  <div className="truncate">
                    <span className="text-slate-500 dark:text-slate-400">Feed:</span>{' '}
                    <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{analysis.feedUrl}</code>
                  </div>
                )}
                {analysis.websiteUrl && (
                  <div className="truncate">
                    <span className="text-slate-500 dark:text-slate-400">URL:</span>{' '}
                    <a href={analysis.websiteUrl} target="_blank" rel="noopener" className="text-argus-600 hover:underline text-xs">
                      {analysis.websiteUrl}
                    </a>
                  </div>
                )}
              </div>

              {/* Feed Validation Status */}
              <div className={`p-4 rounded-lg border-2 transition-all duration-300 ${
                validating ? 'border-slate-300 bg-slate-50 dark:bg-slate-700/50' : 
                validation?.valid === true ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 
                validation?.valid === false ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 
                'border-slate-300 bg-slate-50 dark:bg-slate-700/50'
              }`}>
                <div className="flex items-center gap-3 mb-2">
                  {validating ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-400 border-t-transparent"></div>
                      <span className="font-medium text-slate-600 dark:text-slate-300">Testing feed...</span>
                    </>
                  ) : validation?.valid === true ? (
                    <>
                      <span className="text-xl">✅</span>
                      <span className="font-medium text-green-700 dark:text-green-400">Feed Working!</span>
                    </>
                  ) : validation?.valid === false ? (
                    <>
                      <span className="text-xl">❌</span>
                      <span className="font-medium text-red-700 dark:text-red-400">Feed Issue</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xl">⏳</span>
                      <span className="font-medium text-slate-600 dark:text-slate-300">Validation pending</span>
                    </>
                  )}
                </div>

                {validation?.message && !validating && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">{validation.message}</p>
                )}

                {/* Sample Items Preview */}
                {validation?.sampleItems && validation.sampleItems.length > 0 && (
                  <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Recent Items:</p>
                    {validation.sampleItems.slice(0, 3).map((item, i) => (
                      <div key={i} className="p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-600">
                        <a 
                          href={item.link} 
                          target="_blank" 
                          rel="noopener" 
                          className="text-sm font-medium text-argus-600 hover:underline line-clamp-1"
                        >
                          {item.title}
                        </a>
                        {item.pubDate && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {new Date(item.pubDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {validation?.valid === false && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        const feedUrl = analysis.feedUrl || analysis.websiteUrl;
                        if (feedUrl) validateFeed(feedUrl, analysis.sourceType);
                      }}
                      className="text-sm text-argus-600 hover:text-argus-700 underline"
                    >
                      🔄 Retry
                    </button>
                    
                    {/* Offer web scraping fallback */}
                    {validation.canFallbackToScraping && analysis.sourceType !== 'website' && (
                      <button
                        onClick={switchToWebScraping}
                        className="px-3 py-1 text-sm bg-argus-600 hover:bg-argus-700 text-white rounded-lg transition"
                      >
                        🌐 Switch to Web Scraping
                      </button>
                    )}
                  </div>
                )}
                
                {/* Fallback suggestion */}
                {validation?.fallbackSuggestion && analysis.sourceType !== 'website' && (
                  <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm text-blue-700 dark:text-blue-400">
                    {validation.fallbackSuggestion}
                    {validation.scrapePreview?.articleCount && validation.scrapePreview.articleCount > 0 && (
                      <span className="ml-1">(Found {validation.scrapePreview.articleCount} article elements)</span>
                    )}
                  </div>
                )}
              </div>

              {/* Warning if validation failed and no fallback available */}
              {validation?.valid === false && !validation.canFallbackToScraping && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-400 text-sm">
                  <strong>⚠️ Feed validation failed.</strong> You can still add this source, but it may not retrieve content properly.
                </div>
              )}
              
              {/* Success message if switched to scraping */}
              {validation?.valid === true && analysis.sourceType === 'website' && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">
                  <strong>✅ Web scraping enabled.</strong> Argus will periodically scan this site for new content.
                </div>
              )}
            </div>

            {/* Full-width Actions */}
            <div className="col-span-1 lg:col-span-2 flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={reset}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              >
                ← Start Over
              </button>
              <button
                onClick={addSource}
                disabled={adding || selectedDomains.length === 0 || validating}
                className={`flex-1 px-6 py-3 text-white rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                  validation?.valid === false 
                    ? 'bg-amber-600 hover:bg-amber-700' 
                    : 'bg-green-600 hover:bg-green-700'
                } disabled:bg-slate-400`}
              >
                {adding ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Adding...
                  </>
                ) : validating ? (
                  'Validating...'
                ) : validation?.valid === false ? (
                  '⚠️ Add Anyway'
                ) : (
                  `✅ Add to ${selectedDomains.length} Domain${selectedDomains.length !== 1 ? 's' : ''}`
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
