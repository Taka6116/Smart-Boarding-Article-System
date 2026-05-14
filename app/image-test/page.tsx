'use client'

import { useEffect, useState, useCallback } from 'react'

interface Archetype {
  id: string
  label: string
  sceneHint: string
  peopleHint: string
}

interface Palette {
  id: string
  label: string
  paletteHint: string
}

interface GenerateResult {
  imageBase64: string
  mimeType: string
  prompt: string
  geminiPrompt: string | null
  archetypeId: string
  paletteId: string
  archetypeHint: string
  paletteHint: string
}

interface HistoryItem extends GenerateResult {
  id: number
  title: string
  keyword: string
  archetypeLabel: string
  paletteLabel: string
  timestamp: string
  useGemini: boolean
}

const ARCHETYPE_LABELS: Record<string, string> = {
  lifestyle_portrait_outdoor: '屋外ライフスタイル',
  silhouette_or_back_pose: 'シルエット/後ろ姿',
  business_meeting_japan: '会議シーン',
  macro_object_detail: 'クローズアップ',
  bright_landscape: '自然風景',
  clean_workspace: 'ワークスペース',
}

const PALETTE_LABELS: Record<string, string> = {
  intellectual_blue_silver: 'ブルー/シルバー（知的）',
  warm_earth_tones: 'アース/ウォーム',
  vibrant_accents: 'ビビッドアクセント',
  refined_monochrome_spot: 'モノクロ+スポット',
  airy_pastel: 'エアリーパステル',
}

