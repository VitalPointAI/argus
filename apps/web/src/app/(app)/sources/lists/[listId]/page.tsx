'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface SourceListItem {
  id: string;
  sourceId: string;
  addedAt: string;
  source: {
    id: string;
    name: string;
    type: string;
    url: string;
    domainId: string | null;
    reliabilityScore: number;
    isActive: boolean;
  };
}

interface SourceList {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  isOwner: boolean;
  items: SourceListItem[];
}

export default function SourceListDetailPage() {
  const { listId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [list, setList] = useState<SourceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [activating, setActivating] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    // Wait for auth to finish loading before making requests
    if (authLoading || hasFetched) return;
    if (!listId) return;
    
    // Once auth is settled, fetch the list
    setHasFetched(true);
    fetchList();
    if (token) {
      checkIfActive();
    }
  }, [listId, token, authLoading, hasFetched]);

  const checkIfActive = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/sources/lists/active`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.data && data.data.id === listId) {
        setIsActive(true);
      }
    } catch (err) {
      // Ignore errors
    }
  };

  const activateList = async () => {
    if (!token || !listId) return;
    setActivating(true);
    try {
      const res = await fetch(`${API_URL}/api/sources/lists/${listId}/activate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setIsActive(true);
        setSuccessMessage('Source list activated! Dashboard and briefings will now use these sources.');
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setError(data.error || 'Failed to activate list');
      }
    } catch (err) {
      setError('Failed to activate list');
    } finally {
      setActivating(false);
    }
  };

  const deactivateList = async () => {
    if (!token) return;
    setActivating(true);
    try {
      const res = await fetch(`${API_URL}/api/sources/lists/active`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setIsActive(false);
        setSuccessMessage('Switched to all sources.');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(data.error || 'Failed to deactivate');
      }
    } catch (err) {
      setError('Failed to deactivate');
    } finally {
      setActivating(false);
    }
  };

  const fetchList = async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_URL}/api/sources/lists/${listId}`, { headers });
      const data = await res.json();

      if (data.success) {
        setList(data.data);
      } else {
        setError(data.error || 'Failed to load source list');
      }
    } catch (err) {
      setError('Failed to load source list');
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async (itemId: string) => {
    if (!token || !list) return;

    try {
      const res = await fetch(`${API_URL}/api/sources/lists/${listId}/items/${itemId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const data = await res.json();

      if (data.success) {
        setList({
          ...list,
          items: list.items.filter(item => item.id !== itemId),
        });
        setSuccessMessage('Source removed from list');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(data.error || 'Failed to remove source');
      }
    } catch (err) {
      setError('Failed to remove source');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500">Loading source list...</div>
      </div>
    );
  }

  if (error && !list) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <h1 className="text-2xl font-bold mb-4 text-red-600">Error</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">{error}</p>
        <a
          href="/sources"
          className="text-argus-600 hover:text-argus-700"
        >
          ← Back to Sources
        </a>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Source List Not Found</h1>
        <a
          href="/sources"
          className="text-argus-600 hover:text-argus-700"
        >
          ← Back to Sources
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
          <button onClick={() => setError('')} className="float-right">×</button>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg">
          {successMessage}
        </div>
      )}

      {/* Header */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2 text-sm">
            <a href="/sources" className="text-slate-500 hover:text-slate-700">
              Sources
            </a>
            <span className="text-slate-400">/</span>
            <span className="text-slate-700 dark:text-slate-300">Lists</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
            {list.name}
            {list.isPublic && (
              <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded text-sm font-medium">
                Public
              </span>
            )}
          </h1>
          {list.description && (
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              {list.description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/sources"
            className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            ← Back
          </a>
          {user && (
            isActive ? (
              <button
                onClick={deactivateList}
                disabled={activating}
                className="px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition disabled:opacity-50 flex items-center gap-1"
              >
                <span>✓</span> <span className="hidden sm:inline">Active —</span> Show All
              </button>
            ) : (
              <button
                onClick={activateList}
                disabled={activating}
                className="px-3 py-2 text-sm bg-argus-600 hover:bg-argus-700 text-white rounded-lg transition disabled:opacity-50 flex items-center gap-1"
              >
                {activating ? 'Activating...' : '🎯 Use for Dashboard'}
              </button>
            )
          )}
          {list.isOwner && (
            <a
              href="/sources/manage"
              className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Manage
            </a>
          )}
        </div>
      </div>

      {/* Sources in this list */}
      {list.items.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
          <div className="bg-slate-50 dark:bg-slate-700 px-4 md:px-6 py-4 border-b border-slate-200 dark:border-slate-600">
            <h2 className="text-lg font-semibold">
              {list.items.length} Source{list.items.length !== 1 ? 's' : ''} in this list
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {list.items.map((item) => (
              <div key={item.id} className="px-4 md:px-6 py-4 space-y-2">
                {/* Source name and status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <StatusDot active={item.source.isActive} />
                    <span className="font-medium break-words">{item.source.name}</span>
                  </div>
                  {list.isOwner && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-red-600 hover:text-red-800 text-sm shrink-0"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {/* URL */}
                <div className="text-sm text-slate-500 truncate">
                  {item.source.url}
                </div>
                {/* Badges and date */}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <TypeBadge type={item.source.type} />
                  <ReliabilityBadge score={item.source.reliabilityScore} />
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500">
                    Added {new Date(item.addedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-12 text-center">
          <p className="text-slate-500 mb-4">This list is empty.</p>
          {list.isOwner && (
            <p className="text-slate-400 text-sm">
              Go to the <a href="/sources" className="text-argus-600 hover:underline">Sources page</a> to add sources to this list.
            </p>
          )}
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

function ReliabilityBadge({ score }: { score: number }) {
  const stars = Math.round(score / 20);
  return (
    <span className="text-yellow-400 text-sm">
      {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
    </span>
  );
}
