/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // Proxy /api/v1/* to Express backend
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:3000/api/v1/:path*',
      },
      // Also allow /api/* to proxy (for backward compatibility)
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/v1/:path*',
      },
    ]
  },
}

export default nextConfig
