'use client';

import React, { useState } from 'react';
import { getConfidenceDisplay } from '@/lib/confidence';
import VerifyModal from './VerifyModal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface Article {
  id: string;
  title: string;
  source: string;
  url: string;
  confidenceScore: number;
  verificationUrl: string;
}

interface Story {
  id: string;
  headline: string;
  context: string;
  latestUpdate: string;
  significance: 'high' | 'medium' | 'low';
  articles: Article[];
  avgConfidence: number;
  deepVerified: boolean;
}

interface Section {
  domain: string;
  domainSlug: string;
  icon: string;
  stories: Story[];
}

interface ExecutiveBriefingData {
  id: string;
  title: string;
  subtitle: string;
  generatedAt: string;
  readTimeMinutes: number;
  sections: Section[];
  summary: {
    totalArticles: number;
    totalStories: number;
    avgConfidence: number;
    topDomains: string[];
  };
  ttsScript?: string;
  htmlContent: string;
  markdownContent: string;
}

function ConfidenceBadge({ score, onVerify, articleUrl }: { score: number; onVerify?: (url: string) => void; articleUrl?: string }) {
  const display = getConfidenceDisplay(score);

  const badge = (
    <span 
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${display.bgClass}`}
      title={display.description}
    >
      {display.emoji} {display.label}
    </span>
  );

  if (onVerify && articleUrl) {
    return (
      <button onClick={() => onVerify(articleUrl)} className="hover:opacity-80 transition">
        {badge}
      </button>
    );
  }
  return badge;
}

function StoryCard({ story, onVerify }: { story: Story; onVerify?: (url: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  
  const sigColors = {
    high: 'border-l-red-500 bg-red-50/30 dark:bg-red-900/10',
    medium: 'border-l-yellow-500 bg-yellow-50/30 dark:bg-yellow-900/10',
    low: 'border-l-slate-300 bg-white dark:bg-slate-800',
  };

  const sigLabels = {
    high: '🔴 High Impact',
    medium: '🟡 Notable',
    low: '⚪ Developing',
  };

  const primaryArticle = story.articles[0];

  return (
    <article className={`mb-4 pl-4 border-l-4 rounded-r-lg ${sigColors[story.significance]} p-4`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
          {story.headline}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500">{sigLabels[story.significance]}</span>
          <ConfidenceBadge score={story.avgConfidence} onVerify={onVerify} articleUrl={primaryArticle?.url} />
        </div>
      </div>
      
      <div className="mb-3">
        <p className="text-slate-600 dark:text-slate-300 text-sm mb-2">
          <strong className="text-slate-700 dark:text-slate-200">Context:</strong> {story.context}
        </p>
        <p className="text-slate-700 dark:text-slate-200 text-sm">
          <strong>Latest:</strong> {story.latestUpdate}
        </p>
      </div>

      {/* Sources */}
      <div className="flex items-center flex-wrap gap-2 text-sm">
        <span className="text-slate-500 dark:text-slate-400">Sources:</span>
        {story.articles.slice(0, expanded ? undefined : 3).map((article, i) => (
          <a
            key={article.id}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-xs hover:border-argus-400 transition"
          >
            <span className="text-slate-700 dark:text-slate-300">{article.source}</span>
            <span className={`ml-1 ${getConfidenceDisplay(article.confidenceScore).color}`} title={getConfidenceDisplay(article.confidenceScore).description}>{getConfidenceDisplay(article.confidenceScore).emoji}</span>
          </a>
        ))}
        {story.articles.length > 3 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-argus-600 dark:text-argus-400 hover:underline"
          >
            +{story.articles.length - 3} more
          </button>
        )}
        <button
          onClick={() => primaryArticle?.url && onVerify?.(primaryArticle.url)}
          className="ml-auto text-xs text-argus-600 dark:text-argus-400 hover:underline flex items-center gap-1"
        >
          🔍 Verify
        </button>
      </div>
    </article>
  );
}

function SectionComponent({ section, onVerify }: { section: Section; onVerify?: (url: string) => void }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-2xl">{section.icon}</span>
        <span>{section.domain}</span>
        <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2">
          ({section.stories.length} stories)
        </span>
      </h2>
      
      {section.stories.map((story) => (
        <StoryCard key={story.id} story={story} onVerify={onVerify} />
      ))}
    </section>
  );
}

interface Props {
  briefing?: ExecutiveBriefingData | { 
    title?: string;
    markdownContent?: string;
    savedAt?: string;
    briefingId?: string;
    isHistorical?: boolean;
    sections?: Section[];
    summary?: any;
  };
  onGenerate?: () => void;
  loading?: boolean;
  hideGenerateCard?: boolean;
}

// Parse markdown links and add verify buttons
function parseMarkdownWithLinks(text: string, onVerify?: (url: string) => void): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match markdown links: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;
  let keyIndex = 0;
  
  while ((match = linkRegex.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
      parts.push(<span key={`t${keyIndex++}`} dangerouslySetInnerHTML={{ __html: beforeText }} />);
    }
    
    const linkText = match[1];
    const linkUrl = match[2];
    
    // Add the link with a verify button
    parts.push(
      <span key={`l${keyIndex++}`} className="inline-flex items-center gap-1">
        <a 
          href={linkUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-argus-600 dark:text-argus-400 hover:underline"
        >
          {linkText}
        </a>
        <button
          onClick={(e) => {
            e.preventDefault();
            onVerify?.(linkUrl);
          }}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-argus-100 dark:bg-argus-900/30 text-argus-600 dark:text-argus-400 rounded text-xs hover:bg-argus-200 dark:hover:bg-argus-800 transition"
          title="Verify this source"
        >
          🔍 Verify
        </button>
      </span>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    parts.push(<span key={`t${keyIndex++}`} dangerouslySetInnerHTML={{ __html: remainingText }} />);
  }
  
  return parts.length > 0 ? parts : [<span key="empty" dangerouslySetInnerHTML={{ __html: text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>') }} />];
}

// Render markdown content as formatted JSX
function MarkdownRenderer({ content, onVerify }: { content: string; onVerify?: (url: string) => void }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={i} className="h-2" />);
      return;
    }
    
    // H1
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-2xl font-bold text-slate-800 dark:text-white mt-6 mb-3">
          {trimmed.substring(2)}
        </h1>
      );
      return;
    }
    
    // H2
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-xl font-bold text-slate-800 dark:text-white mt-6 mb-3 flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
          {trimmed.substring(3)}
        </h2>
      );
      return;
    }
    
    // H3
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-lg font-semibold text-slate-800 dark:text-white mt-4 mb-2">
          {trimmed.substring(4)}
        </h3>
      );
      return;
    }
    
    // Bullet points - check for links
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletContent = trimmed.substring(2);
      const hasLink = /\[([^\]]+)\]\(([^)]+)\)/.test(bulletContent);
      
      if (hasLink) {
        elements.push(
          <li key={i} className="text-slate-600 dark:text-slate-300 ml-4 mb-1">
            {parseMarkdownWithLinks(bulletContent, onVerify)}
          </li>
        );
      } else {
        const content = bulletContent
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*]+)\*/g, '<em>$1</em>');
        elements.push(
          <li 
            key={i} 
            className="text-slate-600 dark:text-slate-300 ml-4 mb-1"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        );
      }
      return;
    }
    
    // Regular paragraphs - check for links
    const hasLink = /\[([^\]]+)\]\(([^)]+)\)/.test(trimmed);
    
    if (hasLink) {
      elements.push(
        <p key={i} className="text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
          {parseMarkdownWithLinks(trimmed, onVerify)}
        </p>
      );
    } else {
      const content = trimmed
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
      
      elements.push(
        <p 
          key={i} 
          className="text-slate-600 dark:text-slate-300 leading-relaxed mb-2"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      );
    }
  });
  
  return <div className="prose prose-slate dark:prose-invert max-w-none">{elements}</div>;
}

export default function ExecutiveBriefing({ briefing, onGenerate, loading, hideGenerateCard }: Props) {
  const [playingAudio, setPlayingAudio] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [verifyModalUrl, setVerifyModalUrl] = useState<string | null>(null);
  
  const handleVerify = (url: string) => {
    setVerifyModalUrl(url);
  };

  const handlePlayAudio = async () => {
    if (audioUrl) {
      // Toggle existing audio
      const audio = document.getElementById('briefing-audio') as HTMLAudioElement;
      if (audio) {
        if (playingAudio) {
          audio.pause();
        } else {
          audio.play();
        }
        setPlayingAudio(!playingAudio);
      }
      return;
    }

    // Generate audio
    setAudioLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/briefings/executive/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type: 'morning',
          generateAudio: true 
        }),
      });
      
      const data = await res.json();
      if (data.success && data.data.audioBase64) {
        const blob = new Blob(
          [Uint8Array.from(atob(data.data.audioBase64), c => c.charCodeAt(0))],
          { type: 'audio/mpeg' }
        );
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Auto-play
        setTimeout(() => {
          const audio = document.getElementById('briefing-audio') as HTMLAudioElement;
          if (audio) {
            audio.play();
            setPlayingAudio(true);
          }
        }, 100);
      } else {
        alert('Audio generation not available. Check ElevenLabs configuration.');
      }
    } catch (error) {
      console.error('Audio generation failed:', error);
      alert('Failed to generate audio');
    } finally {
      setAudioLoading(false);
    }
  };

  // Use browser TTS as fallback
  const handleBrowserTTS = () => {
    const ttsScript = briefing && 'ttsScript' in briefing ? briefing.ttsScript : undefined;
    if (!ttsScript) return;
    
    if (playingAudio) {
      window.speechSynthesis.cancel();
      setPlayingAudio(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(ttsScript);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onend = () => setPlayingAudio(false);
    window.speechSynthesis.speak(utterance);
    setPlayingAudio(true);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-argus-500 border-t-transparent mx-auto mb-4"></div>
        <p className="text-slate-600 dark:text-slate-400">Generating executive briefing...</p>
        <p className="text-sm text-slate-500 mt-2">This may take 15-30 seconds</p>
      </div>
    );
  }

  if (!briefing && !hideGenerateCard) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
        <div className="text-6xl mb-4">🦚</div>
        <h2 className="text-xl font-semibold mb-2 text-slate-900 dark:text-white">
          Executive Briefing
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
          Get a structured, easy-to-read intelligence summary with confidence scores,
          source links, and optional audio narration.
        </p>
        {onGenerate && (
          <button
            onClick={onGenerate}
            className="px-6 py-3 bg-argus-600 hover:bg-argus-700 text-white rounded-lg font-medium transition"
          >
            Generate Executive Briefing
          </button>
        )}
      </div>
    );
  }
  
  // If hideGenerateCard is true but no briefing, show minimal placeholder
  if (!briefing) {
    return null;
  }

  // Check if we have sections (live generated) or just markdown (saved)
  const hasSections = briefing.sections && briefing.sections.length > 0;
  const hasMarkdown = 'markdownContent' in briefing && briefing.markdownContent;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <header className="bg-gradient-to-r from-argus-600 to-argus-700 text-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">{briefing.title || 'Executive Briefing'}</h1>
            {'subtitle' in briefing && briefing.subtitle && (
              <p className="text-argus-100">{briefing.subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Generate New Button */}
            {onGenerate && (
              <button
                onClick={onGenerate}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition"
                title="Generate a new briefing with latest intel"
              >
                🔄 Generate New
              </button>
            )}
            {/* TTS Button */}
            <button
              onClick={audioUrl ? handlePlayAudio : handleBrowserTTS}
              disabled={audioLoading}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition disabled:opacity-50"
              title="Listen to briefing"
            >
              {audioLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              ) : playingAudio ? (
                <>⏸️ Pause</>
              ) : (
                <>🎧 Listen</>
              )}
            </button>
          </div>
        </div>
        
        {/* Stats bar - only show if we have summary stats */}
        {briefing.summary && (
          <div className="flex items-center gap-6 mt-4 text-sm text-argus-100">
            <span>📊 {briefing.summary.totalStories} stories</span>
            <span>📰 {briefing.summary.totalArticles} sources</span>
            {'readTimeMinutes' in briefing && <span>⏱️ {briefing.readTimeMinutes} min read</span>}
            <span title={getConfidenceDisplay(briefing.summary.avgConfidence).description}>{getConfidenceDisplay(briefing.summary.avgConfidence).emoji} {getConfidenceDisplay(briefing.summary.avgConfidence).label} confidence</span>
          </div>
        )}
      </header>

      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          id="briefing-audio"
          src={audioUrl}
          onEnded={() => setPlayingAudio(false)}
          onPause={() => setPlayingAudio(false)}
          onPlay={() => setPlayingAudio(true)}
        />
      )}

      {/* Content */}
      <div className="p-6">
        {hasSections ? (
          // Render structured sections
          briefing.sections!.map((section) => (
            <SectionComponent key={section.domainSlug} section={section} onVerify={handleVerify} />
          ))
        ) : hasMarkdown ? (
          // Render markdown content
          <MarkdownRenderer content={briefing.markdownContent!} onVerify={handleVerify} />
        ) : (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">
            No content available
          </p>
        )}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>
            Generated by <strong>Argus Intelligence Platform</strong> •{' '}
            <a href="https://docs.argus.vitalpoint.ai" className="text-argus-600 hover:underline">
              Documentation
            </a>
          </p>
        </footer>
      </div>

      {/* Verify Modal */}
      {verifyModalUrl && (
        <VerifyModal 
          url={verifyModalUrl} 
          isOpen={true} 
          onClose={() => setVerifyModalUrl(null)} 
        />
      )}
    </div>
  );
}
