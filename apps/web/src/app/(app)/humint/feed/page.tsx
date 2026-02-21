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
  likeCount: number;
  replyCount: number;
  liked: boolean;
  isOwner: boolean;
  parentId?: string;
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
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [likingPostId, setLikingPostId] = useState<string | null>(null);

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

  async function handleLike(postId: string, currentlyLiked: boolean) {
    setLikingPostId(postId);
    try {
      const res = await fetch(`/api/humint-feed/posts/${postId}/like`, {
        method: currentlyLiked ? 'DELETE' : 'POST',
        credentials: 'include',
      });

      if (res.ok) {
        // Update local state
        setPosts(prev => prev.map(p => 
          p.id === postId 
            ? { 
                ...p, 
                liked: !currentlyLiked, 
                likeCount: currentlyLiked ? p.likeCount - 1 : p.likeCount + 1 
              } 
            : p
        ));
      }
    } catch (err) {
      console.error('Like error:', err);
    } finally {
      setLikingPostId(null);
    }
  }

  async function handleDelete(postId: string) {
    if (!confirm('Are you sure you want to delete this post?')) {
      return;
    }

    setDeletingPostId(postId);
    try {
      const res = await fetch(`/api/humint-feed/posts/${postId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        // Remove from local state
        setPosts(prev => prev.filter(p => p.id !== postId));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
      }
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setDeletingPostId(null);
    }
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
              <article key={post.id} className="px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer border-b border-gray-800">
                <div className="flex gap-3">
                  {/* Avatar */}
                  <Link href={`/humint/sources/${post.source.id}`} className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-sm font-bold hover:opacity-90 transition-opacity">
                      {post.source.codename.charAt(0).toUpperCase()}
                    </div>
                  </Link>
                  
                  <div className="flex-1 min-w-0">
                    {/* Header row */}
                    <div className="flex items-center gap-1 text-[15px]">
                      <Link href={`/humint/sources/${post.source.id}`} className="font-bold hover:underline truncate">
                        {post.source.codename}
                      </Link>
                      <span className="text-gray-500 truncate">@{post.source.id}</span>
                      <span className="text-gray-500">·</span>
                      <span className="text-gray-500 hover:underline">{formatTime(post.createdAt)}</span>
                      {post.tier !== 'Free' && (
                        <span className="ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-500/20 text-emerald-400">
                          {post.tier}
                        </span>
                      )}
                      {/* More menu */}
                      {post.isOwner && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(post.id); }}
                          className="ml-auto p-1.5 -m-1.5 rounded-full hover:bg-red-500/10 hover:text-red-400 text-gray-500 transition-colors"
                        >
                          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    
                    {/* Content */}
                    {post.locked ? (
                      <div className="mt-2 p-3 bg-gray-800/50 rounded-2xl border border-gray-700/50">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <span className="text-gray-400 text-sm flex-1">Subscribe to unlock</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); unlockPost(post.id); }}
                            className="px-3 py-1 bg-white text-black rounded-full text-sm font-bold hover:bg-gray-200 transition-colors"
                          >
                            Subscribe
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <p className="text-[15px] text-white leading-normal whitespace-pre-wrap break-words">
                          {post.content?.text}
                        </p>
                        {post.content?.mediaUrl && (
                          <div className="mt-3 rounded-2xl overflow-hidden border border-gray-700">
                            <img 
                              src={post.content.mediaUrl} 
                              alt=""
                              className="w-full"
                            />
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* X-style action bar */}
                    <div className="flex items-center justify-between mt-3 max-w-[425px] -ml-2">
                      {/* Reply */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleReply(post.id, post.source.codename); }}
                        className="group flex items-center"
                      >
                        <div className="p-2 rounded-full group-hover:bg-sky-500/10 transition-colors">
                          <svg className="w-[18px] h-[18px] text-gray-500 group-hover:text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </div>
                        {post.replyCount > 0 && <span className="text-[13px] text-gray-500 group-hover:text-sky-500 -ml-1">{post.replyCount}</span>}
                      </button>
                      
                      {/* Repost placeholder */}
                      <button className="group flex items-center">
                        <div className="p-2 rounded-full group-hover:bg-green-500/10 transition-colors">
                          <svg className="w-[18px] h-[18px] text-gray-500 group-hover:text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </div>
                      </button>
                      
                      {/* Like */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleLike(post.id, post.liked); }}
                        disabled={likingPostId === post.id}
                        className="group flex items-center"
                      >
                        <div className={`p-2 rounded-full transition-colors ${post.liked ? 'text-pink-600' : 'group-hover:bg-pink-500/10'}`}>
                          <svg className={`w-[18px] h-[18px] ${post.liked ? 'text-pink-600 fill-current' : 'text-gray-500 group-hover:text-pink-600'}`} viewBox="0 0 24 24" stroke="currentColor" fill={post.liked ? 'currentColor' : 'none'}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        </div>
                        {post.likeCount > 0 && <span className={`text-[13px] -ml-1 ${post.liked ? 'text-pink-600' : 'text-gray-500 group-hover:text-pink-600'}`}>{post.likeCount}</span>}
                      </button>
                      
                      {/* Views placeholder */}
                      <button className="group flex items-center">
                        <div className="p-2 rounded-full group-hover:bg-sky-500/10 transition-colors">
                          <svg className="w-[18px] h-[18px] text-gray-500 group-hover:text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                      </button>
                      
                      {/* Bookmark & Share */}
                      <div className="flex items-center">
                        <button className="group p-2 rounded-full hover:bg-sky-500/10 transition-colors">
                          <svg className="w-[18px] h-[18px] text-gray-500 group-hover:text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleShare(post.id); }}
                          className="group p-2 rounded-full hover:bg-sky-500/10 transition-colors"
                        >
                          <svg className={`w-[18px] h-[18px] ${copiedPostId === post.id ? 'text-green-500' : 'text-gray-500 group-hover:text-sky-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        </button>
                      </div>
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
