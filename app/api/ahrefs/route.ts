import { NextRequest, NextResponse } from 'next/server'
import { listS3Objects, getS3ObjectAsText, putS3Object, deleteS3Object } from '@/lib/s3Reference'
import { parseAhrefsCsv, type AhrefsDataset } from '@/lib/ahrefsCsvParser'

export const dynamic = 'force-dynamic'

const PREFIX = 'ahrefs/uploads/'

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

    const text = await file.text()
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
