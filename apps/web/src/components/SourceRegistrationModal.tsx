'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  AnonAuthProvider, 
  useAnonAuth 
} from '@vitalpoint/near-phantom-auth/client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface SourceRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Platform detection for sync disable instructions
function getPlatformInstructions(): { platform: string; instructions: string[] } {
  if (typeof navigator === 'undefined') return { platform: 'Unknown', instructions: [] };
  
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) {
    return {
      platform: 'iOS',
      instructions: [
        'Go to Settings → Passwords',
        'Tap "Password Options"',
        'Turn OFF "iCloud Keychain"',
        'Now create your passkey - it will stay on this device only',
      ],
    };
  }
  if (/Android/.test(ua)) {
    return {
      platform: 'Android',
      instructions: [
        'Go to Settings → Google → Auto-fill',
        'Tap "Google Password Manager"',
        'Disable sync (or use a different password manager)',
        'Now create your passkey - it will stay on this device only',
      ],
    };
  }
  if (/Chrome/.test(ua)) {
    return {
      platform: 'Chrome',
      instructions: [
        'Go to chrome://settings/passwords',
        'Turn OFF "Offer to save passwords"',
        'Or: When prompted, choose "Use another device" and select a hardware key',
      ],
    };
  }
  return {
    platform: 'Your Browser',
    instructions: [
      'Check your browser/OS password settings',
      'Disable cloud sync for passwords/passkeys',
      'Or use a hardware security key (YubiKey, etc.)',
    ],
  };
}

