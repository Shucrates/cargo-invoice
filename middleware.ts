import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const host = req.headers.get('host') || '';
  const url = req.nextUrl.clone();

  // 1. Subdomain routing for tracking page (e.g. track.yourdomain.com or track.localhost:3000)
  const isTrackingSubdomain = host.startsWith('track.') || host.startsWith('tracking.');
  if (isTrackingSubdomain) {
    if (!url.pathname.startsWith('/tracking')) {
      url.pathname = `/tracking${url.pathname === '/' ? '' : url.pathname}`;
      return NextResponse.rewrite(url);
    }
    return;
  }

  // 2. Auth protection for dashboard & login
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
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images, fonts
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
