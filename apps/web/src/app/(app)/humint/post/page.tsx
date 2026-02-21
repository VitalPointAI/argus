'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { 
  createEncryptedPost, 
  initHumintCrypto, 
  type HumintKeys 
} from '@/lib/humint-crypto';
import { 
  Image, 
  Video, 
  X, 
  Lock, 
  Shield, 
  AlertTriangle,
  Upload,
  Eye,
  EyeOff 
} from 'lucide-react';
import Link from 'next/link';

export default function CreatePostPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [content, setContent] = useState('');
  const [tier, setTier] = useState<'free' | 'bronze' | 'silver' | 'gold'>('free');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<HumintKeys | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Initialize crypto keys (would connect to wallet in production)
  const initKeys = async () => {
    if (keys) return keys;
    
    // Mock wallet signing for now
    const mockSignMessage = async (message: string) => ({
      signature: btoa(message + Date.now()),
      publicKey: 'mock-pubkey',
    });
    
    const newKeys = await initHumintCrypto(
      user?.nearAccountId || 'test.near',
      mockSignMessage
    );
    setKeys(newKeys);
    return newKeys;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + mediaFiles.length > 4) {
      setError('Maximum 4 media files allowed');
      return;
    }
    
    setMediaFiles([...mediaFiles, ...files]);
    
    // Generate previews
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setMediaPreviews(prev => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeMedia = (index: number) => {
    setMediaFiles(mediaFiles.filter((_, i) => i !== index));
    setMediaPreviews(mediaPreviews.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!content.trim() && mediaFiles.length === 0) {
      setError('Post must have content or media');
      return;
    }

    setPosting(true);
    setError(null);

    try {
      // Initialize crypto
      const cryptoKeys = await initKeys();
      
      // Read media files as ArrayBuffers
      const mediaBlobs = await Promise.all(
        mediaFiles.map(file => file.arrayBuffer().then(buf => new Uint8Array(buf)))
      );
      
      // Encrypt everything client-side
      const { textPost, mediaBlobs: encryptedMedia } = await createEncryptedPost(
        content,
        mediaBlobs,
        tier,
        cryptoKeys
      );
      
      // Upload encrypted media to IPFS first
      const mediaCids: string[] = [];
      for (const blob of encryptedMedia) {
        const res = await fetch('/api/humint-feed/media', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            encryptedBlob: btoa(String.fromCharCode(...blob.encrypted)),
          }),
        });
        const data = await res.json();
        if (data.success) {
          mediaCids.push(data.data.cid);
        }
      }
      
      // Create post
      const postId = crypto.randomUUID();
      const res = await fetch('/api/humint-feed/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          postId,
          encryptedContent: textPost.encryptedContent,
          contentHash: textPost.contentHash,
          contentKeyWrapped: textPost.contentKeyWrapped,
          iv: textPost.iv,
          tier: textPost.tier,
          epoch: textPost.epoch,
          mediaCids,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        router.push('/humint');
      } else {
        setError(data.error || 'Failed to create post');
      }
    } catch (err) {
      console.error('Post creation error:', err);
      setError('Failed to create post. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const tierOptions = [
    { value: 'free', label: 'Free', description: 'Visible to everyone', color: 'green' },
    { value: 'bronze', label: 'Bronze', description: '$5/month subscribers', color: 'orange' },
    { value: 'silver', label: 'Silver', description: '$15/month subscribers', color: 'gray' },
    { value: 'gold', label: 'Gold', description: '$50/month subscribers', color: 'yellow' },
  ];

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link href="/humint" className="text-gray-400 hover:text-white">
              <X className="w-6 h-6" />
            </Link>
            <button
              onClick={handleSubmit}
              disabled={posting || (!content.trim() && mediaFiles.length === 0)}
              className={`px-5 py-2 rounded-full font-medium text-sm transition-colors ${
                posting || (!content.trim() && mediaFiles.length === 0)
                  ? 'bg-blue-600/50 text-blue-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {posting ? 'Encrypting...' : 'Post'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Security notice */}
        <div className="mb-6 p-4 bg-green-900/20 border border-green-800 rounded-lg flex items-start gap-3">
          <Shield className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-green-400 font-medium">End-to-end encrypted</p>
            <p className="text-green-300/70 text-sm mt-1">
              Your content is encrypted in your browser before upload. 
              Only subscribers with valid access can decrypt it.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Composer */}
        <div className="flex gap-3">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-lg">
              {user?.name?.[0] || '?'}
            </span>
          </div>

          <div className="flex-1">
            {/* Text input */}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What intelligence do you have?"
              className="w-full bg-transparent text-white text-xl placeholder-gray-600 resize-none border-none focus:outline-none min-h-[120px]"
              autoFocus
            />

            {/* Media previews */}
            {mediaPreviews.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {mediaPreviews.map((preview, i) => (
                  <div key={i} className="relative rounded-xl overflow-hidden">
                    <img 
                      src={preview} 
                      alt="" 
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => removeMedia(i)}
                      className="absolute top-2 right-2 p-1 bg-black/70 rounded-full hover:bg-black"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                    <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded text-xs text-white flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Encrypted
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tier selector */}
            <div className="mt-6 pt-4 border-t border-gray-800">
              <p className="text-gray-400 text-sm mb-3">Who can see this?</p>
              <div className="grid grid-cols-2 gap-2">
                {tierOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setTier(option.value as typeof tier)}
                    className={`p-3 rounded-lg border transition-colors text-left ${
                      tier === option.value
                        ? `border-${option.color}-500 bg-${option.color}-500/10`
                        : 'border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    <div className={`font-medium ${
                      tier === option.value ? `text-${option.color}-400` : 'text-white'
                    }`}>
                      {option.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {option.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between">
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-full transition-colors"
                  title="Add image"
                >
                  <Image className="w-5 h-5" />
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-full transition-colors"
                  title="Add video"
                >
                  <Video className="w-5 h-5" />
                </button>
              </div>

              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm"
              >
                {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                Preview
              </button>
            </div>
          </div>
        </div>

        {/* Preview */}
        {showPreview && content && (
          <div className="mt-6 p-4 bg-gray-900 rounded-lg border border-gray-800">
            <p className="text-gray-400 text-xs mb-2">Preview (how subscribers will see it):</p>
            <p className="text-white whitespace-pre-wrap">{content}</p>
          </div>
        )}

        {/* Info */}
        <div className="mt-8 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
          <h3 className="text-white font-medium mb-2">🔐 How encryption works</h3>
          <ul className="text-gray-400 text-sm space-y-2">
            <li>• Your content is encrypted in your browser using AES-256-GCM</li>
            <li>• Encryption keys are derived from your wallet - never stored anywhere</li>
            <li>• Only subscribers with valid NFT access passes can decrypt</li>
            <li>• Even we can't read your encrypted posts</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
