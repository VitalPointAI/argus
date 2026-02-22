'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

// Dynamic import for Leaflet (SSR issues)
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import('react-leaflet').then((mod) => mod.CircleMarker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);
const Tooltip = dynamic(
  () => import('react-leaflet').then((mod) => mod.Tooltip),
  { ssr: false }
);

interface MapDataPoint {
  code: string;
  name: string;
  lat: number;
  lng: number;
  articleCount: number;
  topics: Record<string, number>;
  trend: 'up' | 'down' | 'stable';
  importance: 'critical' | 'high' | 'medium' | 'low';
  recentArticles: Array<{ id: string; title: string; topic: string }>;
}

interface TopicSummary {
  topic: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
}

const TOPIC_COLORS: Record<string, string> = {
  'Military': '#ef4444',
  'Defense': '#ef4444',
  'Nuclear': '#dc2626',
  'Conflict': '#f97316',
  'Cyber Security': '#22c55e',
  'Intelligence': '#8b5cf6',
  'China': '#eab308',
  'Russia': '#3b82f6',
  'Ukraine': '#0ea5e9',
  'Taiwan': '#06b6d4',
  'Israel': '#6366f1',
  'Gaza': '#ec4899',
  'Iran': '#f59e0b',
  'AI': '#10b981',
  'Technology': '#14b8a6',
  'Economy': '#84cc16',
  'Trade': '#a3e635',
  'Geopolitics': '#6b7280',
};

const IMPORTANCE_STYLES = {
  critical: { color: '#ef4444', pulse: true, size: 1.5 },
  high: { color: '#f97316', pulse: true, size: 1.2 },
  medium: { color: '#eab308', pulse: false, size: 1.0 },
  low: { color: '#6b7280', pulse: false, size: 0.8 },
};

const TREND_ICONS = {
  up: '🔺',
  down: '🔻',
  stable: '➡️',
};

function getMarkerColor(point: MapDataPoint): string {
  // Use primary topic color, or importance color
  const topTopics = Object.entries(point.topics).sort((a, b) => b[1] - a[1]);
  if (topTopics.length > 0) {
    return TOPIC_COLORS[topTopics[0][0]] || IMPORTANCE_STYLES[point.importance].color;
  }
  return IMPORTANCE_STYLES[point.importance].color;
}

function getMarkerRadius(articleCount: number): number {
  if (articleCount >= 100) return 25;
  if (articleCount >= 50) return 20;
  if (articleCount >= 20) return 15;
  if (articleCount >= 10) return 12;
  if (articleCount >= 5) return 10;
  return 8;
}

