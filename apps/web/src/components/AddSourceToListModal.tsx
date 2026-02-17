'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface Source {
  id: string;
  name: string;
  type: string;
  url: string;
  reliabilityScore: number;
}

interface AddSourceToListModalProps {
  isOpen: boolean;
  onClose: () => void;
  listId: string;
  listName: string;
  existingSourceIds: string[];
  onSuccess?: () => void;
}

export function AddSourceToListModal({ 
  isOpen, 
  onClose, 
  listId, 
  listName,
  existingSourceIds,
  onSuccess 
}: AddSourceToListModalProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchSources();
      setError('');
      setAddedIds(new Set());
      setSearchTerm('');
    }
  }, [isOpen]);

  const fetchSources = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/sources`, { credentials: 'include' });
      const data = await res.json();
      if (data.data) {
        // Filter out sources already in the list
        const available = data.data.filter((s: Source) => !existingSourceIds.includes(s.id));
        setSources(available);
      }
    } catch (err) {
      setError('Failed to load sources');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSource = async (sourceId: string) => {
    setSubmitting(sourceId);
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/api/sources/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sourceId }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setAddedIds(prev => new Set([...prev, sourceId]));
        if (onSuccess) onSuccess();
      } else {
        setError(data.error || 'Failed to add source');
      }
    } catch (err) {
      setError('Failed to add source');
    } finally {
      setSubmitting(null);
    }
  };

  // Filter sources by search term
  const filteredSources = sources.filter(s => 
    !addedIds.has(s.id) && (
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.url.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Add Sources to List
            </h3>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Add sources to "<span className="font-medium">{listName}</span>"
          </p>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-700">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search sources..."
            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-argus-500 outline-none text-sm"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          {addedIds.size > 0 && (
            <div className="mb-4 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-lg text-sm">
              ✓ Added {addedIds.size} source{addedIds.size !== 1 ? 's' : ''} to the list
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-argus-500"></div>
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 dark:text-slate-400">
                {searchTerm ? 'No matching sources found.' : 'All your sources are already in this list.'}
              </p>
              <a
                href="/sources/manage"
                className="inline-block mt-4 px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg text-sm"
              >
                Create New Source
              </a>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900 dark:text-white truncate">
                      {source.name}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{source.url}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getTypeColor(source.type)}`}>
                        {source.type.toUpperCase()}
                      </span>
                      <span className="text-yellow-400 text-xs">
                        {'★'.repeat(Math.round((source.reliabilityScore > 1 ? source.reliabilityScore : source.reliabilityScore * 100) / 20))}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddSource(source.id)}
                    disabled={submitting !== null}
                    className="ml-4 px-3 py-1.5 text-sm bg-argus-600 hover:bg-argus-700 text-white rounded transition disabled:opacity-50"
                  >
                    {submitting === source.id ? (
                      <span className="inline-block animate-spin">⏳</span>
                    ) : (
                      '+ Add'
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    rss: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    youtube: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    web: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    twitter: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    telegram: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    podcast: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    government: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  };
  return colors[type] || 'bg-slate-100 text-slate-600';
}
