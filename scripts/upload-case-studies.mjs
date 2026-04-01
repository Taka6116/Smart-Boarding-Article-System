/**
 * 匿名導入事例ファイルを S3 にアップロードするスクリプト
 * Usage: node scripts/upload-case-studies.mjs
 */
import { readFileSync } from 'fs'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const envText = readFileSync('.env.local', 'utf8')
const env = Object.fromEntries(
  envText.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const BUCKET = env.S3_BUCKET_NAME
if (!BUCKET) { console.error('S3_BUCKET_NAME が .env.local に設定されていません'); process.exit(1) }

const client = new S3Client({
  region: env.AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
})

const body = readFileSync('data/case-studies-anonymous.md', 'utf8')
const key = 'case-studies/anonymous-cases.md'

await client.send(new PutObjectCommand({
  Bucket: BUCKET,
  Key: key,
  Body: body,
  ContentType: 'text/markdown; charset=utf-8',
}))

console.log(`✓ アップロード完了: s3://${BUCKET}/${key} (${body.length} chars)`)
