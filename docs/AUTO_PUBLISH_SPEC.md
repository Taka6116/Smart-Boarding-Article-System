# 記事自動投稿システム 設計書（AUTO_PUBLISH_SPEC）

Smart Boarding コラムの週 2 回・完全自動投稿フロー。人間はキューに「どのプロンプトでどのキーワードを書くか」を積んでおくだけで、火・金 JST 10:00 に 1 本ずつ生成・投稿される。

---

## 1. 目的と方針

- **週 2 回（火・金 JST 10:00）**に 1 本ずつ自動投稿する
- **生成は Gemini を主、Claude（Bedrock）を副**（Gemini 失敗時のみフォールバック）
- **アイキャッチは画像生成 + タイトル焼き込み**（ブランディングの一貫性）をサーバサイド Canvas で実施
- **投稿ステータスは `future`（予約公開）**：Cron 実行時刻 + 2 時間後に自動公開
  - 2 時間のバッファで、管理者は WordPress 管理画面から内容をチェックし、問題あれば予約解除・削除できる
  - 何もしなければその時刻に自動公開される

---

## 2. 全体アーキテクチャ

```
┌─────────────────────────┐       ┌─────────────────────────────┐
│  GitHub Actions          │       │  Vercel (Next.js)            │
│  .github/workflows/      │       │  /api/auto-publish/run       │
│  auto-publish.yml        │─POST─▶│  runtime=nodejs              │
│  cron: 0 1 * * 2,5 (UTC) │       │  maxDuration=300s            │
│  = 火・金 JST 10:00      │       │                              │
└─────────────────────────┘       │  ┌────────────────────────┐ │
                                   │  │ 1. キュー先頭 peek      │ │
┌─────────────────────────┐       │  │    (S3 autorun/queue)  │ │
│  Admin (管理者)           │       │  │ 2. プロンプト読込       │ │
│  UI / REST:              │       │  │ 3. Gemini 生成→推敲    │ │
│  /api/auto-publish/queue │──────▶│  │    Claude フォールバック│ │
│  POST / GET / DELETE     │       │  │ 4. SD3.5 画像生成       │ │
└─────────────────────────┘       │  │ 5. Canvas でタイトル焼込 │ │
                                   │  │ 6. WP メディア upload  │ │
                                   │  │ 7. WP 予約投稿(future) │ │
                                   │  │ 8. S3 記事保存+履歴    │ │
                                   │  └────────────────────────┘ │
                                   └─────────────────────────────┘
```

---

## 3. スケジュール

| 項目 | 値 |
|------|-----|
| Cron | `0 1 * * 2,5`（UTC） |
| 実行時刻 | JST 火・金 10:00（±数分の遅延あり） |
| 予約投稿（`future`）オフセット | Cron 実行から 2 時間後（`AUTO_PUBLISH_SCHEDULE_DELAY_HOURS`）|
| 実公開時刻 | JST 12:00 前後 |
| 1 実行あたり投稿本数 | **1 本** |

---

## 4. 入力：キュー

### 4-1. 保存先

S3 `autorun/queue.json` に JSON 配列で FIFO 保持。

```json
[
  {
    "id": "arq-1740000000000",
    "promptId": "1727000000000",
    "keyword": "リーダーシップ研修 効果",
    "wordpressTags": ["リーダーシップ研修"],
    "wordpressCategoryIds": [68],
    "enqueuedAt": "2026-04-22T09:00:00.000Z"
  }
]
```

### 4-2. キュー操作 API

`/api/auto-publish/queue` は管理者認証（ログイン済み Cookie）または `Bearer CRON_SECRET` で利用可：

| Method | 用途 |
|--------|------|
| GET | 現在のキュー一覧を取得 |
| POST | `{ promptId, keyword, wordpressTags?, wordpressCategoryIds? }` を末尾追加 |
| DELETE | `{ id }` を削除 |

### 4-3. 推奨運用

- 少なくとも 3 件以上を常に積んでおく（Cron が動いた翌日に枯渇しないように）
- 1 週間分（火・金）を見据えて、月曜朝などに次週分の 2 件をまとめて追加する

---

## 5. 生成フロー（1 ループの詳細）

`app/api/auto-publish/run/route.ts` の `processSingleItem(item)` より：

1. **キュー先頭 peek**（成功するまで消費しない）
2. **プロンプト読込**: `prompts/<promptId>.json` を S3 から取得
3. **一次執筆**: `generateFirstDraftFromPrompt(promptContent, keyword)`
   - Gemini（`gemini-2.5-flash` → `-lite` → `2.0-flash` → `2.5-pro`）を順次試行
   - クォータや障害で全敗したら **Claude（Bedrock）にフォールバック**
4. **推敲**: `refineArticleWithGemini(title, content, keyword)`
5. **スラッグ**: `generateSlugFromGemini(title, keyword, body)` → `smartboarding-xxx`
6. **画像生成**: `generateArticleImage({title, content})`
   - Gemini でアーキタイプを選ばせた英文プロンプト → SD3.5（`stability.sd3-5-large-v1:0`）
   - 安全フィルター（人物 / 文字 / UI 禁止）維持
7. **タイトル焼き込み**: `compositeArticleTitleOnImageServer(buffer, title)`
   - `@napi-rs/canvas` で `public/fonts/NotoSansJP-Bold.ttf` を読み込み
   - 既存の `wrapTitleLines`（禁則・句点改行・製品名改行・オーファン解消）を共通利用
