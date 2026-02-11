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
];

// Routes that should redirect to dashboard if already logged in
const authRoutes = ['/login', '/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check for session from either auth system:
  // - argus_session: Standard user auth (email/OAuth)
  // - anon_session: HUMINT passkey auth
  const standardSession = request.cookies.get('argus_session')?.value;
  const passkeySession = request.cookies.get('anon_session')?.value;
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
  
  // Has session + auth route = redirect to dashboard
  // (but allow /register/source for HUMINT users to manage their account)
  if (isAuthRoute && hasSession && !pathname.startsWith('/register/source')) {
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
    '/login',
    '/register',
    '/register/:path*',
  ],
};