function SourceRegistrationContent({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'info' | 'privacy-setup' | 'register' | 'privacy-warning' | 'success'>('info');
  const [acknowledgedWarning, setAcknowledgedWarning] = useState(false);
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
    credentialCloudSynced,
  } = useAnonAuth();

  // On successful auth, show success or redirect (with privacy warning check)
  useEffect(() => {
    if (isAuthenticated && codename) {
      if (step === 'register') {
        if (credentialCloudSynced && !acknowledgedWarning) {
          setStep('privacy-warning');
        } else {
          setStep('success');
        }
      } else if (step === 'privacy-warning') {
        // Already on warning screen, stay there
      } else {
        // Existing user login - redirect to dashboard
        router.push('/dashboard');
        onClose();
      }
    }
  }, [isAuthenticated, codename, step, router, credentialCloudSynced, acknowledgedWarning, onClose]);

  const handleStartRegistration = async () => {
    clearError();
    setStep('register');
    await register();
  };

  const handlePrivacySetup = () => {
    clearError();
    setStep('privacy-setup');
  };

  const handlePasskeyLogin = async () => {
    clearError();
    await login();
  };

  const handleContinueWithWarning = () => {
    setAcknowledgedWarning(true);
    setStep('success');
  };

  const handleGoToDashboard = () => {
    router.push('/dashboard');
    onClose();
  };

  // Info screen
  if (step === 'info') {
    return (
      <>
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center text-2xl mx-auto mb-3">
            🎭
          </div>
          <h2 className="text-xl font-bold text-white">HUMINT Source Registration</h2>
          <p className="text-purple-300 text-sm mt-1">Anonymous Intelligence Submission</p>
        </div>

        {/* Privacy Box */}
        <div className="bg-purple-900/30 border border-purple-500/50 rounded-xl p-3 mb-4">
          <h3 className="font-semibold text-purple-200 text-sm mb-2">🔐 Privacy Protection</h3>
          <ul className="text-xs text-purple-100/80 space-y-1">
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
          </ul>
        </div>

        {/* Capabilities */}
        <div className="mb-4">
          <h3 className="font-medium text-slate-200 text-sm mb-2">As a source, you can:</h3>
          <ul className="space-y-1 text-slate-300 text-xs">
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Submit intelligence reports anonymously
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Build reputation under your codename
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Claim bounties for verified intel
            </li>
          </ul>
        </div>

        {/* WebAuthn Check */}
        {!webAuthnSupported && (
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 mb-4">
            <p className="text-xs text-yellow-200">
              <strong>⚠️ Browser Support:</strong> Your browser doesn't support passkeys.
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-2">
          <button
            onClick={handleStartRegistration}
            disabled={!webAuthnSupported || isLoading}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isLoading ? 'Creating...' : 'Quick Setup'}
          </button>
          
          <button
            onClick={handlePrivacySetup}
            disabled={!webAuthnSupported || isLoading}
            className="w-full py-2.5 bg-green-700 hover:bg-green-600 text-white font-medium rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
          >
            <span>🛡️</span> Privacy Setup
          </button>
          
          <button
            onClick={handlePasskeyLogin}
            disabled={!webAuthnSupported || isLoading}
            className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition disabled:opacity-50 text-sm"
          >
            {isLoading ? 'Authenticating...' : 'Sign In with Existing Passkey'}
          </button>
        </div>

        {error && (
          <div className="mt-3 bg-red-500/20 border border-red-500 text-red-300 px-3 py-2 rounded-lg text-xs">
            {error}
          </div>
        )}
      </>
    );
  }

  // Privacy Setup screen
  if (step === 'privacy-setup') {
    const { platform, instructions } = getPlatformInstructions();
    
    return (
      <>
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center text-2xl mx-auto mb-3">
            🛡️
          </div>
          <h2 className="text-xl font-bold text-white">Privacy Setup</h2>
          <p className="text-green-300 text-sm mt-1">Maximum anonymity configuration</p>
        </div>

        {/* Best Option with Hardware Keys */}
        <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-3 mb-4">
          <h3 className="font-semibold text-green-200 text-sm mb-2">🔑 Best Option: Hardware Security Key</h3>
          <p className="text-xs text-green-100/80 mb-3">
            Use a hardware security key. Your passkey never touches the cloud.
          </p>
          
          <div className="space-y-2">
            <a 
              href="https://www.nitrokey.com/products/nitrokeys" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg p-2 transition border border-slate-700 hover:border-green-500/50"
            >
              <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center text-lg">🔐</div>
              <div className="flex-1">
                <div className="font-medium text-white text-sm">Nitrokey</div>
                <div className="text-xs text-slate-400">Open-source. ~€50-70</div>
              </div>
              <div className="text-green-400 text-xs font-medium">Recommended</div>
            </a>
            
            <a 
              href="https://amzn.to/3ZwsEgn" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg p-2 transition border border-slate-700"
            >
              <div className="w-8 h-8 bg-slate-500/20 rounded-lg flex items-center justify-center text-lg">🔑</div>
              <div className="flex-1">
                <div className="font-medium text-white text-sm">YubiKey</div>
                <div className="text-xs text-slate-400">Industry standard. ~$50-70</div>
              </div>
            </a>
          </div>
        </div>

        {/* Software Options - Collapsible */}
        <details className="mb-4 group">
          <summary className="cursor-pointer bg-slate-700/50 hover:bg-slate-700 rounded-lg p-2 text-xs font-medium text-slate-200 flex items-center justify-between transition">
            <span>🛡️ Software Privacy Options</span>
            <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="mt-2 bg-slate-700/30 rounded-lg p-3 text-xs text-slate-300 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-yellow-400 font-bold">★★☆</span>
              <div>
                <strong className="text-slate-200">Separate Password Manager</strong>
                <p className="text-slate-400 text-xs">Anonymous Bitwarden/1Password account.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-yellow-400 font-bold">★★☆</span>
              <div>
                <strong className="text-slate-200">Device-Only Storage</strong>
                <p className="text-slate-400 text-xs">Local-only passkeys, no cloud sync.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-orange-400 font-bold">★☆☆</span>
              <div>
                <strong className="text-slate-200">Google/Apple/Microsoft</strong>
                <p className="text-slate-400 text-xs">Convenient but syncs to your account.</p>
              </div>
            </div>
          </div>
        </details>

        {/* Platform-specific instructions */}
        <div className="bg-slate-700/50 rounded-xl p-3 mb-4">
          <h3 className="font-medium text-slate-200 text-sm mb-2">
            📱 Disable Cloud Sync ({platform})
          </h3>
          <ol className="text-xs text-slate-300 space-y-1">
            {instructions.map((instruction, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-green-400 font-bold">{i + 1}.</span>
                <span>{instruction}</span>
              </li>
            ))}
          </ol>
        </div>

        <button
          onClick={handleStartRegistration}
          disabled={isLoading}
          className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition disabled:opacity-50 text-sm"
        >
          {isLoading ? 'Creating...' : 'I\'m Ready - Create Passkey'}
        </button>

        <button
          onClick={() => { setStep('info'); clearError(); }}
          className="w-full py-2 mt-2 text-slate-400 hover:text-white transition text-sm"
        >
          ← Go Back
        </button>
      </>
    );
  }

  // Register step (waiting for passkey creation)
  if (step === 'register' && !isAuthenticated) {
    return (
      <>
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center text-2xl mx-auto mb-3">
            🔐
          </div>
          <h2 className="text-xl font-bold text-white">Create Your Passkey</h2>
          <p className="text-slate-400 text-sm mt-1">
            Your device will prompt you to create a secure passkey
          </p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-300 px-3 py-2 rounded-lg mb-4 text-xs">
            {error}
          </div>
        )}

        <div className="bg-slate-700/50 rounded-xl p-3 mb-4">
          <h3 className="font-medium text-slate-200 text-sm mb-2">What happens next:</h3>
          <ol className="text-xs text-slate-300 space-y-1">
            <li>1. Your device will prompt for biometric or PIN</li>
            <li>2. A unique passkey will be created</li>
            <li>3. You'll receive your anonymous codename</li>
          </ol>
        </div>

        {isLoading ? (
          <div className="text-center py-4">
            <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-slate-400 text-sm">Creating passkey...</p>
          </div>
        ) : (
          <>
            <button
              onClick={handleStartRegistration}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition text-sm"
            >
              Try Again
            </button>

            <button
              onClick={() => { setStep('info'); clearError(); }}
              className="w-full py-2 mt-2 text-slate-400 hover:text-white transition text-sm"
            >
              ← Go Back
            </button>
          </>
        )}
      </>
    );
  }

  // Privacy Warning screen
  if (step === 'privacy-warning') {
    return (
      <>
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-orange-500/20 flex items-center justify-center text-2xl mx-auto mb-3">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-white">Privacy Notice</h2>
          <p className="text-orange-300 text-sm mt-1">Your passkey may be cloud-synced</p>
        </div>

        <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-3 mb-4">
          <p className="text-xs text-orange-100">
            Your passkey appears to be stored in a cloud-synced authenticator. Your codename 
            (<span className="font-mono">{codename}</span>) may be visible to your password manager provider.
          </p>
        </div>

        <div className="bg-slate-700/50 rounded-xl p-3 mb-4">
          <h3 className="font-medium text-slate-200 text-sm mb-2">Your options:</h3>
          <ul className="text-xs text-slate-300 space-y-1">
            <li><strong>Continue anyway</strong> - Still anonymous to us, just not to your provider.</li>
            <li><strong>Delete & retry</strong> - Use a hardware key instead.</li>
          </ul>
        </div>

        <div className="space-y-2">
          <button
            onClick={handleContinueWithWarning}
            className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-lg transition text-sm"
          >
            Continue Anyway
          </button>
          
          <button
            onClick={() => { setStep('info'); clearError(); }}
            className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition text-sm"
          >
            I'll Delete & Try Again
          </button>
        </div>
      </>
    );
  }

  // Success screen
  return (
    <>
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center text-2xl mx-auto mb-3">
          ✓
        </div>
        <h2 className="text-xl font-bold text-white">Registration Complete!</h2>
        <p className="text-green-300 text-sm mt-1">Your anonymous source account is ready</p>
      </div>

      {/* Codename Display */}
      <div className="bg-purple-900/30 border border-purple-500/50 rounded-xl p-4 mb-4 text-center">
        <p className="text-xs text-purple-300 mb-1">Your Codename</p>
        <p className="text-2xl font-bold text-white font-mono">{codename}</p>
      </div>

      {/* Important Info */}
      <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 mb-4">
        <h3 className="font-semibold text-yellow-200 text-sm mb-1">⚠️ Save This Information</h3>
        <ul className="text-xs text-yellow-100/80 space-y-0.5">
          <li>• Your passkey is stored on this device</li>
          <li>• If you lose access, you'll need to start over</li>
        </ul>
      </div>

      <button
        onClick={handleGoToDashboard}
        className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition text-sm"
      >
        Go to Dashboard
      </button>
    </>
  );
}

export function SourceRegistrationModal({ isOpen, onClose }: SourceRegistrationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-700 max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <AnonAuthProvider apiUrl={`${API_BASE}/api/phantom`}>
          <SourceRegistrationContent onClose={onClose} />
        </AnonAuthProvider>
      </div>
    </div>
  );
}
