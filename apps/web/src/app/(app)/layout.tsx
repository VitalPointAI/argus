import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { AuthProvider } from '@/lib/auth';

// Force dynamic rendering - no static caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side auth check using cookies
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('argus_session')?.value;
  
  // No session = redirect to login
  if (!sessionToken) {
    redirect('/login');
  }
  
  // Verify the session is valid by calling the API
  // Use internal URL on server (API runs on same host, port 3001)
  const apiUrl = process.env.INTERNAL_API_URL || process.env.API_URL || 'http://127.0.0.1:3001';
  try {
    const res = await fetch(`${apiUrl}/api/auth/me`, {
      headers: {
        Cookie: `argus_session=${sessionToken}`,
      },
      cache: 'no-store',
    });
    
    if (!res.ok) {
      redirect('/login');
    }
  } catch (error) {
    console.error('Auth verification failed:', error);
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
