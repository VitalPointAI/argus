'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface BriefingData {
  id: string;
  title: string;
  type: string;
  content: string;
  summary?: string;
  createdAt: string;
  isPublic: boolean;
}

export default function BriefingViewPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const briefingId = params?.id as string;
  
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!briefingId) return;
    
    const fetchBriefing = async () => {
      try {
        // If user is logged in, try authenticated endpoint first
        if (user) {
          const authRes = await fetch(`${API_URL}/api/briefings/executive/${briefingId}`, {
            credentials: 'include',
          });
          const authData = await authRes.json();
          
          if (authData.success) {
            setBriefing(authData.data);
            setLoading(false);
            return;
          }
        }
        
        // Fall back to public endpoint
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
  }, [briefingId, user, authLoading]);

  // If user is logged in, offer to go to full briefings page
  const goToFullBriefings = () => {
    router.push('/briefings');
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-slate-300">Loading intelligence briefing...</div>
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
          <p className="text-slate-300 mb-6">
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

  const createdDate = new Date(briefing.createdAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Parse markdown content for display
  const formatContent = (content: string) => {
    if (!content) return '';
    
    // Convert markdown to basic HTML
    let html = content
      // Headers
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold text-white mt-6 mb-2">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold text-white mt-8 mb-3 pb-2 border-b border-slate-700">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold text-white mt-6 mb-4">$1</h1>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em class="text-slate-300">$1</em>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-emerald-400 hover:text-emerald-300 underline">$1</a>')
      // Bullet points
      .replace(/^- (.*$)/gm, '<li class="text-slate-200 ml-4">$1</li>')
      .replace(/^• (.*$)/gm, '<li class="text-slate-200 ml-4">$1</li>')
      // Horizontal rules
      .replace(/^---$/gm, '<hr class="my-6 border-slate-700">')
      // Paragraphs (double newlines)
      .replace(/\n\n/g, '</p><p class="text-slate-200 mb-4">')
      // Single newlines in content
      .replace(/\n/g, '<br>');
    
    return `<p class="text-slate-200 mb-4">${html}</p>`;
  };

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
              <span className="hidden sm:inline text-slate-400 ml-2 text-sm">Strategic Intelligence Platform</span>
            </div>
          </a>
          <div className="flex items-center gap-3">
            {user ? (
              <button 
                onClick={goToFullBriefings}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg font-medium transition-colors"
              >
                Go to Dashboard
              </button>
            ) : (
              <a 
                href="https://argus.vitalpoint.ai/register"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg font-medium transition-colors"
              >
                Get Started Free
              </a>
            )}
          </div>
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
            {briefing.title || 'Intelligence Briefing'}
          </h1>
          <p className="text-slate-400">
            {createdDate}
          </p>
        </div>

        {/* Briefing Content */}
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 sm:p-8 border border-slate-700/50">
          <div 
            className="prose prose-invert prose-emerald max-w-none"
            dangerouslySetInnerHTML={{ __html: formatContent(briefing.content || briefing.summary || '') }}
          />
        </div>

        {/* CTA Section - Only show for non-logged-in users */}
        {!user && (
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
        )}
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
