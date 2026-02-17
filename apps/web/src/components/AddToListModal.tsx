'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface SourceList {
  id: string;
  name: string;
  description: string;
  itemCount: number;
}

interface AddToListModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceId: string;
  sourceName: string;
  onSuccess?: () => void;
}

export function AddToListModal({ isOpen, onClose, sourceId, sourceName, onSuccess }: AddToListModalProps) {
  const [lists, setLists] = useState<SourceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successListId, setSuccessListId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchLists();
      setError('');
      setSuccessListId(null);
    }
  }, [isOpen]);

  const fetchLists = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/sources/lists/my`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setLists(data.data || []);
      }
    } catch (err) {
      setError('Failed to load lists');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToList = async (listId: string) => {
    setSubmitting(listId);
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
        setSuccessListId(listId);
        // Update list count locally
        setLists(lists.map(l => l.id === listId ? { ...l, itemCount: l.itemCount + 1 } : l));
        if (onSuccess) onSuccess();
        // Auto-close after brief success feedback
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        setError(data.error || 'Failed to add source to list');
      }
    } catch (err) {
      setError('Failed to add source to list');
    } finally {
      setSubmitting(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Add to List
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
            Add "<span className="font-medium">{sourceName}</span>" to a source list
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-argus-500"></div>
            </div>
          ) : lists.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                You don't have any source lists yet.
              </p>
              <a
                href="/sources/manage?tab=lists"
                className="inline-block px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg text-sm"
              >
                Create a List
              </a>
            </div>
          ) : (
            <div className="space-y-2">
              {lists.map((list) => (
                <button
                  key={list.id}
                  onClick={() => handleAddToList(list.id)}
                  disabled={submitting !== null || successListId === list.id}
                  className={`w-full text-left p-4 rounded-lg border transition ${
                    successListId === list.id
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-argus-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        {list.name}
                      </div>
                      {list.description && (
                        <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                          {list.description}
                        </div>
                      )}
                      <div className="text-xs text-slate-400 mt-1">
                        {list.itemCount} source{list.itemCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    {submitting === list.id ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-argus-500"></div>
                    ) : successListId === list.id ? (
                      <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span className="text-argus-600 text-sm">+ Add</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
