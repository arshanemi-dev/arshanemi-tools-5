import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Who may show this app inside a frame. The admin panel embeds every tool at
// /tools/<slug>/use, so its origin (NEXT_PUBLIC_ADMIN_API_URL — both the bare
// and the www. form of that host) is allowed; FRAME_ANCESTORS adds any other
// site that embeds it too (comma-separated origins). Everyone else is refused,
// which is also what lib/tokenHandoff.js relies on to trust a framed sign-in.
function frameAncestors() {
  const origins = new Set();
  const add = (value) => {
    try {
      const url = new URL(String(value).trim());
      origins.add(url.origin);
      const host = url.hostname;
      if (host.includes('.') && !/^[\d.]+$/.test(host)) {
        const twin = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
        origins.add(`${url.protocol}//${twin}${url.port ? `:${url.port}` : ''}`);
      }
    } catch {
      // not a URL — ignored
    }
  };
  add(process.env.NEXT_PUBLIC_ADMIN_API_URL);
  for (const origin of (process.env.FRAME_ANCESTORS || '').split(',')) if (origin.trim()) add(origin);
  return ["'self'", ...origins].join(' ');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the project root — this repo is nested inside another repo's
  // node_modules/lockfile tree, which otherwise makes Next infer the wrong
  // workspace root and warn on every run.
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'www.santhyainfotech.com',
        pathname: '/wp-content/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },

  // Baseline security headers on every response — same set as the admin
  // panel's own next.config.mjs, minus X-Frame-Options: that header can only
  // say "same origin" or "nobody", and this app has to stay frameable by the
  // admin panel, so frame-ancestors (which takes a list) does that job alone.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: `frame-ancestors ${frameAncestors()}` },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
