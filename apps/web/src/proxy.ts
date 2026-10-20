import { NextResponse, type NextRequest } from 'next/server';

// Better Auth's session cookie (`__Secure-` prefixed when cookies are secure, in production).
const SESSION_COOKIES = ['evidence.session_token', '__Secure-evidence.session_token'];

/**
 * Optimistic redirect only: visitors without a session cookie go to sign-in before any page
 * renders. It never authorizes anything; the API checks the session on every request.
 */
export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSession) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/w/:path*', '/onboarding', '/account/:path*', '/invitations'],
};
