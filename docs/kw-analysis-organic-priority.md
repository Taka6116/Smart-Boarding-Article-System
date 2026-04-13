# KW分析：競合KW（オーガニック）優先度・スコア設計

## 目的

Site Explorer のオーガニックキーワードCSVは **既に順位が付いているクエリ** が中心。Keywords Explorer 向けの「機会スコア＋KD」ベースの優先度では、KD が 0 に近い行が多く **★★★ が過剰**になり、施策の優先が付きにくい。

競合KWタブでは **順位・オーガニック流入の変動・検索ボリューム** を主とし、**KD は優先度・スコアの計算に使わない**。

## 実装

- `analyzeOrganicKeywords` … 競合KWタブ専用。`app/ahrefs/page.tsx` の `scoredOrganic` のみ使用。
- `calculateOrganicActionScore` … ソート用スコア（0〜99 目安）。順位帯・流入変動・Volume。
- `calcPriorityOrganic` … ★段階。閾値は `src/lib/ahrefsAnalyzer.ts` 内コメント参照。

狙い目KW・トレンドは従来どおり `analyzeKeywords`（全データタブは狙い目KWと同一だったため削除済み）。

## 列ヘッダーのⓘ（ツールチップ）

`app/ahrefs/page.tsx` の `AHREFS_COLUMN_HINTS` に、Ahrefs の用語（Volume / KD / CPC / 順位 / 流入変動等）の日本語要約を定義。ブラウザの `title` によるホバー表示。

## 調整

運用で ★★★ の件数がまだ多い／少ない場合は `calcPriorityOrganic` の閾値（`volume`・`trafficChange`・順位帯）をチューニングする。
