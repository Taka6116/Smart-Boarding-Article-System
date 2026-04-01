export type WordPressPublishChoice =
  | { type: 'draft' }
  | { type: 'publish' }
  /** ローカル日時 YYYY-MM-DDTHH:mm:00（WordPress API / 投稿スケジュールと同一形式） */
  | { type: 'future'; scheduledDateTime: string }
