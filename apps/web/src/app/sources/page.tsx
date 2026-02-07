'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface Source {
  id: string;
  name: string;
  type: string;
  url: string;
  domainId: string | null;
  reliabilityScore: number;
  isActive: boolean;
  lastFetchedAt: string | null;
  createdBy: string | null;
  isGlobal: boolean;
  isOwner: boolean;
  canEdit: boolean;
}

interface Domain {
  id: string;
  name: string;
  slug: string;
}

interface SourceList {
  id: string;
  name: string;
  description: string;
  itemCount: number;
}

export default function SourcesPage() {
  const { user, token } = useAuth();
  const [sources, setSources] = useState<Source[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [sourceLists, setSourceLists] = useState<SourceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [addToListModal, setAddToListModal] = useState<{ sourceId: string; sourceName: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const [sourcesRes, domainsRes] = await Promise.all([
        fetch(`${API_URL}/api/sources`, { headers, cache: 'no-store' }),
        fetch(`${API_URL}/api/v1/domains`, { cache: 'no-store' }),
      ]);

      const sourcesData = await sourcesRes.json();
      const domainsData = await domainsRes.json();

      setSources(sourcesData.data || []);
      setDomains(domainsData.data || []);

      // Fetch user's source lists if authenticated
      if (token) {
        const listsRes = await fetch(`${API_URL}/api/sources/lists/my`, { headers });
        const listsData = await listsRes.json();
        if (listsData.success) {
          setSourceLists(listsData.data || []);
        }
      }
    } catch (err) {
      console.error('Failed to load sources:', err);
    } finally {
      setLoading(false);
    }
  };

  const addToList = async (listId: string) => {
    if (!addToListModal || !token) return;

    try {
      const res = await fetch(`${API_URL}/api/sources/lists/${listId}/items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceId: addToListModal.sourceId }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMessage(`Added "${addToListModal.sourceName}" to list`);
        setTimeout(() => setSuccessMessage(''), 3000);
        setAddToListModal(null);
        fetchData(); // Refresh lists
      }
    } catch (err) {
      console.error('Failed to add to list:', err);
    }
  };

  // Group sources by domain
  const domainMap = new Map(domains.map((d) => [d.id, d]));
  const sourcesByDomain = sources.reduce((acc: any, source) => {
    const domainId = source.domainId || 'uncategorized';
    if (!acc[domainId]) {
      acc[domainId] = {
        domain: domainMap.get(domainId) || { id: 'uncategorized', name: 'Uncategorized', slug: '' },
        sources: [],
      };
    }
    acc[domainId].sources.push(source);
    return acc;
  }, {});

  const groupedDomains = Object.values(sourcesByDomain).sort((a: any, b: any) =>
    (a.domain?.name || '').localeCompare(b.domain?.name || '')
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500">Loading sources...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg">
          {successMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Intelligence Sources
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            {sources.length} sources across {domains.length} strategic domains
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <span className="px-4 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium">
            {sources.filter((s) => s.isActive).length} Active
          </span>
          <span className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium">
            {sources.filter((s) => !s.isActive).length} Inactive
          </span>
          <a
            href="/sources/manage"
            className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg text-sm font-medium transition"
          >
            Manage Sources
          </a>
        </div>
      </div>

      {/* User's Source Lists */}
      {user && sourceLists.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            📋 My Source Lists
          </h2>
          <div className="flex flex-wrap gap-3">
            {sourceLists.map((list) => (
              <a
                key={list.id}
                href={`/sources/lists/${list.id}`}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition"
              >
                <span className="font-medium">{list.name}</span>
                <span className="ml-2 text-slate-500 text-sm">({list.itemCount} sources)</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Sources by Domain */}
      <div className="space-y-6">
        {groupedDomains.map((group: any) => (
          <div key={group.domain?.id || 'unknown'} className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-700 px-6 py-4 border-b border-slate-200 dark:border-slate-600">
              <h2 className="text-lg font-semibold flex items-center gap-3">
                {group.domain?.slug ? (
                  <a href={`/domains/${group.domain?.slug}`} className="hover:text-argus-600">
                    {group.domain?.name || 'Unknown Domain'}
                  </a>
                ) : (
                  <span>{group.domain?.name || 'Unknown Domain'}</span>
                )}
                <span className="text-sm font-normal text-slate-500">
                  {group.sources.length} source{group.sources.length !== 1 ? 's' : ''}
                </span>
              </h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {group.sources.map((source: Source) => (
                <div key={source.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <StatusDot active={source.isActive} />
                      <span className="font-medium">{source.name}</span>
                      <TypeBadge type={source.type} />
                      {source.isGlobal && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded text-xs font-medium">
                          Global
                        </span>
                      )}
                      {source.isOwner && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded text-xs font-medium">
                          Mine
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-slate-500 truncate max-w-xl">
                      {source.url}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm text-slate-500">
                      {source.lastFetchedAt ? (
                        <div>
                          Last fetched: {new Date(source.lastFetchedAt).toLocaleString()}
                        </div>
                      ) : (
                        <div className="text-slate-400">Never fetched</div>
                      )}
                    </div>
                    {user && sourceLists.length > 0 && (
                      <button
                        onClick={() => setAddToListModal({ sourceId: source.id, sourceName: source.name })}
                        className="px-3 py-1 text-sm bg-argus-100 text-argus-700 dark:bg-argus-900/30 dark:text-argus-300 rounded hover:bg-argus-200 transition"
                        title="Add to list"
                      >
                        + List
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-sm text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <StatusDot active={true} />
            <span>Active - Feed is being polled</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot active={false} />
            <span>Inactive - Feed paused</span>
          </div>
        </div>
      </div>

      {/* Add to List Modal */}
      {addToListModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Add to Source List</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Select a list to add "{addToListModal.sourceName}" to:
            </p>
            <div className="space-y-2 mb-4">
              {sourceLists.map((list) => (
                <button
                  key={list.id}
                  onClick={() => addToList(list.id)}
                  className="w-full text-left px-4 py-3 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition"
                >
                  <div className="font-medium">{list.name}</div>
                  {list.description && (
                    <div className="text-sm text-slate-500">{list.description}</div>
                  )}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setAddToListModal(null)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`w-2 h-2 rounded-full ${active ? 'bg-green-500' : 'bg-slate-300'}`} />
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    rss: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    youtube: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    web: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    twitter: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    telegram: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    podcast: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    government: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[type] || 'bg-slate-100 text-slate-600'}`}>
      {type.toUpperCase()}
    </span>
  );
}
