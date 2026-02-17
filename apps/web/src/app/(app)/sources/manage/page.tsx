'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import SourceAssistant from '@/components/SourceAssistant';
import { AddToListModal } from '@/components/AddToListModal';

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
  createdAt: string;
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
  isPublic: boolean;
  itemCount: number;
}

interface HumintSource {
  codename: string;
  bio: string | null;
  domains: string[];
  regions: string[];
  reputationScore: number;
  totalSubmissions: number;
  subscriberCount: number;
  isAcceptingSubscribers: boolean;
}

const SOURCE_TYPES = ['rss', 'youtube', 'web', 'twitter', 'telegram', 'podcast', 'government'];

// Wrapper to handle Suspense for useSearchParams
export default function SourceManagePageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="text-slate-500">Loading...</div></div>}>
      <SourceManagePage />
    </Suspense>
  );
}

function SourceManagePage() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [sources, setSources] = useState<Source[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [sourceLists, setSourceLists] = useState<SourceList[]>([]);
  const [humintSources, setHumintSources] = useState<HumintSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam === 'lists' ? 'lists' : tabParam === 'humint' ? 'humint' : 'sources';
  const [activeTab, setActiveTab] = useState<'sources' | 'lists' | 'humint'>(initialTab);
  
  // Source form state
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [sourceFormData, setSourceFormData] = useState({
    name: '',
    url: '',
    type: 'rss',
    domainId: '',
    reliabilityScore: 50,
    asGlobal: false,
  });
  const [submitting, setSubmitting] = useState(false);
  
  // List form state
  const [showListForm, setShowListForm] = useState(false);
  const [listFormData, setListFormData] = useState({
    name: '',
    description: '',
    isPublic: false,
  });
  
  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteListId, setDeleteListId] = useState<string | null>(null);
  
  // Add to list modal
  const [addToListSource, setAddToListSource] = useState<{ id: string; name: string } | null>(null);
  
  // Fetch data
  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [user, authLoading]);
  
  const fetchData = async () => {
    try {
      const [sourcesRes, domainsRes, userInfoRes] = await Promise.all([
        fetch(`${API_URL}/api/sources`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${API_URL}/api/v1/domains`, { cache: 'no-store' }),
        fetch(`${API_URL}/api/sources/user/info`, { credentials: 'include' }),
      ]);
      
      const sourcesData = await sourcesRes.json();
      const domainsData = await domainsRes.json();
      const userInfo = await userInfoRes.json();
      
      setSources(sourcesData.data || []);
      setDomains(domainsData.data || []);
      setIsAdmin(userInfo.data?.isAdmin || false);
      
      // Fetch source lists if authenticated
      if (user) {
        const listsRes = await fetch(`${API_URL}/api/sources/lists/my`, { credentials: 'include' });
        const listsData = await listsRes.json();
        if (listsData.success) {
          setSourceLists(listsData.data || []);
        }
      }
      
      // Fetch HUMINT sources
      const humintRes = await fetch(`${API_URL}/api/humint/sources?limit=50`, { credentials: 'include' });
      const humintData = await humintRes.json();
      if (humintData.success) {
        setHumintSources(humintData.data || []);
      }
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };
  
  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000);
  };
  
  // Filter sources to only show editable ones
  const editableSources = sources.filter(s => s.canEdit);
  const globalSources = sources.filter(s => s.isGlobal);
  const mySources = sources.filter(s => s.isOwner);
  
  // Create source
  const handleSubmitSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('Please log in to add sources');
      return;
    }
    
    setSubmitting(true);
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/api/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...sourceFormData,
          domainId: sourceFormData.domainId || null,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSources([{ ...data.data, isGlobal: sourceFormData.asGlobal, isOwner: !sourceFormData.asGlobal, canEdit: true }, ...sources]);
        setSourceFormData({ name: '', url: '', type: 'rss', domainId: '', reliabilityScore: 50, asGlobal: false });
        setShowSourceForm(false);
        showSuccess('Source added successfully!');
      } else {
        setError(data.error || 'Failed to add source');
      }
    } catch (err) {
      setError('Failed to add source');
    } finally {
      setSubmitting(false);
    }
  };
  
  // Create source list
  const handleSubmitList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('Please log in to create lists');
      return;
    }
    
    setSubmitting(true);
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/api/sources/lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(listFormData),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSourceLists([{ ...data.data, itemCount: 0 }, ...sourceLists]);
        setListFormData({ name: '', description: '', isPublic: false });
        setShowListForm(false);
        showSuccess('Source list created!');
      } else {
        setError(data.error || 'Failed to create list');
      }
    } catch (err) {
      setError('Failed to create list');
    } finally {
      setSubmitting(false);
    }
  };
  
  // Toggle active status
  const toggleActive = async (source: Source) => {
    if (!user) return;
    
    try {
      const res = await fetch(`${API_URL}/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !source.isActive }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSources(sources.map(s => s.id === source.id ? { ...s, ...data.data } : s));
        showSuccess(`Source ${data.data.isActive ? 'activated' : 'deactivated'}`);
      } else {
        setError(data.error || 'Access denied');
      }
    } catch (err) {
      setError('Failed to update source');
    }
  };
  
  // Update reliability score
  const updateReliability = async (source: Source, score: number) => {
    if (!user) return;
    
    try {
      const res = await fetch(`${API_URL}/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reliabilityScore: score }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSources(sources.map(s => s.id === source.id ? { ...s, ...data.data } : s));
      }
    } catch (err) {
      setError('Failed to update reliability');
    }
  };
  
  // Delete source
  const confirmDeleteSource = async () => {
    if (!deleteId || !user) return;
    
    try {
      const res = await fetch(`${API_URL}/api/sources/${deleteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSources(sources.filter(s => s.id !== deleteId));
        showSuccess('Source deleted');
      } else {
        setError(data.error || 'Failed to delete source');
      }
    } catch (err) {
      setError('Failed to delete source');
    } finally {
      setDeleteId(null);
    }
  };
  
  // Delete list
  const confirmDeleteList = async () => {
    if (!deleteListId || !user) return;
    
    try {
      const res = await fetch(`${API_URL}/api/sources/lists/${deleteListId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSourceLists(sourceLists.filter(l => l.id !== deleteListId));
        showSuccess('Source list deleted');
      } else {
        setError(data.error || 'Failed to delete list');
      }
    } catch (err) {
      setError('Failed to delete list');
    } finally {
      setDeleteListId(null);
    }
  };
  
  // Get domain name by ID
  const getDomainName = (domainId: string | null) => {
    if (!domainId) return '—';
    const domain = domains.find(d => d.id === domainId);
    return domain?.name || 'Unknown';
  };
  
  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }
  
  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Please log in to manage your sources and source lists.
        </p>
        <a
          href="/login"
          className="px-6 py-3 bg-argus-600 hover:bg-argus-700 text-white rounded-lg inline-block"
        >
          Log In
        </a>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Manage Sources
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1 sm:mt-2">
            {isAdmin && <span className="text-argus-600 font-medium">Admin Mode • </span>}
            Manage your sources and source lists
          </p>
        </div>
        <div className="flex gap-3">
          <a 
            href="/sources" 
            className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            View All Sources
          </a>
        </div>
      </div>
      
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
      
      {/* Tabs */}
      <div className="flex flex-col sm:flex-row border-b border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap">
          <button
            onClick={() => setActiveTab('sources')}
            className={`px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-medium transition ${
              activeTab === 'sources'
                ? 'text-argus-600 border-b-2 border-argus-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Sources ({mySources.length})
          </button>
          <button
            onClick={() => setActiveTab('lists')}
            className={`px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-medium transition ${
              activeTab === 'lists'
                ? 'text-argus-600 border-b-2 border-argus-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Lists ({sourceLists.length})
          </button>
          <button
            onClick={() => setActiveTab('humint')}
            className={`px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-medium transition flex items-center gap-1 ${
              activeTab === 'humint'
                ? 'text-purple-600 border-b-2 border-purple-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            🎭 HUMINT ({humintSources.length})
          </button>
        </div>
        {isAdmin && (
          <span className="px-4 py-2 sm:py-3 sm:ml-auto text-xs sm:text-sm text-slate-500">
            👑 {globalSources.length} global
          </span>
        )}
      </div>
      
      {/* Sources Tab */}
      {activeTab === 'sources' && (
        <div className="space-y-6">
          {/* Add Source Button */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowSourceForm(!showSourceForm)}
              className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg transition"
            >
              {showSourceForm ? 'Cancel' : '+ Add Source'}
            </button>
          </div>
          
          {/* AI Source Assistant */}
          {showSourceForm && (
            <SourceAssistant 
              onSourceAdded={() => {
                fetchData();
                showSuccess('Source added successfully!');
              }} 
            />
          )}

          {/* Legacy form hidden behind link for manual entry */}
          {showSourceForm && (
            <details className="mt-4">
              <summary className="text-sm text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
                ⚙️ Advanced: Manual source entry
              </summary>
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 sm:p-6 mt-4">
                <h2 className="text-base sm:text-lg font-semibold mb-4">Manual Source Entry</h2>
                <form onSubmit={handleSubmitSource} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Name *</label>
                      <input
                        type="text"
                        value={sourceFormData.name}
                        onChange={(e) => setSourceFormData({ ...sourceFormData, name: e.target.value })}
                        required
                        className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-argus-500 outline-none"
                        placeholder="Source name"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">URL *</label>
                      <input
                        type="url"
                        value={sourceFormData.url}
                        onChange={(e) => setSourceFormData({ ...sourceFormData, url: e.target.value })}
                        required
                        className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-argus-500 outline-none"
                        placeholder="https://..."
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Type *</label>
                      <select
                        value={sourceFormData.type}
                        onChange={(e) => setSourceFormData({ ...sourceFormData, type: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-argus-500 outline-none"
                      >
                        {SOURCE_TYPES.map(type => (
                          <option key={type} value={type}>{type.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Domain</label>
                      <select
                        value={sourceFormData.domainId}
                        onChange={(e) => setSourceFormData({ ...sourceFormData, domainId: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-argus-500 outline-none"
                      >
                        <option value="">Select a domain...</option>
                        {domains.map(domain => (
                          <option key={domain.id} value={domain.id}>{domain.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1">
                        Reliability Score: {sourceFormData.reliabilityScore}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={sourceFormData.reliabilityScore}
                        onChange={(e) => setSourceFormData({ ...sourceFormData, reliabilityScore: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                    
                    {isAdmin && (
                      <div className="md:col-span-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={sourceFormData.asGlobal}
                            onChange={(e) => setSourceFormData({ ...sourceFormData, asGlobal: e.target.checked })}
                            className="rounded"
                          />
                          <span className="text-sm font-medium">Create as Global Source (visible to all users)</span>
                      </label>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSourceForm(false)}
                    className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-sm bg-argus-600 hover:bg-argus-700 text-white rounded-lg disabled:opacity-50"
                  >
                    {submitting ? 'Adding...' : 'Add Source'}
                  </button>
                </div>
              </form>
              </div>
            </details>
          )}
          
          {/* My Sources Table */}
          {mySources.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-700 px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-600">
                <h3 className="font-semibold">My Sources</h3>
              </div>
              <SourceTable
                sources={mySources}
                getDomainName={getDomainName}
                toggleActive={toggleActive}
                updateReliability={updateReliability}
                setDeleteId={setDeleteId}
                onAddToList={(source) => setAddToListSource({ id: source.id, name: source.name })}
              />
            </div>
          )}
          
          {mySources.length === 0 && !showSourceForm && (
            <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg shadow">
              <p className="text-slate-500 mb-4">You haven't created any sources yet.</p>
              <button
                onClick={() => setShowSourceForm(true)}
                className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg"
              >
                Add Your First Source
              </button>
            </div>
          )}
          
          {/* Admin: Global Sources */}
          {isAdmin && globalSources.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
              <div className="bg-blue-50 dark:bg-blue-900/30 px-6 py-3 border-b border-slate-200 dark:border-slate-600">
                <h3 className="font-semibold text-blue-700 dark:text-blue-300">👑 Global Sources (Admin)</h3>
              </div>
              <SourceTable
                sources={globalSources}
                getDomainName={getDomainName}
                toggleActive={toggleActive}
                updateReliability={updateReliability}
                setDeleteId={setDeleteId}
                onAddToList={(source) => setAddToListSource({ id: source.id, name: source.name })}
              />
            </div>
          )}
        </div>
      )}
      
      {/* Lists Tab */}
      {activeTab === 'lists' && (
        <div className="space-y-6">
          {/* Add List Button */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowListForm(!showListForm)}
              className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg transition"
            >
              {showListForm ? 'Cancel' : '+ Create Source List'}
            </button>
          </div>
          
          {/* Add List Form */}
          {showListForm && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold mb-4">Create Source List</h2>
              <form onSubmit={handleSubmitList} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input
                    type="text"
                    value={listFormData.name}
                    onChange={(e) => setListFormData({ ...listFormData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-argus-500 outline-none"
                    placeholder="e.g., China Tech Watch"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    value={listFormData.description}
                    onChange={(e) => setListFormData({ ...listFormData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-argus-500 outline-none"
                    rows={2}
                    placeholder="Describe what this list is for..."
                  />
                </div>
                
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={listFormData.isPublic}
                      onChange={(e) => setListFormData({ ...listFormData, isPublic: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm font-medium">Make this list public (others can view)</span>
                  </label>
                </div>
                
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setShowListForm(false)}
                    className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-sm bg-argus-600 hover:bg-argus-700 text-white rounded-lg disabled:opacity-50"
                  >
                    {submitting ? 'Creating...' : 'Create List'}
                  </button>
                </div>
              </form>
            </div>
          )}
          
          {/* Source Lists */}
          {sourceLists.length > 0 ? (
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sourceLists.map((list) => (
                <div key={list.id} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 sm:p-6">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h3 className="font-semibold text-base sm:text-lg">{list.name}</h3>
                    <div className="flex gap-2">
                      {list.isPublic && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded text-xs">
                          Public
                        </span>
                      )}
                    </div>
                  </div>
                  {list.description && (
                    <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">
                      {list.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-sm">
                      {list.itemCount} source{list.itemCount !== 1 ? 's' : ''}
                    </span>
                    <div className="flex gap-2">
                      <a
                        href={`/sources/lists/${list.id}`}
                        className="text-sm text-argus-600 hover:text-argus-700"
                      >
                        View
                      </a>
                      <button
                        onClick={() => setDeleteListId(list.id)}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg shadow">
              <p className="text-slate-500 mb-4">You haven't created any source lists yet.</p>
              <p className="text-slate-400 text-sm mb-4">
                Source lists let you organize sources into collections for different purposes.
              </p>
              <button
                onClick={() => setShowListForm(true)}
                className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg"
              >
                Create Your First List
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* HUMINT Tab */}
      {activeTab === 'humint' && (
        <div className="space-y-6">
          {/* Info Box */}
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <h3 className="font-semibold text-purple-800 dark:text-purple-200 mb-2 flex items-center gap-2">
              🎭 Human Intelligence Sources
            </h3>
            <p className="text-sm text-purple-700 dark:text-purple-300">
              Anonymous human sources providing on-the-ground intelligence. Add them to your source lists alongside RSS feeds and other traditional sources.
            </p>
          </div>

          {/* HUMINT Sources Grid */}
          {humintSources.length > 0 ? (
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
              {humintSources.map((source) => (
                <div key={source.codename} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">{source.codename}</h3>
                      {source.bio && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{source.bio}</p>
                      )}
                    </div>
                    <div className={`px-2 py-1 rounded text-xs font-bold ${
                      source.reputationScore >= 70 
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' 
                        : source.reputationScore >= 50
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      ⭐ {source.reputationScore}
                    </div>
                  </div>
                  
                  {/* Coverage Tags */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {source.regions.slice(0, 2).map((region) => (
                      <span key={region} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                        📍 {region}
                      </span>
                    ))}
                    {source.domains.slice(0, 2).map((domain) => (
                      <span key={domain} className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs">
                        {domain}
                      </span>
                    ))}
                  </div>
                  
                  {/* Stats */}
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                    <span>{source.totalSubmissions} posts</span>
                    <span>{source.subscriberCount} subscribers</span>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-2">
                    <a
                      href={`/sources/humint/${source.codename}`}
                      className="flex-1 px-3 py-1.5 text-center text-sm border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                    >
                      View Profile
                    </a>
                    <button
                      onClick={() => {
                        // TODO: Add to list modal for HUMINT sources
                        showSuccess('Adding HUMINT sources to lists coming soon!');
                      }}
                      className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded transition"
                    >
                      + List
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg shadow">
              <div className="text-4xl mb-4">🎭</div>
              <h3 className="text-lg font-semibold mb-2">No HUMINT Sources Yet</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                Human intelligence sources will appear here once registered.
              </p>
            </div>
          )}
          
          {/* Become a Source - Wallet Only */}
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">
              🔒 Want to become a HUMINT source?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              To protect your identity, HUMINT source registration requires <strong>anonymous wallet login</strong>. 
              Your real identity is never stored — only a codename and public key.
            </p>
            <p className="text-xs text-slate-500">
              Standard login (email/Google/Twitter) cannot register as a HUMINT source — this ensures true anonymity.
            </p>
          </div>
        </div>
      )}
      
      {/* Delete Source Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Source?</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              This action cannot be undone. The source will be permanently removed.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteSource}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete List Modal */}
      {deleteListId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Source List?</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              This action cannot be undone. The list and all its items will be removed.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteListId(null)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteList}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to List Modal */}
      <AddToListModal
        isOpen={addToListSource !== null}
        onClose={() => setAddToListSource(null)}
        sourceId={addToListSource?.id || ''}
        sourceName={addToListSource?.name || ''}
        onSuccess={() => {
          showSuccess('Source added to list!');
          fetchData(); // Refresh to update list counts
        }}
      />
    </div>
  );
}

// Source Table Component
function SourceTable({ 
  sources, 
  getDomainName, 
  toggleActive, 
  updateReliability, 
  setDeleteId,
  onAddToList,
}: {
  sources: Source[];
  getDomainName: (id: string | null) => string;
  toggleActive: (source: Source) => void;
  updateReliability: (source: Source, score: number) => void;
  setDeleteId: (id: string) => void;
  onAddToList: (source: Source) => void;
}) {
  return (
    <>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3 p-4">
        {sources.map((source) => (
          <div key={source.id} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 dark:text-white">{source.name}</div>
                <div className="text-xs text-slate-500 truncate">{source.url}</div>
              </div>
              <button
                onClick={() => toggleActive(source)}
                className={`w-10 h-6 rounded-full relative transition-colors shrink-0 ${
                  source.isActive ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    source.isActive ? 'left-5' : 'left-1'
                  }`}
                />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={source.type} />
              <span className="text-xs text-slate-500">{getDomainName(source.domainId)}</span>
            </div>
            <div className="flex items-center justify-between">
              <StarRating
                score={source.reliabilityScore}
                onChange={(score) => updateReliability(source, score)}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => onAddToList(source)}
                  className="text-argus-600 hover:text-argus-800 text-sm"
                >
                  + List
                </button>
                <button
                  onClick={() => setDeleteId(source.id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-700">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Domain</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Reliability</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {sources.map((source) => (
              <tr key={source.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleActive(source)}
                    className={`w-10 h-6 rounded-full relative transition-colors ${
                      source.isActive ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        source.isActive ? 'left-5' : 'left-1'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{source.name}</div>
                  <div className="text-xs text-slate-500 truncate max-w-xs">{source.url}</div>
                </td>
                <td className="px-4 py-3">
                  <TypeBadge type={source.type} />
                </td>
                <td className="px-4 py-3 text-sm">
                  {getDomainName(source.domainId)}
                </td>
                <td className="px-4 py-3">
                  <StarRating
                    score={source.reliabilityScore}
                    onChange={(score) => updateReliability(source, score)}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button
                      onClick={() => onAddToList(source)}
                      className="text-argus-600 hover:text-argus-800 text-sm"
                    >
                      + List
                    </button>
                    <button
                      onClick={() => setDeleteId(source.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
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

function StarRating({ score, onChange }: { score: number; onChange: (score: number) => void }) {
  // Normalize score: handle both 0-1 (legacy) and 0-100 formats
  const normalizedScore = score <= 1 ? Math.round(score * 100) : score;
  const stars = Math.round(normalizedScore / 20);
  
  const handleClick = (star: number) => {
    onChange(star * 20);
  };
  
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => handleClick(star)}
          className={`text-lg transition-colors ${
            star <= stars
              ? 'text-yellow-400 hover:text-yellow-500'
              : 'text-slate-300 hover:text-slate-400 dark:text-slate-600 dark:hover:text-slate-500'
          }`}
        >
          ★
        </button>
      ))}
      <span className="ml-2 text-xs text-slate-500">({normalizedScore})</span>
    </div>
  );
}
