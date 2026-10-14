import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Для своего сервера: `next build` собирает самодостаточный server.js (см. Dockerfile)
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  poweredByHeader: false,
  agentRules: false,
  serverExternalPackages: ['exceljs', 'pg-boss'],
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