8. **WP メディア upload**: `/wp/v2/media` に JPEG を POST（`preUploadedMediaId` 取得）
9. **WP 予約投稿**: `postToWordPress(..., 'future', { scheduledDate: now+2h, preUploadedMediaId })`
10. **S3 記事保存**: `articles/auto-<ts>.json` に `SavedArticle` を書き出し
11. **キュー shift**（成功した 1 件だけ先頭から除去）
12. **履歴追記**: `autorun/history/YYYY-MM-DD.json` に `status=success` エントリ追加

---

## 6. 失敗時の挙動

`processSingleItem` が例外を投げたら：

- `autorun/history/YYYY-MM-DD.json` に `status=failed` のエントリを追加（`error` メッセージ付き）
- キュー先頭は **shift せず requeue**（`failureCount++`）
- `failureCount >= 3` になったらそのアイテムは drop（履歴にだけ残る）
- GitHub Actions には HTTP 500 で返す（Actions のログで失敗が見える）

---

## 7. 認証

| 入り口 | 認証方式 |
|--------|----------|
| `/api/auto-publish/run` | `Authorization: Bearer ${CRON_SECRET}`（`?secret=` も許容） |
| `/api/auto-publish/queue` | 管理者ログイン Cookie（`nas_auth`）または `Bearer CRON_SECRET` |

`CRON_SECRET` は Vercel と GitHub Secrets に**同じ値**を登録する。

---

## 8. 必要な環境変数（Vercel）

| Key | 用途 | 推奨値 |
|-----|------|--------|
| `CRON_SECRET` | 自動投稿エンドポイントの認証 | ランダム 64 hex |
| `CLAUDE_BEDROCK_MODEL` | Claude メインモデル | `anthropic.claude-sonnet-4-6` |
| `CLAUDE_BEDROCK_MODEL_FALLBACK` | Claude 予備モデル | `anthropic.claude-haiku-4-5` |
| `CLAUDE_BEDROCK_REGION` | Bedrock リージョン | `us-west-2` |
| `CLAUDE_ENABLE_FALLBACK` | Claude フォールバックを有効にするか | `true` |
| `AUTO_PUBLISH_STATUS` | 投稿ステータス（現状は内部的に `future` 固定） | `future` |
| `AUTO_PUBLISH_SCHEDULE_DELAY_HOURS` | Cron 実行から公開までの猶予 | `2` |
| `AUTOPUBLISH_COUNT_PER_RUN` | 1 回の本数（現状 1 固定） | `1` |

既存：`GEMINI_API_KEY` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `S3_BUCKET_NAME` / `WORDPRESS_URL` / `WORDPRESS_USERNAME` / `WORDPRESS_APP_PASSWORD` / `WORDPRESS_CATEGORY_ID` / `AUTH_SECRET`。

---

## 9. 必要な GitHub Secrets

| Name | 値 |
|------|-----|
| `AUTOPUBLISH_URL` | `https://smart-boarding-article-system.vercel.app/api/auto-publish/run` |
| `CRON_SECRET` | Vercel 側と同一の値 |

---

## 10. Claude モデル選定の理由

| モデル | 役割 | 採用理由 |
|--------|------|----------|
| **Claude Sonnet 4.6**（`anthropic.claude-sonnet-4-6`） | メインフォールバック | 最新の Sonnet 系。日本語の文章品質が安定しており、Gemini 2.5 Flash に近い記事品質が得られる。AWS コンソールでアカウント有効化済み |
| **Claude Haiku 4.5**（`anthropic.claude-haiku-4-5`） | 二段目フォールバック | コスト・速度重視。Sonnet がスロットリング等で落ちた場合の最終保険 |

> Bedrock の新世代モデルはクロスリージョン推論プロファイル（`us.anthropic.claude-sonnet-4-6` など）経由でしか呼べないことがあるため、`claude.ts` は foundation-model ID で `AccessDenied` / `ResourceNotFound` が返った場合、自動的に `us.` プレフィックス付きの inference profile ID にフォールバックする実装にしている。

---

## 11. フォント同梱

`public/fonts/NotoSansJP-Bold.ttf` をリポジトリに含める（約 5.4MB）。  
ライセンス：SIL Open Font License 1.1（`public/fonts/LICENSE.txt`）。

`@napi-rs/canvas` の `GlobalFonts.registerFromPath` でランタイムに登録している（`compositeArticleTitleOnImageServer.ts`）。

---

## 12. 監視・運用

### 日次履歴

- S3 `autorun/history/YYYY-MM-DD.json` に 1 日分のサマリが蓄積される
- GitHub Actions のログ（Actions タブ）でも成否確認可能

### 手動トリガー

- GitHub → Actions → `Auto Publish Article` → **Run workflow** ボタン
- キュー先頭 1 件を即座に処理できる（初回テスト用・運用リカバリ用）

### 公開を止めたい時

1. WordPress 管理画面 → 投稿一覧 → ステータス「予約投稿」
2. 該当記事を開き、**「公開」→「下書きへ切り替え」** または **ゴミ箱**
3. 2 時間以内ならば自動公開を止められる

---

## 13. 将来の拡張候補

- 1 実行あたりの本数を増やす（`AUTOPUBLISH_COUNT_PER_RUN`）
- Slack / Email 通知
- キュー編集の専用 UI ページ（現状は REST のみ）
- 失敗時の自動リトライを Cron 以外のトリガーからも可能にする
- `S3 autorun/history/` をダッシュボード化
