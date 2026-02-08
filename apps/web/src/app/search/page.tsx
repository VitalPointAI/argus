'use client';

import { useState, useEffect } from 'react';
import { ConfidenceBadge } from '@/components/VerificationTrail';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface SearchResult {
  id: string;
  title: string;
  url: string;
  published_at: string;
  confidence_score: number;
  rank: number;
  snippet: string;
  source_name: string;
  domain_name: string;
  domain_slug: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async (q: string) => {
    if (q.length < 2) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(q)}&limit=50`);
      const data = await res.json();
      
      if (data.success) {
        setResults(data.data.results);
        setTotal(data.data.total);
      }
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Search Intelligence
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Full-text search across {'>'}3,400 verified articles
        </p>
      </div>

      {/* Search Box */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search articles... (e.g., russia, ukraine, cyber)"
          className="flex-1 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-argus-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={loading || query.length < 2}
          className="px-6 py-3 bg-argus-600 hover:bg-argus-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Results */}
      {searched && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              {total > 0 ? `${total} results for "${query}"` : `No results for "${query}"`}
            </h2>
          </div>

          {results.length > 0 ? (
            <div className="space-y-4">
              {results.map((item) => (
                <article key={item.id} className="border-b border-slate-100 dark:border-slate-700 pb-4 last:border-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="font-medium text-argus-600 hover:text-argus-700 dark:text-argus-400"
                      >
                        {item.title}
                      </a>
                      <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                        <span>{item.source_name}</span>
                        <span>•</span>
                        <a href={`/domains/${item.domain_slug}`} className="hover:text-argus-600">
                          {item.domain_name}
                        </a>
                        <span>•</span>
                        <span>{new Date(item.published_at).toLocaleDateString()}</span>
                      </div>
                      {item.snippet && (
                        <p 
                          className="mt-2 text-sm text-slate-600 dark:text-slate-400"
                          dangerouslySetInnerHTML={{ 
                            __html: item.snippet.replace(/\*\*([^*]+)\*\*/g, '<mark class="bg-yellow-200 dark:bg-yellow-700">$1</mark>') 
                          }}
                        />
                      )}
                    </div>
                    {item.confidence_score && (
                      <ConfidenceBadge score={item.confidence_score} contentId={item.id} />
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">
              Try a different search term
            </p>
          )}
        </div>
      )}

      {/* Quick searches */}
      {!searched && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Searches</h2>
          <div className="flex flex-wrap gap-2">
            {['russia', 'ukraine', 'china', 'cyber', 'bitcoin', 'ai', 'nato', 'iran'].map((term) => (
              <button
                key={term}
                onClick={() => {
                  setQuery(term);
                  doSearch(term);
                }}
                className="px-3 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full text-sm transition"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ConfidenceBadge imported from @/components/VerificationTrail
