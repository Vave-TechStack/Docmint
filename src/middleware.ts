import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * DocMint Edge Middleware
 * Handles security headers, multi-tenant routing, and public route detection.
 * NOTE: Auth checks are handled by individual pages and API routes.
 * This middleware runs on Edge Runtime and cannot import Node.js modules (Prisma, bcrypt, etc.).
 */
export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const response = NextResponse.next();

  // ─── Security Headers ───
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.razorpay.com https://api.openai.com;"
  );
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // ─── Multi-tenant subdomain extraction ───
  const host = req.headers.get('host') || '';
  const subdomain = host.split('.')[0];

  if (subdomain && subdomain !== 'www' && subdomain !== 'app' && !host.includes('localhost')) {
    response.headers.set('x-tenant-slug', subdomain);
  }

  // ─── Public routes (no auth required) ───
  const publicRoutes = [
    '/_next',
    '/api/auth',
    '/api/instant',
    '/instant',
    '/favicon.ico',
    '/images',
    '/fonts',
    '/templates',
    '/login',
    '/signup',
    '/forgot-password',
    '/verify-email',
    '/privacy',
    '/terms',
    '/about',
    '/pricing',
    '/contact',
  ];

  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  if (isPublicRoute) {
    return response;
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
