'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface BriefingData {
  id: string;
  type: string;
  summary: string;
  changes: any[];
  forecasts: any[];
  generatedAt: string;
  deliveredAt: string | null;
}

interface ParsedBriefing {
  metadata: {
    type: string;
    sources: string;
    confidence: number;
  };
  verified: DevelopmentItem[];
  unverified: DevelopmentItem[];
  citations: Citation[];
}

interface DevelopmentItem {
  text: string;
  source: string;
  confidence: number;
  contentId?: string;
  url?: string;
}

interface Citation {
  title: string;
  source: string;
  url?: string;
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

interface BriefingHistoryItem {
  id: string;
  type: string;
  summary: string;
  generatedAt: string;
  deliveredAt: string | null;
}

function parseBriefingSummary(summary: string): ParsedBriefing {
  const result: ParsedBriefing = {
    metadata: { type: '', sources: '', confidence: 0 },
    verified: [],
    unverified: [],
    citations: [],
  };

  // Remove markdown dividers
  const content = summary.replace(/^---\n?|\n?---$/g, '').trim();
  
  // Extract metadata
  const typeMatch = content.match(/Type:\s*(\w+)/);
  const sourcesMatch = content.match(/Sources:\s*(\d+)\s*articles?/);
  const confidenceMatch = content.match(/Confidence:\s*(\d+)%/);
  
  if (typeMatch) result.metadata.type = typeMatch[1];
  if (sourcesMatch) result.metadata.sources = sourcesMatch[1];
  if (confidenceMatch) result.metadata.confidence = parseInt(confidenceMatch[1]);

  // Extract verified developments
  const verifiedSection = content.match(/\*\*VERIFIED DEVELOPMENTS\*\*\n([\s\S]*?)(?=\n\*\*(?:UNVERIFIED|CITATIONS)|$)/);
  if (verifiedSection) {
    const items = verifiedSection[1].match(/• (.+?) \(([^)]+)\) \[(\d+)%\]/g) || [];
    result.verified = items.map(item => {
      const match = item.match(/• (.+?) \(([^)]+)\) \[(\d+)%\]/);
      return match ? {
        text: match[1],
        source: match[2],
        confidence: parseInt(match[3]),
      } : { text: item, source: '', confidence: 0 };
    });
  }

  // Extract unverified reports
  const unverifiedSection = content.match(/\*\*UNVERIFIED REPORTS\*\*[^\n]*\n([\s\S]*?)(?=\n\*\*CITATIONS|$)/);
  if (unverifiedSection) {
    const items = unverifiedSection[1].match(/• ⚠ (.+?) \(([^)]+)\) \[(\d+)%\]/g) || [];
    result.unverified = items.map(item => {
      const match = item.match(/• ⚠ (.+?) \(([^)]+)\) \[(\d+)%\]/);
      return match ? {
        text: match[1],
        source: match[2],
        confidence: parseInt(match[3]),
      } : { text: item, source: '', confidence: 0 };
    });
  }

  // Extract citations
  const citationsSection = content.match(/\*\*CITATIONS\*\*\n([\s\S]*?)$/);
  if (citationsSection) {
    const items = citationsSection[1].match(/• "([^"]+)" - ([^-\n]+) - (URL|https?:\/\/[^\s]+)/g) || [];
    result.citations = items.map(item => {
      const match = item.match(/• "([^"]+)" - ([^-]+) - (URL|https?:\/\/[^\s]+)/);
      return match ? {
        title: match[1].trim(),
        source: match[2].trim(),
        url: match[3] === 'URL' ? undefined : match[3].trim(),
      } : { title: item, source: '' };
    });
  }

  return result;
}

function extractBriefingStats(summary: string): { articleCount: number; confidence: number } {
  const sourcesMatch = summary.match(/Sources:\s*(\d+)/);
  const confidenceMatch = summary.match(/Confidence:\s*(\d+)%/);
  return {
    articleCount: sourcesMatch ? parseInt(sourcesMatch[1]) : 0,
    confidence: confidenceMatch ? parseInt(confidenceMatch[1]) : 0,
  };
}

