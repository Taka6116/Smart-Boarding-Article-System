'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tag, X, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import {
  MAX_WORDPRESS_TAGS,
  TAG_SUGGESTIONS_COLLAPSED_COUNT,
  isNoiseWordPressTagName,
  parseWordPressTagsInput,
} from '@/lib/wordpressTags'
import {
  loadWordPressTagHistory,
  saveWordPressTagHistory,
} from '@/lib/wordpressTagHistory'
import {
  addWordPressTagHidden,
  loadWordPressTagHidden,
  removeWordPressTagHidden,
} from '@/lib/wordpressTagHidden'
import type { WpTagListItem } from '@/lib/wpTagList'

interface WordPressTagsFieldProps {
  value: string
  onChange: (value: string) => void
}

function uniquePushCap(out: string[], add: string[], cap: number): void {
  const seen = new Set(out)
  for (const a of add) {
    const t = a.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= cap) break
  }
}

export default function WordPressTagsField({ value, onChange }: WordPressTagsFieldProps) {
  const selected = useMemo(() => parseWordPressTagsInput(value), [value])
  const [freeText, setFreeText] = useState('')
  const [filter, setFilter] = useState('')
  const [wpTags, setWpTags] = useState<WpTagListItem[]>([])
  const [wpLoading, setWpLoading] = useState(true)
  const [wpError, setWpError] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [wpListExpanded, setWpListExpanded] = useState(false)
  const [hiddenList, setHiddenList] = useState<string[]>([])
  const [hiddenPanelOpen, setHiddenPanelOpen] = useState(false)
  const historyDebounce = useRef<ReturnType<typeof setTimeout> | undefined>()

  const applyTags = useCallback(
    (next: string[]) => {
      const capped = next.slice(0, MAX_WORDPRESS_TAGS)
      onChange(capped.join('、'))
    },
    [onChange]
  )

  const toggleTag = useCallback(
    (name: string) => {
      const t = name.trim()
      if (!t) return
      if (selected.includes(t)) {
        applyTags(selected.filter(s => s !== t))
        return
      }
      if (selected.length >= MAX_WORDPRESS_TAGS) return
      applyTags([...selected, t])
    },
    [selected, applyTags]
  )

  const removeTag = useCallback(
    (name: string) => {
      applyTags(selected.filter(s => s !== name))
    },
    [selected, applyTags]
  )

  const addFreeText = useCallback(() => {
    const parsed = parseWordPressTagsInput(freeText)
    if (parsed.length === 0) return
    const next = [...selected]
    uniquePushCap(next, parsed, MAX_WORDPRESS_TAGS)
    applyTags(next)
    setFreeText('')
  }, [freeText, selected, applyTags])

  const loadWpTags = useCallback(async () => {
    setWpLoading(true)
    setWpError(null)
    try {
      const res = await fetch('/api/wordpress/tags?per_page=100&page=1')
      const data = (await res.json()) as { tags?: WpTagListItem[]; error?: string }
      if (!res.ok) {
        setWpError(data.error || 'タグ一覧を取得できませんでした')
        setWpTags([])
        return
      }
      setWpTags(Array.isArray(data.tags) ? data.tags : [])
    } catch {
      setWpError('タグ一覧の取得に失敗しました')
      setWpTags([])
    } finally {
      setWpLoading(false)
    }
  }, [])

  useEffect(() => {
    setHistory(loadWordPressTagHistory())
    setHiddenList(loadWordPressTagHidden())
    loadWpTags()
  }, [loadWpTags])

  const hiddenSet = useMemo(() => new Set(hiddenList), [hiddenList])

  const hideFromCandidates = useCallback(
    (name: string) => {
      const t = name.trim()
      if (!t) return
      const next = addWordPressTagHidden(t, hiddenList)
      setHiddenList(next)
      if (selected.includes(t)) {
        applyTags(selected.filter(s => s !== t))
      }
    },
    [hiddenList, selected, applyTags]
  )

  const restoreHiddenTag = useCallback((name: string) => {
    const t = name.trim()
    if (!t) return
    setHiddenList(removeWordPressTagHidden(t, hiddenList))
  }, [hiddenList])

  const hiddenSorted = useMemo(
    () => [...hiddenList].sort((a, b) => a.localeCompare(b, 'ja')),
    [hiddenList]
  )

  useEffect(() => {
    if (historyDebounce.current) clearTimeout(historyDebounce.current)
    historyDebounce.current = setTimeout(() => {
      if (selected.length === 0) return
      saveWordPressTagHistory(selected)
      setHistory(loadWordPressTagHistory())
    }, 400)
    return () => {
      if (historyDebounce.current) clearTimeout(historyDebounce.current)
    }
  }, [selected])

  const filterLower = filter.trim().toLowerCase()
  useEffect(() => {
    setHistoryExpanded(false)
    setWpListExpanded(false)
  }, [filterLower])

  const matchesFilter = (name: string) =>
    !filterLower || name.toLowerCase().includes(filterLower)

  const wpNames = useMemo(
    () => new Set(wpTags.filter(t => !isNoiseWordPressTagName(t.name)).map(t => t.name)),
    [wpTags]
  )

  const historyCandidates = useMemo(() => {
    return history.filter(
      h =>
        !isNoiseWordPressTagName(h) &&
        !hiddenSet.has(h) &&
        matchesFilter(h) &&
        !wpNames.has(h)
    )
  }, [history, filterLower, wpNames, hiddenSet])

  const wpFiltered = useMemo(() => {
    return wpTags.filter(
      t =>
        !isNoiseWordPressTagName(t.name) &&
        !hiddenSet.has(t.name) &&
        matchesFilter(t.name)
    )
  }, [wpTags, filterLower, hiddenSet])

  const historyVisible = useMemo(
    () =>
      historyExpanded
        ? historyCandidates
        : historyCandidates.slice(0, TAG_SUGGESTIONS_COLLAPSED_COUNT),
    [historyCandidates, historyExpanded]
  )

  const wpVisible = useMemo(
    () =>
      wpListExpanded
        ? wpFiltered
        : wpFiltered.slice(0, TAG_SUGGESTIONS_COLLAPSED_COUNT),
    [wpFiltered, wpListExpanded]
  )

  const historyHiddenCount = Math.max(
    0,
    historyCandidates.length - TAG_SUGGESTIONS_COLLAPSED_COUNT
  )
  const wpHiddenCount = Math.max(
    0,
    wpFiltered.length - TAG_SUGGESTIONS_COLLAPSED_COUNT
  )

  const showListBody =
    historyCandidates.length > 0 || wpFiltered.length > 0 || wpLoading

  return (
    <div className="w-full space-y-3">
      <p className="text-[11px] text-[#94A3B8] leading-relaxed">
        リストから複数選択するか、下の入力でカンマ区切り追加。最大 {MAX_WORDPRESS_TAGS}
        件。スペースでは分割されません。行末の × はこの端末の候補から隠します（WordPress のタグそのものは削除されません）。
      </p>

      <div className="flex flex-wrap gap-2 min-h-[2rem]">
        {selected.length === 0 ? (
          <span className="text-xs text-[#94A3B8]">未選択</span>
        ) : (
          selected.map(name => (
            <span
              key={name}
              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-[#EEF2FF] text-[#1B2A4A] text-xs font-medium border border-indigo-100"
            >
              {name}
              <button
                type="button"
                onClick={() => removeTag(name)}
                className="p-0.5 rounded-full hover:bg-indigo-200/60 text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/30"
                aria-label={`「${name}」を外す`}
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <input
          type="search"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="候補を絞り込み…"
          className="flex-1 px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/30 focus:border-[#1B2A4A]"
          aria-label="タグ候補の検索"
        />
        <button
          type="button"
          onClick={() => loadWpTags()}
          disabled={wpLoading}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          <RefreshCw size={14} className={wpLoading ? 'animate-spin' : ''} />
          WordPress から再取得
        </button>
      </div>

      {wpError && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{wpError}（履歴からの選択は利用できます）</span>
        </div>
      )}

      <div
        className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFC] overscroll-contain"
        role="group"
        aria-label="タグ候補リスト"
      >
        {!showListBody ? (
          <p className="text-xs text-[#94A3B8] px-3 py-6 text-center">
            候補がありません。検索条件を変えるか、下から新規追加してください。
          </p>
        ) : (
          <ul className="p-2 space-y-3 list-none m-0">
            {historyCandidates.length > 0 && (
              <li>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] px-2 pb-1">
                  最近使ったタグ・手入力候補
                </p>
                <ul
                  className={`space-y-0.5 list-none m-0 p-0 ${
                    historyExpanded && historyHiddenCount > 0
                      ? 'max-h-[220px] overflow-y-auto'
                      : ''
                  }`}
                >
                  {historyVisible.map(name => {
                    const checked = selected.includes(name)
                    return (
                      <li key={`h-${name}`}>
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white text-sm text-[#334155]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTag(name)}
                            className="rounded border-[#CBD5E1] text-[#1B2A4A] focus:ring-[#1B2A4A]/30 flex-shrink-0"
                            aria-label={`「${name}」を選択`}
                          />
                          <button
                            type="button"
                            className="flex-1 min-w-0 text-left cursor-pointer hover:underline"
                            onClick={() => toggleTag(name)}
                          >
                            {name}
                          </button>
                          <button
                            type="button"
                            onClick={() => hideFromCandidates(name)}
                            className="p-1 rounded-md hover:bg-red-50 text-[#94A3B8] hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200 flex-shrink-0"
                            aria-label={`「${name}」を候補一覧から隠す`}
                          >
                            <X size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {historyHiddenCount > 0 && (
                  <button
                    type="button"
                    aria-expanded={historyExpanded}
                    id="tag-history-expand"
                    onClick={() => setHistoryExpanded(e => !e)}
                    className="mt-1.5 ml-2 flex items-center gap-1 text-xs font-semibold text-[#1B2A4A] hover:underline"
                  >
                    {historyExpanded ? (
                      <>
                        <ChevronUp size={14} aria-hidden />
                        閉じる
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} aria-hidden />
                        他 {historyHiddenCount} 件を表示
                      </>
                    )}
                  </button>
                )}
              </li>
            )}

            <li>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] px-2 pb-1 flex items-center gap-2">
                <Tag size={12} />
                WordPress（使用頻度順）
              </p>
              {wpLoading && wpFiltered.length === 0 ? (
                <p className="text-xs text-[#94A3B8] px-2 py-3">読み込み中…</p>
              ) : wpFiltered.length === 0 ? (
                <p className="text-xs text-[#94A3B8] px-2 py-3">該当するタグがありません</p>
              ) : (
                <>
                  <ul
                    className={`space-y-0.5 list-none m-0 p-0 ${
                      wpListExpanded ? 'max-h-[220px] overflow-y-auto' : ''
                    }`}
                  >
                    {wpVisible.map(t => {
                      const name = t.name
                      const checked = selected.includes(name)
                      return (
                        <li key={t.id}>
                          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white text-sm text-[#334155]">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTag(name)}
                              className="rounded border-[#CBD5E1] text-[#1B2A4A] focus:ring-[#1B2A4A]/30 flex-shrink-0"
                              aria-label={`「${name}」を選択`}
                            />
                            <button
                              type="button"
                              className="flex-1 min-w-0 text-left cursor-pointer hover:underline"
                              onClick={() => toggleTag(name)}
                            >
                              {name}
                            </button>
                            {typeof t.count === 'number' ? (
                              <span className="text-[10px] text-[#94A3B8] tabular-nums flex-shrink-0">
                                {t.count}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => hideFromCandidates(name)}
                              className="p-1 rounded-md hover:bg-red-50 text-[#94A3B8] hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200 flex-shrink-0"
                              aria-label={`「${name}」を候補一覧から隠す`}
                            >
                              <X size={14} strokeWidth={2.5} />
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  {wpHiddenCount > 0 && (
                    <button
                      type="button"
                      aria-expanded={wpListExpanded}
                      id="tag-wp-expand"
                      onClick={() => setWpListExpanded(e => !e)}
                      className="mt-1.5 ml-2 flex items-center gap-1 text-xs font-semibold text-[#1B2A4A] hover:underline"
                    >
                      {wpListExpanded ? (
                        <>
                          <ChevronUp size={14} aria-hidden />
                          閉じる
                        </>
                      ) : (
                        <>
                          <ChevronDown size={14} aria-hidden />
                          他 {wpHiddenCount} 件を表示
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </li>
          </ul>
        )}
        {hiddenList.length > 0 && (
          <div className="border-t border-[#E2E8F0] px-2 py-2 bg-[#F8FAFC]">
            <button
              type="button"
              aria-expanded={hiddenPanelOpen}
              onClick={() => setHiddenPanelOpen(v => !v)}
              className="flex w-full items-center gap-1 text-xs font-semibold text-[#64748B] hover:text-[#1B2A4A]"
            >
              {hiddenPanelOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
              一覧から隠したタグ（{hiddenList.length}）{hiddenPanelOpen ? 'を閉じる' : 'を表示'}
            </button>
            {hiddenPanelOpen && (
              <ul className="mt-2 space-y-1 list-none m-0 p-0 max-h-[180px] overflow-y-auto">
                {hiddenSorted.map(name => (
                  <li
                    key={`hidden-${name}`}
                    className="flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-white border border-[#E2E8F0] text-xs text-[#334155]"
                  >
                    <span className="min-w-0 break-all">{name}</span>
                    <button
                      type="button"
                      onClick={() => restoreHiddenTag(name)}
                      className="flex-shrink-0 px-2 py-0.5 rounded border border-[#CBD5E1] text-[#1B2A4A] hover:bg-[#F1F5F9] font-semibold"
                    >
                      候補に戻す
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-[#64748B]">新規・追加（カンマ区切り可）</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={freeText}
            onChange={e => setFreeText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addFreeText()
              }
            }}
            placeholder="例: DD（デューデリジェンス）、売却"
            autoComplete="off"
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#E2E8F0] text-sm text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/30 focus:border-[#1B2A4A]"
          />
          <button
            type="button"
            onClick={addFreeText}
            className="px-4 py-2.5 rounded-lg bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#162240] transition-colors sm:flex-shrink-0"
          >
            追加
          </button>
        </div>
      </div>
    </div>
  )
}
