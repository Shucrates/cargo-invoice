import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';
import { verifyCsrf } from '@/lib/csrf';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  // API routes check their own sessions; here we only reject cross-site
  // mutating requests. NextAuth's own endpoints carry their own CSRF token.
  if (req.nextUrl.pathname.startsWith('/api/')) {
    if (!req.nextUrl.pathname.startsWith('/api/auth/')) {
      const csrf = verifyCsrf(req);
      if (!csrf.ok) return NextResponse.json({ error: csrf.error }, { status: 403 });
    }
    return;
  }

  const host = req.headers.get('host') || '';
  const url = req.nextUrl.clone();

  // 1. Determine host type
  const isAdminSubdomain = host.startsWith('admin.') || host.startsWith('system.');
  const isTrackingSubdomain = host.startsWith('track.') || host.startsWith('tracking.');
  // A host is "customer-facing" only when it is neither an admin subdomain
  // nor a tracking subdomain.  The previous `||` made this always true —
  // fixed to `&&` so admin.rudracargo.com correctly routes to /dashboard.
  const isCustomerFacing = !isAdminSubdomain && !isTrackingSubdomain;

  // 2. Customer-facing host (www.rudracargo.com, rudracargo.com, track.*)
  if (isCustomerFacing && !host.includes('localhost')) {
    if (url.pathname === '/') {
      url.pathname = '/tracking';
      return NextResponse.rewrite(url);
    }
  }

  // 3. Admin-facing host (admin.rudracargo.com)
  if (isAdminSubdomain) {
    if (url.pathname === '/') {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  // 4. Auth protection for dashboard & login
  const isLoggedIn = !!req.auth;
  const isOnDashboard = req.nextUrl.pathname.startsWith('/dashboard');

  if (isOnDashboard) {
    if (isLoggedIn) return;
    return Response.redirect(new URL('/login', req.nextUrl));
  } else if (isLoggedIn && req.nextUrl.pathname === '/login') {
    return Response.redirect(new URL('/dashboard', req.nextUrl));
  }
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images, fonts
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
