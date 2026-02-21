'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';

interface Post {
  id: string;
  source: {
    id: string;
    codename: string;
  };
  tier: string;
  createdAt: string;
  locked: boolean;
  canUnlock: boolean;
  content?: {
    type: string;
    text?: string;
    mediaUrl?: string;
  };
  proofs?: {
    location: boolean;
    reputation: boolean;
    identity: boolean;
  };
}

interface Source {
  id: string;
  codename: string;
  bio?: string;
  tiers: Array<{
    name: string;
    pricePerMonth: number;
    description: string;
  }>;
}

export default function HumintFeedPage() {
  const { user, isHumint, loading: authLoading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [unlockingPost, setUnlockingPost] = useState<string | null>(null);
  const [isSource, setIsSource] = useState<boolean | null>(null);
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);

  // Check if HUMINT user needs to complete registration
  useEffect(() => {
    console.log('[Feed] Auth state:', { authLoading, isHumint, user });
    
    if (authLoading) return; // Wait for auth to load
    
    async function checkSourceRegistration() {
      console.log('[Feed] Checking source registration, isHumint:', isHumint);
      
      if (!isHumint) {
        // Not logged in with passkey, just load feed normally
        console.log('[Feed] Not HUMINT user, skipping redirect');
        setIsSource(false);
        return;
      }
      
      try {
        const res = await fetch('/api/humint-feed/sources/me', {
          credentials: 'include',
        });
        
        console.log('[Feed] Source check response:', res.status);
        
        if (res.ok) {
          setIsSource(true);
        } else {
          // HUMINT user but not registered as source - redirect to registration
          console.log('[Feed] HUMINT user not registered, redirecting...');
          setIsSource(false);
          router.push('/humint/sources/new');
        }
      } catch (err) {
        console.error('[Feed] Source check error:', err);
        setIsSource(false);
      }
    }
    
    checkSourceRegistration();
  }, [authLoading, isHumint, router]);

  useEffect(() => {
    loadFeed();
    loadSources();
  }, [selectedSource]);

  async function loadFeed() {
    try {
      const params = new URLSearchParams();
      if (selectedSource) params.set('source', selectedSource);
      
      const res = await fetch(`/api/humint-feed/feed?${params}`, {
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch (error) {
      console.error('Failed to load feed:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadSources() {
    try {
      const res = await fetch('/api/humint-feed/sources', {
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
      }
    } catch (error) {
      console.error('Failed to load sources:', error);
    }
  }

  async function unlockPost(postId: string) {
    setUnlockingPost(postId);
    try {
      const res = await fetch(`/api/humint-feed/posts/${postId}`, {
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        // Update post in feed with decrypted content
        setPosts(posts.map(p => 
          p.id === postId 
            ? { ...p, locked: false, content: data.content }
            : p
        ));
        setExpandedPost(postId);
      } else if (res.status === 403) {
        // Show subscription modal
        const post = posts.find(p => p.id === postId);
        if (post) {
          showSubscribeModal(post.source.id);
        }
      }
    } catch (error) {
      console.error('Failed to unlock post:', error);
    } finally {
      setUnlockingPost(null);
    }
  }

  function showSubscribeModal(sourceId: string) {
    // For now, redirect to subscribe page
    window.location.href = `/humint/subscribe/${sourceId}`;
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return date.toLocaleDateString();
  }

  function getTierBadgeColor(tier: string) {
    switch (tier.toLowerCase()) {
      case 'gold': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'silver': return 'bg-gray-400/20 text-gray-300 border-gray-400/30';
      case 'bronze': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    }
  }

  function handleReply(postId: string, sourceCodename: string) {
    // Navigate to compose with reply context
    router.push(`/humint/compose?replyTo=${postId}&source=${sourceCodename}`);
  }

  function handleSave(postId: string) {
    setSavedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }

  async function handleShare(postId: string) {
    const url = `${window.location.origin}/humint/post/${postId}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Intel from Argus',
          url: url,
        });
      } catch (err) {
        // User cancelled or error
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(url);
      setCopiedPostId(postId);
      setTimeout(() => setCopiedPostId(null), 2000);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">Intel Feed</h1>
          {isSource === false && (
            <Link 
              href="/humint/sources/new"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-full text-sm font-medium transition-colors"
            >
              Become a Source
            </Link>
          )}
          {isSource && (
            <Link 
              href="/humint/compose"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-full text-sm font-medium transition-colors"
            >
              Post Intel
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto">
        {/* Source Filter */}
        <div className="px-4 py-3 border-b border-gray-800 overflow-x-auto">
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedSource(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                !selectedSource 
                  ? 'bg-white text-gray-900' 
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              All Sources
            </button>
            {sources.slice(0, 5).map(source => (
              <button
                key={source.id}
                onClick={() => setSelectedSource(source.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedSource === source.id
                    ? 'bg-white text-gray-900'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {source.codename}
              </button>
            ))}
          </div>
        </div>

        {/* Feed */}
        <div className="divide-y divide-gray-800">
          {loading ? (
            <div className="py-12 text-center text-gray-500">
              <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="mt-3">Loading intel...</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-6xl mb-4">🔐</div>
              <h2 className="text-xl font-semibold mb-2">No Intel Yet</h2>
              <p className="text-gray-400 mb-6">
                Subscribe to sources to see their intel here.
              </p>
              <Link 
                href="/humint/discover"
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-full font-medium transition-colors"
              >
                Discover Sources
              </Link>
            </div>
          ) : (
            posts.map(post => (
              <article key={post.id} className="px-4 py-4 hover:bg-gray-900/50 transition-colors">
                {/* Post Header */}
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-lg font-bold">
                    {post.source.codename.charAt(0).toUpperCase()}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    {/* Name & Time */}
                    <div className="flex items-center gap-2">
                      <Link 
                        href={`/humint/sources/${post.source.id}`}
                        className="font-semibold hover:underline"
                      >
                        {post.source.codename}
                      </Link>
                      <span className="text-gray-500">·</span>
                      <span className="text-gray-500 text-sm">
                        {formatTime(post.createdAt)}
                      </span>
                      {post.tier !== 'Free' && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getTierBadgeColor(post.tier)}`}>
                          {post.tier}
                        </span>
                      )}
                      {/* ZK Proof Badges */}
                      {post.proofs?.location && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30" title="Location verified via ZK proof">
                          📍 Verified
                        </span>
                      )}
                      {post.proofs?.reputation && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30" title="Reputation verified via ZK proof">
                          ⭐ Trusted
                        </span>
                      )}
                    </div>
                    
                    {/* Content */}
                    {post.locked ? (
                      <div className="mt-3 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                        <div className="flex items-center gap-3 text-gray-400">
                          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <div className="flex-1">
                            <p className="font-medium text-white">Premium Intel</p>
                            <p className="text-sm">
                              Subscribe to {post.tier} tier to unlock
                            </p>
                          </div>
                          <button
                            onClick={() => unlockPost(post.id)}
                            disabled={unlockingPost === post.id}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-full text-sm font-medium text-white transition-colors disabled:opacity-50"
                          >
                            {unlockingPost === post.id ? 'Checking...' : 'Unlock'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2">
                        {post.content?.text && (
                          <p className="text-gray-100 whitespace-pre-wrap">
                            {expandedPost === post.id || post.content.text.length < 280
                              ? post.content.text
                              : (
                                <>
                                  {post.content.text.slice(0, 280)}...
                                  <button 
                                    onClick={() => setExpandedPost(post.id)}
                                    className="text-emerald-400 hover:underline ml-1"
                                  >
                                    Show more
                                  </button>
                                </>
                              )
                            }
                          </p>
                        )}
                        {post.content?.mediaUrl && (
                          <div className="mt-3 rounded-xl overflow-hidden border border-gray-800">
                            <img 
                              src={post.content.mediaUrl} 
                              alt="Intel media"
                              className="w-full max-h-96 object-cover"
                            />
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Actions */}
                    <div className="flex items-center gap-6 mt-3 text-gray-500">
                      <button 
                        onClick={() => handleReply(post.id, post.source.codename)}
                        className="flex items-center gap-2 hover:text-emerald-400 transition-colors group"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <span className="text-sm group-hover:text-emerald-400">Reply</span>
                      </button>
                      <button 
                        onClick={() => handleSave(post.id)}
                        className={`flex items-center gap-2 transition-colors group ${savedPosts.has(post.id) ? 'text-red-400' : 'hover:text-red-400'}`}
                      >
                        <svg className="w-5 h-5" fill={savedPosts.has(post.id) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                        <span className="text-sm">{savedPosts.has(post.id) ? 'Saved' : 'Save'}</span>
                      </button>
                      <button 
                        onClick={() => handleShare(post.id)}
                        className="flex items-center gap-2 hover:text-emerald-400 transition-colors group"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        <span className="text-sm group-hover:text-emerald-400">
                          {copiedPostId === post.id ? 'Copied!' : 'Share'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      {/* Floating Compose Button (for sources only) */}
      {isSource && (
        <Link
          href="/humint/compose"
          className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-600 hover:bg-emerald-500 rounded-full shadow-lg flex items-center justify-center transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </Link>
      )}
    </div>
  );
}
