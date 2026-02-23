'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface BriefingData {
  id: string;
  title: string;
  type: string;
  content: string;
  structuredData?: {
    title?: string;
    subtitle?: string;
    readTimeMinutes?: number;
    sections?: Array<{
      title: string;
      stories: Array<{
        headline: string;
        summary: string;
        analysis?: string;
        confidenceScore?: number;
        sources?: Array<{ name: string; url: string }>;
      }>;
    }>;
    summary?: {
      totalStories?: number;
      avgConfidence?: number;
      topDomains?: string[];
    };
  };
  createdAt: string;
  isPublic: boolean;
}

export default function PublicBriefingPage() {
  const params = useParams();
  const briefingId = params?.id as string;
  
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!briefingId) return;
    
    const fetchBriefing = async () => {
      try {
        const res = await fetch(`${API_URL}/api/briefings/public/${briefingId}`);
        const data = await res.json();
        
        if (data.success) {
          setBriefing(data.data);
        } else {
          setError(data.error || 'Briefing not found');
        }
      } catch (err) {
        setError('Failed to load briefing');
      } finally {
        setLoading(false);
      }
    };
    
    fetchBriefing();
  }, [briefingId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-slate-400">Loading intelligence briefing...</div>
        </div>
      </div>
    );
  }

  if (error || !briefing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Briefing Not Found
          </h1>
          <p className="text-slate-400 mb-6">
            {error || 'This briefing may have been removed or is not publicly accessible.'}
          </p>
          <a 
            href="https://argus.vitalpoint.ai"
            className="inline-block px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
          >
            Discover Argus →
          </a>
        </div>
      </div>
    );
  }

  const structured = briefing.structuredData;
  const createdDate = new Date(briefing.createdAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="https://argus.vitalpoint.ai" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <div>
              <span className="text-xl font-bold text-white">ARGUS</span>
              <span className="hidden sm:inline text-slate-500 ml-2 text-sm">Strategic Intelligence Platform</span>
            </div>
          </a>
          <a 
            href="https://argus.vitalpoint.ai/register"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg font-medium transition-colors"
          >
            Get Started Free
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Title Section */}
        <div className="mb-8 text-center">
          <div className="inline-block px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-medium rounded-full mb-4">
            INTELLIGENCE BRIEFING
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            {structured?.title || briefing.title || 'Intelligence Briefing'}
          </h1>
          <p className="text-slate-400">
            {structured?.subtitle || createdDate}
          </p>
          {structured?.readTimeMinutes && (
            <p className="text-sm text-slate-500 mt-2">
              📖 {structured.readTimeMinutes} min read • {structured?.summary?.totalStories || 0} stories analyzed
            </p>
          )}
        </div>

        {/* Summary Stats */}
        {structured?.summary && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700/50 text-center">
              <div className="text-3xl font-bold text-white">
                {structured.summary.totalStories || 0}
              </div>
              <div className="text-sm text-slate-400">Stories Analyzed</div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700/50 text-center">
              <div className="text-3xl font-bold text-emerald-400">
                {structured.summary.avgConfidence?.toFixed(0) || 0}%
              </div>
              <div className="text-sm text-slate-400">Avg Confidence</div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700/50 text-center">
              <div className="text-3xl font-bold text-white">
                {structured.summary.topDomains?.length || 0}
              </div>
              <div className="text-sm text-slate-400">Intel Domains</div>
            </div>
          </div>
        )}

        {/* Sections */}
        {structured?.sections?.map((section, sIdx) => (
          <div key={sIdx} className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700/50 flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
              {section.title}
            </h2>
            <div className="space-y-4">
              {section.stories?.map((story, stIdx) => (
                <div 
                  key={stIdx} 
                  className="bg-slate-800/30 backdrop-blur rounded-xl p-5 border border-slate-700/30 hover:border-slate-600/50 transition-colors"
                >
                  <h3 className="font-semibold text-white mb-2 text-lg">
                    {story.headline}
                  </h3>
                  <p className="text-slate-300 mb-3 leading-relaxed">
                    {story.summary}
                  </p>
                  {story.analysis && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 mb-3">
                      <p className="text-emerald-300 text-sm">
                        💡 <span className="font-medium">Analysis:</span> {story.analysis}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    {story.confidenceScore && (
                      <span className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${story.confidenceScore >= 70 ? 'bg-emerald-500' : story.confidenceScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
                        {story.confidenceScore}% confidence
                      </span>
                    )}
                    {story.sources?.length && (
                      <span>📰 {story.sources.length} source{story.sources.length > 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Fallback: Raw content if no structured data */}
        {!structured?.sections && briefing.content && (
          <div className="bg-slate-800/30 backdrop-blur rounded-xl p-6 border border-slate-700/30">
            <div 
              className="prose prose-invert prose-emerald max-w-none"
              dangerouslySetInnerHTML={{ __html: briefing.content.replace(/\n/g, '<br/>') }}
            />
          </div>
        )}

        {/* CTA Section */}
        <div className="mt-12 bg-gradient-to-r from-emerald-600/20 to-teal-600/20 rounded-2xl p-8 border border-emerald-500/20">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-3">
              Get Your Own Intelligence Briefings
            </h2>
            <p className="text-slate-300 mb-6">
              Argus delivers AI-powered intelligence briefings tailored to your interests. 
              Create custom source lists, contribute HUMINT reports, and stay ahead with verified intelligence.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="https://argus.vitalpoint.ai/register"
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
              >
                Create Free Account
              </a>
              <a 
                href="https://argus.vitalpoint.ai"
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Learn More
              </a>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
              <span>✓ Custom Source Lists</span>
              <span>✓ HUMINT Network</span>
              <span>✓ Scheduled Briefings</span>
              <span>✓ Multi-channel Delivery</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-12 py-8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <span className="text-slate-400 text-sm">
                © 2026 Argus Intelligence Platform
              </span>
            </div>
            <div className="flex gap-6 text-sm text-slate-500">
              <a href="https://argus.vitalpoint.ai" className="hover:text-slate-300 transition-colors">Home</a>
              <a href="https://argus.vitalpoint.ai/register" className="hover:text-slate-300 transition-colors">Sign Up</a>
              <a href="https://docs.argus.vitalpoint.ai" className="hover:text-slate-300 transition-colors">Docs</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
