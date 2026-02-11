'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  AnonAuthProvider, 
  useAnonAuth 
} from '@vitalpoint/near-phantom-auth/client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

function SourceRegistrationContent() {
  const [step, setStep] = useState<'info' | 'register' | 'success'>('info');
  const router = useRouter();
  
  const {
    isLoading,
    isAuthenticated,
    codename,
    nearAccountId,
    webAuthnSupported,
    error,
    register,
    login,
    clearError,
  } = useAnonAuth();

  // On successful auth, show success screen
  useEffect(() => {
    if (isAuthenticated && codename) {
      // Both registration and login show success screen
      // (HUMINT users have separate dashboard - TODO)
      setStep('success');
    }
  }, [isAuthenticated, codename, step]);

  const handleStartRegistration = async () => {
    clearError();
    setStep('register');
    await register();
  };

  const handlePasskeyLogin = async () => {
    clearError();
    await login();
  };

  // Info screen
  if (step === 'info') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="max-w-lg w-full mx-4">
          <div className="bg-slate-800 rounded-2xl p-8 border border-purple-500/30">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center text-3xl mx-auto mb-4">
                🎭
              </div>
              <h1 className="text-2xl font-bold text-white">HUMINT Source Registration</h1>
              <p className="text-purple-300 mt-2">Anonymous Intelligence Submission</p>
            </div>

            {/* Warning Box */}
            <div className="bg-purple-900/30 border border-purple-500/50 rounded-xl p-4 mb-6">
              <h3 className="font-semibold text-purple-200 mb-2">🔐 Privacy Protection</h3>
              <ul className="text-sm text-purple-100/80 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  Your identity is <strong>never</strong> stored or known to us
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  Authentication uses device-bound passkeys only
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  You'll receive a <strong>codename</strong> (e.g., ALPINE-7)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  A NEAR account is created for crypto payments
                </li>
              </ul>
            </div>

            {/* Capabilities */}
            <div className="mb-6">
              <h3 className="font-medium text-slate-200 mb-3">As a source, you can:</h3>
              <ul className="space-y-2 text-slate-300 text-sm">
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span> Submit intelligence reports anonymously
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span> Build reputation under your codename
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span> Claim bounties for verified intel
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span> Receive direct tips in crypto
                </li>
              </ul>
            </div>

            {/* Important Warning */}
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-200">
                <strong>⚠️ Important:</strong> HUMINT accounts cannot be upgraded to standard accounts. This is by design to protect your anonymity.
              </p>
            </div>

            {/* WebAuthn Check */}
            {!webAuthnSupported && (
              <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 mb-6">
                <p className="text-sm text-yellow-200">
                  <strong>⚠️ Browser Support:</strong> Your browser doesn't support passkeys. Please use a modern browser like Chrome, Firefox, or Safari.
                </p>
              </div>
            )}

            {/* Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleStartRegistration}
                disabled={!webAuthnSupported || isLoading}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Creating...' : 'Create New Source Account'}
              </button>
              
              <button
                onClick={handlePasskeyLogin}
                disabled={!webAuthnSupported || isLoading}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition disabled:opacity-50"
              >
                {isLoading ? 'Authenticating...' : 'Sign In with Existing Passkey'}
              </button>
            </div>

            {error && (
              <div className="mt-4 bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Back link */}
            <p className="text-center text-slate-400 text-sm mt-6">
              Want a standard account?{' '}
              <Link href="/login" className="text-argus-400 hover:text-argus-300">
                Sign in with OAuth
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Register step (waiting for passkey creation)
  if (step === 'register' && !isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="max-w-lg w-full mx-4">
          <div className="bg-slate-800 rounded-2xl p-8 border border-purple-500/30">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center text-3xl mx-auto mb-4">
                🔐
              </div>
              <h1 className="text-2xl font-bold text-white">Create Your Passkey</h1>
              <p className="text-slate-400 mt-2">
                Your device will prompt you to create a secure passkey
              </p>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            <div className="bg-slate-700/50 rounded-xl p-4 mb-6">
              <h3 className="font-medium text-slate-200 mb-2">What happens next:</h3>
              <ol className="text-sm text-slate-300 space-y-2">
                <li>1. Your device will prompt for biometric (face/fingerprint) or PIN</li>
                <li>2. A unique passkey will be created and stored on your device</li>
                <li>3. You'll receive your anonymous codename</li>
                <li>4. A NEAR account will be created for payments</li>
              </ol>
            </div>

            {isLoading ? (
              <div className="text-center py-4">
                <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-slate-400">Creating passkey...</p>
              </div>
            ) : (
              <>
                <button
                  onClick={handleStartRegistration}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition"
                >
                  Try Again
                </button>

                <button
                  onClick={() => { setStep('info'); clearError(); }}
                  className="w-full py-3 mt-3 text-slate-400 hover:text-white transition"
                >
                  ← Go Back
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Success screen
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="max-w-lg w-full mx-4">
        <div className="bg-slate-800 rounded-2xl p-8 border border-green-500/30">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-3xl mx-auto mb-4">
              ✓
            </div>
            <h1 className="text-2xl font-bold text-white">Registration Complete!</h1>
            <p className="text-green-300 mt-2">Your anonymous source account is ready</p>
          </div>

          {/* Codename Display */}
          <div className="bg-purple-900/30 border border-purple-500/50 rounded-xl p-6 mb-6 text-center">
            <p className="text-sm text-purple-300 mb-2">Your Codename</p>
            <p className="text-3xl font-bold text-white font-mono">{codename}</p>
          </div>

          {/* NEAR Account */}
          {nearAccountId && (
            <div className="bg-slate-700/50 rounded-xl p-4 mb-6">
              <p className="text-sm text-slate-400 mb-1">NEAR Account (for payments)</p>
              <p className="text-sm font-mono text-slate-200 break-all">{nearAccountId}</p>
            </div>
          )}

          {/* Important Info */}
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-200 mb-2">⚠️ Save This Information</h3>
            <ul className="text-sm text-yellow-100/80 space-y-1">
              <li>• Your passkey is stored on this device</li>
              <li>• If you lose access, you'll need to start over</li>
              <li>• Consider setting up IPFS recovery in settings</li>
            </ul>
          </div>

          <Link
            href="/dashboard"
            className="block w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition text-center"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SourceRegistrationPage() {
  return (
    <AnonAuthProvider apiUrl={`${API_BASE}/api/auth/passkey`}>
      <SourceRegistrationContent />
    </AnonAuthProvider>
  );
}
