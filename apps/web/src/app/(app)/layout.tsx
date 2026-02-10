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
  // Server-side auth check - just verify cookie exists
  // API will validate the token when requests are made
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('argus_session')?.value;
  
  // No session cookie = redirect to login
  if (!sessionToken) {
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
