'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { Lock, Unlock, Image, Video, MessageCircle, Heart, Share2, Clock, Shield } from 'lucide-react';
import Link from 'next/link';

interface Post {
  id: string;
  postId: string;
  sourceHash: string;
  contentCid: string;
  tier: string;
  epoch: string;
  mediaCount: number;
  createdAt: string;
  sourceCodename?: string;
  sourceReputation?: number;
  sourcePubkey?: string;
  hasAccess?: boolean;
}

export default function HumintFeedPage() {
  const { user, token } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'subscribed'>('all');

  useEffect(() => {
    fetchFeed();
  }, [filter]);

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/humint-feed', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) {
        setPosts(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'gold': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'silver': return 'bg-gray-400/20 text-gray-300 border-gray-400/30';
      case 'bronze': return 'bg-orange-600/20 text-orange-400 border-orange-600/30';
      default: return 'bg-green-500/20 text-green-400 border-green-500/30';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <h1 className="text-xl font-bold text-white">Intel Feed</h1>
            <Link
              href="/humint/post"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-full transition-colors"
            >
              + Post Intel
            </Link>
          </div>
          
          {/* Filter tabs */}
          <div className="flex gap-6 border-b border-gray-800 -mb-px">
            <button
              onClick={() => setFilter('all')}
              className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                filter === 'all'
                  ? 'text-white border-blue-500'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              All Intel
            </button>
            <button
              onClick={() => setFilter('subscribed')}
              className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                filter === 'subscribed'
                  ? 'text-white border-blue-500'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              Subscribed
            </button>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="max-w-2xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <Shield className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-400 mb-2">No intel yet</h2>
            <p className="text-gray-600 mb-6">
              Be the first to post intelligence or subscribe to sources.
            </p>
            <Link
              href="/humint/sources"
              className="text-blue-500 hover:text-blue-400"
            >
              Browse Sources →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {posts.map((post) => (
              <PostCard key={post.postId} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PostCard({ post }: { post: Post }) {
  const [expanded, setExpanded] = useState(false);
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  const handleDecrypt = async () => {
    if (!post.hasAccess) return;
    
    setDecrypting(true);
    try {
      // TODO: Implement actual decryption using humint-crypto
      // For now, show placeholder
      setTimeout(() => {
        setDecryptedContent('🔓 [Decrypted content would appear here]\n\nThis post has been encrypted with post-quantum cryptography. Only subscribers with valid access passes can view the content.');
        setDecrypting(false);
      }, 1000);
    } catch (error) {
      console.error('Decryption failed:', error);
      setDecrypting(false);
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'gold': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'silver': return 'bg-gray-400/20 text-gray-300 border-gray-400/30';
      case 'bronze': return 'bg-orange-600/20 text-orange-400 border-orange-600/30';
      default: return 'bg-green-500/20 text-green-400 border-green-500/30';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <article className="px-4 py-4 hover:bg-gray-900/50 transition-colors">
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <Link href={`/humint/source/${post.sourceHash}`}>
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-lg">
              {post.sourceCodename?.[0] || '?'}
            </span>
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          {/* Name and meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link 
              href={`/humint/source/${post.sourceHash}`}
              className="font-bold text-white hover:underline"
            >
              {post.sourceCodename || `Source-${post.sourceHash.slice(0, 8)}`}
            </Link>
            {post.sourceReputation && (
              <span className="text-xs text-gray-500">
                ⭐ {post.sourceReputation}
              </span>
            )}
            <span className="text-gray-600">·</span>
            <span className="text-gray-500 text-sm">
              {formatTimeAgo(post.createdAt)}
            </span>
            <span className={`px-2 py-0.5 text-xs rounded-full border ${getTierColor(post.tier)}`}>
              {post.tier}
            </span>
          </div>

          {/* Content */}
          <div className="mt-2">
            {post.hasAccess ? (
              decryptedContent ? (
                <p className="text-gray-200 whitespace-pre-wrap">{decryptedContent}</p>
              ) : (
                <button
                  onClick={handleDecrypt}
                  disabled={decrypting}
                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {decrypting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent" />
                      Decrypting...
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4" />
                      Click to decrypt
                    </>
                  )}
                </button>
              )
            ) : (
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                <div className="flex items-center gap-2 text-gray-400">
                  <Lock className="w-5 h-5" />
                  <span>This content requires a <strong>{post.tier}</strong> subscription</span>
                </div>
                <Link
                  href={`/humint/source/${post.sourceHash}`}
                  className="mt-3 inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Subscribe to Access
                </Link>
              </div>
            )}
          </div>

          {/* Media indicator */}
          {post.mediaCount > 0 && (
            <div className="mt-3 flex items-center gap-2 text-gray-500 text-sm">
              <Image className="w-4 h-4" />
              <span>{post.mediaCount} media file{post.mediaCount > 1 ? 's' : ''}</span>
              {!post.hasAccess && <Lock className="w-3 h-3" />}
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex items-center gap-6 text-gray-500">
            <button className="flex items-center gap-2 hover:text-blue-400 transition-colors">
              <MessageCircle className="w-5 h-5" />
              <span className="text-sm">0</span>
            </button>
            <button className="flex items-center gap-2 hover:text-pink-400 transition-colors">
              <Heart className="w-5 h-5" />
              <span className="text-sm">0</span>
            </button>
            <button className="flex items-center gap-2 hover:text-green-400 transition-colors">
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
