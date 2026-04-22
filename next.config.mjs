/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
    // @napi-rs/canvas は .node ネイティブバイナリを含む。
    // Next.js 14.2.14+ では App Router でネイティブバイナリが自動的に外部化されるが、
    // 明示的に列挙しておくことで確実にバンドル対象から外れる。
    serverComponentsExternalPackages: ['@napi-rs/canvas'],
    // 自動投稿の Canvas 合成で public/fonts/NotoSansJP-Bold.ttf を読むため、
    // /api/auto-publish/run の serverless bundle に同梱する（Vercel の output file tracing）。
    outputFileTracingIncludes: {
      '/api/auto-publish/run': ['./public/fonts/NotoSansJP-Bold.ttf'],
    },
  },
};

export default nextConfig;