export default function ImageTestPage() {
  const [archetypes, setArchetypes] = useState<Archetype[]>([])
  const [palettes, setPalettes] = useState<Palette[]>([])

  const [title, setTitle] = useState('人材育成で現場が変わる5つのステップ')
  const [keyword, setKeyword] = useState('人材育成')
  const [content, setContent] = useState(
    'eラーニングとOJTを組み合わせた研修プログラムの設計方法や、成功事例を紹介します。Smart Boardingを活用することで人材育成の効率が大幅に向上します。'
  )
  const [archetypeId, setArchetypeId] = useState('__auto__')
  const [paletteId, setPaletteId] = useState('__auto__')
  const [useGemini, setUseGemini] = useState(true)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [expandedPrompt, setExpandedPrompt] = useState<number | null>(null)
  const [idCounter, setIdCounter] = useState(1)

  useEffect(() => {
    fetch('/api/image-test')
      .then(r => r.json())
      .then((data: { archetypes: Archetype[]; palettes: Palette[] }) => {
        setArchetypes(data.archetypes ?? [])
        setPalettes(data.palettes ?? [])
      })
      .catch(() => {})
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!title.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/image-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          keyword: keyword.trim() || title.trim(),
          content: content.trim(),
          archetypeId: archetypeId === '__auto__' ? undefined : archetypeId,
          paletteId: paletteId === '__auto__' ? undefined : paletteId,
          useGemini,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '生成に失敗しました')
        if (data.prompt) {
          setError(prev => `${prev}\n\n【送信プロンプト】\n${data.prompt}`)
        }
        return
      }
      const result = data as GenerateResult
      const item: HistoryItem = {
        ...result,
        id: idCounter,
        title: title.trim(),
        keyword: keyword.trim(),
        archetypeLabel:
          ARCHETYPE_LABELS[result.archetypeId] ?? result.archetypeId,
        paletteLabel:
          PALETTE_LABELS[result.paletteId] ?? result.paletteId,
        timestamp: new Date().toLocaleTimeString('ja-JP'),
        useGemini,
      }
      setHistory(prev => [item, ...prev])
      setIdCounter(c => c + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [title, keyword, content, archetypeId, paletteId, useGemini, idCounter])

  return (
    <div className="w-full max-w-7xl mx-auto pt-6 pb-16 px-4">
      {/* ヘッダ */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#1A1A2E]">サムネイル画像テスト</h1>
        <p className="text-sm text-[#64748B] mt-1">
          WordPress・S3 への書き込みは一切行いません。Bedrock SD3.5 で画像を生成して品質確認するための専用画面です。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* ── 左: 設定パネル ── */}
        <div
          className="rounded-xl p-5 flex flex-col gap-4 self-start"
          style={{ background: 'white', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide">生成条件</p>

          {/* タイトル */}
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">
              記事タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#1A1A2E]"
              placeholder="例: 人材育成の効果的な進め方"
            />
          </div>

          {/* KW */}
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">
              ターゲットKW（省略可）
            </label>
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#1A1A2E]"
              placeholder="例: 人材育成"
            />
          </div>

          {/* 本文 */}
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">
              本文（Gemini ON の場合はここから画像プロンプトを生成）
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#1A1A2E] resize-y"
              placeholder="記事本文の一部を貼り付けてください..."
            />
          </div>

          {/* archetype */}
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">
              アーキタイプ（シーンの型）
            </label>
            <select
              value={archetypeId}
              onChange={e => setArchetypeId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#1A1A2E] bg-white"
            >
              <option value="__auto__">自動（ローテーション）</option>
              {archetypes.map(a => (
                <option key={a.id} value={a.id}>
                  {ARCHETYPE_LABELS[a.id] ?? a.label}
                </option>
              ))}
            </select>
            {archetypeId !== '__auto__' && archetypes.find(a => a.id === archetypeId) && (
              <p className="text-[11px] text-[#64748B] mt-1 leading-relaxed">
                {archetypes.find(a => a.id === archetypeId)?.sceneHint}
              </p>
            )}
          </div>

          {/* palette */}
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">
              カラーパレット
            </label>
            <select
              value={paletteId}
              onChange={e => setPaletteId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#1A1A2E] bg-white"
            >
              <option value="__auto__">自動（ローテーション）</option>
              {palettes.map(p => (
                <option key={p.id} value={p.id}>
                  {PALETTE_LABELS[p.id] ?? p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Gemini トグル */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setUseGemini(v => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${useGemini ? 'bg-[#1A9FCC]' : 'bg-[#CBD5E1]'}`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${useGemini ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </div>
            <span className="text-sm font-medium text-[#475569]">
              Gemini でプロンプトを生成する
            </span>
          </label>
          <p className="text-[11px] text-[#94A3B8] -mt-2">
            OFF にするとアーキタイプ/パレットのヒントをそのまま SD3.5 に送ります（高速・費用同じ）
          </p>

          {/* エラー */}
          {error && (
            <div className="rounded-lg p-3 text-xs text-red-700 bg-red-50 border border-red-200 whitespace-pre-wrap">
              {error}
            </div>
          )}

          {/* 生成ボタン */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !title.trim()}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: loading ? '#94A3B8' : '#1A9FCC' }}
          >
            {loading ? '生成中…（10〜30秒）' : '画像を生成する'}
          </button>

          <p className="text-[11px] text-[#94A3B8] text-center -mt-1">
            1回あたり約 $0.08 の AWS Bedrock 費用が発生します
          </p>
        </div>

        {/* ── 右: 履歴 ── */}
        <div className="flex flex-col gap-4">
          {history.length === 0 && !loading && (
            <div
              className="rounded-xl p-12 text-center text-sm text-[#94A3B8]"
              style={{ background: 'white', border: '1px solid #E2E8F0' }}
            >
              生成した画像がここに表示されます。<br />
              同じ設定で何度でも生成し直せます。
            </div>
          )}

          {loading && (
            <div
              className="rounded-xl p-8 flex items-center justify-center gap-3 text-sm text-[#1A9FCC]"
              style={{ background: 'white', border: '1px solid #E2E8F0' }}
            >
              <div className="w-5 h-5 border-2 border-[#1A9FCC] border-t-transparent rounded-full animate-spin" />
              Bedrock SD3.5 で生成中…
            </div>
          )}

          {history.map(item => (
            <div
              key={item.id}
              className="rounded-xl overflow-hidden"
              style={{ background: 'white', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
            >
              {/* 画像 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:${item.mimeType};base64,${item.imageBase64}`}
                alt={item.title}
                className="w-full object-cover"
                style={{ aspectRatio: '16/9' }}
              />

              {/* メタ情報 */}
              <div className="p-4 space-y-3">
                {/* タグ行 */}
                <div className="flex flex-wrap gap-2">
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F0F4FF] text-[#1A9FCC] border border-[#C7D7FF]">
                    {item.archetypeLabel}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]">
                    {item.paletteLabel}
                  </span>
                  {item.useGemini && item.geminiPrompt && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FEF9C3] text-[#A16207] border border-[#FDE68A]">
                      Gemini
                    </span>
                  )}
                  <span className="text-[11px] text-[#94A3B8] ml-auto">{item.timestamp}</span>
                </div>

                {/* タイトル/KW */}
                <p className="text-sm font-semibold text-[#1A1A2E] leading-snug">{item.title}</p>
                {item.keyword && (
                  <p className="text-[11px] text-[#64748B]">KW: {item.keyword}</p>
                )}

                {/* プロンプト展開 */}
                <button
                  type="button"
                  onClick={() => setExpandedPrompt(expandedPrompt === item.id ? null : item.id)}
                  className="text-[11px] font-medium text-[#1A9FCC] hover:underline"
                >
                  {expandedPrompt === item.id ? '▲ プロンプトを閉じる' : '▼ 送信プロンプトを確認する'}
                </button>

                {expandedPrompt === item.id && (
                  <div className="space-y-2">
                    {item.geminiPrompt && (
                      <div>
                        <p className="text-[10px] font-semibold text-[#94A3B8] mb-1">Gemini 生成プロンプト（英語1文）</p>
                        <pre className="text-[11px] text-[#475569] bg-[#F8FAFC] rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed border border-[#E2E8F0]">
                          {item.geminiPrompt}
                        </pre>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] font-semibold text-[#94A3B8] mb-1">SD3.5 最終プロンプト</p>
                      <pre className="text-[11px] text-[#475569] bg-[#F8FAFC] rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed border border-[#E2E8F0]">
                        {item.prompt}
                      </pre>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-[#94A3B8] mb-1">アーキタイプ Hint</p>
                      <p className="text-[11px] text-[#64748B] bg-[#F8FAFC] rounded-lg p-2 border border-[#E2E8F0]">
                        {item.archetypeHint}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-[#94A3B8] mb-1">パレット Hint</p>
                      <p className="text-[11px] text-[#64748B] bg-[#F8FAFC] rounded-lg p-2 border border-[#E2E8F0]">
                        {item.paletteHint}
                      </p>
                    </div>
                    {/* ダウンロード */}
                    <a
                      href={`data:${item.mimeType};base64,${item.imageBase64}`}
                      download={`test-${item.id}-${item.archetypeId}.jpg`}
                      className="inline-block text-[11px] font-medium text-[#1A9FCC] hover:underline mt-1"
                    >
                      ↓ 画像をダウンロード
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
