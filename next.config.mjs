/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
    // @napi-rs/canvas は .node ネイティブバイナリを含むため webpack がバンドルできない。
    // Next.js 14.2 では experimental 内に置くのが正式な場所。
    serverComponentsExternalPackages: ['@napi-rs/canvas'],
    // 自動投稿の Canvas 合成で public/fonts/NotoSansJP-Bold.ttf を読むため、
    // /api/auto-publish/run の serverless bundle に同梱する（Vercel の output file tracing）。
    outputFileTracingIncludes: {
      '/api/auto-publish/run': ['./public/fonts/NotoSansJP-Bold.ttf'],
    },
  },
  webpack(config, { isServer }) {
    if (isServer) {
      // .node ネイティブバイナリを webpack のバンドル対象から除外する。
      // @napi-rs/canvas の skia.*.node が原因でビルドが落ちるのを防ぐ。
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        ({ request }, callback) => {
          if (request && (request.endsWith('.node') || request === '@napi-rs/canvas')) {
            return callback(null, `commonjs ${request}`)
          }
          callback()
        },
      ]
    }
    return config
  },
};

export default nextConfig;
