'use client';

import { useState, useEffect } from 'react';

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
}

interface Domain {
  id: string;
  name: string;
  slug: string;
}

const SOURCE_TYPES = ['rss', 'youtube', 'web', 'twitter', 'telegram', 'podcast', 'government'];

export default function SourceManagePage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    type: 'rss',
    domainId: '',
    reliabilityScore: 50,
  });
  const [submitting, setSubmitting] = useState(false);
  
  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  // Fetch data
  useEffect(() => {
    fetchData();
  }, []);
  
  const fetchData = async () => {
    try {
      const [sourcesRes, domainsRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/sources`, { cache: 'no-store' }),
        fetch(`${API_URL}/api/v1/domains`, { cache: 'no-store' }),
      ]);
      
      const sourcesData = await sourcesRes.json();
      const domainsData = await domainsRes.json();
      
      setSources(sourcesData.data || []);
      setDomains(domainsData.data || []);
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
  
  // Create source
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/api/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          domainId: formData.domainId || null,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSources([data.data, ...sources]);
        setFormData({ name: '', url: '', type: 'rss', domainId: '', reliabilityScore: 50 });
        setShowForm(false);
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
  
  // Toggle active status
  const toggleActive = async (source: Source) => {
    try {
      const res = await fetch(`${API_URL}/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !source.isActive }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSources(sources.map(s => s.id === source.id ? data.data : s));
        showSuccess(`Source ${data.data.isActive ? 'activated' : 'deactivated'}`);
      }
    } catch (err) {
      setError('Failed to update source');
    }
  };
  
  // Update reliability score
  const updateReliability = async (source: Source, score: number) => {
    try {
      const res = await fetch(`${API_URL}/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reliabilityScore: score }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSources(sources.map(s => s.id === source.id ? data.data : s));
      }
    } catch (err) {
      setError('Failed to update reliability');
    }
  };
  
  // Delete source
  const confirmDelete = async () => {
    if (!deleteId) return;
    
    try {
      const res = await fetch(`${API_URL}/api/sources/${deleteId}`, {
        method: 'DELETE',
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
  
  // Get domain name by ID
  const getDomainName = (domainId: string | null) => {
    if (!domainId) return '—';
    const domain = domains.find(d => d.id === domainId);
    return domain?.name || 'Unknown';
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500">Loading sources...</div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Manage Sources
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Add, edit, and manage intelligence sources
          </p>
        </div>
        <div className="flex gap-3">
          <a 
            href="/sources" 
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            View Sources
          </a>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg transition"
          >
            {showForm ? 'Cancel' : '+ Add Source'}
          </button>
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
      
      {/* Add Form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Add New Source</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-argus-500 outline-none"
                  placeholder="Source name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">URL *</label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:ring-2 focus:ring-argus-500 outline-none"
                  placeholder="https://..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Type *</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
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
                  value={formData.domainId}
                  onChange={(e) => setFormData({ ...formData, domainId: e.target.value })}
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
                  Reliability Score: {formData.reliabilityScore}
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.reliabilityScore}
                  onChange={(e) => setFormData({ ...formData, reliabilityScore: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>0 - Unreliable</span>
                  <span>50 - Moderate</span>
                  <span>100 - Highly Reliable</span>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg disabled:opacity-50"
              >
                {submitting ? 'Adding...' : 'Add Source'}
              </button>
            </div>
          </form>
        </div>
      )}
      
      {/* Sources Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
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
                  <button
                    onClick={() => setDeleteId(source.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {sources.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            No sources yet. Add your first source above.
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Source?</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              This action cannot be undone. The source and its configuration will be permanently removed.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
  // Convert 0-100 score to 1-5 stars
  const stars = Math.round(score / 20);
  
  const handleClick = (star: number) => {
    // Convert 1-5 stars to 0-100 score
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
      <span className="ml-2 text-xs text-slate-500">({score})</span>
    </div>
  );
}
