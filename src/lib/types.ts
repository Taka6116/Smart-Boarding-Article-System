export type Step = 1 | 2 | 3 | 4 | 5

/** 内部リンク1件（記事内のどの文言にどのURLを張るか） */
export interface InternalLinkEntry {
  /** 記事内のリンクを張る文言（アンカーテキスト） */
  anchorText: string
  /** リンク先URL */
  url: string
  /** 管理用ラベル（例: お役立ち情報のタイトル） */
  label?: string
}

export interface ArticleData {
  title: string
  originalContent: string
  refinedContent: string
  /** Gemini推敲後のタイトル（未推敲時は空） */
  refinedTitle: string
  targetKeyword?: string
  /** 追加する内部リンク（担当者が設定） */
  internalLinks: InternalLinkEntry[]
  imageUrl: string
  wordpressUrl?: string
  /** WordPress REST が返した直近の投稿ステータス（下書き投稿成功時など） */
  wordpressPostStatus?: string
  /** WordPress の post_tag 用（パース済みのタグ名の配列） */
  wordpressTags?: string[]
  /** WordPress の column__category 用（カテゴリーID配列） */
  wordpressCategoryIds?: number[]
}

export type ArticleStatus = 'draft' | 'ready' | 'published'

export interface SavedArticle {
  id: string
  title: string
  refinedTitle: string
  targetKeyword: string
  originalContent: string
  refinedContent: string
  imageUrl: string
  wordpressUrl?: string
  status: ArticleStatus
  createdAt: string
  scheduledDate?: string
  scheduledTime?: string
  /** WordPress REST が返す投稿ステータス（予約投稿成功時に保存。future / publish / draft 等） */
  wordpressPostStatus?: string
  /** WordPress REST の date_gmt（公開日または予約公開日時）。KW分析などの表示用 */
  wordpressPublishedAt?: string
  slug?: string
  /** WordPress post_tag 用タグ名（保存・予約投稿で引き継ぎ） */
  wordpressTags?: string[]
  /** WordPress column__category 用カテゴリーID */
  wordpressCategoryIds?: number[]
  wordCount: number
}

export type ProcessingState = 'idle' | 'loading' | 'success' | 'error'

export interface StepState {
  currentStep: Step
  article: ArticleData
  geminiStatus: ProcessingState
  fireflyStatus: ProcessingState
  wordpressStatus: ProcessingState
}
