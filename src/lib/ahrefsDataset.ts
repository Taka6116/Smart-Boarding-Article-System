/**
 * Ahrefs データセットを S3 から直接取得するヘルパー。
 *
 * /api/ahrefs の GET と同じロジックだが、サーバサイド（/api/auto-publish/run など）から
 * fetch() を介さずに直接呼べるようにしたもの。HTTP 通信のオーバーヘッドを避ける。
 */
import { listS3Objects, getS3ObjectAsText } from './s3Reference'
import type { AhrefsDataset } from './ahrefsCsvParser'

const PREFIX = 'ahrefs/uploads/'

/**
 * 全 Ahrefs データセット（full オブジェクト）を uploadedAt 降順で返す。
 */
export async function loadAllAhrefsDatasets(): Promise<AhrefsDataset[]> {
  const objects = await listS3Objects(PREFIX)
  const jsonFiles = objects.filter(o => o.key.endsWith('.json'))
  const out: AhrefsDataset[] = []

  for (const obj of jsonFiles) {
    const r = await getS3ObjectAsText(obj.key)
    if (!r) continue
    try {
      out.push(JSON.parse(r.content) as AhrefsDataset)
    } catch {
      /* ignore corrupted entries */
    }
  }

  out.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
  return out
}

/**
 * 最新の type='keywords' な Ahrefs データセット（＝「狙い目KW」の入力）を返す。
 * 1 件も無ければ null。
 */
export async function loadLatestKeywordsDataset(): Promise<AhrefsDataset | null> {
  const all = await loadAllAhrefsDatasets()
  const kw = all.filter(d => (d.type ?? 'keywords') === 'keywords')
  return kw[0] ?? null
}
