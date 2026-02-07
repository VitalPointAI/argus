'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function NavBar() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <nav className="bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🦚</span>
            <a href="/" className="text-xl font-bold">Argus</a>
          </div>
          <div className="flex items-center gap-6">
            <a href="/" className="hover:text-argus-300">Dashboard</a>
            <a href="/search" className="hover:text-argus-300">Search</a>
            <a href="/domains" className="hover:text-argus-300">Domains</a>
            <a href="/sources" className="hover:text-argus-300">Sources</a>
            <a href="/briefings" className="hover:text-argus-300">Briefings</a>
            
            <div className="border-l border-slate-700 pl-6 flex items-center gap-4">
              {loading ? (
                <span className="text-slate-400">...</span>
              ) : user ? (
                <>
                  <span className="text-slate-300">{user.name}</span>
                  <button
                    onClick={handleLogout}
                    className="text-slate-400 hover:text-white transition"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <a href="/login" className="hover:text-argus-300">Login</a>
                  <a
                    href="/register"
                    className="bg-argus-600 hover:bg-argus-700 px-4 py-2 rounded-lg transition"
                  >
                    Register
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
