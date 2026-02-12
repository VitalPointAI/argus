'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  AnonAuthProvider, 
  useAnonAuth 
} from '@vitalpoint/near-phantom-auth/client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

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

function SourceRegistrationContent() {
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
        // New registration - check if we need to show privacy warning
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
      }
    }
  }, [isAuthenticated, codename, step, router, credentialCloudSynced, acknowledgedWarning]);

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
              </ul>
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
                {isLoading ? 'Creating...' : 'Quick Setup'}
              </button>
              
              <button
                onClick={handlePrivacySetup}
                disabled={!webAuthnSupported || isLoading}
                className="w-full py-3 bg-green-700 hover:bg-green-600 text-white font-medium rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span>🛡️</span> Privacy Setup
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

  // Privacy Setup screen - instructions to disable sync before registration
  if (step === 'privacy-setup') {
    const { platform, instructions } = getPlatformInstructions();
    
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="max-w-lg w-full mx-4">
          <div className="bg-slate-800 rounded-2xl p-8 border border-green-500/30">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-3xl mx-auto mb-4">
                🛡️
              </div>
              <h1 className="text-2xl font-bold text-white">Privacy Setup</h1>
              <p className="text-green-300 mt-2">Maximum anonymity configuration</p>
            </div>

            {/* Best Option */}
            <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4 mb-6">
              <h3 className="font-semibold text-green-200 mb-2">🔑 Best Option: Hardware Security Key</h3>
              <p className="text-sm text-green-100/80 mb-4">
                Use a hardware security key. Your passkey never touches the cloud.
                When prompted, choose "Use security key" or "Use another device".
              </p>
              
              {/* Recommended Hardware */}
              <div className="space-y-3 mt-4 pt-4 border-t border-green-500/20">
                <a 
                  href="https://www.nitrokey.com/products/nitrokeys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg p-3 transition border border-slate-700 hover:border-green-500/50"
                >
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center text-xl">🔐</div>
                  <div className="flex-1">
                    <div className="font-medium text-white">Nitrokey</div>
                    <div className="text-xs text-slate-400">Open-source, made in Germany. ~€50-70</div>
                  </div>
                  <div className="text-green-400 text-xs font-medium">Recommended</div>
                </a>
                
                <a 
                  href="https://amzn.to/3ZwsEgn" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg p-3 transition border border-slate-700 hover:border-slate-500"
                >
                  <div className="w-10 h-10 bg-slate-500/20 rounded-lg flex items-center justify-center text-xl">🔑</div>
                  <div className="flex-1">
                    <div className="font-medium text-white">YubiKey</div>
                    <div className="text-xs text-slate-400">Industry standard. ~$50-70</div>
                  </div>
                </a>
              </div>
            </div>

            {/* Software Privacy Options - Collapsible */}
            <details className="mb-6 group">
              <summary className="cursor-pointer bg-slate-700/50 hover:bg-slate-700 rounded-lg p-3 text-sm font-medium text-slate-200 flex items-center justify-between transition">
                <span>🛡️ Software Privacy Options</span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="mt-2 bg-slate-700/30 rounded-lg p-4 text-sm text-slate-300 space-y-3">
                <p className="text-slate-400">
                  No hardware key? Here are software alternatives ranked by privacy:
                </p>
                
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-yellow-400 font-bold">★★☆</span>
                    <div>
                      <strong className="text-slate-200">Separate Password Manager</strong>
                      <p className="text-slate-400 text-xs">Create a Bitwarden/1Password account with anonymous email (ProtonMail). No link to real identity.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <span className="text-yellow-400 font-bold">★★☆</span>
                    <div>
                      <strong className="text-slate-200">Device-Only Storage</strong>
                      <p className="text-slate-400 text-xs">Some devices allow local-only passkeys (no cloud sync). High privacy but no backup.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <span className="text-orange-400 font-bold">★☆☆</span>
                    <div>
                      <strong className="text-slate-200">Google/Apple/Microsoft</strong>
                      <p className="text-slate-400 text-xs">Convenient but syncs to your account. Provider can see codename + domain association.</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-500 pt-2 border-t border-slate-600">
                  💡 Tip: When your device prompts to save the passkey, look for "Use another device" or storage options.
                </p>
              </div>
            </details>

            {/* Platform-specific instructions */}
            <div className="bg-slate-700/50 rounded-xl p-4 mb-6">
              <h3 className="font-medium text-slate-200 mb-3">
                📱 Disable Cloud Sync ({platform})
              </h3>
              <ol className="text-sm text-slate-300 space-y-2">
                {instructions.map((instruction, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-green-400 font-bold">{i + 1}.</span>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Alternative */}
            <div className="bg-slate-700/30 rounded-lg p-3 mb-6">
              <p className="text-sm text-slate-400">
                <strong className="text-slate-300">Alternative:</strong> Create a separate 
                Bitwarden account with an anonymous email (ProtonMail/Tutanota) and use that 
                to store this passkey.
              </p>
            </div>

            <button
              onClick={handleStartRegistration}
              disabled={isLoading}
              className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'I\'m Ready - Create Passkey'}
            </button>

            <button
              onClick={() => { setStep('info'); clearError(); }}
              className="w-full py-3 mt-3 text-slate-400 hover:text-white transition"
            >
              ← Go Back
            </button>
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

  // Privacy Warning screen - shown after registration if cloud-synced detected
  if (step === 'privacy-warning') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="max-w-lg w-full mx-4">
          <div className="bg-slate-800 rounded-2xl p-8 border border-orange-500/30">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center text-3xl mx-auto mb-4">
                ⚠️
              </div>
              <h1 className="text-2xl font-bold text-white">Privacy Notice</h1>
              <p className="text-orange-300 mt-2">Your passkey may be cloud-synced</p>
            </div>

            <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4 mb-6">
              <p className="text-sm text-orange-100">
                Your passkey appears to be stored in your device's built-in authenticator 
                (like iCloud Keychain or Google Password Manager), which syncs to your account.
              </p>
              <p className="text-sm text-orange-100 mt-3">
                <strong>This means:</strong> Your codename (<span className="font-mono">{codename}</span>) 
                may be visible to Apple/Google/Microsoft, potentially linking your anonymous identity 
                to your real account.
              </p>
            </div>

            <div className="bg-slate-700/50 rounded-xl p-4 mb-6">
              <h3 className="font-medium text-slate-200 mb-2">Your options:</h3>
              <ul className="text-sm text-slate-300 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-green-400">1.</span>
                  <span><strong>Continue anyway</strong> - Your intelligence submissions are still anonymous to us, just not to your password manager provider.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">2.</span>
                  <span><strong>Delete &amp; retry</strong> - Remove this passkey from your password manager, then register again with a hardware key or local-only storage.</span>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleContinueWithWarning}
                className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-lg transition"
              >
                Continue Anyway
              </button>
              
              <button
                onClick={() => { setStep('info'); clearError(); }}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition"
              >
                I'll Delete &amp; Try Again
              </button>
            </div>

            <p className="text-xs text-slate-500 text-center mt-4">
              Note: To delete this passkey, check your password manager settings.
            </p>
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
  // Rebuild trigger: 2026-02-11-v2
  return (
    <AnonAuthProvider apiUrl={`${API_BASE}/api/phantom`}>
      <SourceRegistrationContent />
    </AnonAuthProvider>
  );
}
