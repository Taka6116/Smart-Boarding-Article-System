import { NextRequest, NextResponse } from 'next/server'
import { listS3Objects } from '@/lib/s3Reference'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const prefix = searchParams.get('prefix') ?? ''
    const items = await listS3Objects(prefix || undefined)
    return NextResponse.json({ files: items })
  } catch (e) {
    console.error('S3 list error:', e)
    return NextResponse.json(
      { error: 'S3の一覧取得に失敗しました。環境変数（S3_BUCKET_NAME, AWS_*）を確認してください。' },
      { status: 500 }
    )
  }
}
