# 記事自動投稿システム 設計書（AUTO_PUBLISH_SPEC v2）

Smart Boarding コラムの週 2 回・完全自動投稿フロー。
**v2 からは KW 分析テーブル（`/ahrefs` の狙い目KW）を入力として、優先度・スコア順に上から順に消化する** 方式に変更された。管理者はキューを手動で積む必要がなく、Ahrefs の CSV をアップロードするだけで自動投稿の予約が埋まる。

---

## 1. 目的と方針

- **週 2 回（火・金 JST 10:00）**に 1 本ずつ自動投稿する
- **入力 = 最新の Ahrefs 狙い目KW データセット**（`/ahrefs` 画面と同じ並び順）
- **1 回の cron で、未投稿 KW の先頭 1 件**を生成・投稿する
- **生成プロンプトは `/ahrefs` の「記事作成」ボタン押下時と完全に同一**（`generateAutoPrompt`）
- **生成は Gemini を主、Claude（Bedrock）を副**（Gemini 失敗時のみフォールバック）
- **アイキャッチは画像生成 + タイトル焼き込み** をサーバサイド Canvas で実施
- **投稿ステータスは `future`（予約公開）**：Cron 実行時刻 + 2 時間後に自動公開
  - 2 時間のバッファで、管理者は WordPress 管理画面から内容をチェックし、問題あれば予約解除・削除できる
  - 何もしなければその時刻に自動公開される

---

## 2. 全体アーキテクチャ

```
┌──────────────────────────┐
│ S3: ahrefs/uploads/*.json │   ← /ahrefs から CSV アップロード
│  (latest type=keywords)   │
└──────────────┬────────────┘
               │
               │ (1) 最新 KW データセット取得
               ▼
┌─────────────────────────┐       ┌─────────────────────────────┐
│  GitHub Actions          │       │  Vercel (Next.js)            │
│  .github/workflows/      │       │  /api/auto-publish/run       │
│  auto-publish.yml        │─POST─▶│  runtime=nodejs              │
│  cron: 0 1 * * 2,5 (UTC) │       │  maxDuration=300s            │
│  = 火・金 JST 10:00      │       │                              │
└─────────────────────────┘       │  ┌────────────────────────┐ │
                                   │  │ 1. 最新 KW データセット │ │
                                   │  │ 2. 優先度↓・スコア↓     │ │
                                   │  │ 3. 投稿済 & skipped 除外│ │
                                   │  │ 4. 先頭 KW 選択         │ │
                                   │  │ 5. generateAutoPrompt   │ │
                                   │  │ 6. Gemini→Claude 生成   │ │
                                   │  │ 7. 推敲・スラッグ        │ │
                                   │  │ 8. SD3.5 画像生成        │ │
                                   │  │ 9. Canvas でタイトル焼込 │ │
                                   │  │10. WP メディア upload   │ │
                                   │  │11. WP 予約投稿(future)  │ │
                                   │  │12. S3 記事保存+履歴      │ │
                                   │  └────────────────────────┘ │
                                   └─────────────┬───────────────┘
                                                 │
                                                 ▼
                                     ┌───────────────────────┐
                                     │ S3: articles/*.json    │
                                     │  (targetKeyword 必須)  │
                                     └───────────┬───────────┘
                                                 │
                                                 │ 次回表示時に突合
                                                 ▼
                                     ┌───────────────────────┐
                                     │ /ahrefs 投稿日列        │
                                     │ 5/3（公開）5/3（予約）  │
                                     └───────────────────────┘
```

---

## 3. KW 選定ロジック（v2 の肝）

