'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ExecutiveBriefing from '@/components/ExecutiveBriefing';
import { useAuth } from '@/lib/auth';
import { getConfidenceDisplay } from '@/lib/confidence';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface BriefingProfile {
  id: string;
  name: string;
  filterConfig: {
    topics?: string[];
    excludeTopics?: string[];
    domains?: string[];
    excludeDomains?: string[];
    topicQuery?: string;
    sourceListIds?: string[];
  };
  settings: {
    format?: 'executive' | 'summary';
    hoursBack?: number;
    minConfidence?: number;
    maxArticles?: number;
    includeTTS?: boolean;
  };
  schedule: {
    enabled?: boolean;
    times?: string[];
    timezone?: string;
    days?: string[];
    channels?: string[];
    webhookUrl?: string;
    webhookSecret?: string;
  };
  lastGeneratedAt: string | null;
  generationCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SavedBriefing {
  id: string;
  title: string;
  type: string;
  content: string;
  createdAt: string;
}

interface StatsData {
  content?: {
    total: number;
    last24h: number;
    verified: number;
    averageConfidence: number;
  };
  sources?: number;
  domains?: number;
}

function StatCard({ title, value, subtitle }: { title: string; value: number | string; subtitle: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle}</div>
    </div>
  );
}

function FilterBadges({ filterConfig }: { filterConfig: BriefingProfile['filterConfig'] }) {
  const badges = [];
  if (filterConfig.topics?.length) {
    badges.push({ label: `Topics: ${filterConfig.topics.join(', ')}`, color: 'blue' });
  }
  if (filterConfig.excludeTopics?.length) {
    badges.push({ label: `❌ Topics: ${filterConfig.excludeTopics.join(', ')}`, color: 'red' });
  }
  if (filterConfig.domains?.length) {
    badges.push({ label: `Sources: ${filterConfig.domains.join(', ')}`, color: 'green' });
  }
  if (filterConfig.excludeDomains?.length) {
    badges.push({ label: `❌ Sources: ${filterConfig.excludeDomains.join(', ')}`, color: 'red' });
  }
  if (filterConfig.topicQuery) {
    badges.push({ label: `Search: "${filterConfig.topicQuery}"`, color: 'purple' });
  }
  
  if (badges.length === 0) {
    return <span className="text-slate-400 text-xs">All sources</span>;
  }
  
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  };
  
  return (
    <div className="flex flex-wrap gap-1">
      {badges.slice(0, 3).map((badge, i) => (
        <span key={i} className={`px-2 py-0.5 rounded text-xs ${colorClasses[badge.color]}`}>
          {badge.label.length > 30 ? badge.label.substring(0, 30) + '...' : badge.label}
        </span>
      ))}
      {badges.length > 3 && (
        <span className="text-xs text-slate-400">+{badges.length - 3} more</span>
      )}
    </div>
  );
}

