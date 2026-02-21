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
    <div className="fixed inset-0 bg-black text-white overflow-auto">
      {/* Header - X style */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-neutral-800">
        <div className="px-4 h-[53px] flex items-center justify-between">
          <h1 className="text-xl font-bold">Intel</h1>
          {isSource && (
            <Link 
              href="/humint/compose"
              className="px-4 py-1.5 bg-white text-black rounded-full text-sm font-bold hover:bg-neutral-200 transition-colors"
            >
              Post
            </Link>
          )}
        </div>
      </header>

      <div className="w-full min-h-[calc(100vh-53px)]">
        {/* Tabs */}
        <div className="flex border-b border-neutral-800">
          <button className="flex-1 py-4 text-center hover:bg-white/[0.03] transition-colors relative">
            <span className="font-bold text-[15px]">For you</span>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-sky-500 rounded-full"></div>
          </button>
          <button className="flex-1 py-4 text-center text-neutral-500 hover:bg-white/[0.03] transition-colors">
            <span className="font-medium text-[15px]">Following</span>
          </button>
        </div>

        {/* Feed */}
        <div>
          {loading ? (
            <div className="py-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : posts.length === 0 ? (
            <div className="py-16 px-8 text-center">
              <h2 className="text-[31px] font-extrabold mb-2">Welcome to Intel</h2>
              <p className="text-neutral-500 text-[15px]">
                When sources you follow post intel, it will show up here.
              </p>
            </div>
          ) : (
            posts.map(post => (
              <article key={post.id} className="px-4 py-3 border-b border-neutral-800 hover:bg-white/[0.03] transition-colors">
                <div className="flex gap-3">
                  {/* Avatar */}
                  <Link href={`/humint/sources/${post.source.id}`} className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-neutral-700 flex items-center justify-center text-sm font-bold hover:brightness-90 transition">
                      {post.source.codename.charAt(0).toUpperCase()}
                    </div>
                  </Link>
                  
                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-1 text-[15px] leading-5">
                      <Link href={`/humint/sources/${post.source.id}`} className="font-bold hover:underline">
                        {post.source.codename}
                      </Link>
                      <span className="text-neutral-500">@{post.source.id.slice(0, 8)}</span>
                      <span className="text-neutral-500">·</span>
                      <time className="text-neutral-500 hover:underline">{formatTime(post.createdAt)}</time>
                      {post.isOwner && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(post.id); }}
                          className="ml-auto p-2 -m-2 rounded-full hover:bg-sky-500/10 text-neutral-500 hover:text-sky-500 transition-colors"
                        >
                          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9 2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm7 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                          </svg>
                        </button>
                      )}
                    </div>
                    
                    {/* Content */}
                    {post.locked ? (
                      <div className="mt-3 py-6 text-center border border-neutral-800 rounded-2xl">
                        <svg className="w-8 h-8 text-neutral-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <p className="text-neutral-500 text-sm mb-3">Premium content</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); unlockPost(post.id); }}
                          className="px-4 py-1.5 bg-white text-black rounded-full text-sm font-bold hover:bg-neutral-200 transition-colors"
                        >
                          Subscribe
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="mt-0.5 text-[15px] leading-[20px] whitespace-pre-wrap break-words">
                          {post.content?.text}
                        </p>
                        {post.content?.mediaUrl && (
                          <div className="mt-3 rounded-2xl overflow-hidden border border-neutral-800">
                            <img src={post.content.mediaUrl} alt="" className="w-full" />
                          </div>
                        )}
                      </>
                    )}
                    
                    {/* Actions */}
                    <div className="flex items-center mt-3 -ml-2 max-w-md justify-between">
                      {/* Reply */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleReply(post.id, post.source.codename); }}
                        className="group flex items-center gap-0.5 text-neutral-500"
                      >
                        <div className="p-2 rounded-full group-hover:bg-sky-500/10 group-hover:text-sky-400 transition-colors">
                          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z"/>
                          </svg>
                        </div>
                        {post.replyCount > 0 && <span className="text-[13px] group-hover:text-sky-400">{post.replyCount}</span>}
                      </button>
                      
                      {/* Repost */}
                      <button className="group flex items-center gap-0.5 text-neutral-500">
                        <div className="p-2 rounded-full group-hover:bg-green-500/10 group-hover:text-green-400 transition-colors">
                          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2h6v2h-6c-2.21 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 20.12l-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2h-6V4h6c2.21 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14z"/>
                          </svg>
                        </div>
                      </button>
                      
                      {/* Like */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleLike(post.id, post.liked); }}
                        className={`group flex items-center gap-0.5 ${post.liked ? 'text-pink-600' : 'text-neutral-500'}`}
                      >
                        <div className={`p-2 rounded-full transition-colors ${post.liked ? '' : 'group-hover:bg-pink-500/10 group-hover:text-pink-600'}`}>
                          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill={post.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5}>
                            <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/>
                          </svg>
                        </div>
                        {post.likeCount > 0 && <span className="text-[13px]">{post.likeCount}</span>}
                      </button>
                      
                      {/* Views */}
                      <button className="group flex items-center gap-0.5 text-neutral-500">
                        <div className="p-2 rounded-full group-hover:bg-sky-500/10 group-hover:text-sky-400 transition-colors">
                          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path d="M8.75 21V3h2v18h-2zM18.75 21V8.5h2V21h-2zM13.75 21v-6h2v6h-2zM3.75 21v-3h2v3h-2z"/>
                          </svg>
                        </div>
                      </button>
                      
                      {/* Bookmark & Share */}
                      <div className="flex">
                        <button className="group p-2 rounded-full text-neutral-500 hover:bg-sky-500/10 hover:text-sky-400 transition-colors">
                          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z"/>
                          </svg>
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleShare(post.id); }}
                          className={`group p-2 rounded-full transition-colors ${copiedPostId === post.id ? 'text-green-400' : 'text-neutral-500 hover:bg-sky-500/10 hover:text-sky-400'}`}
                        >
                          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"/>
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

      {/* Floating Compose Button - X style */}
      {isSource && (
        <Link
          href="/humint/compose"
          className="fixed bottom-6 right-6 w-14 h-14 bg-sky-500 hover:bg-sky-600 rounded-full shadow-lg flex items-center justify-center transition-colors"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23 3c-6.62-.1-10.38 2.421-13.05 6.03C7.29 12.61 6 17.331 6 22h2c0-1.007.07-2.012.19-3H12c4.1 0 7.48-3.082 7.94-7.054C22.79 10.147 23.17 6.359 23 3zm-7 8h-1.5v2H16c.63-.016 1.2-.08 1.72-.188C16.95 15.24 14.68 17 12 17H8.55c.57-2.512 1.57-4.851 3-6.78 2.16-2.912 5.29-4.911 9.45-5.187C20.95 8.079 19.9 11 16 11zM4 9V6H1V4h3V1h2v3h3v2H6v3H4z"/>
          </svg>
        </Link>
      )}
    </div>
  );
}
