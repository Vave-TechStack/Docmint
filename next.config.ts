import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ─── Production Optimizations ───
  output: 'standalone', // For Docker deployment
  poweredByHeader: false,
  reactStrictMode: true,

  // ─── Image Configuration ───
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // No remote image hosts are used (thumbnails are generated locally and
    // rendered unoptimized; uploaded images are data URLs), so the optimizer
    // must not be allowed to fetch arbitrary hosts.
    remotePatterns: [],
  },

  // ─── Security Headers ───
  //
  // Strict-Transport-Security is intentionally NOT set here. `headers()` is
  // static and cannot see the request, so it applied HSTS to plain-HTTP
  // responses too, overriding the protocol check in `src/proxy.ts`. HSTS is
  // now owned solely by the proxy, which emits it only for requests verified
  // as HTTPS via a trusted proxy.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
      // Cache static assets
      {
        source: '/images/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/fonts/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // ─── Redirects ───
  async redirects() {
    return [
      {
        source: '/admin',
        destination: '/admin/dashboard',
        permanent: true,
      },
    ];
  },

  // ─── Compiler Options ───
  compiler: {
    // Strip debug/info logs in production, but KEEP error and warn — the app
    // relies on console.error/warn for auth failures, webhook errors, and the
    // startup config check. Removing everything makes production un-debuggable.
    removeConsole: {
      exclude: ['error', 'warn'],
    },
  },

  // ─── Experimental Features ───
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
};

export default nextConfig;
