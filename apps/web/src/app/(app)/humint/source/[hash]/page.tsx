'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { 
  Shield, 
  Star, 
  Users, 
  FileText, 
  Check, 
  Lock,
  Calendar,
  MapPin,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';

interface SourceProfile {
  codenameHash: string;
  publicKey: string;
  reputationScore: number;
  totalPosts: number;
  subscriberCount: number;
  tiers: {
    name: string;
    level: number;
    priceUsdc: number;
  }[];
  createdAt: string;
}

interface Post {
  postId: string;
  contentCid: string;
  tier: string;
  epoch: string;
  mediaCount: number;
  createdAt: string;
}

export default function SourceProfilePage() {
  const params = useParams();
  const hash = params.hash as string;
  const { user, token } = useAuth();
  
  const [source, setSource] = useState<SourceProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  useEffect(() => {
    fetchSource();
  }, [hash]);

  const fetchSource = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/humint-feed/sources/${hash}`);
      const data = await res.json();
      if (data.success) {
        setSource(data.data.source);
        setPosts(data.data.posts);
      }
    } catch (error) {
      console.error('Failed to fetch source:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (tierName: string) => {
    if (!user || !token) {
      // Redirect to login
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
      return;
    }

    setSubscribing(true);
    setSelectedTier(tierName);
    
    try {
      // In production, this would:
      // 1. Connect to NEAR wallet
      // 2. Purchase NFT access pass
      // 3. Store subscription
      
      // For now, just show a modal/redirect
      alert(`Subscription to ${tierName} tier coming soon!\n\nThis will purchase an NFT access pass that grants you decryption keys for this tier's content.`);
    } catch (error) {
      console.error('Subscribe error:', error);
    } finally {
      setSubscribing(false);
      setSelectedTier(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!source) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Source Not Found</h1>
          <p className="text-gray-400 mb-4">This source doesn't exist or has been deactivated.</p>
          <Link href="/humint" className="text-blue-500 hover:text-blue-400">
            ← Back to Feed
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gradient-to-b from-blue-900/30 to-gray-950 border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Profile */}
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Shield className="w-12 h-12 text-white" />
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">
                  Anonymous Source
                </h1>
                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/30">
                  Verified
                </span>
              </div>
              
              <p className="text-gray-500 text-sm mt-1 font-mono">
                {hash.slice(0, 16)}...{hash.slice(-8)}
              </p>

              <div className="flex items-center gap-6 mt-4 text-gray-400 text-sm">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-500" />
                  <span><strong className="text-white">{source.reputationScore}</strong> reputation</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span><strong className="text-white">{source.subscriberCount}</strong> subscribers</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span><strong className="text-white">{source.totalPosts}</strong> posts</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Joined {formatDate(source.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold text-white mb-4">Recent Posts</h2>
            
            {posts.length === 0 ? (
              <div className="text-center py-12 bg-gray-900 rounded-lg border border-gray-800">
                <FileText className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-400">No posts yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map((post) => (
                  <div 
                    key={post.postId}
                    className="p-4 bg-gray-900 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full border ${
                        post.tier === 'gold' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                        post.tier === 'silver' ? 'bg-gray-400/20 text-gray-300 border-gray-400/30' :
                        post.tier === 'bronze' ? 'bg-orange-600/20 text-orange-400 border-orange-600/30' :
                        'bg-green-500/20 text-green-400 border-green-500/30'
                      }`}>
                        {post.tier}
                      </span>
                      <span className="text-gray-500 text-sm">
                        {formatDate(post.createdAt)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-gray-400">
                      <Lock className="w-4 h-4" />
                      <span className="text-sm">Encrypted content</span>
                      {post.mediaCount > 0 && (
                        <span className="text-sm">• {post.mediaCount} media</span>
                      )}
                    </div>

                    <Link
                      href={`/humint/post/${post.postId}`}
                      className="mt-3 inline-block text-blue-400 hover:text-blue-300 text-sm"
                    >
                      View post →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Subscribe</h2>
            
            <div className="space-y-3">
              {source.tiers.map((tier) => (
                <div 
                  key={tier.name}
                  className={`p-4 rounded-lg border transition-colors ${
                    tier.priceUsdc === 0 
                      ? 'bg-green-900/20 border-green-800'
                      : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-semibold ${
                      tier.name === 'gold' ? 'text-yellow-400' :
                      tier.name === 'silver' ? 'text-gray-300' :
                      tier.name === 'bronze' ? 'text-orange-400' :
                      'text-green-400'
                    }`}>
                      {tier.name.charAt(0).toUpperCase() + tier.name.slice(1)}
                    </span>
                    <span className="text-white font-bold">
                      {tier.priceUsdc === 0 ? 'Free' : `$${tier.priceUsdc}/mo`}
                    </span>
                  </div>
                  
                  <ul className="text-gray-400 text-sm space-y-1 mb-3">
                    {tier.level >= 0 && <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Free posts</li>}
                    {tier.level >= 1 && <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Bronze posts</li>}
                    {tier.level >= 2 && <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Silver posts</li>}
                    {tier.level >= 3 && <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Gold posts</li>}
                  </ul>

                  {tier.priceUsdc > 0 ? (
                    <button
                      onClick={() => handleSubscribe(tier.name)}
                      disabled={subscribing}
                      className={`w-full py-2 rounded-lg font-medium text-sm transition-colors ${
                        subscribing && selectedTier === tier.name
                          ? 'bg-blue-600/50 text-blue-300 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                    >
                      {subscribing && selectedTier === tier.name ? 'Processing...' : 'Subscribe'}
                    </button>
                  ) : (
                    <div className="w-full py-2 text-center text-green-400 text-sm">
                      ✓ Already included
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* NFT info */}
            <div className="mt-6 p-4 bg-gray-900 rounded-lg border border-gray-800">
              <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                NFT Access Pass
              </h3>
              <p className="text-gray-400 text-sm">
                Subscriptions are NFTs that grant cryptographic access to encrypted content. 
                You can transfer or sell your access pass anytime.
              </p>
            </div>

            {/* Security info */}
            <div className="mt-4 p-4 bg-gray-900 rounded-lg border border-gray-800">
              <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Decentralized Access
              </h3>
              <p className="text-gray-400 text-sm">
                Access keys are derived from your wallet - not stored on any server. 
                Only you can decrypt content you've subscribed to.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
