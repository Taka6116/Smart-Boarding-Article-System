import { NextRequest, NextResponse } from 'next/server'
import { listS3Objects, getS3ObjectAsText, putS3Object, deleteS3Object } from '@/lib/s3Reference'
import { parseAhrefsCsv, type AhrefsDataset } from '@/lib/ahrefsCsvParser'

export const dynamic = 'force-dynamic'

const PREFIX = 'ahrefs/uploads/'

async function decodeFileToUtf8(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer())

  // UTF-16 LE BOM (0xFF 0xFE)
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    const content = buf.toString('utf16le')
    return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content
  }

  // UTF-16 BE BOM (0xFE 0xFF)
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    const swapped = Buffer.alloc(buf.length)
    for (let i = 0; i < buf.length - 1; i += 2) {
      swapped[i] = buf[i + 1]
      swapped[i + 1] = buf[i]
    }
    const content = swapped.toString('utf16le')
    return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content
  }

  // UTF-8 BOM (0xEF 0xBB 0xBF)
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.toString('utf8').slice(1)
  }

  return buf.toString('utf8')
}

function datasetKey(id: string): string {
  return `${PREFIX}${id}.json`
}

export async function GET() {
  try {
    const objects = await listS3Objects(PREFIX)
    const jsonFiles = objects.filter(o => o.key.endsWith('.json'))

    const datasets: Omit<AhrefsDataset, 'keywords'>[] = []
    const full: AhrefsDataset[] = []

    for (const obj of jsonFiles) {
      const result = await getS3ObjectAsText(obj.key)
      if (result) {
        try {
          const ds = JSON.parse(result.content) as AhrefsDataset
          full.push(ds)
          datasets.push({
            id: ds.id,
            uploadedAt: ds.uploadedAt,
            fileName: ds.fileName,
            rowCount: ds.rowCount,
            type: ds.type ?? 'keywords',
          })
        } catch { /* skip */ }
      }
    }

    datasets.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    full.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())

    return NextResponse.json({ datasets, full })
  } catch (e) {
    console.error('Ahrefs GET error:', e)
    return NextResponse.json({ error: 'Ahrefsデータの取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'CSVファイルを選択してください' }, { status: 400 })
    }

    const text = await decodeFileToUtf8(file)
    const dataset = parseAhrefsCsv(text, file.name)

    const ok = await putS3Object(datasetKey(dataset.id), JSON.stringify(dataset))
    if (!ok) {
      return NextResponse.json({ error: 'S3への保存に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      id: dataset.id,
      rowCount: dataset.rowCount,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'CSVの解析に失敗しました'
    console.error('Ahrefs POST error:', e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = (await request.json()) as { id: string }
    if (!id) {
      return NextResponse.json({ error: 'IDが必要です' }, { status: 400 })
    }

    const ok = await deleteS3Object(datasetKey(id))
    if (!ok) {
      return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Ahrefs DELETE error:', e)
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
  }
}
