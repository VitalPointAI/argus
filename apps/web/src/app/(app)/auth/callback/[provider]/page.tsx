'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const provider = params.provider as string;
  
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [error, setError] = useState('');

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError(searchParams.get('error_description') || errorParam);
        setStatus('error');
        return;
      }

      if (!code || !state) {
        setError('Missing authorization code or state');
        setStatus('error');
        return;
      }

      // Verify state matches stored state
      const storedState = sessionStorage.getItem('oauth_state');
      if (state !== storedState) {
        setError('Invalid OAuth state - possible CSRF attack');
        setStatus('error');
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/auth/oauth/${provider}/callback`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'OAuth callback failed');
        }

        const data = await response.json();

        // Clear stored state
        sessionStorage.removeItem('oauth_state');
        sessionStorage.removeItem('oauth_provider');

        // Store token if returned
        if (data.data?.token) {
          localStorage.setItem('argus_token', data.data.token);
        }

        setStatus('success');

        // Redirect to dashboard
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setStatus('error');
      }
    }

    handleCallback();
  }, [searchParams, provider, router]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="max-w-md w-full mx-4 text-center">
        {status === 'processing' && (
          <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
            <div className="w-16 h-16 rounded-full bg-argus-500/20 flex items-center justify-center mx-auto mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-argus-500 border-t-transparent"></div>
            </div>
            <h1 className="text-xl font-bold text-white">Completing Sign In...</h1>
            <p className="text-slate-400 mt-2">Please wait while we verify your account</p>
          </div>
        )}

        {status === 'success' && (
          <div className="bg-slate-800 rounded-2xl p-8 border border-green-500/30">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-3xl mx-auto mb-4">
              ✓
            </div>
            <h1 className="text-xl font-bold text-white">Sign In Successful!</h1>
            <p className="text-green-300 mt-2">Redirecting to dashboard...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-slate-800 rounded-2xl p-8 border border-red-500/30">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-3xl mx-auto mb-4">
              ✗
            </div>
            <h1 className="text-xl font-bold text-white">Sign In Failed</h1>
            <p className="text-red-300 mt-2">{error}</p>
            <button
              onClick={() => router.push('/login')}
              className="mt-6 px-6 py-2 bg-argus-600 hover:bg-argus-500 text-white rounded-lg transition"
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