export default function BriefingsPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Profiles state
  const [profiles, setProfiles] = useState<BriefingProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<BriefingProfile | null>(null);
  const [showCreateProfile, setShowCreateProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileFilterUrl, setNewProfileFilterUrl] = useState('');
  
  // Briefing state
  const [executiveBriefing, setExecutiveBriefing] = useState<any>(null);
  const [currentSavedBriefing, setCurrentSavedBriefing] = useState<SavedBriefing | null>(null);
  const [executiveHistory, setExecutiveHistory] = useState<SavedBriefing[]>([]);
  const [executiveLoading, setExecutiveLoading] = useState(false);
  const [executiveError, setExecutiveError] = useState<string | null>(null);
  const [generateFormat, setGenerateFormat] = useState<'executive' | 'summary'>('executive');
  
  // Quick generate (no profile)
  const [customFilterUrl, setCustomFilterUrl] = useState('');
  const [useCustomFilters, setUseCustomFilters] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'quick' | 'profiles'>('profiles');
  
  // Schedule editing
  const [showScheduleEditor, setShowScheduleEditor] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>(['05:00', '18:00']);
  const [scheduleTimezone, setScheduleTimezone] = useState('America/New_York');
  const [scheduleDays, setScheduleDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [scheduleChannels, setScheduleChannels] = useState<string[]>(['web']);

  // Source list selection for scheduled briefings
  const [sourceLists, setSourceLists] = useState<any[]>([]);
  const [selectedSourceListIds, setSelectedSourceListIds] = useState<string[]>([]);

  // Webhook delivery
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [rssCopied, setRssCopied] = useState(false);

  // Fetch profiles
  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/briefings/profiles`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success) {
        setProfiles(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch profiles:', error);
    }
  }, []);

  // Fetch history for a profile
  const fetchProfileHistory = useCallback(async (profileId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/briefings/profiles/${profileId}/history?limit=20`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success) {
        const history = data.data || [];
        setExecutiveHistory(history);
        
        // Auto-load the latest briefing if history exists
        if (history.length > 0) {
          const latest = history[0];
          loadHistoricalBriefing(latest.id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile history:', error);
    }
  }, []);

  // Fetch current saved executive briefing (for quick generate)
  const fetchCurrentExecutive = async () => {
    try {
      const res = await fetch(`${API_URL}/api/briefings/executive/current`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success && data.data) {
        setCurrentSavedBriefing(data.data);
        setExecutiveBriefing({
          title: data.data.title,
          markdownContent: data.data.content,
          savedAt: data.data.createdAt,
          briefingId: data.data.id,
        });
      }
    } catch (error) {
      console.error('Failed to fetch current briefing:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch executive briefing history (all, for quick generate)
  const fetchExecutiveHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/briefings/executive/history?limit=20`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success && data.data) {
        setExecutiveHistory(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch briefing history:', error);
    }
  };

  // Create a new profile
  const createProfile = async () => {
    if (!newProfileName.trim()) return;
    
    try {
      const res = await fetch(`${API_URL}/api/briefings/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newProfileName.trim(),
          filterUrl: newProfileFilterUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setProfiles([data.data, ...profiles]);
        setSelectedProfile(data.data);
        setShowCreateProfile(false);
        setNewProfileName('');
        setNewProfileFilterUrl('');
        fetchProfileHistory(data.data.id);
      } else {
        setExecutiveError(data.error || 'Failed to create profile');
      }
    } catch (error) {
      console.error('Failed to create profile:', error);
      setExecutiveError('Failed to create profile');
    }
  };

  // Delete a profile
  const deleteProfile = async (profileId: string) => {
    if (!confirm('Delete this briefing profile? History will be preserved but unlinked.')) return;
    
    try {
      const res = await fetch(`${API_URL}/api/briefings/profiles/${profileId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setProfiles(profiles.filter(p => p.id !== profileId));
        if (selectedProfile?.id === profileId) {
          setSelectedProfile(null);
          setExecutiveBriefing(null);
          setExecutiveHistory([]);
        }
      }
    } catch (error) {
      console.error('Failed to delete profile:', error);
    }
  };

  // Open schedule editor for a profile
  const openScheduleEditor = (profile: BriefingProfile) => {
    setScheduleEnabled(profile.schedule?.enabled || false);
    setScheduleTimes(profile.schedule?.times || ['05:00', '18:00']);
    setScheduleTimezone(profile.schedule?.timezone || 'America/New_York');
    setScheduleDays(profile.schedule?.days || ['mon', 'tue', 'wed', 'thu', 'fri']);
    setScheduleChannels(profile.schedule?.channels || ['web']);
    // Load source list IDs from filterConfig
    setSelectedSourceListIds(profile.filterConfig?.sourceListIds || []);
    // Load webhook settings from schedule
    setWebhookUrl(profile.schedule?.webhookUrl || '');
    setWebhookSecret(profile.schedule?.webhookSecret || '');
    setShowScheduleEditor(true);
  };

  // Save schedule for profile
  const saveSchedule = async () => {
    if (!selectedProfile) return;
    
    try {
      const res = await fetch(`${API_URL}/api/briefings/profiles/${selectedProfile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          schedule: {
            enabled: scheduleEnabled,
            times: scheduleTimes,
            timezone: scheduleTimezone,
            days: scheduleDays,
            channels: scheduleChannels,
            webhookUrl: webhookUrl || undefined,
            webhookSecret: webhookSecret || undefined,
          },
          filterConfig: {
            ...selectedProfile.filterConfig,
            sourceListIds: selectedSourceListIds.length > 0 ? selectedSourceListIds : undefined,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Update local state
        const updated = data.data;
        setProfiles(profiles.map(p => p.id === updated.id ? updated : p));
        setSelectedProfile(updated);
        setShowScheduleEditor(false);
      } else {
        setExecutiveError(data.error || 'Failed to save schedule');
      }
    } catch (error) {
      console.error('Failed to save schedule:', error);
      setExecutiveError('Failed to save schedule');
    }
  };

  // Toggle a day in schedule
  const toggleScheduleDay = (day: string) => {
    if (scheduleDays.includes(day)) {
      setScheduleDays(scheduleDays.filter(d => d !== day));
    } else {
      setScheduleDays([...scheduleDays, day]);
    }
  };

  // Add a time to schedule
  const addScheduleTime = () => {
    if (scheduleTimes.length < 4) {
      setScheduleTimes([...scheduleTimes, '12:00']);
    }
  };

  // Remove a time from schedule
  const removeScheduleTime = (index: number) => {
    if (scheduleTimes.length > 1) {
      setScheduleTimes(scheduleTimes.filter((_, i) => i !== index));
    }
  };

  // Update a time in schedule
  const updateScheduleTime = (index: number, value: string) => {
    const newTimes = [...scheduleTimes];
    newTimes[index] = value;
    setScheduleTimes(newTimes);
  };

  // Generate briefing for profile
  const generateForProfile = async (profile: BriefingProfile) => {
    setExecutiveLoading(true);
    setExecutiveError(null);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    
    try {
      const res = await fetch(`${API_URL}/api/briefings/profiles/${profile.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.success) {
        setExecutiveBriefing(data.data);
        // Refresh history and profiles
        fetchProfileHistory(profile.id);
        fetchProfiles();
      } else {
        setExecutiveError(data.error || 'Failed to generate briefing');
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setExecutiveError('Request timed out. The briefing is taking longer than expected.');
      } else {
        setExecutiveError(error.message || 'Failed to generate briefing');
      }
    } finally {
      setExecutiveLoading(false);
    }
  };

  // Quick generate (no profile)
  const generateExecutiveBriefing = async (format: 'executive' | 'summary' = 'executive') => {
    setExecutiveLoading(true);
    setExecutiveError(null);
    setGenerateFormat(format);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    
    try {
      const requestBody: Record<string, unknown> = {
        type: 'morning',
        hoursBack: 14,
        includeTTS: false,
        format: format,
      };
      
      if (useCustomFilters && customFilterUrl.trim()) {
        requestBody.filterUrl = customFilterUrl.trim();
      }
      
      const res = await fetch(`${API_URL}/api/briefings/executive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.success) {
        setExecutiveBriefing(data.data);
        if (data.data.saved) {
          setCurrentSavedBriefing({
            id: data.data.briefingId,
            title: data.data.title,
            type: format,
            content: data.data.markdownContent,
            createdAt: new Date().toISOString(),
          });
          fetchExecutiveHistory();
        }
      } else {
        setExecutiveError(data.error || 'Failed to generate briefing');
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setExecutiveError('Request timed out. The briefing is taking longer than expected.');
      } else {
        setExecutiveError(error.message || 'Failed to generate briefing');
      }
    } finally {
      setExecutiveLoading(false);
    }
  };

  // Load a specific briefing from history
  const loadHistoricalBriefing = async (id: string) => {
    setExecutiveLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/briefings/executive/${id}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success && data.data) {
        setExecutiveBriefing({
          title: data.data.title,
          markdownContent: data.data.content,
          savedAt: data.data.createdAt,
          briefingId: data.data.id,
          isHistorical: true,
        });
      }
    } catch (error) {
      console.error('Failed to load briefing:', error);
    } finally {
      setExecutiveLoading(false);
    }
  };

  // Select a profile
  const selectProfile = (profile: BriefingProfile) => {
    setSelectedProfile(profile);
    setExecutiveBriefing(null);
    fetchProfileHistory(profile.id);
  };

  
  // Fetch user source lists
  const fetchSourceLists = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/sources/lists/my`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setSourceLists(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch source lists:', error);
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const statsRes = await fetch(`${API_URL}/api/v1/stats`, { cache: 'no-store' });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData.success) {
            setStats(statsData.data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    }
    fetchData();
    fetchProfiles();
    fetchSourceLists();
    fetchCurrentExecutive();
  }, [fetchProfiles, fetchSourceLists]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Intelligence Briefings
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            AI-curated summaries from your sources
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <a
            href="/briefings/propaganda"
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
          >
            <span>🔍</span>
            Propaganda Analysis
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('profiles')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'profiles'
              ? 'border-argus-500 text-argus-600 dark:text-argus-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          📋 Saved Briefings
        </button>
        <button
          onClick={() => {
            setActiveTab('quick');
            setSelectedProfile(null);
            fetchExecutiveHistory();
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'quick'
              ? 'border-argus-500 text-argus-600 dark:text-argus-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          ⚡ Quick Generate
        </button>
      </div>

      {/* Platform Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            title="Articles"
            value={stats.content?.total || 0}
            subtitle={`${stats.content?.last24h || 0} in 24h`}
          />
          <StatCard
            title="Verified"
            value={stats.content?.verified || 0}
            subtitle={`${getConfidenceDisplay(stats.content?.averageConfidence || 0).label} confidence`}
          />
          <StatCard
            title="Sources"
            value={stats.sources || 0}
            subtitle="Active"
          />
          <StatCard
            title="Domains"
            value={stats.domains || 0}
            subtitle="Tracked"
          />
        </div>
      )}

      {/* Error Display */}
      {executiveError && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <div className="flex justify-between items-start">
            <div>
              <strong>Error:</strong> {executiveError}
            </div>
            <button 
              onClick={() => setExecutiveError(null)}
              className="text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {activeTab === 'profiles' ? (
        /* Profiles Tab */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Profiles Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sticky top-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <span>📋</span> Briefing Profiles
                </h3>
                <button
                  onClick={() => setShowCreateProfile(true)}
                  className="text-argus-600 hover:text-argus-700 dark:text-argus-400 text-sm font-medium"
                >
                  + New
                </button>
              </div>
              
              {/* Create Profile Form */}
              {showCreateProfile && (
                <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-3">
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="Profile name (e.g., China Watch)"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                  />
                  <input
                    type="text"
                    value={newProfileFilterUrl}
                    onChange={(e) => setNewProfileFilterUrl(e.target.value)}
                    placeholder="Paste filter URL from dashboard (optional)"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={createProfile}
                      disabled={!newProfileName.trim()}
                      className="flex-1 px-3 py-1.5 bg-argus-600 hover:bg-argus-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateProfile(false);
                        setNewProfileName('');
                        setNewProfileFilterUrl('');
                      }}
                      className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              
              {/* Profile List */}
              {profiles.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
                  No profiles yet. Create one to save your filter configs.
                </p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {profiles.map((profile) => {
                    const isActive = selectedProfile?.id === profile.id;
                    return (
                      <div
                        key={profile.id}
                        className={`p-3 rounded-lg text-sm transition cursor-pointer ${
                          isActive 
                            ? 'bg-argus-100 dark:bg-argus-900/30 border border-argus-300 dark:border-argus-700'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-transparent'
                        }`}
                        onClick={() => selectProfile(profile)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {profile.name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteProfile(profile.id);
                            }}
                            className="text-slate-400 hover:text-red-500 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                        <FilterBadges filterConfig={profile.filterConfig} />
                        <div className="text-xs text-slate-400 mt-1">
                          {profile.generationCount} briefings
                          {profile.lastGeneratedAt && (
                            <> • Last: {new Date(profile.lastGeneratedAt).toLocaleDateString()}</>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Schedule Info */}
              {selectedProfile?.schedule?.enabled && (
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                    📅 Scheduled Delivery
                  </div>
                  <div className="text-xs text-amber-600 dark:text-amber-500">
                    {selectedProfile.schedule.times?.join(', ')} ({selectedProfile.schedule.timezone})
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {selectedProfile ? (
              <div className="space-y-4">
                {/* Profile Header */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                        {selectedProfile.name}
                      </h2>
                      <div className="mt-1">
                        <FilterBadges filterConfig={selectedProfile.filterConfig} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openScheduleEditor(selectedProfile)}
                        className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium text-sm transition-colors flex items-center gap-1"
                      >
                        <span>📅</span>
                        <span className="hidden sm:inline">Schedule</span>
                      </button>
                      <button
                        onClick={() => generateForProfile(selectedProfile)}
                        disabled={executiveLoading}
                        className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {executiveLoading ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        ) : (
                          <span>📊</span>
                        )}
                        Generate Briefing
                      </button>
                    </div>
                  </div>
                  
                  {/* Settings & Schedule */}
                  <div className="mt-4 flex flex-wrap gap-4 text-sm">
                    <div className="text-slate-500 dark:text-slate-400">
                      <span className="font-medium">Settings:</span>{' '}
                      {selectedProfile.settings.hoursBack || 14}h back,{' '}
                      {selectedProfile.settings.maxArticles || 100} max articles
                    </div>
                    {selectedProfile.schedule?.enabled && (
                      <div className="text-amber-600 dark:text-amber-400">
                        <span className="font-medium">Schedule:</span>{' '}
                        {selectedProfile.schedule.times?.join(', ')} ({selectedProfile.schedule.timezone})
                      </div>
                    )}
                  </div>
                  
                  {/* RSS Feed URL */}
                  {(selectedProfile.filterConfig.topics?.length || 
                    selectedProfile.filterConfig.excludeTopics?.length || 
                    selectedProfile.filterConfig.domains?.length || 
                    selectedProfile.filterConfig.excludeDomains?.length ||
                    selectedProfile.filterConfig.topicQuery) && (
                    <div className="mt-3 p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-orange-600 dark:text-orange-400 font-medium">📡 RSS Feed:</span>
                        <code className="flex-1 bg-white dark:bg-slate-800 px-2 py-1 rounded text-[10px] text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-nowrap">
                          {`${API_URL}/api/rss/filter?${[
                            selectedProfile.filterConfig.topics?.length && `topics=${selectedProfile.filterConfig.topics.join(',')}`,
                            selectedProfile.filterConfig.excludeTopics?.length && `excludeTopics=${selectedProfile.filterConfig.excludeTopics.join(',')}`,
                            selectedProfile.filterConfig.domains?.length && `domains=${selectedProfile.filterConfig.domains.join(',')}`,
                            selectedProfile.filterConfig.excludeDomains?.length && `excludeDomains=${selectedProfile.filterConfig.excludeDomains.join(',')}`,
                            selectedProfile.filterConfig.topicQuery && `q=${encodeURIComponent(selectedProfile.filterConfig.topicQuery)}`,
                          ].filter(Boolean).join('&')}`}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${API_URL}/api/rss/filter?${[
                              selectedProfile.filterConfig.topics?.length && `topics=${selectedProfile.filterConfig.topics.join(',')}`,
                              selectedProfile.filterConfig.excludeTopics?.length && `excludeTopics=${selectedProfile.filterConfig.excludeTopics.join(',')}`,
                              selectedProfile.filterConfig.domains?.length && `domains=${selectedProfile.filterConfig.domains.join(',')}`,
                              selectedProfile.filterConfig.excludeDomains?.length && `excludeDomains=${selectedProfile.filterConfig.excludeDomains.join(',')}`,
                              selectedProfile.filterConfig.topicQuery && `q=${encodeURIComponent(selectedProfile.filterConfig.topicQuery)}`,
                            ].filter(Boolean).join('&')}`;
                            navigator.clipboard.writeText(url);
                            setRssCopied(true);
                            setTimeout(() => setRssCopied(false), 2000);
                          }}
                          className={`px-2 py-1 rounded text-xs transition-colors ${
                            rssCopied 
                              ? 'bg-green-100 dark:bg-green-800/30 text-green-600 dark:text-green-400' 
                              : 'bg-orange-100 dark:bg-orange-800/30 text-orange-600 dark:text-orange-400 hover:bg-orange-200'
                          }`}
                        >
                          {rssCopied ? '✓ Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* History & Content */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  {/* History */}
                  <div className="lg:col-span-1">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-3 text-sm flex items-center gap-2">
                        <span>📜</span> History
                      </h3>
                      {executiveHistory.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
                          No briefings yet
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                          {executiveHistory.map((item) => {
                            const date = new Date(item.createdAt);
                            const isActive = executiveBriefing?.briefingId === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => loadHistoricalBriefing(item.id)}
                                className={`w-full text-left p-2 rounded-lg text-sm transition ${
                                  isActive 
                                    ? 'bg-argus-100 dark:bg-argus-900/30 border border-argus-300 dark:border-argus-700'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-transparent'
                                }`}
                              >
                                <div className="font-medium text-slate-700 dark:text-slate-300">
                                  {date.toLocaleDateString('en-US', { 
                                    weekday: 'short', 
                                    month: 'short', 
                                    day: 'numeric',
                                  })}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {date.toLocaleTimeString('en-US', { 
                                    hour: '2-digit', 
                                    minute: '2-digit',
                                  })}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Briefing Content */}
                  <div className="lg:col-span-3">
                    {loading ? (
                      <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-10 w-10 border-4 border-argus-500 border-t-transparent"></div>
                      </div>
                    ) : executiveBriefing ? (
                      <ExecutiveBriefing 
                        briefing={executiveBriefing}
                        onGenerate={() => generateForProfile(selectedProfile)}
                        loading={executiveLoading}
                        hideGenerateCard={true}
                      />
                    ) : (
                      <div className="bg-gradient-to-br from-argus-50 to-white dark:from-argus-900/20 dark:to-slate-800 rounded-2xl shadow-lg border border-argus-200 dark:border-argus-800/50 p-8 text-center">
                        <div className="text-6xl mb-4">📋</div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                          Generate Your First Briefing
                        </h2>
                        <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-6">
                          Click "Generate Briefing" above to create an intelligence briefing with your saved filters.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* No profile selected */
              <div className="bg-gradient-to-br from-argus-50 to-white dark:from-argus-900/20 dark:to-slate-800 rounded-2xl shadow-lg border border-argus-200 dark:border-argus-800/50 p-8 text-center">
                <div className="text-6xl mb-4">📋</div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  Saved Briefing Profiles
                </h2>
                <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-6">
                  Create profiles to save your filter configurations. Each profile has its own history, schedule, and settings.
                </p>
                <button
                  onClick={() => setShowCreateProfile(true)}
                  className="px-6 py-3 bg-argus-600 hover:bg-argus-700 text-white rounded-lg font-medium transition-colors"
                >
                  + Create Your First Profile
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Quick Generate Tab */
        <div className="space-y-6">
          {/* Custom Filter Input */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomFilters}
                    onChange={(e) => setUseCustomFilters(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">Use custom filters</span>
                </label>
                <span className="text-xs text-slate-500">
                  Generate from filtered RSS instead of your source list
                </span>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => generateExecutiveBriefing('summary')}
                  disabled={executiveLoading}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {executiveLoading && generateFormat === 'summary' ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-500 border-t-transparent"></div>
                  ) : (
                    <span>📝</span>
                  )}
                  Summary
                </button>
                <button
                  onClick={() => generateExecutiveBriefing('executive')}
                  disabled={executiveLoading}
                  className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {executiveLoading && generateFormat === 'executive' ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  ) : (
                    <span>📊</span>
                  )}
                  Executive
                </button>
              </div>
            </div>
            
            {useCustomFilters && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Filter URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customFilterUrl}
                      onChange={(e) => setCustomFilterUrl(e.target.value)}
                      placeholder="Paste RSS filter URL from dashboard"
                      className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                    />
                    <a
                      href="/dashboard"
                      target="_blank"
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600"
                    >
                      📋 Create Filter
                    </a>
                  </div>
                </div>
                
                {customFilterUrl && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm">
                    <span className="font-medium">Filter Preview:</span>{' '}
                    {(() => {
                      try {
                        const url = new URL(customFilterUrl);
                        const params = url.searchParams;
                        const parts = [];
                        if (params.get('topics')) parts.push(`Topics: ${params.get('topics')}`);
                        if (params.get('excludeTopics')) parts.push(`Exclude: ${params.get('excludeTopics')}`);
                        if (params.get('domains')) parts.push(`Sources: ${params.get('domains')}`);
                        if (params.get('excludeDomains')) parts.push(`Exclude sources: ${params.get('excludeDomains')}`);
                        if (params.get('topicQuery')) parts.push(`Search: "${params.get('topicQuery')}"`);
                        return parts.length > 0 ? parts.join(' • ') : 'No filters detected';
                      } catch {
                        return 'Invalid URL';
                      }
                    })()}
                  </div>
                )}
                
                {/* Save as Profile option */}
                {customFilterUrl && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Want to save this filter?</span>
                    <button
                      onClick={() => {
                        setNewProfileFilterUrl(customFilterUrl);
                        setShowCreateProfile(true);
                        setActiveTab('profiles');
                      }}
                      className="text-argus-600 hover:text-argus-700 dark:text-argus-400 font-medium"
                    >
                      Create Profile →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* History Sidebar */}
            <div className="lg:col-span-1 order-2 lg:order-1">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sticky top-4">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-3 text-sm flex items-center gap-2">
                  <span>📜</span> Recent Briefings
                </h3>
                {executiveHistory.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
                    No history yet
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {executiveHistory.map((item) => {
                      const date = new Date(item.createdAt);
                      const isActive = executiveBriefing?.briefingId === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => loadHistoricalBriefing(item.id)}
                          className={`w-full text-left p-3 rounded-lg text-sm transition ${
                            isActive 
                              ? 'bg-argus-100 dark:bg-argus-900/30 border border-argus-300 dark:border-argus-700'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-transparent'
                          }`}
                        >
                          <div className="font-medium text-slate-700 dark:text-slate-300">
                            {date.toLocaleDateString('en-US', { 
                              weekday: 'short', 
                              month: 'short', 
                              day: 'numeric',
                            })}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {date.toLocaleTimeString('en-US', { 
                              hour: '2-digit', 
                              minute: '2-digit',
                            })}
                            {item.type && (
                              <span className="ml-2 capitalize">• {item.type}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Main Briefing Content */}
            <div className="lg:col-span-3 order-1 lg:order-2">
              {executiveBriefing?.savedAt && !executiveLoading && (
                <div className="mb-4 flex items-center justify-between text-sm">
                  <div className="text-slate-500 dark:text-slate-400">
                    {executiveBriefing.isHistorical ? '📜 Viewing briefing from' : '📋 Latest briefing from'}{' '}
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {new Date(executiveBriefing.savedAt).toLocaleString()}
                    </span>
                  </div>
                  {executiveBriefing.isHistorical && currentSavedBriefing && (
                    <button
                      onClick={() => {
                        setExecutiveBriefing({
                          title: currentSavedBriefing.title,
                          markdownContent: currentSavedBriefing.content,
                          savedAt: currentSavedBriefing.createdAt,
                          briefingId: currentSavedBriefing.id,
                        });
                      }}
                      className="text-argus-600 hover:text-argus-700 dark:text-argus-400 font-medium"
                    >
                      ← Back to latest
                    </button>
                  )}
                </div>
              )}
              
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-argus-500 border-t-transparent"></div>
                </div>
              ) : executiveBriefing ? (
                <ExecutiveBriefing 
                  briefing={executiveBriefing}
                  onGenerate={() => generateExecutiveBriefing('executive')}
                  loading={executiveLoading}
                  hideGenerateCard={true}
                />
              ) : (
                <div className="bg-gradient-to-br from-argus-50 to-white dark:from-argus-900/20 dark:to-slate-800 rounded-2xl shadow-lg border border-argus-200 dark:border-argus-800/50 p-8 text-center">
                  <div className="text-6xl mb-4">📋</div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                    Quick Generate
                  </h2>
                  <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-6">
                    Generate a one-off briefing. Use custom filters or your default source list.
                  </p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => generateExecutiveBriefing('summary')}
                      disabled={executiveLoading}
                      className="px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      📝 Quick Summary
                    </button>
                    <button
                      onClick={() => generateExecutiveBriefing('executive')}
                      disabled={executiveLoading}
                      className="px-6 py-3 bg-argus-600 hover:bg-argus-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      📊 Full Executive
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Briefing Schedule Info */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-4">
            <span className="text-slate-500 dark:text-slate-400">Default delivery:</span>
            <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs font-medium">
              🌅 5:00 AM
            </span>
            <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded text-xs font-medium">
              🌆 6:00 PM
            </span>
          </div>
          <span className="text-slate-400 text-xs">
            Configure per-profile schedules in profile settings
          </span>
        </div>
      </div>

      {/* Schedule Editor Modal */}
      {showScheduleEditor && selectedProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  📅 Schedule: {selectedProfile.name}
                </h3>
                <button
                  onClick={() => setShowScheduleEditor(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  ✕
                </button>
              </div>

              {/* Enable/Disable */}
              <div className="mb-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-argus-600 focus:ring-argus-500"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Enable automatic briefing generation
                  </span>
                </label>
              </div>

              {scheduleEnabled && (
                <>
                  {/* Delivery Times */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Delivery Times
                    </label>
                    <div className="space-y-2">
                      {scheduleTimes.map((time, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="time"
                            value={time}
                            onChange={(e) => updateScheduleTime(index, e.target.value)}
                            className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                          />
                          {scheduleTimes.length > 1 && (
                            <button
                              onClick={() => removeScheduleTime(index)}
                              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      {scheduleTimes.length < 4 && (
                        <button
                          onClick={addScheduleTime}
                          className="text-sm text-argus-600 hover:text-argus-700 dark:text-argus-400"
                        >
                          + Add another time
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Timezone */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Timezone
                    </label>
                    <select
                      value={scheduleTimezone}
                      onChange={(e) => setScheduleTimezone(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="America/New_York">Eastern (ET)</option>
                      <option value="America/Chicago">Central (CT)</option>
                      <option value="America/Denver">Mountain (MT)</option>
                      <option value="America/Los_Angeles">Pacific (PT)</option>
                      <option value="UTC">UTC</option>
                      <option value="Europe/London">London (GMT/BST)</option>
                      <option value="Europe/Paris">Paris (CET)</option>
                      <option value="Asia/Tokyo">Tokyo (JST)</option>
                    </select>
                  </div>

                  {/* Days */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Active Days
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => (
                        <button
                          key={day}
                          onClick={() => toggleScheduleDay(day)}
                          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                            scheduleDays.includes(day)
                              ? 'bg-argus-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {day.charAt(0).toUpperCase() + day.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Delivery Channels */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Delivery Channels
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleChannels.includes('web')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setScheduleChannels([...scheduleChannels, 'web']);
                            } else {
                              setScheduleChannels(scheduleChannels.filter(c => c !== 'web'));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-argus-600"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-400">🌐 Web (save to history)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleChannels.includes('telegram')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setScheduleChannels([...scheduleChannels, 'telegram']);
                            } else {
                              setScheduleChannels(scheduleChannels.filter(c => c !== 'telegram'));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-argus-600"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-400">📱 Telegram (if configured)</span>
                      </label>
                    </div>
                  </div>

                  {/* Source Lists */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      📋 Source Lists (optional)
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      Filter briefings to sources from specific lists
                    </p>
                    {sourceLists.length === 0 ? (
                      <p className="text-sm text-slate-400 italic">No source lists created yet</p>
                    ) : (
                      <div className="space-y-2 max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-lg p-2">
                        {sourceLists.map((list) => (
                          <label key={list.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedSourceListIds.includes(list.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSourceListIds([...selectedSourceListIds, list.id]);
                                } else {
                                  setSelectedSourceListIds(selectedSourceListIds.filter(id => id !== list.id));
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-argus-600"
                            />
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {list.name} ({list.itemCount || 0} sources)
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Webhook Delivery */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      🔗 Webhook Delivery (optional)
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      POST briefings to a custom endpoint
                    </p>
                    <input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://your-server.com/webhook"
                      className="w-full px-3 py-2 mb-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                    />
                    {webhookUrl && (
                      <input
                        type="text"
                        value={webhookSecret}
                        onChange={(e) => setWebhookSecret(e.target.value)}
                        placeholder="Webhook secret (for HMAC signature)"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                      />
                    )}
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setShowScheduleEditor(false)}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSchedule}
                  className="flex-1 px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg font-medium"
                >
                  Save Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
