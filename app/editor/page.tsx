'use client'

import { useState, useCallback, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Step, ArticleData, ProcessingState } from '@/lib/types'
import { applyInternalLinksToText } from '@/lib/internalLinks'
import { getArticleById, saveArticle, updateArticleStatus } from '@/lib/articleStorage'
import { setSessionPreviewImage } from '@/lib/sessionPreviewImage'
import { compositeArticleTitleOnImage } from '@/lib/compositeArticleTitleOnImage'
import { parseWordPressTagsInput } from '@/lib/wordpressTags'
import type { WordPressPublishChoice } from '@/lib/wordpressPublishChoice'
import ArticleInput from '@/components/editor/ArticleInput'
import GeminiResult from '@/components/editor/GeminiResult'
import ImageResult from '@/components/editor/ImageResult'
import PublishResult from '@/components/editor/PublishResult'
import { Plus } from 'lucide-react'

const STORAGE_KEY = 'nas_editor_state'

const initialArticle: ArticleData = {
  title: '',
  originalContent: '',
  refinedContent: '',
  refinedTitle: '',
  targetKeyword: '',
  internalLinks: [],
  imageUrl: '',
  wordpressUrl: undefined,
  wordpressTags: [],
}

interface SavedState {
  article: ArticleData
  currentStep: Step
  geminiStatus: ProcessingState
  fireflyStatus: ProcessingState
  slug?: string
  refineSlugSuggestion?: string
  /** WordPressタグ入力の生文字列（編集中の区切りを保持） */
  wordpressTagsInput?: string
}

function loadState(): SavedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SavedState
  } catch {
    return null
  }
}

