'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface NftListing {
  tokenId: string;
  name: string;
  description: string;
  sourceCount: number;
  domain: string;
  creator: string;
  owner: string;
  price?: string;
  royaltyPercent: number;
  isActive: boolean;
}

interface ContractInfo {
  network: string;
  nftContract: string;
  dataRegistryContract: string;
  rpcEndpoint: string;
}

export default function MarketplacePage() {
  const { user, token } = useAuth();
  const [listings, setListings] = useState<NftListing[]>([]);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchContractInfo();
    fetchListings();
  }, []);

  const fetchContractInfo = async () => {
    try {
      const res = await fetch(`${API_URL}/api/nft/contract-info`);
      const data = await res.json();
      if (data.success) {
        setContractInfo(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch contract info:', err);
    }
  };

  const fetchListings = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/nft/marketplace`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      const data = await res.json();
      
      if (data.success) {
        setListings(data.data);
      } else {
        setError(data.error || 'Failed to load marketplace');
      }
    } catch (err) {
      setError('Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="text-4xl">🎨</span>
            Source List Marketplace
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Trade curated intelligence source lists as NFTs
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link
            href="/sources/manage"
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            My Source Lists
          </Link>
        </div>
      </div>

      {/* Contract Info Banner */}
      {contractInfo && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="font-semibold text-purple-700 dark:text-purple-300">
              ⛓️ NEAR {contractInfo.network.toUpperCase()}
            </span>
            <span className="text-slate-600 dark:text-slate-400">
              Contract: <code className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded">{contractInfo.nftContract}</code>
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-slate-500">Loading marketplace...</div>
        </div>
      )}

      {/* Listings Grid */}
      {!loading && listings.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((nft) => (
            <div
              key={nft.tokenId}
              className="bg-white dark:bg-slate-800 rounded-lg shadow hover:shadow-lg transition p-6"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {nft.name}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                    {nft.description}
                  </p>
                </div>
                {nft.price && (
                  <div className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm font-bold">
                    {nft.price} Ⓝ
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <span className="text-slate-500">Sources:</span>
                  <span className="ml-2 font-semibold">{nft.sourceCount}</span>
                </div>
                <div>
                  <span className="text-slate-500">Domain:</span>
                  <span className="ml-2 font-semibold">{nft.domain}</span>
                </div>
                <div>
                  <span className="text-slate-500">Royalty:</span>
                  <span className="ml-2 font-semibold">{nft.royaltyPercent}%</span>
                </div>
                <div>
                  <span className="text-slate-500">Status:</span>
                  <span className={`ml-2 font-semibold ${nft.isActive ? 'text-green-600' : 'text-slate-400'}`}>
                    {nft.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {/* Creator */}
              <div className="text-xs text-slate-500 mb-4">
                Created by: <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">{nft.creator}</code>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Link
                  href={`/marketplace/${nft.tokenId}`}
                  className="flex-1 text-center px-4 py-2 bg-argus-600 text-white rounded-lg hover:bg-argus-700 transition font-medium"
                >
                  View Details
                </Link>
                {nft.price && (
                  <button
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                    onClick={() => alert('Connect NEAR wallet to purchase')}
                  >
                    Buy
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && listings.length === 0 && (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-lg shadow">
          <div className="text-6xl mb-4">🎨</div>
          <h3 className="text-xl font-semibold mb-2">No NFTs Listed Yet</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
            The marketplace is empty. Be the first to mint a source list NFT and start trading curated intelligence!
          </p>
          <Link
            href="/sources/manage"
            className="inline-block px-6 py-3 bg-argus-600 text-white rounded-lg hover:bg-argus-700 transition font-medium"
          >
            Create a Source List
          </Link>
        </div>
      )}

      {/* How It Works */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6">
        <h3 className="font-semibold mb-4 text-lg">How NFT Source Lists Work</h3>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <div className="text-2xl mb-2">1️⃣</div>
            <h4 className="font-medium mb-1">Create & Curate</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Build a source list in your dashboard. Add high-quality sources, set domains, and refine your curation.
            </p>
          </div>
          <div>
            <div className="text-2xl mb-2">2️⃣</div>
            <h4 className="font-medium mb-1">Mint as NFT</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Convert your list to an NFT. Data is encrypted and stored on IPFS. Ownership is recorded on NEAR.
            </p>
          </div>
          <div>
            <div className="text-2xl mb-2">3️⃣</div>
            <h4 className="font-medium mb-1">Trade & Earn</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              List for sale, set your price. Earn royalties on secondary sales. Buyers get access to your curated sources.
            </p>
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span>👤</span> For Curators
          </h3>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li>• Monetize your research and curation work</li>
            <li>• Earn ongoing royalties from resales</li>
            <li>• Build reputation as a trusted curator</li>
            <li>• Keep control with encrypted data</li>
          </ul>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span>🔍</span> For Analysts
          </h3>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li>• Access expertly curated source collections</li>
            <li>• Skip the research, get straight to analysis</li>
            <li>• Verified quality through marketplace ratings</li>
            <li>• Support independent curators</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
