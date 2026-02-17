import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/briefings',
  '/sources',
  '/search',
  '/settings',
  '/admin',
  '/domains',
  '/marketplace',
  '/zk',
  '/verify',
  '/predictions',
];

// Routes that should redirect to dashboard if already logged in
// NOTE: We DON'T redirect /register to dashboard here - let the page handle it
// This prevents stale cookies from blocking new user registration
const authRoutes = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check for session from either auth system:
  // - argus_session: Standard user auth (email/OAuth)
  // - phantom_session: HUMINT passkey auth
  const standardSession = request.cookies.get('argus_session')?.value;
  const passkeySession = request.cookies.get('phantom_session')?.value;
  const hasSession = standardSession || passkeySession;
  
  // Check if route is protected
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
  
  const isAuthRoute = authRoutes.some(route => pathname.startsWith(route));
  
  // No session + protected route = redirect to login
  if (isProtectedRoute && !hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // Has session + login page only = redirect to dashboard
  // (User is already logged in, no need to show login)
  if (isAuthRoute && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  // Match protected routes and their sub-paths
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/briefings',
    '/briefings/:path*',
    '/sources',
    '/sources/:path*',
    '/search',
    '/search/:path*',
    '/settings',
    '/settings/:path*',
    '/admin',
    '/admin/:path*',
    '/domains',
    '/domains/:path*',
    '/marketplace',
    '/marketplace/:path*',
    '/zk',
    '/zk/:path*',
    '/verify',
    '/verify/:path*',
    '/predictions',
    '/predictions/:path*',
    '/login',
  ],
};