function ConfidenceBadge({ confidence, size = 'sm' }: { confidence: number; size?: 'sm' | 'md' | 'lg' }) {
  const getColor = (conf: number) => {
    if (conf >= 80) return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', ring: 'ring-green-500/30' };
    if (conf >= 60) return { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', ring: 'ring-yellow-500/30' };
    return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', ring: 'ring-red-500/30' };
  };
  
  const colors = getColor(confidence);
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ${colors.bg} ${colors.text} ${colors.ring} ${sizeClasses[size]}`}>
      <span className="font-bold">{confidence}%</span>
    </span>
  );
}

interface Claim {
  id: string;
  text: string;
  confidence: number;
  status: 'verified' | 'partially_verified' | 'unverified' | 'contradicted';
  method: string | null;
  verifiedBy: string[];
  contradictedBy: string[];
}

function ClaimItem({ claim, isExpanded, onToggle }: { claim: Claim; isExpanded: boolean; onToggle: () => void }) {
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'verified':
        return { icon: '✓', label: 'Verified', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' };
      case 'partially_verified':
        return { icon: '◐', label: 'Partially Verified', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30' };
      case 'contradicted':
        return { icon: '✗', label: 'Contradicted', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' };
      default:
        return { icon: '?', label: 'Unverified', color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-700' };
    }
  };

  const statusInfo = getStatusInfo(claim.status);

  return (
    <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
      <button 
        onClick={onToggle}
        className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-start gap-3"
      >
        <span className={`flex-shrink-0 w-6 h-6 rounded-full ${statusInfo.bg} flex items-center justify-center ${statusInfo.color} text-sm font-bold`}>
          {statusInfo.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">{claim.text}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="text-xs text-slate-500">{claim.confidence}% confidence</span>
          </div>
        </div>
        <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
      </button>
      
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
          {claim.method && (
            <div className="mt-2">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Verification Method</div>
              <p className="text-xs text-slate-600 dark:text-slate-300">{claim.method}</p>
            </div>
          )}
          
          {claim.verifiedBy && claim.verifiedBy.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Corroborated by</div>
              <div className="flex flex-wrap gap-1">
                {claim.verifiedBy.map((source, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                    {source}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {claim.contradictedBy && claim.contradictedBy.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Contradicted by</div>
              <div className="flex flex-wrap gap-1">
                {claim.contradictedBy.map((source, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                    {source}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${
                  claim.confidence >= 80 ? 'bg-green-500' : 
                  claim.confidence >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${claim.confidence}%` }}
              />
            </div>
            <span className="text-xs font-medium text-slate-500">{claim.confidence}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function FactVerificationModal({ 
  item, 
  isOpen, 
  onClose 
}: { 
  item: DevelopmentItem; 
  isOpen: boolean; 
  onClose: () => void;
}) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [expandedClaim, setExpandedClaim] = useState<string | null>(null);
  const [skipSuggested, setSkipSuggested] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [verificationData, setVerificationData] = useState<any>(null);

  // Fetch existing claims from API - uses real claims when contentId is available
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setClaims([]);
      setSkipSuggested(false);
      setVerificationData(null);
      
      const fetchClaims = async () => {
        try {
          // If we have a contentId, fetch existing claims from the API
          if (item.contentId) {
            const response = await fetch(`${API_URL}/api/verification/claims/${item.contentId}`);
            if (response.ok) {
              const data = await response.json();
              if (data.success && data.data.claims && data.data.claims.length > 0) {
                // Map API claims to our Claim interface
                const apiClaims: Claim[] = data.data.claims.map((c: any) => ({
                  id: c.id,
                  text: c.text,
                  confidence: c.confidence,
                  status: c.status,
                  method: c.method,
                  verifiedBy: c.verifiedBy || [],
                  contradictedBy: c.contradictedBy || [],
                }));
                setClaims(apiClaims);
                setLoading(false);
                return;
              }
            }
          }
          
          // No existing claims - show prompt to verify
          setClaims([]);
        } catch (error) {
          console.error('Failed to fetch claims:', error);
          setClaims([]);
        } finally {
          setLoading(false);
        }
      };
      
      fetchClaims();
    }
  }, [isOpen, item]);

  // Extract claims on-demand when user clicks "Verify Claims"
  const handleVerifyClaims = async (force = false) => {
    if (!item.contentId) return;
    
    setExtracting(true);
    setSkipSuggested(false);
    
    try {
      const url = `${API_URL}/api/verification/verify-claims/${item.contentId}${force ? '?force=true' : ''}`;
      const response = await fetch(url, { method: 'POST' });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.skipSuggested && !force) {
          setSkipSuggested(true);
          setSkipReason(data.reason);
          setVerificationData(data.data);
        } else if (data.success && data.data.claims) {
          const apiClaims: Claim[] = data.data.claims.map((c: any) => ({
            id: c.id,
            text: c.text,
            confidence: c.confidence,
            status: c.status,
            method: c.method,
            verifiedBy: c.verifiedBy || [],
            contradictedBy: c.contradictedBy || [],
          }));
          setClaims(apiClaims);
          setVerificationData(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to extract claims:', error);
    } finally {
      setExtracting(false);
    }
  };

  if (!isOpen) return null;

  const getConfidenceLevel = (conf: number) => {
    if (conf >= 80) return { label: 'High Confidence', color: 'text-green-600', icon: '✓' };
    if (conf >= 60) return { label: 'Medium Confidence', color: 'text-yellow-600', icon: '!' };
    return { label: 'Low Confidence', color: 'text-red-600', icon: '⚠' };
  };

  const level = getConfidenceLevel(item.confidence);
  
  // Count claim statuses
  const verifiedCount = claims.filter(c => c.status === 'verified').length;
  const partialCount = claims.filter(c => c.status === 'partially_verified').length;
  const unverifiedCount = claims.filter(c => c.status === 'unverified').length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Fact Verification</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Detailed claim-by-claim analysis</p>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
          >
            ✕
          </button>
        </div>
        
        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Original claim */}
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">ARTICLE SUMMARY</div>
            <p className="text-slate-700 dark:text-slate-300">{item.text}</p>
            <div className="flex items-center gap-3 mt-3">
              <span className="px-2 py-1 bg-argus-100 dark:bg-argus-900/30 text-argus-700 dark:text-argus-400 rounded text-sm font-medium">
                {item.source}
              </span>
              <ConfidenceBadge confidence={item.confidence} />
            </div>
          </div>

          {/* Overall confidence bar */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-500 dark:text-slate-400">Overall Confidence</span>
                <span className={`font-bold ${level.color}`}>{item.confidence}%</span>
              </div>
              <div className="h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${
                    item.confidence >= 80 ? 'bg-green-500' : 
                    item.confidence >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${item.confidence}%` }}
                />
              </div>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${
              item.confidence >= 80 ? 'bg-green-100 dark:bg-green-900/30' : 
              item.confidence >= 60 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-red-100 dark:bg-red-900/30'
            }`}>
              <span className={`text-lg ${level.color}`}>{level.icon}</span>
              <span className={`text-sm font-medium ${level.color}`}>{level.label}</span>
            </div>
          </div>

          {/* Claim verification summary */}
          {claims.length > 0 && (
            <div className="flex gap-4 py-3 border-y border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 text-xs font-bold">✓</span>
                <span className="text-sm text-slate-600 dark:text-slate-300">{verifiedCount} verified</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center text-yellow-600 dark:text-yellow-400 text-xs font-bold">◐</span>
                <span className="text-sm text-slate-600 dark:text-slate-300">{partialCount} partial</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 text-xs font-bold">?</span>
                <span className="text-sm text-slate-600 dark:text-slate-300">{unverifiedCount} unverified</span>
              </div>
            </div>
          )}

          {/* Skip suggestion banner */}
          {skipSuggested && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-xl">✓</span>
                <div className="flex-1">
                  <h4 className="font-medium text-green-700 dark:text-green-400">Verification Not Required</h4>
                  <p className="text-sm text-green-600 dark:text-green-300 mt-1">{skipReason}</p>
                  {verificationData && (
                    <p className="text-xs text-green-500 mt-2">
                      Source: {verificationData.sourceName} (reliability: {verificationData.sourceReliability}%)
                    </p>
                  )}
                  <button
                    onClick={() => handleVerifyClaims(true)}
                    disabled={extracting}
                    className="mt-3 text-sm text-green-700 dark:text-green-400 underline hover:no-underline"
                  >
                    Verify anyway →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Claims list */}
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Extracted Claims</h4>
            {loading || extracting ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-argus-500 border-t-transparent"></div>
                {extracting && (
                  <p className="text-sm text-slate-500 mt-3">Extracting claims with AI...</p>
                )}
              </div>
            ) : claims.length > 0 ? (
              <div className="space-y-2">
                {claims.map((claim) => (
                  <ClaimItem 
                    key={claim.id} 
                    claim={claim}
                    isExpanded={expandedClaim === claim.id}
                    onToggle={() => setExpandedClaim(expandedClaim === claim.id ? null : claim.id)}
                  />
                ))}
              </div>
            ) : !skipSuggested && (
              <div className="text-center py-8 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                <div className="text-4xl mb-3">🔍</div>
                <p className="text-slate-700 dark:text-slate-300 font-medium">No claims extracted yet</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
                  Click the button below to extract and verify claims from this article
                </p>
                {item.contentId ? (
                  <button
                    onClick={() => handleVerifyClaims(false)}
                    disabled={extracting}
                    className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                  >
                    {extracting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Extracting...
                      </>
                    ) : (
                      <>
                        <span>🔬</span>
                        Verify Claims
                      </>
                    )}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Deep claim extraction not available for this item.
                    </p>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg font-medium transition-colors"
                      >
                        <span>📰</span> View Original Source ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400 dark:text-slate-500">
              {item.contentId ? (
                <>
                  <span className="text-green-500 mr-1">●</span>
                  Claims verified against source reputation and cross-referenced with related articles.
                </>
              ) : (
                'Verification based on source reputation.'
              )}
            </div>
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 bg-argus-100 dark:bg-argus-900/40 text-argus-700 dark:text-argus-300 rounded-lg hover:bg-argus-200 dark:hover:bg-argus-800 transition-colors flex items-center gap-1.5"
              >
                <span>📰</span> View Source ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DevelopmentCard({ 
  item, 
  isUnverified = false 
}: { 
  item: DevelopmentItem; 
  isUnverified?: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowModal(true);
  };

  const handleVerifyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowModal(true);
  };

  const handleSourceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Let the link navigate naturally
  };

  return (
    <>
      <div 
        role="button"
        tabIndex={0}
        className={`group rounded-lg p-4 border cursor-pointer transition-all hover:shadow-md hover:scale-[1.01] active:scale-[0.99] select-none ${
          isUnverified 
            ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50 hover:border-amber-300 dark:hover:border-amber-600' 
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-argus-400 dark:hover:border-argus-500'
        }`}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && setShowModal(true)}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed">
              {isUnverified && <span className="text-amber-500 mr-1">⚠</span>}
              {item.text}
            </p>
            <div className="flex items-center flex-wrap gap-2 mt-3">
              {item.url ? (
                <a 
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleSourceClick}
                  className="text-xs text-argus-600 dark:text-argus-400 font-medium hover:underline flex items-center gap-1"
                >
                  {item.source} <span className="opacity-60">↗</span>
                </a>
              ) : (
                <span className="text-xs text-argus-600 dark:text-argus-400 font-medium">
                  {item.source}
                </span>
              )}
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <ConfidenceBadge confidence={item.confidence} />
              {item.contentId && (
                <span className="text-xs text-green-500 flex items-center gap-1">
                  <span>●</span> Verifiable
                </span>
              )}
              <button
                onClick={handleVerifyClick}
                className="ml-auto px-3 py-1 text-xs font-medium rounded-full bg-argus-100 dark:bg-argus-900/40 text-argus-700 dark:text-argus-300 hover:bg-argus-200 dark:hover:bg-argus-800 transition-colors flex items-center gap-1.5"
              >
                <span>🔍</span>
                Verify
              </button>
            </div>
          </div>
        </div>
      </div>
      <FactVerificationModal item={item} isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    morning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    evening: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    alert: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    weekly: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  };
  
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[type] || 'bg-slate-100 text-slate-600'}`}>
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: number | string; subtitle: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
      <div className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</div>
    </div>
  );
}

function CitationsList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span>📚</span> Sources & Citations
      </h3>
      <div className="grid gap-2">
        {citations.map((citation, i) => (
          <div 
            key={i} 
            className="flex items-center justify-between py-2 px-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-argus-300 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm text-slate-700 dark:text-slate-300 line-clamp-1">
                {citation.title}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                — {citation.source}
              </span>
            </div>
            {citation.url && citation.url !== 'URL' && (
              <a 
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-argus-600 hover:text-argus-700 dark:text-argus-400 dark:hover:text-argus-300 text-sm"
                onClick={e => e.stopPropagation()}
              >
                Open ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BriefingHistoryCard({ briefing, onSelect, isSelected }: { 
  briefing: BriefingHistoryItem; 
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
  const stats = extractBriefingStats(briefing.summary);
  const date = new Date(briefing.generatedAt);
  
  return (
    <button
      onClick={() => onSelect(briefing.id)}
      className={`w-full text-left p-4 rounded-lg border transition-all hover:shadow-md ${
        isSelected 
          ? 'border-argus-500 bg-argus-50 dark:bg-argus-900/20 ring-2 ring-argus-500/30' 
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-argus-300'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <TypeBadge type={briefing.type} />
        {briefing.deliveredAt && (
          <span className="text-xs text-green-600 dark:text-green-400">✓ Delivered</span>
        )}
      </div>
      <div className="text-sm font-medium text-slate-900 dark:text-white">
        {date.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        })}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs">
        <span className="text-slate-600 dark:text-slate-400">
          {stats.articleCount} articles
        </span>
        {stats.confidence > 0 && (
          <ConfidenceBadge confidence={stats.confidence} size="sm" />
        )}
      </div>
    </button>
  );
}

