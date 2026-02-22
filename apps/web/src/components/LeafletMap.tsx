'use client';

// @ts-expect-error - react-leaflet types issue with Next.js
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLngExpression } from 'leaflet';

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
  critical: { color: '#ef4444', pulse: true },
  high: { color: '#f97316', pulse: true },
  medium: { color: '#eab308', pulse: false },
  low: { color: '#6b7280', pulse: false },
};

const TREND_ICONS = {
  up: '🔺',
  down: '🔻',
  stable: '➡️',
};

function getMarkerColor(point: MapDataPoint): string {
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

interface LeafletMapProps {
  data: MapDataPoint[];
  onLocationClick?: (point: MapDataPoint) => void;
}

export default function LeafletMap({ data, onLocationClick }: LeafletMapProps) {
  const center: LatLngExpression = [30, 10];
  
  return (
    // @ts-expect-error - react-leaflet MapContainer props typing issue
    <MapContainer
      center={center}
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
      
      {data.map((point) => {
        const color = getMarkerColor(point);
        const radius = getMarkerRadius(point.articleCount);
        const style = IMPORTANCE_STYLES[point.importance];
        const markerCenter: LatLngExpression = [point.lat, point.lng];
        
        return (
          // @ts-expect-error - react-leaflet CircleMarker props typing issue
          <CircleMarker
            key={point.code}
            center={markerCenter}
            radius={radius}
            pathOptions={{
              color: color,
              fillColor: color,
              fillOpacity: 0.6,
              weight: style.pulse ? 2 : 1,
            }}
            eventHandlers={{
              click: () => onLocationClick?.(point),
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
  );
}
