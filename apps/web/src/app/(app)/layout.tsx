import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { AuthProvider } from '@/lib/auth';

// Force dynamic rendering - no static caching
export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side auth check - verify any valid session exists
  // Supports both standard auth (argus_session) and HUMINT passkey auth (phantom_session)
  const cookieStore = await cookies();
  const standardSession = cookieStore.get('argus_session')?.value;
  const passkeySession = cookieStore.get('phantom_session')?.value;
  
  // No session cookie from either auth system = redirect to login
  if (!standardSession && !passkeySession) {
    redirect('/login');
  }

  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <NavBar />
        <main className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
