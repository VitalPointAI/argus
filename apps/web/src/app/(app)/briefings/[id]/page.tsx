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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-slate-600 dark:text-slate-400">Loading briefing...</div>
      </div>
    );
  }

  if (error || !briefing) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
            Briefing Not Found
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            {error || 'This briefing may have been removed or is not publicly accessible.'}
          </p>
          <a 
            href="https://argus.vitalpoint.ai"
            className="mt-4 inline-block text-argus-600 hover:text-argus-700"
          >
            Go to Argus →
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="https://argus.vitalpoint.ai" className="flex items-center gap-2">
            <span className="text-xl font-bold text-argus-600">ARGUS</span>
            <span className="text-slate-400">|</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">Intelligence Platform</span>
          </a>
          <span className="text-xs text-slate-400 dark:text-slate-500">Shared Briefing</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">
            {structured?.title || briefing.title || 'Intelligence Briefing'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {structured?.subtitle || createdDate}
          </p>
          {structured?.readTimeMinutes && (
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              📖 {structured.readTimeMinutes} min read
            </p>
          )}
        </div>

        {/* Summary Stats */}
        {structured?.summary && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
              <div className="text-2xl font-bold text-slate-800 dark:text-white">
                {structured.summary.totalStories || 0}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Stories</div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
              <div className="text-2xl font-bold text-slate-800 dark:text-white">
                {structured.summary.avgConfidence?.toFixed(0) || 0}%
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Avg Confidence</div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
              <div className="text-2xl font-bold text-slate-800 dark:text-white">
                {structured.summary.topDomains?.length || 0}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Domains</div>
            </div>
          </div>
        )}

        {/* Sections */}
        {structured?.sections?.map((section, sIdx) => (
          <div key={sIdx} className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
              {section.title}
            </h2>
            <div className="space-y-4">
              {section.stories?.map((story, stIdx) => (
                <div 
                  key={stIdx} 
                  className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700"
                >
                  <h3 className="font-medium text-slate-800 dark:text-white mb-2">
                    {story.headline}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300 text-sm mb-2">
                    {story.summary}
                  </p>
                  {story.analysis && (
                    <p className="text-slate-500 dark:text-slate-400 text-sm italic mb-2">
                      💡 {story.analysis}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    {story.confidenceScore && (
                      <span>Confidence: {story.confidenceScore}%</span>
                    )}
                    {story.sources?.length && (
                      <span>{story.sources.length} source{story.sources.length > 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Fallback: Raw content if no structured data */}
        {!structured?.sections && briefing.content && (
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
            <div 
              className="prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: briefing.content.replace(/\n/g, '<br/>') }}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-700 mt-12 py-6">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-slate-400 dark:text-slate-500">
          Powered by <a href="https://argus.vitalpoint.ai" className="text-argus-600 hover:text-argus-700">Argus Intelligence Platform</a>
        </div>
      </footer>
    </div>
  );
}
