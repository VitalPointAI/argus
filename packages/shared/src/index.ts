// Argus Shared Types

// ============ Domains ============
export interface Domain {
  id: string;
  name: string;
  slug: string;
  description: string;
  isBuiltIn: boolean;
  createdAt: Date;
}

// ============ Sources ============
export type SourceType = 
  | 'rss' 
  | 'web' 
  | 'twitter' 
  | 'telegram' 
  | 'youtube' 
  | 'podcast' 
  | 'government';

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  domainId: string;
  reliabilityScore: number; // 0-100, updated over time
  isActive: boolean;
  lastFetchedAt: Date | null;
  createdAt: Date;
}

export interface SourceList {
  id: string;
  userId: string;
  name: string;
  description: string;
  isPublic: boolean;
  cloneCount: number;
  rating: number; // average rating 0-5
  createdAt: Date;
}

// ============ Content ============
export interface Content {
  id: string;
  sourceId: string;
  externalId: string; // original ID from source
  title: string;
  body: string;
  url: string;
  author: string | null;
  publishedAt: Date;
  fetchedAt: Date;
  confidenceScore: number | null; // 0-100, null if not yet verified
  verificationId: string | null;
}

// ============ Verification ============
export interface Verification {
  id: string;
  contentId: string;
  confidenceScore: number; // 0-100
  crossReferenceCount: number;
  misinfoMarkers: string[];
  factCheckResults: FactCheckResult[];
  reasoning: string; // LLM explanation
  verifiedAt: Date;
}

export interface FactCheckResult {
  claim: string;
  verdict: 'true' | 'false' | 'mixed' | 'unverified';
  sources: string[];
  confidence: number;
}

// ============ Intelligence ============
export interface Briefing {
  id: string;
  userId: string;
  type: 'morning' | 'evening' | 'alert';
  summary: string;
  changes: Change[];
  forecasts: Forecast[];
  contentIds: string[];
  generatedAt: Date;
  deliveredAt: Date | null;
  deliveryChannels: DeliveryChannel[];
}

export interface Change {
  domain: string;
  description: string;
  significance: 'low' | 'medium' | 'high';
  contentId: string;
}

export interface Forecast {
  event: string;
  probability: number; // 0-100
  timeframe: 'near' | 'mid' | 'long'; // <1 week, 1-4 weeks, 1-6 months
  reasoning: string;
  confidence: number;
}

export type DeliveryChannel = 'telegram' | 'email' | 'web';

// ============ User ============
export interface User {
  id: string;
  email: string;
  name: string;
  preferences: UserPreferences;
  createdAt: Date;
}

export interface UserPreferences {
  domains: string[]; // domain IDs
  deliveryChannels: DeliveryChannel[];
  briefingSchedule: {
    morning: string | null; // "06:00" or null
    evening: string | null; // "18:00" or null
  };
  realTimeAlerts: boolean;
  minConfidenceThreshold: number; // 0-100
  briefingFormat: 'detailed' | 'headlines';
  timezone: string;
}

// ============ API Types ============
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}
