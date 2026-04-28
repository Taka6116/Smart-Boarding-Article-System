'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useCallback, useMemo, useState, useEffect, Suspense } from 'react'
import StepIndicator from '@/components/editor/StepIndicator'
import type { Step } from '@/lib/types'

/** 行頭の全角数字番号を半角に直し、全角句点を半角に寄せる（見出し判定の取りこぼし防止） */
function normalizeNumberedHeadingLine(line: string): string {
  const fwToAscii = (s: string) =>
    [...s].map((c) => {
      const code = c.charCodeAt(0)
      if (code >= 0xff10 && code <= 0xff19) return String.fromCharCode(code - 0xff10 + 48)
      return c
    }).join('')

  let s = line
  s = s.replace(/^([０-９]+)([．.])\s/u, (_, digits: string, punct: string) => {
    const d = fwToAscii(digits)
    const dot = punct === '．' ? '.' : punct
    return `${d}${dot} `
  })
  s = s.replace(/^([０-９]+)-([０-９]+)([．.])\s/u, (_, a: string, b: string, punct: string) => {
    const da = fwToAscii(a)
    const db = fwToAscii(b)
    const dot = punct === '．' ? '.' : punct
    return `${da}-${db}${dot} `
  })
  s = s.replace(/^(\d+)(．)\s/u, '$1. ')
  s = s.replace(/^(\d+)-(\d+)(．)\s/u, '$1-$2. ')
  return s
}

/** 単独の区切り記号行はプレビュー本文に出さない */
function isDecorativeSeparatorLine(trimmed: string): boolean {
  return /^[\-—―–─━=*＊]{1,10}$/.test(trimmed)
}