function saveState(state: SavedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

function EditorContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [currentArticleId, setCurrentArticleId] = useState<string | null>(null)
  const [article, setArticle] = useState<ArticleData>(initialArticle)
  const [geminiToastShown, setGeminiToastShown] = useState(false)
  const [geminiStatus, setGeminiStatus] = useState<ProcessingState>('idle')
  const [geminiError, setGeminiError] = useState<string | null>(null)
  const [fireflyStatus, setFireflyStatus] = useState<ProcessingState>('idle')
  const [fireflyError, setFireflyError] = useState<string | null>(null)
  const [wordpressStatus, setWordpressStatus] = useState<ProcessingState>('idle')
  const [wordpressError, setWordpressError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [refineSlugSuggestion, setRefineSlugSuggestion] = useState('')
  const [wordpressTagsInput, setWordpressTagsInput] = useState('')
  const [wordpressCategoryIds, setWordpressCategoryIds] = useState<number[]>([68])
  const prevStepRef = useRef<Step>(1)

  useEffect(() => {
    const init = async () => {
    const articleId = searchParams.get('articleId')
    const stepParam = searchParams.get('step')

    if (articleId) {
      const savedArticle = await getArticleById(articleId)
      if (savedArticle) {
        setArticle({
          title: savedArticle.title,
          refinedTitle: savedArticle.refinedTitle,
          targetKeyword: savedArticle.targetKeyword,
          originalContent: savedArticle.originalContent,
          refinedContent: savedArticle.refinedContent,
          imageUrl: savedArticle.imageUrl,
          internalLinks: [],
          wordpressUrl: savedArticle.wordpressUrl,
          wordpressPostStatus: savedArticle.wordpressPostStatus,
          wordpressTags: savedArticle.wordpressTags ?? [],
          wordpressCategoryIds: savedArticle.wordpressCategoryIds ?? [68],
        })
        setCurrentArticleId(savedArticle.id)
        setSlug(savedArticle.slug || '')
        setRefineSlugSuggestion(savedArticle.slug || '')
        setWordpressTagsInput((savedArticle.wordpressTags ?? []).join('、'))
        setWordpressCategoryIds(savedArticle.wordpressCategoryIds ?? [68])
        const parsedStep = Number(stepParam)
        if (parsedStep === 4) {
          const content = applyInternalLinksToText(
            savedArticle.refinedContent || savedArticle.originalContent || '',
            []
          )
          sessionStorage.setItem('preview_content', content)
          const params = new URLSearchParams({
            title: (savedArticle.refinedTitle || savedArticle.title || '').trim(),
            imageUrl: savedArticle.imageUrl || '',
            category: 'お役立ち情報',
            date: new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' }).replace(/\//g, '.'),
          })
          params.set('articleId', savedArticle.id)
          router.replace(`/preview?${params.toString()}`)
          setMounted(true)
          return
        }
        if ([1, 2, 3, 5].includes(parsedStep)) {
          setCurrentStep(parsedStep as Step)
        }
        setGeminiStatus(savedArticle.refinedContent ? 'success' : 'idle')
        setFireflyStatus(savedArticle.imageUrl ? 'success' : 'idle')
        setGeminiToastShown(Boolean(savedArticle.refinedContent))
        setMounted(true)
        return
      }
    }

    // Ahrefsダッシュボードからの遷移: KW+プロンプトをプリセット
    const fromAhrefs = searchParams.get('fromAhrefs')
    const ahrefsKw = searchParams.get('targetKeyword')
    const ahrefsPrompt = searchParams.get('prompt')
    if (fromAhrefs === 'true' && ahrefsKw) {
      clearState()
      setArticle({ ...initialArticle, targetKeyword: ahrefsKw })
      setMounted(true)
      return
    }

    const saved = loadState()
    if (saved) {
      setArticle({
        ...saved.article,
        internalLinks: saved.article.internalLinks ?? [],
        wordpressTags: saved.article.wordpressTags ?? [],
        wordpressCategoryIds: saved.article.wordpressCategoryIds ?? [68],
      })
      if (saved.article.wordpressCategoryIds?.length) {
        setWordpressCategoryIds(saved.article.wordpressCategoryIds)
      }
      // 旧4ステップの「投稿」は新ステップ5にマッピング
      const step = saved.currentStep as number
      const mappedStep = step === 4 ? 5 : step
      setCurrentStep(mappedStep as Step)
      setGeminiStatus(saved.geminiStatus === 'loading' ? 'idle' : saved.geminiStatus)
      setFireflyStatus(saved.fireflyStatus === 'loading' ? 'idle' : saved.fireflyStatus)
      setGeminiToastShown(Boolean(saved.article?.refinedContent))
      if (typeof saved.slug === 'string') setSlug(saved.slug)
      if (typeof saved.refineSlugSuggestion === 'string') setRefineSlugSuggestion(saved.refineSlugSuggestion)
      if (typeof saved.wordpressTagsInput === 'string') {
        setWordpressTagsInput(saved.wordpressTagsInput)
      } else {
        setWordpressTagsInput((saved.article.wordpressTags ?? []).join('、'))
      }
    }
    // プレビューから「投稿画面へ」で飛んできたときなど、URLの step を優先する
    const parsedStepFromUrl = Number(stepParam)
    if (stepParam != null && stepParam !== '' && !Number.isNaN(parsedStepFromUrl) && [1, 2, 3, 5].includes(parsedStepFromUrl)) {
      setCurrentStep(parsedStepFromUrl as Step)
    }
    setMounted(true)
    }
    init()
  }, [searchParams])

  useEffect(() => {
    if (!mounted) return
    saveState({
      article,
      currentStep,
      geminiStatus,
      fireflyStatus,
      slug,
      refineSlugSuggestion,
      wordpressTagsInput,
    })
  }, [article, currentStep, geminiStatus, fireflyStatus, mounted, slug, refineSlugSuggestion, wordpressTagsInput])

  const updateArticle = useCallback((updates: Partial<ArticleData>) => {
    setArticle(prev => ({ ...prev, ...updates }))
  }, [])

  const callGeminiApi = useCallback(async () => {
    setGeminiError(null)
    setGeminiStatus('loading')
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: article.title,
          content: article.originalContent,
          targetKeyword: article.targetKeyword ?? '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '推敲に失敗しました')
      const refinedTitle =
        typeof data.refinedTitle === 'string' && data.refinedTitle.trim().length > 0
          ? data.refinedTitle
          : article.title
      const refinedContent =
        typeof data.refinedContent === 'string' ? data.refinedContent.trim() : ''
      if (!refinedContent) {
        throw new Error('Geminiの推敲結果が空です。再度お試しください。')
      }
      updateArticle({ refinedTitle, refinedContent })
      if (typeof data.slug === 'string' && data.slug.trim()) {
        const s = data.slug.trim()
        setRefineSlugSuggestion(s)
        setSlug(s)
      } else {
        setRefineSlugSuggestion('')
      }
      setGeminiStatus('success')
    } catch (e) {
      setGeminiStatus('error')
      setGeminiError(e instanceof Error ? e.message : '推敲に失敗しました')
    }
  }, [article.title, article.originalContent, article.targetKeyword, updateArticle])

  const handleStep1Next = useCallback(async () => {
    setCurrentStep(2)
    await callGeminiApi()
  }, [callGeminiApi])

  const handleStep2Next = useCallback(() => setCurrentStep(3), [])

  const triggerFirefly = useCallback(async () => {
    setFireflyStatus('loading')
    setFireflyError(null)
    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: article.refinedTitle?.trim() || article.title,
          content: article.refinedContent,
          targetKeyword: article.targetKeyword,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFireflyError(
          [data.error ?? '画像生成に失敗しました', data.debug].filter(Boolean).join('\n')
        )
        setFireflyStatus('error')
        return
      }
      updateArticle({
        imageUrl: `data:${data.mimeType ?? 'image/png'};base64,${data.imageBase64}`,
      })
      setFireflyStatus('success')
    } catch (e) {
      setFireflyError(e instanceof Error ? e.message : '画像生成に失敗しました')
      setFireflyStatus('error')
    }
  }, [article.title, article.refinedTitle, article.refinedContent, article.targetKeyword, updateArticle])

  const handleImageUpload = useCallback(
    (imageUrl: string) => {
      updateArticle({ imageUrl })
      setFireflyStatus('success')
    },
    [updateArticle]
  )

  useEffect(() => {
    if (currentStep !== 3) {
      prevStepRef.current = currentStep
      return
    }
    if (!mounted) return
    if (article.imageUrl) {
      setFireflyStatus('success')
      prevStepRef.current = 3
      return
    }
    const justArrived = prevStepRef.current !== 3
    if (justArrived && fireflyStatus === 'error') {
      setFireflyStatus('idle')
      setFireflyError(null)
      prevStepRef.current = 3
      return
    }
    prevStepRef.current = 3
    // 画像は「画像を生成する」クリックで開始（自動では開始しない）
  }, [mounted, currentStep, article.imageUrl, fireflyStatus])

  const handleStep3NextComplete = useCallback(() => setCurrentStep(5), [])

  const handleStepClick = useCallback(
    (step: Step) => {
      if (step === 4) {
        void (async () => {
          const content = applyInternalLinksToText(
            article.refinedContent || article.originalContent || '',
            article.internalLinks ?? []
          )
          sessionStorage.setItem('preview_content', content)
          let previewImage: string | null = article.imageUrl || null
          const title = article.refinedTitle?.trim() || article.title || ''
          if (previewImage && title) {
            try {
              previewImage = await compositeArticleTitleOnImage(previewImage, title)
            } catch {
              /* raw のまま */
            }
          }
          await setSessionPreviewImage(previewImage)
          const params = new URLSearchParams({
            title: (article.refinedTitle || article.title || '').trim(),
            category: 'お役立ち情報',
            date: new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' }).replace(/\//g, '.'),
          })
          if (currentArticleId) params.set('articleId', currentArticleId)
          router.push(`/preview?${params.toString()}`)
        })()
      } else {
        setCurrentStep(step)
      }
    },
    [article, currentArticleId, router]
  )

  const handleSaveDraft = useCallback(async () => {
    const idFromUrl = searchParams.get('articleId')
    const id = currentArticleId ?? idFromUrl ?? String(Date.now())
    setCurrentArticleId(id)

    const tags = parseWordPressTagsInput(wordpressTagsInput)
    updateArticle({ wordpressTags: tags })

    const existing = await getArticleById(id)
    try {
      await saveArticle({
        id,
        title: article.title,
        refinedTitle: article.refinedTitle ?? article.title,
        targetKeyword: article.targetKeyword ?? '',
        originalContent: article.originalContent,
        refinedContent: article.refinedContent,
        imageUrl: article.imageUrl,
        wordpressUrl: article.wordpressUrl,
        wordpressPostStatus: existing?.wordpressPostStatus,
        wordpressPublishedAt: existing?.wordpressPublishedAt,
        status: article.imageUrl ? 'ready' : 'draft',
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        scheduledDate: existing?.scheduledDate,
        slug: slug.trim() || existing?.slug || undefined,
        wordpressTags: tags.length ? tags : undefined,
        wordpressCategoryIds: wordpressCategoryIds.length ? wordpressCategoryIds : undefined,
        wordCount: article.refinedContent.length,
      })
    } catch (e) {
      alert(e instanceof Error ? e.message : '下書きの保存に失敗しました')
      return
    }

    setToastMessage('下書きを保存しました')
    return id
  }, [article, currentArticleId, searchParams, slug, wordpressTagsInput, wordpressCategoryIds, updateArticle])

  const handleRegenerate = useCallback(async () => {
    setFireflyStatus('loading')
    setFireflyError(null)
    updateArticle({ imageUrl: '' })
    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: article.refinedTitle?.trim() || article.title, 
          content: article.refinedContent,
          targetKeyword: article.targetKeyword
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFireflyError(
          [data.error ?? '画像生成に失敗しました', data.debug].filter(Boolean).join('\n')
        )
        setFireflyStatus('error')
        return
      }
      updateArticle({ imageUrl: `data:${data.mimeType};base64,${data.imageBase64}` })
      setFireflyStatus('success')
    } catch (e) {
      setFireflyError(e instanceof Error ? e.message : '画像生成に失敗しました')
      setFireflyStatus('error')
    }
  }, [article.title, article.refinedTitle, article.refinedContent, article.targetKeyword, updateArticle])

  const handlePublish = useCallback(async (choice: WordPressPublishChoice) => {
    setWordpressStatus('loading')
    setWordpressError(null)
    const tags = parseWordPressTagsInput(wordpressTagsInput)
    try {
      const contentWithLinks = applyInternalLinksToText(
        article.refinedContent,
        article.internalLinks ?? []
      )
      const publishTitle = article.refinedTitle?.trim() || article.title

      const wpStatus: 'draft' | 'publish' | 'future' =
        choice.type === 'future' ? 'future' : choice.type

      // ── Step 1: 画像アップロード（専用エンドポイントで先に処理）
      let preUploadedMediaId: number | undefined
      let preUploadedImageUrl: string | undefined
      const imageDataUrl = article.imageUrl
      if (imageDataUrl?.startsWith('data:')) {
        const matches = imageDataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/)
        if (matches) {
          const [, imgMimeType, imgBase64] = matches
          try {
            const uploadRes = await fetch('/api/wordpress/upload-media', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageBase64: imgBase64,
                mimeType: imgMimeType,
                articleTitle: publishTitle,
              }),
            })
            const uploadData = await uploadRes.json()
            if (uploadRes.ok) {
              preUploadedMediaId = uploadData.mediaId
              preUploadedImageUrl = uploadData.sourceUrl
            } else {
              setToastMessage(`⚠️ アイキャッチ画像のアップロードに失敗しました（投稿は続行します）\n${uploadData.error ?? ''}`)
            }
          } catch (uploadErr) {
            setToastMessage(`⚠️ 画像アップロードでエラーが発生しました（投稿は続行します）`)
          }
        }
      }

      // ── Step 2: 記事投稿（画像はURLのみ渡す）
      const body: Record<string, unknown> = {
        title: publishTitle,
        content: contentWithLinks,
        imageUrl: preUploadedImageUrl ?? (imageDataUrl?.startsWith('data:') ? undefined : imageDataUrl),
        preUploadedMediaId,
        targetKeyword: article.targetKeyword?.trim() || undefined,
        slug: slug.trim() || undefined,
        status: wpStatus,
        wordpressTags: tags.length ? tags : undefined,
        categoryIds: wordpressCategoryIds.length ? wordpressCategoryIds : undefined,
      }
      if (choice.type === 'future') {
        body.scheduledDate = choice.scheduledDateTime
      }

      const res = await fetch('/api/wordpress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const publishedAt =
        typeof data.dateGmt === 'string' && data.dateGmt.trim() ? data.dateGmt.trim() : undefined

      updateArticle({
        wordpressUrl: data.wordpressUrl,
        wordpressPostStatus: data.status,
        wordpressTags: tags,
        wordpressCategoryIds,
      })

      const nextArticleStatus = choice.type === 'draft' ? 'ready' : 'published'

      const scheduleFields =
        choice.type === 'future'
          ? (() => {
              const [dPart, tPart] = choice.scheduledDateTime.split('T')
              return { scheduledDate: dPart, scheduledTime: tPart.slice(0, 5) }
            })()
          : { scheduledDate: undefined, scheduledTime: undefined }

      if (currentArticleId) {
        const existing = await getArticleById(currentArticleId)
        if (existing) {
          await saveArticle({
            ...existing,
            status: nextArticleStatus,
            wordpressUrl: data.wordpressUrl,
            wordpressPostStatus: data.status,
            wordpressPublishedAt: publishedAt ?? existing.wordpressPublishedAt,
            wordpressTags: tags.length ? tags : undefined,
            wordpressCategoryIds: wordpressCategoryIds.length ? wordpressCategoryIds : undefined,
            ...scheduleFields,
          })
        } else {
          await updateArticleStatus(
            currentArticleId,
            nextArticleStatus,
            data.wordpressUrl,
            data.status
          )
        }
      } else {
        const newId = String(Date.now())
        setCurrentArticleId(newId)
        await saveArticle({
          id: newId,
          title: article.title,
          refinedTitle: article.refinedTitle ?? article.title,
          targetKeyword: article.targetKeyword ?? '',
          originalContent: article.originalContent,
          refinedContent: article.refinedContent,
          imageUrl: article.imageUrl,
          wordpressUrl: data.wordpressUrl,
          wordpressPostStatus: data.status,
          ...(publishedAt ? { wordpressPublishedAt: publishedAt } : {}),
          status: nextArticleStatus,
          createdAt: new Date().toISOString(),
          wordCount: article.refinedContent.length,
          slug: slug.trim() || undefined,
          wordpressTags: tags.length ? tags : undefined,
          wordpressCategoryIds: wordpressCategoryIds.length ? wordpressCategoryIds : undefined,
          ...scheduleFields,
        })
      }
      setWordpressStatus('success')
      if (data.imageUploadWarning) {
        setToastMessage(`⚠️ 投稿は成功しましたが、アイキャッチ画像のアップロードに失敗しました。\n${data.imageUploadWarning}`)
      }
    } catch (e) {
      setWordpressStatus('error')
      setWordpressError(e instanceof Error ? e.message : 'WordPress投稿に失敗しました')
    }
  }, [
    article.title,
    article.refinedTitle,
    article.targetKeyword,
    article.originalContent,
    article.refinedContent,
    article.internalLinks,
    article.imageUrl,
    wordpressTagsInput,
    wordpressCategoryIds,
    currentArticleId,
    slug,
    updateArticle,
  ])

  const handleReset = useCallback(() => {
    clearState()
    setCurrentStep(1)
    setArticle({ ...initialArticle })
    setGeminiStatus('idle')
    setGeminiToastShown(false)
    setGeminiError(null)
    setFireflyStatus('idle')
    setWordpressStatus('idle')
    setWordpressError(null)
    setSlug('')
    setRefineSlugSuggestion('')
    setWordpressTagsInput('')
  }, [])

  const handleClearArticle = useCallback(() => {
    setArticle({ ...initialArticle })
    setGeminiStatus('idle')
    setGeminiToastShown(false)
    setGeminiError(null)
    setFireflyStatus('idle')
    setWordpressStatus('idle')
    setWordpressError(null)
    setCurrentStep(1)
    setSlug('')
    setRefineSlugSuggestion('')
    setWordpressTagsInput('')
  }, [])

  /** どのステップからでも一次執筆のまっさらな状態で始める */
  const handleNewArticle = useCallback(() => {
    clearState()
    setCurrentArticleId(null)
    setArticle({ ...initialArticle })
    setGeminiStatus('idle')
    setGeminiToastShown(false)
    setGeminiError(null)
    setFireflyStatus('idle')
    setFireflyError(null)
    setWordpressStatus('idle')
    setWordpressError(null)
    setCurrentStep(1)
    setSlug('')
    setRefineSlugSuggestion('')
    setWordpressTagsInput('')
    router.replace('/editor')
  }, [router])

  // サーバー・クライアントとも初回は null で一致させ、マウント後に描画（ハイドレーション回避）
  if (!mounted) {
    return null
  }

  return (
    <div className="w-full">
      {/* 全ステップ共通：新規作成ボタン */}
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={handleNewArticle}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
          style={{ background: '#1A9FCC', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <Plus size={16} />
          新規作成
        </button>
      </div>
      {currentStep === 1 && (
        <ArticleInput
          article={article}
          onTitleChange={title => updateArticle({ title })}
          onContentChange={content => updateArticle({ originalContent: content })}
          onTargetKeywordChange={kw => updateArticle({ targetKeyword: kw })}
          onNext={handleStep1Next}
          onClear={handleClearArticle}
            onStepClick={handleStepClick}
        />
      )}
      {currentStep === 2 && (
        <GeminiResult
          article={article}
          geminiStatus={geminiStatus}
          geminiError={geminiError}
          showCompletionToast={!geminiToastShown}
          onCompletionToastShown={() => setGeminiToastShown(true)}
          onRefinedTitleChange={refinedTitle => updateArticle({ refinedTitle })}
          onRefinedContentChange={refinedContent => updateArticle({ refinedContent })}
          onBack={() => setCurrentStep(1)}
          onNext={handleStep2Next}
          onRetry={callGeminiApi}
            onStepClick={handleStepClick}
        />
      )}
      {currentStep === 3 && (
        <ImageResult
          article={article}
          fireflyStatus={fireflyStatus}
          fireflyError={fireflyError}
          onBack={() => setCurrentStep(2)}
          onSaveDraft={handleSaveDraft}
          onNext={handleStep3NextComplete}
          onRegenerate={handleRegenerate}
          onGenerate={triggerFirefly}
          onImageUpload={handleImageUpload}
          onStepClick={handleStepClick}
          articleId={currentArticleId}
        />
      )}
      {currentStep === 5 && (
        <PublishResult
          article={article}
          wordpressStatus={wordpressStatus}
          wordpressError={wordpressError}
          onBack={() => setCurrentStep(3)}
          onSaveDraft={handleSaveDraft}
          onPublish={handlePublish}
          onReset={handleReset}
          onStepClick={handleStepClick}
          onRefinedTitleChange={title => updateArticle({ refinedTitle: title })}
          onRefinedContentChange={content => updateArticle({ refinedContent: content })}
          wordpressTagsInput={wordpressTagsInput}
          onWordpressTagsInputChange={v => {
            setWordpressTagsInput(v)
            updateArticle({ wordpressTags: parseWordPressTagsInput(v) })
          }}
          wordpressCategoryIds={wordpressCategoryIds}
          onWordpressCategoryIdsChange={ids => {
            setWordpressCategoryIds(ids)
            updateArticle({ wordpressCategoryIds: ids })
          }}
          slug={slug}
          onSlugChange={setSlug}
          refineSlugSuggestion={refineSlugSuggestion}
        />
      )}

      {toastMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xl max-w-sm w-full mx-4 p-6 text-center">
            <p className="text-sm font-medium text-[#1A1A2E] mb-5">{toastMessage}</p>
            <button
              onClick={() => setToastMessage(null)}
              className="px-8 py-2 rounded-full bg-[#1A9FCC] text-white text-sm font-semibold hover:bg-[#178AB5] transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">読み込み中...</div>}>
      <EditorContent />
    </Suspense>
  )
}