```typescript
async function pickNextKeyword() {
  // a. 最新の type='keywords' Ahrefs データセットを取得
  const latest = await loadLatestKeywordsDataset()
  if (!latest) return { kw: null, reason: 'no-dataset' }

  // b. 画面と同じスコアリング
  const scored = analyzeKeywords(latest.keywords).sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return b.score - a.score
  })

  // c. 投稿済みと skipped を除外
  const posted   = buildKeywordWpEntriesByKeyword(await getAllArticles())
  const skipped  = await getSkippedKeywordSet()

  for (const kw of scored) {
    const key = normalizeKeywordForArticleMatch(kw.keyword)
    if (posted.has(key))  continue   // 既に記事アリ
    if (skipped.has(key)) continue   // 3 回連続失敗で除外
    return { kw }
  }
  return { kw: null, reason: 'all-done' }
}
```

**「投稿済み」の定義**: `SavedArticle.targetKeyword` を正規化して一致、かつ `wordpressPostStatus in ['publish', 'future']` かつ `wordpressUrl` あり。
これは `/ahrefs` 画面の投稿日列・記事作成ボタンラベルの突合ロジックと同一。

**正規化** (`normalizeKeywordForArticleMatch`): NFKC 正規化 → trim → 小文字化。

---

## 4. プロンプトの出どころ

`src/lib/ahrefsAutoPrompt.ts` の `generateAutoPrompt(scoredKw)` を使用する。
同じ関数は `/ahrefs` 画面の「記事作成」ボタン押下時にも呼ばれており、**手動フローと自動フローで完全に同一のプロンプト**が使われる。

プロンプトには以下が動的に埋め込まれる：
- ターゲット KW（`row.keyword`）
- 月間検索ボリューム / KD / CPC
- 優先度（★★★/★★/★）
- カテゴリ（分類ルール）
- Volume 戦略 / KD 戦略 / CPC 戦略（ボリューム・KD・CPC による執筆方針の切り替え）
- トレンド注記（上昇/下降時のみ）
- カテゴリ別の追加検索意図

プロンプトの**内容そのもの**を変更したい場合は `src/lib/ahrefsAutoPrompt.ts` を直接編集する（自動フロー側だけで変わる、みたいな分岐はしない）。

---

## 5. 失敗時の扱い

S3 に 2 種類のファイルで管理：

| ファイル | 役割 |
|---|---|
| `autorun/failures.json` | `{normalizedKw: {count, lastError, lastAt, keyword}}` 連続失敗カウント |
| `autorun/skipped.json` | `string[]` 3 回連続失敗した KW（正規化前の原文） |

動作：
- 成功時: `clearFailure(kw)` で failures から消す
- 失敗時: `recordFailure(kw, error)` でカウント++
- 3 回目で skipped に昇格、failures から削除（二重カウント防止）
- skipped の KW は以後 `pickNextKeyword` の候補から除外

**skipped からの復帰**: 管理者が手動で S3 の `autorun/skipped.json` を編集して該当 KW を削除すると、次回から再び候補に戻る。将来的に `/ahrefs` 画面にバッジ UI を追加する余地あり。

---

## 6. スケジュールと GitHub Actions

`.github/workflows/auto-publish.yml`

```yaml
schedule:
  - cron: '0 1 * * 2,5'   # UTC 01:00 = JST 10:00（火・金）
workflow_dispatch:         # 手動実行ボタン
```

- JST 10:00 に 1 回だけ叩かれる
- `curl -X POST <AUTOPUBLISH_URL> -H "Authorization: Bearer <CRON_SECRET>"`
- Vercel の `maxDuration=300s` 以内（実測 120〜180 秒）

### テスト用クエリオーバーライド（CRON_SECRET 必須）

| クエリ | 挙動 | 用途 |
|---|---|---|
| `?status=publish` | 即時公開 | 動作確認で本番公開まで一気通貫 |
| `?status=draft` | WP 下書き | 中身だけ人間確認したい |
| `?delayMinutes=5` | 5 分後予約 | future フローで短時間確認 |

**本番 cron ではこれらのクエリを付けない**（デフォルト future + 2h 予約）。

---

## 7. 3 ヶ月後の KW 枯渇