export default function BriefingsPage() {
  const [latest, setLatest] = useState<BriefingData | null>(null);
  const [history, setHistory] = useState<BriefingHistoryItem[]>([]);
  const [selectedBriefing, setSelectedBriefing] = useState<BriefingData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [parsed, setParsed] = useState<ParsedBriefing | null>(null);
  const [activeTab, setActiveTab] = useState<'latest' | 'history'>('latest');

  useEffect(() => {
    async function fetchData() {
      try {
        const [latestRes, historyRes, statsRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/briefings/latest`, { cache: 'no-store' }),
          fetch(`${API_URL}/api/v1/briefings?limit=20`, { cache: 'no-store' }),
          fetch(`${API_URL}/api/v1/stats`, { cache: 'no-store' }),
        ]);

        if (latestRes.ok) {
          const latestData = await latestRes.json();
          if (latestData.success && latestData.data) {
            setLatest(latestData.data);
            setSelectedBriefing(latestData.data);
            setParsed(parseBriefingSummary(latestData.data.summary));
          }
        }

        if (historyRes.ok) {
          const historyData = await historyRes.json();
          if (historyData.success && historyData.data) {
            setHistory(historyData.data);
          }
        }

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData.success) {
            setStats(statsData.data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch briefing data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const handleSelectBriefing = async (id: string) => {
    if (selectedBriefing?.id === id) return;
    
    setLoadingBriefing(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/briefings/${id}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setSelectedBriefing(data.data);
          setParsed(parseBriefingSummary(data.data.summary));
        }
      }
    } catch (error) {
      console.error('Failed to fetch briefing:', error);
    } finally {
      setLoadingBriefing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-argus-500 border-t-transparent"></div>
      </div>
    );
  }

  const displayBriefing = selectedBriefing || latest;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center pb-4">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Intelligence Briefings
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2 text-lg">
          AI-verified summaries of strategic intelligence
        </p>
      </div>

      {/* Platform Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Articles"
            value={stats.content?.total || 0}
            subtitle={`${stats.content?.last24h || 0} in last 24h`}
          />
          <StatCard
            title="Verified"
            value={stats.content?.verified || 0}
            subtitle={`${stats.content?.averageConfidence || 0}% avg confidence`}
          />
          <StatCard
            title="Sources"
            value={stats.sources || 0}
            subtitle="Active feeds"
          />
          <StatCard
            title="Domains"
            value={stats.domains || 0}
            subtitle="Strategic areas"
          />
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('latest')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'latest'
              ? 'border-argus-500 text-argus-600 dark:text-argus-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Latest Briefing
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-argus-500 text-argus-600 dark:text-argus-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Briefing History ({history.length})
        </button>
      </div>

      {activeTab === 'history' ? (
        /* History View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* History List */}
          <div className="lg:col-span-1 space-y-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Past Briefings
            </h3>
            {history.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                No briefing history yet
              </p>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {history.map((briefing) => (
                  <BriefingHistoryCard 
                    key={briefing.id} 
                    briefing={briefing} 
                    onSelect={handleSelectBriefing}
                    isSelected={selectedBriefing?.id === briefing.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Selected Briefing Preview */}
          <div className="lg:col-span-2">
            {loadingBriefing ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-argus-500 border-t-transparent"></div>
              </div>
            ) : displayBriefing && parsed ? (
              <BriefingContent briefing={displayBriefing} parsed={parsed} />
            ) : (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-12 text-center">
                <p className="text-slate-500 dark:text-slate-400">
                  Select a briefing to view details
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Latest View */
        displayBriefing && parsed ? (
          <BriefingContent briefing={displayBriefing} parsed={parsed} />
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-xl font-semibold mb-2 text-slate-900 dark:text-white">No Briefings Yet</h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Briefings are generated from verified intelligence. 
              Use the API to generate morning or evening briefings.
            </p>
            <div className="mt-6 text-sm text-slate-400">
              <code className="bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-lg font-mono">
                POST /api/briefings/generate
              </code>
            </div>
          </div>
        )
      )}

      {/* Briefing Types Explanation */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="font-semibold mb-4 text-slate-900 dark:text-white">Briefing Types</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="flex gap-3 items-start">
            <TypeBadge type="morning" />
            <span className="text-slate-600 dark:text-slate-400">
              Comprehensive overnight intelligence summary
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <TypeBadge type="evening" />
            <span className="text-slate-600 dark:text-slate-400">
              End-of-day developments and changes
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <TypeBadge type="alert" />
            <span className="text-slate-600 dark:text-slate-400">
              Urgent breaking developments
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <TypeBadge type="weekly" />
            <span className="text-slate-600 dark:text-slate-400">
              Weekly trend analysis and forecasts
            </span>
          </div>
        </div>
      </div>

      {/* API Usage */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-semibold mb-4 text-slate-900 dark:text-white">Generate Briefings via API</h3>
        <div className="space-y-4 text-sm">
          <div>
            <div className="font-medium text-slate-700 dark:text-slate-300 mb-2">Generate Morning Briefing:</div>
            <code className="block bg-slate-100 dark:bg-slate-700 px-4 py-3 rounded-lg text-xs font-mono overflow-x-auto">
              curl -X POST https://argus.vitalpoint.ai/api/briefings/generate \<br/>
              &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br/>
              &nbsp;&nbsp;-d &apos;&#123;&quot;type&quot;: &quot;morning&quot;&#125;&apos;
            </code>
          </div>
          <div>
            <div className="font-medium text-slate-700 dark:text-slate-300 mb-2">Get Latest Briefing:</div>
            <code className="block bg-slate-100 dark:bg-slate-700 px-4 py-3 rounded-lg text-xs font-mono">
              curl https://argus.vitalpoint.ai/api/v1/briefings/latest
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to match parsed items with changes array to get contentIds and URLs
function enrichWithContentIds(items: DevelopmentItem[], changes: any[]): DevelopmentItem[] {
  return items.map(item => {
    // Try to find matching change by text similarity or source name
    const textLower = item.text.toLowerCase();
    const sourceLower = item.source.toLowerCase();
    
    const match = changes.find((c: any) => {
      const descLower = (c.description || '').toLowerCase();
      const changeSource = (c.sourceName || c.source || '').toLowerCase();
      
      // Method 1: Source name match (most reliable)
      if (sourceLower && changeSource && (
        sourceLower.includes(changeSource) || changeSource.includes(sourceLower)
      )) {
        // Also need some text overlap
        const words = textLower.split(/\s+/).filter(w => w.length > 3);
        const hasOverlap = words.some(w => descLower.includes(w));
        if (hasOverlap) return true;
      }
      
      // Method 2: Significant word overlap
      const words = textLower.split(/\s+/).filter(w => w.length > 4);
      const matchCount = words.filter(w => descLower.includes(w)).length;
      if (matchCount >= 2) return true;
      
      // Method 3: Substring match
      if (descLower.includes(textLower.substring(0, 30))) return true;
      
      return false;
    });
    
    if (match) {
      return {
        ...item,
        contentId: match.contentId,
        url: match.url,
      };
    }
    return item;
  });
}

function BriefingContent({ briefing, parsed }: { briefing: BriefingData; parsed: ParsedBriefing }) {
  // Enrich parsed items with contentIds from changes array
  const enrichedVerified = enrichWithContentIds(parsed.verified, briefing.changes || []);
  const enrichedUnverified = enrichWithContentIds(parsed.unverified, briefing.changes || []);
  
  return (
    <div className="space-y-6">
      {/* Executive Summary Card */}
      <div className="bg-gradient-to-br from-argus-50 to-white dark:from-argus-900/20 dark:to-slate-800 rounded-2xl shadow-lg border border-argus-200 dark:border-argus-800/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-argus-200/50 dark:border-argus-800/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <TypeBadge type={briefing.type} />
            {parsed.metadata.confidence > 0 && (
              <ConfidenceBadge confidence={parsed.metadata.confidence} size="md" />
            )}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {parsed.metadata.sources && (
              <><span className="font-medium">{parsed.metadata.sources} sources</span><span className="mx-2">•</span></>
            )}
            <span>{new Date(briefing.generatedAt).toLocaleString()}</span>
            {briefing.deliveredAt && (
              <span className="ml-2 text-green-600 dark:text-green-400">✓ Delivered</span>
            )}
          </div>
        </div>
        
        <div className="p-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <span>📋</span> Executive Summary
          </h2>
          <div className="prose prose-slate dark:prose-invert prose-sm max-w-none">
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              This {parsed.metadata.type || briefing.type} briefing 
              {parsed.metadata.sources && <> covers {parsed.metadata.sources} sources</>}
              {parsed.metadata.confidence > 0 && <> with an overall confidence score of <strong>{parsed.metadata.confidence}%</strong></>}. 
              {parsed.verified.length > 0 && (
                <> Contains <strong>{parsed.verified.length} verified developments</strong></>
              )}
              {parsed.verified.length > 0 && parsed.unverified.length > 0 && ' and '}
              {parsed.unverified.length > 0 && (
                <><strong>{parsed.unverified.length} unverified reports</strong> requiring additional confirmation.</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Verified Developments */}
      {enrichedVerified.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-green-500">✓</span> Verified Developments
          </h2>
          <div className="grid gap-3">
            {enrichedVerified.map((item, i) => (
              <DevelopmentCard key={i} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Unverified Reports */}
      {enrichedUnverified.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-amber-500">⚠</span> Unverified Reports
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
              (confidence &lt; 70%)
            </span>
          </h2>
          <div className="grid gap-3">
            {enrichedUnverified.map((item, i) => (
              <DevelopmentCard key={i} item={item} isUnverified />
            ))}
          </div>
        </div>
      )}

      {/* Citations */}
      <CitationsList citations={parsed.citations} />

      {/* Key Changes (from API) */}
      {briefing.changes && briefing.changes.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <span>🔄</span> Key Changes
          </h3>
          <div className="space-y-3">
            {briefing.changes.map((change: any, i: number) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <div className="flex items-center flex-wrap gap-2 mb-2">
                  <span className="text-xs font-medium text-argus-600 dark:text-argus-400 px-2 py-0.5 bg-argus-100 dark:bg-argus-900/30 rounded">
                    {change.domain}
                  </span>
                  {change.significance && (
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      change.significance === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      change.significance === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                    }`}>
                      {change.significance}
                    </span>
                  )}
                  {change.source && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      via {change.source}
                    </span>
                  )}
                  {change.url && (
                    <a
                      href={change.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-xs px-2 py-1 bg-argus-100 dark:bg-argus-900/40 text-argus-700 dark:text-argus-300 rounded hover:bg-argus-200 dark:hover:bg-argus-800 transition-colors flex items-center gap-1"
                    >
                      <span>📰</span> Source ↗
                    </a>
                  )}
                </div>
                <p className="text-slate-700 dark:text-slate-300 text-sm">{change.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Forecasts */}
      {briefing.forecasts && briefing.forecasts.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <span>🔮</span> Forecasts
          </h3>
          <div className="space-y-3">
            {briefing.forecasts.map((forecast: any, i: number) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                {typeof forecast === 'string' ? (
                  <p className="text-slate-700 dark:text-slate-300 text-sm">{forecast}</p>
                ) : (
                  <>
                    <p className="text-slate-700 dark:text-slate-300 text-sm font-medium mb-2">
                      {forecast.event || forecast.prediction}
                    </p>
                    {forecast.reasoning && (
                      <p className="text-slate-500 dark:text-slate-400 text-xs mb-2">{forecast.reasoning}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {forecast.timeframe && (
                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                          {forecast.timeframe}
                        </span>
                      )}
                      {(forecast.probability !== undefined || forecast.confidence !== undefined) && (
                        <span className={`px-2 py-0.5 rounded font-medium ${
                          (forecast.probability || forecast.confidence) >= 70 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : (forecast.probability || forecast.confidence) >= 40
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {forecast.probability || forecast.confidence}% probability
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