export default function GlobalMapPage() {
  const [mapData, setMapData] = useState<MapDataPoint[]>([]);
  const [topicSummary, setTopicSummary] = useState<TopicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<MapDataPoint | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [hoursBack, setHoursBack] = useState(48);
  const [mapReady, setMapReady] = useState(false);

  const fetchMapData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/map/data?hours=${hoursBack}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setMapData(data.data.locations);
        setTopicSummary(data.data.topicSummary);
      } else {
        setError(data.error || 'Failed to load map data');
      }
    } catch (err) {
      setError('Failed to load map data');
    } finally {
      setLoading(false);
    }
  }, [hoursBack]);

  useEffect(() => {
    fetchMapData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchMapData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMapData]);

  useEffect(() => {
    // Delay map render to avoid SSR issues
    const timer = setTimeout(() => setMapReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const toggleTopic = (topic: string) => {
    const newSelected = new Set(selectedTopics);
    if (newSelected.has(topic)) {
      newSelected.delete(topic);
    } else {
      newSelected.add(topic);
    }
    setSelectedTopics(newSelected);
  };

  const filteredData = selectedTopics.size > 0
    ? mapData.filter(point => 
        Object.keys(point.topics).some(t => selectedTopics.has(t))
      )
    : mapData;

  const hotspots = [...mapData]
    .sort((a, b) => {
      const importanceOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      if (importanceOrder[a.importance] !== importanceOrder[b.importance]) {
        return importanceOrder[a.importance] - importanceOrder[b.importance];
      }
      return b.articleCount - a.articleCount;
    })
    .slice(0, 8);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🌍</span>
          <h1 className="font-bold text-lg">ARGUS GLOBAL MONITOR</h1>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={hoursBack}
            onChange={(e) => setHoursBack(parseInt(e.target.value))}
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
          >
            <option value={24}>Last 24h</option>
            <option value={48}>Last 48h</option>
            <option value={72}>Last 72h</option>
            <option value={168}>Last 7 days</option>
          </select>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
            <span className="text-sm">LIVE</span>
          </div>
          <span className="text-sm text-slate-400">
            {new Date().toLocaleTimeString()} UTC
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Topic Filters */}
        <div className="w-48 bg-slate-800 text-white p-3 overflow-y-auto hidden lg:block">
          <h3 className="text-xs font-semibold text-slate-400 mb-2">TOPICS</h3>
          <div className="space-y-1">
            <button
              onClick={() => setSelectedTopics(new Set())}
              className={`w-full text-left px-2 py-1.5 rounded text-sm transition ${
                selectedTopics.size === 0 
                  ? 'bg-argus-600 text-white' 
                  : 'hover:bg-slate-700'
              }`}
            >
              ☐ All Topics
            </button>
            {topicSummary.slice(0, 15).map((t) => (
              <button
                key={t.topic}
                onClick={() => toggleTopic(t.topic)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm transition flex items-center justify-between ${
                  selectedTopics.has(t.topic) 
                    ? 'bg-argus-600 text-white' 
                    : 'hover:bg-slate-700'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: TOPIC_COLORS[t.topic] || '#6b7280' }}
                  ></span>
                  <span className="truncate">{t.topic}</span>
                </span>
                <span className="text-xs text-slate-400">{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative bg-slate-900">
          {loading && !mapReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-50">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-argus-500 border-t-transparent"></div>
            </div>
          )}
          
          {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded z-50">
              {error}
            </div>
          )}

          {mapReady && typeof window !== 'undefined' && (
            <MapContainer
              center={[30, 10]}
              zoom={2}
              style={{ height: '100%', width: '100%', background: '#1e293b' }}
              minZoom={2}
              maxZoom={8}
              worldCopyJump={true}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              />
              
              {filteredData.map((point) => {
                const color = getMarkerColor(point);
                const radius = getMarkerRadius(point.articleCount);
                const style = IMPORTANCE_STYLES[point.importance];
                
                return (
                  <CircleMarker
                    key={point.code}
                    center={[point.lat, point.lng]}
                    radius={radius}
                    pathOptions={{
                      color: color,
                      fillColor: color,
                      fillOpacity: 0.6,
                      weight: style.pulse ? 2 : 1,
                    }}
                    eventHandlers={{
                      click: () => setSelectedLocation(point),
                    }}
                  >
                    <Tooltip permanent={point.importance === 'critical'} direction="top">
                      <div className="text-xs font-medium">
                        {point.name} ({point.articleCount})
                      </div>
                    </Tooltip>
                    <Popup>
                      <div className="min-w-[200px]">
                        <h3 className="font-bold text-lg">{point.name}</h3>
                        <p className="text-sm text-slate-600 mb-2">
                          {point.articleCount} articles • {TREND_ICONS[point.trend]} {point.trend}
                        </p>
                        <div className="mb-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            point.importance === 'critical' ? 'bg-red-100 text-red-700' :
                            point.importance === 'high' ? 'bg-orange-100 text-orange-700' :
                            point.importance === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {point.importance.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-xs mb-2">
                          <strong>Topics:</strong> {Object.keys(point.topics).slice(0, 4).join(', ')}
                        </div>
                        <div className="border-t pt-2 mt-2">
                          <div className="text-xs font-medium mb-1">Recent:</div>
                          {point.recentArticles.slice(0, 3).map((a, i) => (
                            <div key={i} className="text-xs text-slate-600 truncate">
                              • {a.title}
                            </div>
                          ))}
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          )}
        </div>

        {/* Right Sidebar - Hotspots */}
        <div className="w-64 bg-slate-800 text-white p-3 overflow-y-auto hidden md:block">
          <h3 className="text-xs font-semibold text-slate-400 mb-2">HOTSPOTS</h3>
          <div className="space-y-2">
            {hotspots.map((point) => (
              <div 
                key={point.code}
                className="bg-slate-700 rounded-lg p-3 cursor-pointer hover:bg-slate-600 transition"
                onClick={() => setSelectedLocation(point)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    point.importance === 'critical' ? 'bg-red-500' :
                    point.importance === 'high' ? 'bg-orange-500' :
                    point.importance === 'medium' ? 'bg-yellow-500' :
                    'bg-slate-500'
                  }`}>
                    {point.importance.toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-400">
                    {TREND_ICONS[point.trend]}
                  </span>
                </div>
                <div className="font-medium">{point.name}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {point.articleCount} articles
                </div>
                <div className="text-xs text-slate-500 mt-1 truncate">
                  {Object.keys(point.topics).slice(0, 2).join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Stats Bar */}
      <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between border-t border-slate-700">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-slate-400">Locations: </span>
            <span className="font-bold">{filteredData.length}</span>
          </div>
          <div>
            <span className="text-slate-400">Critical: </span>
            <span className="font-bold text-red-400">
              {filteredData.filter(p => p.importance === 'critical').length}
            </span>
          </div>
          <div>
            <span className="text-slate-400">High: </span>
            <span className="font-bold text-orange-400">
              {filteredData.filter(p => p.importance === 'high').length}
            </span>
          </div>
        </div>
        <div className="text-xs text-slate-500">
          Updated: {new Date().toLocaleString()}
        </div>
      </div>
    </div>
  );
}
