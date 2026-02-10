'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface AccountTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountTypeModal({ isOpen, onClose }: AccountTypeModalProps) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<'user' | 'source' | null>(null);

  if (!isOpen) return null;

  const handleContinue = () => {
    if (selectedType === 'user') {
      router.push('/login');
    } else if (selectedType === 'source') {
      router.push('/register/source');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-700">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <h2 className="text-2xl font-bold text-white mb-2">
          Choose Your Account Type
        </h2>
        <p className="text-slate-400 mb-6">
          How would you like to participate in Argus?
        </p>

        {/* Options */}
        <div className="space-y-4">
          {/* Standard User Option */}
          <button
            onClick={() => setSelectedType('user')}
            className={`w-full p-4 rounded-xl border-2 text-left transition ${
              selectedType === 'user'
                ? 'border-argus-500 bg-argus-500/10'
                : 'border-slate-600 hover:border-slate-500 bg-slate-700/30'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-argus-500/20 flex items-center justify-center text-2xl flex-shrink-0">
                👤
              </div>
              <div>
                <h3 className="font-semibold text-white">Standard User</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Sign in with Google, GitHub, or X. Full access to dashboard, briefings, and source management.
                </p>
              </div>
              {selectedType === 'user' && (
                <div className="text-argus-400 flex-shrink-0">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
          </button>

          {/* HUMINT Source Option */}
          <button
            onClick={() => setSelectedType('source')}
            className={`w-full p-4 rounded-xl border-2 text-left transition ${
              selectedType === 'source'
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-slate-600 hover:border-slate-500 bg-slate-700/30'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-2xl flex-shrink-0">
                🎭
              </div>
              <div>
                <h3 className="font-semibold text-white">HUMINT Source</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Anonymous passkey authentication. Submit intel and earn crypto without revealing your identity.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-full">
                    🔒 Anonymous
                  </span>
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-300 text-xs rounded-full">
                    💰 Earn Crypto
                  </span>
                </div>
              </div>
              {selectedType === 'source' && (
                <div className="text-purple-400 flex-shrink-0">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
          </button>
        </div>

        {/* Info box */}
        {selectedType === 'source' && (
          <div className="mt-4 p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
            <p className="text-sm text-purple-200">
              <strong>⚠️ Important:</strong> HUMINT accounts cannot be upgraded to standard accounts, as this would compromise your anonymity.
            </p>
          </div>
        )}

        {/* Continue button */}
        <button
          onClick={handleContinue}
          disabled={!selectedType}
          className={`w-full mt-6 py-3 font-medium rounded-lg transition ${
            selectedType
              ? selectedType === 'user'
                ? 'bg-argus-600 hover:bg-argus-500 text-white'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
              : 'bg-slate-600 text-slate-400 cursor-not-allowed'
          }`}
        >
          Continue
        </button>

        {/* Already have account */}
        <p className="text-center text-slate-400 text-sm mt-4">
          Already have an account?{' '}
          <a href="/login" className="text-argus-400 hover:text-argus-300">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
