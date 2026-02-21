'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function NavBar() {
  const { user, loading, logout, isHumint } = useAuth();
  
  // Get display name based on user type
  const displayName = user?.type === 'humint' ? user.codename : (user as any)?.name || 'User';
  const displayEmail = user?.type === 'humint' ? 'HUMINT Source' : (user as any)?.email || '';
  const displayInitial = displayName.charAt(0).toUpperCase();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  
  const userMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/');
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
  };

  // Primary navigation - core features
  const primaryLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/humint/feed', label: 'Intel' },
    { href: '/briefings', label: 'Briefings' },
    { href: '/sources', label: 'Sources' },
    { href: '/search', label: 'Search' },
  ];

  // Secondary navigation - in "More" dropdown
  const moreLinks = [
    { href: '/marketplace', label: '🛒 Marketplace' },
    { href: '/leaderboard', label: '🏆 Leaderboard' },
    { href: '/analytics', label: '📊 Analytics' },
    { href: '/domains', label: '🌐 Domains' },
    { href: '/bounties', label: '📋 Intel Bounties' },
    { href: '/zk', label: '🔐 ZK Proofs' },
    { href: 'https://docs.argus.vitalpoint.ai', label: '📚 Documentation', external: true },
  ];

  return (
    <nav className="bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 hover:opacity-80 transition">
            <svg className="w-8 h-8" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="argusGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#1d4ed8" />
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="15" fill="url(#argusGrad)"/>
              <ellipse cx="16" cy="16" rx="10" ry="7" fill="white"/>
              <circle cx="16" cy="16" r="5" fill="#1e40af"/>
              <circle cx="16" cy="16" r="2.5" fill="#0f172a"/>
              <circle cx="14" cy="14.5" r="1" fill="white" opacity="0.8"/>
            </svg>
            <span className="text-xl font-bold">Argus</span>
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {/* Primary Links */}
            {primaryLinks.map((link) => (
              <a 
                key={link.href} 
                href={link.href} 
                className="px-3 py-2 rounded-lg hover:bg-slate-800 transition text-sm font-medium"
              >
                {link.label}
              </a>
            ))}
            
            {/* More Dropdown */}
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className="px-3 py-2 rounded-lg hover:bg-slate-800 transition text-sm font-medium flex items-center gap-1"
              >
                More
                <svg className={`w-4 h-4 transition-transform ${moreMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {moreMenuOpen && (
                <div className="absolute top-full right-0 mt-1 w-48 bg-slate-800 rounded-lg shadow-lg border border-slate-700 py-1 z-50">
                  {moreLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      onClick={() => setMoreMenuOpen(false)}
                      className="block px-4 py-2 text-sm hover:bg-slate-700 transition"
                      {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-slate-700 mx-2" />
            
            {/* User Section */}
            {loading ? (
              <span className="text-slate-400 px-3">...</span>
            ) : user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 transition"
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${isHumint ? 'bg-purple-600' : 'bg-argus-600'}`}>
                    {isHumint ? '🎭' : displayInitial}
                  </div>
                  <span className="text-sm font-medium max-w-[100px] truncate">{displayName}</span>
                  <svg className={`w-4 h-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {userMenuOpen && (
                  <div className="absolute top-full right-0 mt-1 w-48 bg-slate-800 rounded-lg shadow-lg border border-slate-700 py-1 z-50">
                    <div className="px-4 py-2 border-b border-slate-700">
                      <p className="text-sm font-medium truncate">{displayName}</p>
                      <p className="text-xs text-slate-400 truncate">{displayEmail}</p>
                    </div>
                    <a
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2 text-sm hover:bg-slate-700 transition"
                    >
                      ⚙️ Settings
                    </a>
                    {!isHumint && (user as any).isAdmin && (
                      <a
                        href="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-purple-400 hover:bg-slate-700 transition"
                      >
                        🛡️ Admin Panel
                      </a>
                    )}
                    <div className="border-t border-slate-700 mt-1 pt-1">
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 transition"
                      >
                        🚪 Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <a href="/login" className="px-3 py-2 text-sm hover:text-argus-300 transition">
                  Login
                </a>
                <a
                  href="/register"
                  className="bg-argus-600 hover:bg-argus-700 px-4 py-2 rounded-lg transition text-sm font-medium"
                >
                  Register
                </a>
              </div>
            )}
          </div>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-slate-800 transition"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-slate-700 pt-4">
            <div className="flex flex-col gap-1">
              {/* Primary Links */}
              {primaryLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2 px-3 rounded-lg hover:bg-slate-800 transition font-medium"
                >
                  {link.label}
                </a>
              ))}
              
              {/* More Links Section - Collapsible */}
              <div className="border-t border-slate-700 mt-2 pt-2">
                <button
                  onClick={() => setMobileMoreOpen(!mobileMoreOpen)}
                  className="w-full py-2 px-3 rounded-lg hover:bg-slate-800 transition font-medium flex items-center justify-between"
                >
                  <span>More</span>
                  <svg className={`w-4 h-4 transition-transform ${mobileMoreOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {mobileMoreOpen && (
                  <div className="ml-3 border-l border-slate-700 pl-3">
                    {moreLinks.map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="py-2 px-3 rounded-lg hover:bg-slate-800 transition text-slate-300 block"
                        {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              
              {/* User Section */}
              <div className="border-t border-slate-700 mt-2 pt-2">
                {loading ? (
                  <span className="text-slate-400 px-3">...</span>
                ) : user ? (
                  <>
                    <div className="px-3 py-2 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${isHumint ? 'bg-purple-600' : 'bg-argus-600'}`}>
                        {isHumint ? '🎭' : displayInitial}
                      </div>
                      <div>
                        <p className="font-medium">{displayName}</p>
                        <p className="text-xs text-slate-400">{displayEmail}</p>
                      </div>
                    </div>
                    <a
                      href="/settings"
                      onClick={() => setMobileMenuOpen(false)}
                      className="py-2 px-3 rounded-lg hover:bg-slate-800 transition text-slate-300 block"
                    >
                      ⚙️ Settings
                    </a>
                    {!isHumint && (user as any).isAdmin && (
                      <a
                        href="/admin"
                        onClick={() => setMobileMenuOpen(false)}
                        className="py-2 px-3 rounded-lg hover:bg-slate-800 transition text-purple-400 block"
                      >
                        🛡️ Admin Panel
                      </a>
                    )}
                    <button
                      onClick={handleLogout}
                      className="w-full text-left py-2 px-3 rounded-lg hover:bg-slate-800 transition text-red-400"
                    >
                      🚪 Logout
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 px-3">
                    <a
                      href="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="py-2 text-center rounded-lg border border-slate-600 hover:bg-slate-800 transition"
                    >
                      Login
                    </a>
                    <a
                      href="/register"
                      onClick={() => setMobileMenuOpen(false)}
                      className="bg-argus-600 hover:bg-argus-700 py-2 rounded-lg transition text-center font-medium"
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
