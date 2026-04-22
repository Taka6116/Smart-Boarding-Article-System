/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
    // @napi-rs/canvas は .node ネイティブバイナリを含むため webpack がバンドルできない。
    // Next.js に「このパッケージはサーバ側で runtime require する」と伝えてバンドル対象から外す。
    serverComponentsExternalPackages: ['@napi-rs/canvas'],
    // 自動投稿の Canvas 合成で public/fonts/NotoSansJP-Bold.ttf を読むため、
    // /api/auto-publish/run の serverless bundle に同梱する（Vercel の output file tracing）。
    outputFileTracingIncludes: {
      '/api/auto-publish/run': ['./public/fonts/NotoSansJP-Bold.ttf'],
    },
  },
};

export default nextConfig;
