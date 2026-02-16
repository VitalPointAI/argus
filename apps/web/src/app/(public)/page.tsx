'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AccountTypeModal } from '@/components/AccountTypeModal';
import { SourceRegistrationModal } from '@/components/SourceRegistrationModal';

// Component that uses useSearchParams - must be wrapped in Suspense
function SearchParamsHandler({ 
  onSourceRegister 
}: { 
  onSourceRegister: () => void 
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const register = searchParams.get('register');
    if (register === 'source') {
      onSourceRegister();
      // Clean up URL
      router.replace('/', { scroll: false });
    }
  }, [searchParams, router, onSourceRegister]);

  return null;
}

export default function LandingPage() {
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);

  const handleSourceSelected = () => {
    setShowAccountModal(false);
    setShowSourceModal(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Suspense wrapper for useSearchParams */}
      <Suspense fallback={null}>
        <SearchParamsHandler onSourceRegister={() => setShowSourceModal(true)} />
      </Suspense>

      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-argus-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 text-center">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <img 
              src="/logo.svg" 
              alt="Argus" 
              className="w-24 h-24 shadow-lg shadow-argus-500/30 rounded-full"
            />
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight">
            Strategic Intelligence
            <br />
            <span className="bg-gradient-to-r from-argus-400 to-purple-400 bg-clip-text text-transparent">
              Reimagined
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-slate-300 mb-12 max-w-3xl mx-auto leading-relaxed">
            Argus is an open-source intelligence platform with AI verification, 
            crowd-sourced confidence scoring, and anonymous HUMINT collection.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => setShowAccountModal(true)}
              className="px-8 py-4 bg-gradient-to-r from-argus-600 to-argus-500 hover:from-argus-500 hover:to-argus-400 text-white font-semibold rounded-xl shadow-lg shadow-argus-500/30 transition-all transform hover:scale-105"
            >
              Get Started
            </button>
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-slate-700/50 hover:bg-slate-700 text-white font-semibold rounded-xl border border-slate-600 transition-all"
            >
              View Demo
            </Link>
            <a
              href="https://docs.argus.vitalpoint.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 bg-transparent hover:bg-slate-700/50 text-white font-semibold rounded-xl border border-slate-600 transition-all"
            >
              Learn More →
            </a>
          </div>

          {/* Trust indicators */}
          <div className="mt-12 flex flex-wrap justify-center gap-8 text-slate-400 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Open Source
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Zero-Knowledge Proofs
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400">✓</span> NEAR Blockchain
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Anonymous Sources
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-16">
            Intelligence Infrastructure for the Modern Age
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50 hover:border-argus-500/50 transition-all">
              <div className="w-14 h-14 rounded-xl bg-argus-500/20 flex items-center justify-center text-2xl mb-6">
                📡
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                Real-Time OSINT Collection
              </h3>
              <p className="text-slate-400">
                Continuous monitoring of open sources with AI-powered relevance scoring and automatic categorization.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50 hover:border-argus-500/50 transition-all">
              <div className="w-14 h-14 rounded-xl bg-purple-500/20 flex items-center justify-center text-2xl mb-6">
                🔐
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                Anonymous HUMINT Sources
              </h3>
              <p className="text-slate-400">
                Protect your sources with passkey-only authentication. We can't identify them—by design.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50 hover:border-argus-500/50 transition-all">
              <div className="w-14 h-14 rounded-xl bg-green-500/20 flex items-center justify-center text-2xl mb-6">
                ✓
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                Crowd-Verified Intelligence
              </h3>
              <p className="text-slate-400">
                Community-driven verification with confidence scores. See how reliable each piece of intel is.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50 hover:border-argus-500/50 transition-all">
              <div className="w-14 h-14 rounded-xl bg-blue-500/20 flex items-center justify-center text-2xl mb-6">
                🎨
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                Source List Marketplace
              </h3>
              <p className="text-slate-400">
                Curate and monetize source collections. Subscribe to expert-curated intelligence feeds with Access Passes.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50 hover:border-argus-500/50 transition-all">
              <div className="w-14 h-14 rounded-xl bg-yellow-500/20 flex items-center justify-center text-2xl mb-6">
                💰
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                Intel Bounties
              </h3>
              <p className="text-slate-400">
                Post bounties for specific intelligence. Sources earn crypto for verified submissions.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50 hover:border-argus-500/50 transition-all">
              <div className="w-14 h-14 rounded-xl bg-red-500/20 flex items-center justify-center text-2xl mb-6">
                🛡️
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                Zero-Knowledge Proofs
              </h3>
              <p className="text-slate-400">
                Prove reputation thresholds and location presence without revealing sensitive details.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* User Types Section */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-6">
            Two Ways to Participate
          </h2>
          <p className="text-slate-400 text-center mb-16 max-w-2xl mx-auto">
            Choose how you want to engage with Argus based on your needs
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Standard Users */}
            <div className="bg-gradient-to-br from-argus-900/50 to-slate-800/50 rounded-2xl p-8 border border-argus-500/30">
              <div className="w-16 h-16 rounded-full bg-argus-500/20 flex items-center justify-center text-3xl mb-6">
                👤
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Standard User</h3>
              <ul className="space-y-3 text-slate-300 mb-8">
                <li className="flex items-start gap-2">
                  <span className="text-argus-400 mt-1">✓</span>
                  <span>Sign up with Google, GitHub, or X</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-argus-400 mt-1">✓</span>
                  <span>Full access to dashboard and briefings</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-argus-400 mt-1">✓</span>
                  <span>Create and manage source lists</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-argus-400 mt-1">✓</span>
                  <span>Post intel bounties</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-argus-400 mt-1">✓</span>
                  <span>Rate and verify intelligence</span>
                </li>
              </ul>
              <button
                onClick={() => setShowAccountModal(true)}
                className="w-full py-3 bg-argus-600 hover:bg-argus-500 text-white font-medium rounded-lg transition"
              >
                Sign Up as User
              </button>
            </div>

            {/* HUMINT Sources */}
            <div className="bg-gradient-to-br from-purple-900/30 to-slate-800/50 rounded-2xl p-8 border border-purple-500/30">
              <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center text-3xl mb-6">
                🎭
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">HUMINT Source</h3>
              <ul className="space-y-3 text-slate-300 mb-8">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-1">✓</span>
                  <span>Anonymous passkey authentication</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-1">✓</span>
                  <span>We never know your identity</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-1">✓</span>
                  <span>Submit intelligence anonymously</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-1">✓</span>
                  <span>Build reputation under a codename</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-1">✓</span>
                  <span>Earn for verified intel</span>
                </li>
              </ul>
              <button
                onClick={() => setShowSourceModal(true)}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition"
              >
                Register as Source
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-r from-argus-900/50 to-purple-900/30">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Transform Your Intelligence Workflow?
          </h2>
          <p className="text-slate-300 mb-8 text-lg">
            Join analysts, researchers, and sources using Argus to stay ahead.
          </p>
          <button
            onClick={() => setShowAccountModal(true)}
            className="px-8 py-4 bg-white text-slate-900 font-semibold rounded-xl shadow-lg hover:bg-slate-100 transition-all transform hover:scale-105"
          >
            Get Started Free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="Argus" className="w-8 h-8" />
              <span className="text-lg font-bold text-white">Argus</span>
            </div>
            <div className="flex gap-6 text-slate-400 text-sm">
              <a href="https://docs.argus.vitalpoint.ai" className="hover:text-white transition">
                Documentation
              </a>
              <a href="https://github.com/vitalpoint/argus" className="hover:text-white transition">
                GitHub
              </a>
              <a href="https://twitter.com/ArgusIntel" className="hover:text-white transition">
                Twitter
              </a>
            </div>
            <p className="text-slate-500 text-sm">
              © 2026 VitalPoint AI
            </p>
          </div>
        </div>
      </footer>

      {/* Account Type Modal */}
      <AccountTypeModal 
        isOpen={showAccountModal} 
        onClose={() => setShowAccountModal(false)}
        onSourceSelected={handleSourceSelected}
      />

      {/* Source Registration Modal */}
      <SourceRegistrationModal
        isOpen={showSourceModal}
        onClose={() => setShowSourceModal(false)}
      />
    </div>
  );
}
