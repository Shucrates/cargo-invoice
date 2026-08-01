import { auth } from '@/auth';

export default auth((req) => {
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
  matcher: ['/dashboard/:path*', '/login'],
};
