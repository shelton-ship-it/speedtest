/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O motor @cloudflare/speedtest é empacotado no build (não é carregado de CDN em runtime).
  transpilePackages: ['@cloudflare/speedtest'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            // connect-src inclui os endpoints de medição usados diretamente pelo browser.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self'",
              "connect-src 'self' https://speed.cloudflare.com",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