- 全件投稿済み → `skipped: all-done` を返して正常終了（GitHub Actions は緑のまま）
- 管理者は `/ahrefs` で新しい CSV をアップロード
- 次の火曜から自動再開（新データセットが `uploadedAt` で最新判定される）

---

## 8. 使用ライブラリ・ヘルパー（v2）

| モジュール | 役割 |
|---|---|
| `src/lib/ahrefsDataset.ts` | S3 から最新 KW データセット取得 |
| `src/lib/ahrefsAutoPrompt.ts` | KW 行 → プロンプト合成（`/ahrefs` と共通） |
| `src/lib/ahrefsAnalyzer.ts` | `analyzeKeywords`（スコアリング） |
| `src/lib/keywordPublishIndex.ts` | 投稿済み突合・表示ラベル |
| `src/lib/autoRunFailures.ts` | 失敗カウント & skipped 管理 |
| `src/lib/autoRunQueue.ts` | history 書き出しのみ使用（`appendAutoRunHistory`）。キュー機能は v2 で非推奨。 |
| `src/lib/imageGeneration.ts` | Bedrock SD3.5 画像生成 |
| `src/lib/compositeArticleTitleOnImageServer.ts` | `@napi-rs/canvas` でタイトル焼き込み |
| `src/lib/wordpress.ts` | WP REST 投稿 |
| `src/lib/api/gemini.ts` | Gemini 生成＋Claude フォールバック |

---

## 9. 環境変数

| 変数 | 例 | 必須 | 備考 |
|---|---|---|---|
| `CRON_SECRET` | `64hex` | ✅ | GitHub Actions との共通値 |
| `AUTO_PUBLISH_SCHEDULE_DELAY_HOURS` | `2` | | デフォルト 2h、0〜24 の範囲 |
| `GOOGLE_API_KEY` | | ✅ | Gemini |
| `CLAUDE_BEDROCK_MODEL` | `anthropic.claude-sonnet-4-6` | | デフォルト Sonnet 4.6 |
| `CLAUDE_BEDROCK_MODEL_FALLBACK` | `anthropic.claude-haiku-4-5` | | デフォルト Haiku 4.5 |
| `CLAUDE_ENABLE_FALLBACK` | `true` | | Claude を使うか |
| `CLAUDE_BEDROCK_REGION` | `us-west-2` | | |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | | ✅ | S3 & Bedrock |
| `S3_BUCKET_NAME` | | ✅ | |
| `WORDPRESS_URL` / `WORDPRESS_USERNAME` / `WORDPRESS_APP_PASSWORD` | | ✅ | |
| `WORDPRESS_CATEGORY_ID` | | | デフォルトカテゴリ |

### GitHub Secrets

| Secret | 役割 |
|---|---|
| `CRON_SECRET` | Vercel 側と同じ値 |
| `AUTOPUBLISH_URL` | `https://<vercel-domain>/api/auto-publish/run` |

---

## 10. 運用

- `/ahrefs` 画面を開けば現在のキュー状況が見える（投稿日列）
- 未投稿の KW = 上から順に次回以降で消化される
- Ahrefs CSV を差し替える（新データセットをアップロード）と、次回 cron から新データセット基準
- **旧データセットに入っていた KW でも、targetKeyword で突合されるので投稿済みマークは引き継がれる**

### 旧 v1 キューの扱い

v1 の `autorun/queue.json` / `/api/auto-publish/queue` は残してあるが、v2 では参照しない。
動作が安定したら（2〜3 週間後）削除予定。

---

## 11. 履歴と監視

- `autorun/history/YYYY-MM-DD.json` に 1 日分をまとめて蓄積
- 各エントリ：`itemId / promptId / keyword / startedAt / finishedAt / status / articleId / wordpressPostId / wordpressUrl / scheduledFor / error`
- Slack / Email 通知は当面なし（`/ahrefs` 画面で目視）
- GitHub Actions の実行履歴で HTTP ステータスも確認できる
