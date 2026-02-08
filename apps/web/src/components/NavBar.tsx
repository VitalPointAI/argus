'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function NavBar() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/');
    setIsOpen(false);
    setUserMenuOpen(false);
  };

  const navLinks = [
    { href: '/', label: 'Dashboard' },
    { href: '/search', label: 'Search' },
    { href: '/domains', label: 'Domains' },
    { href: '/sources', label: 'Sources' },
    { href: '/marketplace', label: '🎨 NFTs' },
    { href: '/bounties', label: '📋 Bounties' },
    { href: '/briefings', label: 'Briefings' },
    { href: 'https://docs.argus.vitalpoint.ai', label: '📚 Docs', external: true },
  ];

  return (
    <nav className="bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="text-2xl">🦚</span>
            <a href="/" className="text-xl font-bold">Argus</a>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <a 
                key={link.href} 
                href={link.href} 
                className="hover:text-argus-300 transition"
                {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {link.label}
              </a>
            ))}
            
            <div className="border-l border-slate-700 pl-6 flex items-center gap-4">
              {loading ? (
                <span className="text-slate-400">...</span>
              ) : user ? (
                <>
                  {user.isAdmin && (
                    <a href="/admin" className="text-purple-400 hover:text-purple-300 transition">
                      Admin
                    </a>
                  )}
                  <span className="text-slate-300">{user.name}</span>
                  <a href="/settings" className="text-slate-400 hover:text-white transition">
                    ⚙️ Settings
                  </a>
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

          {/* Mobile Hamburger */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-slate-800 transition"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-slate-700 pt-4">
            <div className="flex flex-col gap-3">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="py-2 px-3 rounded-lg hover:bg-slate-800 transition"
                  {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {link.label}
                </a>
              ))}
              
              <div className="border-t border-slate-700 mt-2 pt-4">
                {loading ? (
                  <span className="text-slate-400 px-3">...</span>
                ) : user ? (
                  <div className="flex flex-col">
                    {/* Username - tappable to expand submenu */}
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800 transition text-left"
                    >
                      <span className="text-white font-medium">{user.name}</span>
                      <svg 
                        className={`w-4 h-4 text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {/* User submenu */}
                    {userMenuOpen && (
                      <div className="ml-4 mt-1 flex flex-col gap-1 border-l-2 border-slate-700 pl-3">
                        <a
                          href="/settings"
                          onClick={() => setIsOpen(false)}
                          className="py-2 px-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                        >
                          ⚙️ Settings
                        </a>
                        {user.isAdmin && (
                          <a
                            href="/admin"
                            onClick={() => setIsOpen(false)}
                            className="py-2 px-3 text-purple-400 hover:bg-slate-800 rounded-lg transition"
                          >
                            🛡️ Admin Panel
                          </a>
                        )}
                        <button
                          onClick={handleLogout}
                          className="text-left py-2 px-3 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded-lg transition"
                        >
                          🚪 Logout
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <a
                      href="/login"
                      onClick={() => setIsOpen(false)}
                      className="py-2 px-3 rounded-lg hover:bg-slate-800 transition"
                    >
                      Login
                    </a>
                    <a
                      href="/register"
                      onClick={() => setIsOpen(false)}
                      className="bg-argus-600 hover:bg-argus-700 py-2 px-3 rounded-lg transition text-center"
                    >
                      Register
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
