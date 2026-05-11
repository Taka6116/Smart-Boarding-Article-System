/**
 * 記事アイキャッチ画像のスタイル定義（archetype / palette）と
 * 連続生成時に類似画像が並ばないようにするためのローテーションスロット決定ロジック。
 *
 * 方針: Smart Boarding コラム風の「人物入り実写ストックフォト」を中心に、
 *       屋外ライフスタイル/会議/風景/クローズアップ/シルエット/ワークスペースの6種を循環。
 *       パレットは intellectual / warm / vibrant / refined / airy の5種を循環。
 *       6 と 5 は互いに素なので、決定的なローテーションで連続2回が一致しない。
 *
 * このモジュールは src/lib/imageGeneration.ts と src/lib/api/gemini.ts の双方から
 * 参照されるため、循環依存を避けるべく独立した単体モジュールとして配置している。
 */

export interface ImageArchetype {
  id: string
  /** Gemini プロンプト内で参照するラベル（短い見出し用） */
  label: string
  /** Gemini に渡すシーン記述（英語 1〜2 行）。フォールバック単独でも成立する文に。 */
  sceneHint: string
  /** 人物の写り方の方針（プロンプト合成時に自然な制約として埋める） */
  peopleHint: string
}

export interface ImagePalette {
  id: string
  label: string
  paletteHint: string
}

/**
 * Smart Boarding コラム参考イメージ準拠の 6 archetype。
 * - 顔の極端なドアップや特定個人が識別できる特徴は避ける（peopleHint）
 * - テキスト / ロゴ / 看板 / 通貨記号 / UI 要素は禁止（共通ルール側で禁止）
 */
export const IMAGE_ARCHETYPES: readonly ImageArchetype[] = [
  {
    id: 'lifestyle_portrait_outdoor',
    label: 'lifestyle_portrait_outdoor',
    sceneHint:
      'a candid lifestyle scene outdoors with one person enjoying a bright sunny day, soft natural light, joyful relaxed mood, casual everyday clothing, shallow depth of field stock photography',
    peopleHint:
      'one person, face partially shown or angled, not an extreme close-up, no celebrity-like or identifiable features',
  },
  {
    id: 'silhouette_or_back_pose',
    label: 'silhouette_or_back_pose',
    sceneHint:
      'a person seen from behind or as a silhouette against a wide sky at golden hour, arms slightly raised or simply standing tall, sense of hope, possibility, and forward motion',
    peopleHint:
      'one person from behind or as silhouette only, no recognizable facial features',
  },
  {
    id: 'business_meeting_japan',
    label: 'business_meeting_japan',
    sceneHint:
      'a natural Japanese office meeting scene with three to four colleagues collaborating around a whiteboard or table, bright daylight, modern minimalist office, calm professional mood',
    peopleHint:
      'three to four people in business casual, faces at angles or partial, no extreme close-ups, no identifiable individuals',
  },
  {
    id: 'macro_object_detail',
    label: 'macro_object_detail',
    sceneHint:
      'an intimate close-up of a single everyday object such as sneakers resting out of a car window, hands holding a notebook, or shoes on a sunlit path, warm cinematic stock photography',
    peopleHint:
      'only a small body part (legs, feet, or hands) visible, never a face',
  },
  {
    id: 'bright_landscape',
    label: 'bright_landscape',
    sceneHint:
      'a wide bright natural landscape such as a sunlit meadow, calm sea horizon, or open sky over rolling hills, no people, sense of scale and quiet optimism',
    peopleHint: 'no people at all',
  },
  {
    id: 'clean_workspace',
    label: 'clean_workspace',
    sceneHint:
      'a tidy modern workspace with a wooden desk, a notebook, a steaming coffee cup, and a laptop whose screen shows only a soft blurred gradient, warm window light, calm focused mood',
    peopleHint:
      'optionally only hands resting near the notebook, never a face; people may be entirely absent',
  },
]

/**
 * 5 種のパレット（airy パステルへの偏りを避けるため intellectual / warm / vibrant / refined を先に）。
 */
export const IMAGE_PALETTES: readonly ImagePalette[] = [
  {
    id: 'intellectual_blue_silver',
    label: 'intellectual_blue_silver',
    paletteHint:
      'cool blue and silver tones with crisp white accents, clean intellectual mood',
  },
  {
    id: 'warm_earth_tones',
    label: 'warm_earth_tones',
    paletteHint:
      'warm earth tones — honey, terracotta, soft sand — with gentle golden lighting',
  },
  {
    id: 'vibrant_accents',
    label: 'vibrant_accents',
    paletteHint:
      'mostly neutral with one vibrant accent color (red, teal, or yellow) carefully placed for pop',
  },
  {
    id: 'refined_monochrome_spot',
    label: 'refined_monochrome_spot',
    paletteHint:
      'refined near-monochrome composition with a single restrained spot color, editorial photography feel',
  },
  {
    id: 'airy_pastel',
    label: 'airy_pastel',
    paletteHint:
      'bright airy pastel palette with plenty of soft natural light and a high-key mood',
  },
]

export interface ImageRotationSlot {
  archetypeId: string
  paletteId: string
  /** デバッグ用 */
  archetypeIndex: number
  paletteIndex: number
}

/**
 * 文字列のシンプルな決定的ハッシュ（djb2 風）。
 * 暗号用途ではないため標準ライブラリに依存しない軽量版で十分。
 */
function hashString(input: string): number {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * 連続2回（火曜/金曜）の自動生成で、必ず違う archetype・palette が選ばれるよう
 * 決定的にスロットを返す。
 *
 * - 「実行日（UTC 起点の日数）」をベースに進行 → 火曜/金曜のように間隔が空いていれば必ず別スロットに進む
 * - キーワードのハッシュを加算 → 同日に複数記事を生成しても KW で散る
 * - archetype 数 6 と palette 数 5 は互いに素なので、(day, kw) によらず両方が同時に重ならない
 *
 * テスト容易性のため `now` を上書き可能。
 */
export function pickImageRotationSlot(
  seed: string,
  now: Date = new Date(),
): ImageRotationSlot {
  const daysSinceEpoch = Math.floor(now.getTime() / (24 * 60 * 60 * 1000))
  const seedHash = hashString(seed || 'default')
  const archetypeIndex = (daysSinceEpoch + seedHash) % IMAGE_ARCHETYPES.length
  // palette は archetype と独立に進める（互いに素のため自然にローテーション）
  const paletteIndex =
    (daysSinceEpoch + Math.floor(seedHash / IMAGE_ARCHETYPES.length)) %
    IMAGE_PALETTES.length

  return {
    archetypeId: IMAGE_ARCHETYPES[archetypeIndex]!.id,
    paletteId: IMAGE_PALETTES[paletteIndex]!.id,
    archetypeIndex,
    paletteIndex,
  }
}

export function getArchetypeById(id: string): ImageArchetype {
  return (
    IMAGE_ARCHETYPES.find(a => a.id === id) ?? IMAGE_ARCHETYPES[0]!
  )
}

export function getPaletteById(id: string): ImagePalette {
  return IMAGE_PALETTES.find(p => p.id === id) ?? IMAGE_PALETTES[0]!
}

/**
 * フィルター落ち時のリトライで、必ず別 archetype に進めるためのヘルパー。
 */
export function nextArchetypeIdAfter(archetypeId: string): string {
  const idx = IMAGE_ARCHETYPES.findIndex(a => a.id === archetypeId)
  const nextIdx = (idx + 1 + IMAGE_ARCHETYPES.length) % IMAGE_ARCHETYPES.length
  return IMAGE_ARCHETYPES[nextIdx]!.id
}
