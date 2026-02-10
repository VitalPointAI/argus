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
  '/predictions',
  '/bounties',
  '/zk',
];

// Routes that are always public
const publicRoutes = ['/', '/login', '/register', '/auth'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check if route is protected
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
  
  if (!isProtectedRoute) {
    return NextResponse.next();
  }
  
  // Check for auth token in cookies
  const token = request.cookies.get('argus_token')?.value;
  
  // Also check Authorization header (for API calls)
  const authHeader = request.headers.get('authorization');
  
  if (!token && !authHeader) {
    // Redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes (handled separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
