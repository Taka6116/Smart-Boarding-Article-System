import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const TEXT_EXT = new Set(['.txt', '.csv', '.md', '.json', '.html', '.xml'])
const REGION = process.env.AWS_REGION ?? 'ap-northeast-1'
const BUCKET = process.env.S3_BUCKET_NAME?.trim()

function getClient(): S3Client | null {
  if (!BUCKET) return null
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  if (!accessKeyId || !secretAccessKey) return null
  return new S3Client({
    region: REGION,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export interface S3ObjectItem {
  key: string
  size: number
  lastModified: string
}

export async function listS3Objects(prefix?: string): Promise<S3ObjectItem[]> {
  const client = getClient()
  if (!client) return []
  const items: S3ObjectItem[] = []
  let continuationToken: string | undefined
  do {
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET!,
        Prefix: prefix || undefined,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      })
    )
    for (const o of out.Contents ?? []) {
      if (!o.Key) continue
      items.push({
        key: o.Key,
        size: o.Size ?? 0,
        lastModified: o.LastModified?.toISOString() ?? '',
      })
    }
    continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (continuationToken)
  return items
}

/** S3オブジェクトをテキストとして取得。テキスト系拡張子のみ対応 */
export async function getS3ObjectAsText(key: string): Promise<{ key: string; content: string } | null> {
  const client = getClient()
  if (!client) return null
  const ext = key.includes('.') ? key.slice(key.lastIndexOf('.')) : ''
  if (!TEXT_EXT.has(ext.toLowerCase())) return null
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET!, Key: key })
    const res = await client.send(command)
    const body = res.Body
    if (!body) return null
    const bytes = await body.transformToByteArray()
    const content = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    return { key, content }
  } catch {
    return null
  }
}

/** S3オブジェクトをバイナリで取得（画像など）。Content-Type を返す */
export async function getS3ObjectAsBuffer(key: string): Promise<{ body: Uint8Array; contentType?: string } | null> {
  const client = getClient()
  if (!client) return null
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET!, Key: key })
    const res = await client.send(command)
    const body = res.Body
    if (!body) return null
    const bytes = await body.transformToByteArray()
    const contentType = res.ContentType ?? undefined
    return { body: bytes, contentType }
  } catch {
    return null
  }
}

export function getS3BucketName(): string | null {
  return BUCKET ?? null
}

export async function putS3Object(key: string, body: string, contentType = 'application/json'): Promise<boolean> {
  const client = getClient()
  if (!client) return false
  try {
    await client.send(new PutObjectCommand({
      Bucket: BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
    }))
    return true
  } catch (e) {
    console.error('S3 put error:', e)
    return false
  }
}

export async function deleteS3Object(key: string): Promise<boolean> {
  const client = getClient()
  if (!client) return false
  try {
    await client.send(new DeleteObjectCommand({
      Bucket: BUCKET!,
      Key: key,
    }))
    return true
  } catch (e) {
    console.error('S3 delete error:', e)
    return false
  }
}