function formatContent(content: string): string {
  const H2_STYLE =
    "font-size:22px;font-weight:700;margin:48px 0 16px;padding-bottom:8px;border-bottom:2px solid #33B5E5;font-family:'Noto Sans JP',sans-serif;"
  const H3_STYLE = 'font-size:18px;font-weight:400;margin:32px 0 12px;color:#111;'
  const P_STYLE = 'margin-bottom:1.6em;'

  const applyInlineFormatting = (text: string): string =>
    text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+?)__/g, '$1')
      .replace(/(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      .replace(/\*\*/g, '')

  const lines = content.split('\n')
  const htmlLines: string[] = []
  let currentParagraph: string[] = []

  const flushParagraph = () => {
    if (currentParagraph.length === 0) return
    const raw = currentParagraph
      .map(line => line.trim())
      .filter(line => line && !isDecorativeSeparatorLine(line))
      .join('<br>')
      .trim()
    if (raw) {
      htmlLines.push(`<p style="${P_STYLE}">${applyInlineFormatting(raw)}</p>`)
    }
    currentParagraph = []
  }

  for (const line of lines) {
    const trimmed = normalizeNumberedHeadingLine(line.trim())
    if (!trimmed) {
      flushParagraph()
      continue
    }
    if (isDecorativeSeparatorLine(trimmed)) {
      flushParagraph()
      continue
    }
    if (/^\d+[．.]\s/.test(trimmed) && currentParagraph.length === 0) {
      const text = trimmed.replace(/^\d+[．.]\s*/, '')
      htmlLines.push(`<h2 style="${H2_STYLE}">${applyInlineFormatting(text)}</h2>`)
      continue
    }
    if (/^\d+-\d+[．.]\s/.test(trimmed) && currentParagraph.length === 0) {
      const text = trimmed.replace(/^\d+-\d+[．.]\s*/, '').replace(/\*\*(.+?)\*\*/g, '$1')
      htmlLines.push(`<h3 style="${H3_STYLE}">${text}</h3>`)
      continue
    }
    if (/^[■▶◆●▼]\s/.test(trimmed)) {
      flushParagraph()
      const text = trimmed.replace(/^[■▶◆●▼]\s*/, '').replace(/\*\*(.+?)\*\*/g, '$1')
      htmlLines.push(`<h3 style="${H3_STYLE}">${text}</h3>`)
      continue
    }
    currentParagraph.push(trimmed)
  }

  flushParagraph()
  let bodyHtml = htmlLines.join('\n')

  bodyHtml = bodyHtml
    .replace(
      /導入事例・事例集はこちらから\s+https?:\/\/www\.smartboarding\.net\/documents\/1978\/?/g,
      '<a href="https://www.smartboarding.net/documents/1978/" target="_blank" rel="noopener noreferrer" style="color:#33B5E5;text-decoration:underline;">導入事例・事例集はこちらから</a>'
    )
    .replace(
      /14日間無料トライアルはこちら\s+https?:\/\/www\.smartboarding\.net\/trial\/?/g,
      '<a href="https://www.smartboarding.net/trial/" target="_blank" rel="noopener noreferrer" style="color:#33B5E5;text-decoration:underline;">14日間無料トライアルはこちら</a>'
    )

  return bodyHtml
}

/* ─────────────────── Header nav items ─────────────────── */
const NAV_ITEMS = [
  { label: 'サービスの特徴', href: 'https://www.smartboarding.net/concept/' },
  { label: '料金', href: 'https://www.smartboarding.net/price/' },
  { label: '導入事例・活用シーン', href: 'https://www.smartboarding.net/example/' },
  { label: '無料セミナー', href: 'https://www.smartboarding.net/seminar/' },
  { label: 'サポートFAQ', href: 'https://www.smartboarding.net/faq/' },
  { label: 'パートナー制度', href: 'https://www.smartboarding.net/partner/' },
]

const FOOTER_NAV = [
  { section: 'サービス', items: ['コンセプト', '活用シーン', 'カスタマイズ'] },
  { section: 'コンテンツ', items: [] },
  { section: '料金', items: [] },
  { section: '導入事例', items: [] },
  { section: 'サポート', items: ['導入の流れ', 'サポート体制'] },
  { section: 'FAQ', items: [] },
  { section: 'コラム', items: [] },
]

/* ─────────────────── Sidebar banners ─────────────────── */
const SIDE_BANNERS = [
  { img: 'https://smartboarding.net/_pack/img/2024common/side-download_banner_blue.png', href: 'https://smartboarding.net/documents/651/' },
  { img: 'https://smartboarding.net/_pack/img/2024common/side-webinar_banner.png', href: 'https://www.smartboarding.net/webinar/' },
  { img: 'https://smartboarding.net/_pack/img/2024common/side-mailmag_banner.png', href: 'https://www.training-c.co.jp/ml/' },
]

/* ─────────────────── Main ─────────────────── */

function PreviewContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const title = searchParams.get('title') || '（タイトルなし）'
  const contentFromUrl = searchParams.get('content') || ''
  const [storageContent, setStorageContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [wordpressUrl, setWordpressUrl] = useState<string | null>(null)

  const isPublishedPreview = searchParams.get('source') === 'published'

  useEffect(() => {
    if (typeof window === 'undefined') return
    setStorageContent(sessionStorage.getItem('preview_content') || '')
    const id = searchParams.get('articleId')
    let storedImage = ''
    let wp: string | null = null
    if (id) {
      try {
        const raw = localStorage.getItem('nas_articles')
        if (raw) {
          const articles = JSON.parse(raw)
          const match = articles.find((a: { id?: string }) => a.id === id)
          if (match) {
            if (typeof match.wordpressUrl === 'string' && match.wordpressUrl.trim()) {
              wp = match.wordpressUrl.trim()
            }
            if (match.imageUrl) storedImage = match.imageUrl
          }
        }
      } catch { /* ignore */ }
    }
    setWordpressUrl(wp)
    // 直前の「プレビューへ」で焼き込み済みを session に入れているため、article の raw より優先する
    const sessionImage = sessionStorage.getItem('preview_image')?.trim() || ''
    if (sessionImage) {
      setImageUrl(sessionImage)
    } else if (storedImage) {
      setImageUrl(storedImage)
    } else {
      setImageUrl(searchParams.get('imageUrl') || '')
    }
  }, [searchParams])

  const content = contentFromUrl || storageContent
  const category = searchParams.get('category') || 'コラム'
  const date = searchParams.get('date') || new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' }).replace(/\//g, '.')
  const articleId = searchParams.get('articleId') || ''

  const formattedContent = useMemo(
    () => formatContent(content),
    [content]
  )

  const handlePublish = useCallback(() => {
    if (articleId) {
      router.push(`/editor?articleId=${articleId}&step=5`)
    } else {
      router.push('/editor?step=5')
    }
  }, [articleId, router])

  const handleStepClick = useCallback(
    (step: Step) => {
      const base = articleId ? `/editor?articleId=${articleId}&step=` : '/editor?step='
      if (step === 1) router.push(`${base}1`)
      else if (step === 2) router.push(`${base}2`)
      else if (step === 3) router.push(`${base}3`)
      else if (step === 5) handlePublish()
    },
    [articleId, router, handlePublish]
  )

  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: "'Noto Sans JP', sans-serif" }}>
      {/* ───── 固定プレビューバー ───── */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 220,
          right: 0,
          zIndex: 1100,
          backgroundColor: '#1e3a5f',
          color: 'white',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>👁️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>プレビューモード</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              {isPublishedPreview
                ? '投稿済み記事の表示確認（編集はできません）'
                : 'Smart Boarding コラムページでの表示イメージ'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexShrink: 0, alignItems: 'center' }}>
          {isPublishedPreview ? (
            <>
              <button type="button" onClick={() => router.push('/published')} style={previewBtnOutline}>← 一覧に戻る</button>
              {wordpressUrl && (
                <a href={wordpressUrl} target="_blank" rel="noopener noreferrer" style={{ ...previewBtnSolid, backgroundColor: '#1a9a7b', textDecoration: 'none', display: 'inline-block' }}>
                  WordPressで開く
                </a>
              )}
            </>
          ) : (
            <>
              <button type="button" onClick={() => (articleId ? router.push(`/editor?articleId=${articleId}&step=3`) : router.push('/editor?step=3'))} style={previewBtnOutline}>← 戻る</button>
              <button type="button" onClick={handlePublish} style={{ ...previewBtnSolid, backgroundColor: '#e63946' }}>投稿画面へ</button>
            </>
          )}
        </div>
      </div>

      {/* ───── メインコンテンツ（左: プレビュー / 右: ステップ表示） ───── */}
      <div style={{ paddingTop: 52, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* ===== HEADER（Smart Boarding 公式準拠） ===== */}
          <header style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: '#fff', position: 'sticky', top: 52, zIndex: 1000 }}>
            {/* 上部ログインバー */}
            <div style={{ backgroundColor: '#0297CD', textAlign: 'right', padding: '4px 24px' }}>
              <span style={{ color: '#fff', fontSize: 11 }}>ログイン（会員様向け）</span>
            </div>
            {/* メインナビ */}
            <div style={{ maxWidth: 1220, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 70 }}>
              {/* ロゴ */}
              <div style={{ flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.smartboarding.net/_pack/img/cmn_logo_01.png"
                  alt="Smart Boarding（スマートボーディング）"
                  style={{ height: 32, width: 'auto' }}
                />
              </div>
              {/* ナビリンク */}
              <nav style={{ display: 'flex', gap: 20, fontSize: 13, fontWeight: 500, color: '#333', whiteSpace: 'nowrap' }}>
                {NAV_ITEMS.map(n => (
                  <span key={n.label} style={{ cursor: 'default' }}>{n.label}</span>
                ))}
              </nav>
              {/* CTAボタン */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <span style={headerCTABtn('#fff', '#0297CD', '1px solid #0297CD')}>無料トライアル</span>
                <span style={headerCTABtn('#0297CD', '#fff', 'none')}>資料ダウンロード</span>
              </div>
            </div>
          </header>

          {/* ===== パンくず ===== */}
          <div style={{ maxWidth: 1220, margin: '0 auto', padding: '12px 20px', fontSize: 12, color: '#666' }}>
            <span style={{ color: '#0297CD', cursor: 'pointer' }}>TOP</span>
            {' > '}
            <span style={{ color: '#0297CD', cursor: 'pointer' }}>コラム</span>
            {' > '}
            <span>{title.length > 50 ? `${title.slice(0, 50)}...` : title}</span>
          </div>

          {/* ===== 2カラム: 記事本文 + サイドバー ===== */}
          <div style={{ maxWidth: 1220, margin: '0 auto', padding: '0 20px 80px', display: 'flex', gap: 40, alignItems: 'flex-start' }}>
            {/* メインカラム */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* 記事ヘッド */}
              <div style={{ marginBottom: 24 }}>
                {/* 日付 */}
                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#666', marginBottom: 8 }}>
                  <span>📅 {date}</span>
                </div>
                {/* カテゴリ */}
                <div style={{ marginBottom: 12 }}>
                  <span style={{ display: 'inline-block', backgroundColor: '#f0f0f0', padding: '3px 12px', borderRadius: 2, fontSize: 12, color: '#555' }}>
                    {category}
                  </span>
                </div>
                {/* タイトル */}
                <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.6, color: '#222', margin: '0 0 20px' }}>
                  {title}
                </h1>
                {/* アイキャッチ */}
                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" style={{ width: '100%', height: 'auto', borderRadius: 4, marginBottom: 24 }} />
                )}
              </div>

              {/* 記事本文 */}
              <article
                style={{ fontSize: 16, lineHeight: 2, color: '#333' }}
                dangerouslySetInnerHTML={{ __html: formattedContent }}
              />

            </div>

            {/* ───── サイドバー ───── */}
            <aside style={{ width: 280, flexShrink: 0, position: 'sticky', top: 140 }}>
              {SIDE_BANNERS.map((b, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.img} alt="" style={{ width: '100%', height: 'auto', borderRadius: 4, cursor: 'pointer' }} />
                </div>
              ))}
            </aside>
          </div>

          {/* ===== 14日間無料トライアル CTA ===== */}
          <section style={{ backgroundColor: '#e8f8ff', padding: '60px 0', textAlign: 'center' }}>
            <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
                <div style={{
                  width: 100, height: 100, borderRadius: '50%', backgroundColor: '#0297CD', color: '#fff',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, lineHeight: 1.2,
                }}>
                  <span style={{ fontSize: 28 }}>14</span>
                  <span style={{ fontSize: 11 }}>日間</span>
                  <span style={{ fontSize: 10 }}>全機能</span>
                </div>
                <span style={{ fontSize: 28, fontWeight: 700, color: '#222' }}>無料トライアル実施中</span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.8, color: '#444', marginBottom: 24 }}>
                せっかく申し込んだトライアル。結局使わなかった、なんてことありませんか。<br />
                Smart Boardingは無料期間から<strong style={{ color: '#0297CD' }}>「貴社オリジナルコース」</strong>にカスタマイズしてご提供。
              </p>
              <div style={{ marginBottom: 24, fontSize: 15, color: '#333' }}>
                <span style={{ display: 'inline-block', border: '1px solid #ccc', padding: '6px 20px', borderRadius: 4, marginRight: 8 }}>階層</span>
                <span style={{ marginRight: 8 }}>×</span>
                <span style={{ display: 'inline-block', border: '1px solid #ccc', padding: '6px 20px', borderRadius: 4, marginRight: 8 }}>課題</span>
                <span style={{ marginRight: 8 }}>=</span>
                <span style={{ display: 'inline-block', border: '2px solid #0297CD', padding: '6px 20px', borderRadius: 4, color: '#0297CD', fontWeight: 700 }}>貴社オリジナルコース</span>
              </div>
              <div>
                <span style={{
                  display: 'inline-block', backgroundColor: '#0297CD', color: '#fff', padding: '14px 48px',
                  borderRadius: 6, fontWeight: 700, fontSize: 16, cursor: 'pointer',
                }}>
                  ＼3分で登録完了／<br />無料トライアルに申し込む →
                </span>
              </div>
            </div>
          </section>

          {/* ===== CONTACT セクション ===== */}
          <section style={{ backgroundColor: '#1a1a2e', color: '#fff', padding: '60px 0', textAlign: 'center' }}>
            <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>
              <p style={{ fontSize: 12, letterSpacing: 4, marginBottom: 4, opacity: 0.6 }}>CONTACT</p>
              <p style={{ fontSize: 18, fontWeight: 500, marginBottom: 32 }}>お問い合わせ</p>
              <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
                <ContactCard
                  title="14日間無料トライアル"
                  desc="課題/展望をお伺いした上で【貴社専用のコース】を作成し、無料トライアルを14日間行って頂けます。"
                  btnLabel="詳しくはこちら"
                />
                <DownloadCard />
              </div>
              <div style={{ marginTop: 40, display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
                <span style={contactBottomBtn}>資料請求</span>
                <span style={contactBottomBtn}>お問い合わせ・ご相談</span>
              </div>
            </div>
          </section>

          {/* ===== フッター ===== */}
          <footer style={{ backgroundColor: '#111', color: '#fff', padding: '48px 20px 24px' }}>
            <div style={{ maxWidth: 1220, margin: '0 auto' }}>
              <div style={{ display: 'flex', gap: 48, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 40 }}>
                {/* ロゴ + 説明 */}
                <div style={{ maxWidth: 360, flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://www.smartboarding.net/_pack/img/cmn_logo_01.png"
                    alt="Smart Boarding（スマートボーディング）"
                    style={{ height: 28, width: 'auto', filter: 'brightness(10)', marginBottom: 12 }}
                  />
                  <p style={{ fontSize: 11, lineHeight: 1.8, opacity: 0.6 }}>
                    「知っている」から「できている」へ導くオンライントレーニングシステム。インプットだけではなく、４つの手法のオンライントレーニングでアウトプットを繰り返すことでビジネス現場で「成果を出す」レベルまでトレーニングが可能。
                  </p>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <span style={footerCTASmall}>無料トライアルはこちら</span>
                    <span style={footerCTASmall}>今すぐ資料をダウンロード</span>
                  </div>
                </div>
                {/* ナビ */}
                <nav style={{ display: 'flex', gap: 32, flexWrap: 'wrap', fontSize: 12, opacity: 0.7 }}>
                  {FOOTER_NAV.map(g => (
                    <div key={g.section}>
                      <p style={{ fontWeight: 700, marginBottom: 8 }}>{g.section}</p>
                      {g.items.map(item => (
                        <p key={item} style={{ marginBottom: 4, opacity: 0.8 }}>{item}</p>
                      ))}
                    </div>
                  ))}
                </nav>
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.15)', marginBottom: 16 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, opacity: 0.5, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <span>会社概要</span>
                  <span>事業概要</span>
                  <span>プライバシーポリシー</span>
                  <span>特定商取引に関する法律に基づく表記</span>
                </div>
                <span>©FCE . ALL RIGHTS RESERVED.</span>
              </div>
            </div>
          </footer>
        </div>

        {/* ステップインジケータ */}
        {!isPublishedPreview && (
          <div style={{ flexShrink: 0, width: 140, position: 'sticky', top: 72, paddingTop: 8 }}>
            <StepIndicator currentStep={4} onStepClick={handleStepClick} />
          </div>
        )}
      </div>
    </div>
  )
}

/* ───── サブコンポーネント ───── */

function ContactCard({ title, desc, btnLabel }: { title: string; desc: string; btnLabel: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 24, maxWidth: 360, textAlign: 'left', color: '#333' }}>
      <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</p>
      <p style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 16, color: '#666' }}>{desc}</p>
      <span style={{ display: 'inline-block', border: '1px solid #0297CD', color: '#0297CD', padding: '8px 24px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        {btnLabel} →
      </span>
    </div>
  )
}

