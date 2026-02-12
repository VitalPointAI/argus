'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect to landing page with modal open
export default function SourceRegistrationRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to landing page with query param to open source modal
    router.replace('/?register=source');
  }, [router]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-400">Loading source registration...</p>
      </div>
    </div>
  );
}
