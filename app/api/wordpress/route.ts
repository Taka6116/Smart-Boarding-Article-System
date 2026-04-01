import { postToWordPress } from '@/lib/wordpress'

export async function POST(request: Request) {
  const body = await request.json()
  const {
    title, content, targetKeyword, imageUrl, slug, status, scheduledDate,
    wordpressTags, categoryIds,
    preUploadedMediaId, preUploadedImageUrl,
  } = body

  if (!title?.trim() || !content?.trim()) {
    return Response.json(
      { error: 'タイトルと本文は必須です' },
      { status: 400 }
    )
  }

  // data: URLのbase64は使わない（2ステップフローにより事前アップロード済みのはず）
  // フォールバックとして従来のインラインアップロードも残す
  let imageBase64;
  let imageBase64MimeType;

  if (!preUploadedMediaId && imageUrl?.startsWith('data:')) {
    const matches = imageUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      imageBase64MimeType = matches[1];
      imageBase64 = matches[2];
    }
  }

  try {
    const result = await postToWordPress(
      {
        title,
        content,
        targetKeyword,
        imageUrl: preUploadedImageUrl ?? (imageUrl?.startsWith('data:') ? undefined : imageUrl),
        imageBase64,
        imageBase64MimeType,
        slug,
        wordpressTags,
      },
      status ?? 'draft',
      { scheduledDate, categoryIds, preUploadedMediaId, preUploadedImageUrl }
    )

    return Response.json({
      success: true,
      postId: result.id,
      postUrl: result.link,
      wordpressUrl: result.link, // クライアント（editor/page.tsx）が wordpressUrl で参照するため必須
      editUrl: result.editLink,
      status: result.status,
      ...(result.imageUploadWarning ? { imageUploadWarning: result.imageUploadWarning } : {}),
    })

  } catch (error: any) {
    console.error('WordPress post error:', error)
    return Response.json(
      { error: error.message || 'WordPress投稿に失敗しました' },
      { status: 500 }
    )
  }
}