function DownloadCard() {
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 24, maxWidth: 360, textAlign: 'left', color: '#333' }}>
      <p style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>人材開発お役立ち資料</p>
      <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>年間 <span style={{ fontSize: 28, fontWeight: 900 }}>6,000</span> 名の企業研修を受け持つ</p>
      <p style={{ fontSize: 14, marginBottom: 8 }}>講師自らが発見をまとめた</p>
      <p style={{ fontWeight: 700, color: '#0297CD', marginBottom: 16, fontSize: 14 }}>人材開発ノウハウ公開中！</p>
      <span style={{ display: 'inline-block', backgroundColor: '#0297CD', color: '#fff', padding: '10px 24px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        資料をダウンロードする 📄
      </span>
    </div>
  )
}

/* ───── Shared inline styles ───── */

const previewBtnOutline: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.5)',
  color: 'white',
  padding: '8px 18px',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
}

const previewBtnSolid: React.CSSProperties = {
  border: 'none',
  color: 'white',
  padding: '8px 22px',
  borderRadius: 6,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
}

function headerCTABtn(bg: string, color: string, border: string): React.CSSProperties {
  return {
    display: 'inline-block',
    backgroundColor: bg,
    color,
    border,
    padding: '8px 16px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

const contactBottomBtn: React.CSSProperties = {
  display: 'inline-block',
  border: '1px solid rgba(255,255,255,0.4)',
  color: '#fff',
  padding: '12px 32px',
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const footerCTASmall: React.CSSProperties = {
  display: 'inline-block',
  border: '1px solid rgba(255,255,255,0.3)',
  padding: '6px 12px',
  borderRadius: 4,
  fontSize: 10,
  cursor: 'pointer',
}

/* ───── Page export ───── */

export default function PreviewPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>読み込み中...</div>}>
      <PreviewContent />
    </Suspense>
  )
}
