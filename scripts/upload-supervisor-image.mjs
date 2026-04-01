/**
 * 監修者画像（大野様）を S3 にアップロードするスクリプト
 *
 * 使い方:
 *   1. 画像を正方形（推奨 400x400px）で顔が中央にくるようトリミング
 *   2. ファイル名を ohno-shunsuke.jpg に（または引数でパス指定）
 *   3. 環境変数: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME を設定
 *   4. 実行: node scripts/upload-supervisor-image.mjs [画像パス]
 *     例: node --env-file=.env.local scripts/upload-supervisor-image.mjs ./ohno-shunsuke.jpg
 *
 * アップロード先: s3://{S3_BUCKET_NAME}/images/supervisor/ohno-shunsuke.jpg
 * CloudFront を使う場合、NEXT_PUBLIC_CLOUDFRONT_URL を設定すると
 * 監修者ブロックでそのURLが参照されます。
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BUCKET = process.env.S3_BUCKET_NAME?.trim();
const REGION = process.env.AWS_REGION ?? 'ap-northeast-1';
const KEY = 'images/supervisor/ohno-shunsuke.jpg';

async function main() {
  const imagePath = process.argv[2] || resolve(__dirname, '../ohno-shunsuke.jpg');
  if (!BUCKET) {
    console.error('S3_BUCKET_NAME が設定されていません');
    process.exit(1);
  }
  if (!process.env.AWS_ACCESS_KEY_ID?.trim() || !process.env.AWS_SECRET_ACCESS_KEY?.trim()) {
    console.error('AWS_ACCESS_KEY_ID と AWS_SECRET_ACCESS_KEY を設定してください');
    process.exit(1);
  }

  let body;
  try {
    body = readFileSync(imagePath);
  } catch (e) {
    console.error('画像ファイルを読み込めません:', imagePath, e.message);
    process.exit(1);
  }

  const client = new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const ext = imagePath.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: KEY,
      Body: body,
      ContentType: `image/${ext}`,
    })
  );

  console.log('アップロード完了:', `s3://${BUCKET}/${KEY}`);
  console.log('CloudFront の場合は NEXT_PUBLIC_CLOUDFRONT_URL を設定し、そのURL + /images/supervisor/ohno-shunsuke.jpg で参照されます。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
