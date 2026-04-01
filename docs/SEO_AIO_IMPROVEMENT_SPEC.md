# SEO / AIO 改善設計書

> 対象ファイル: `src/lib/wordpress.ts`  
> 原則: **フロントエンドの見た目（style属性・色・フォントサイズ・太字・余白・紺色の下線・レイアウト）は一切変えない**

---

## 変更の種類

| 種類 | 説明 | 見た目への影響 |
|------|------|----------------|
| A. 既存タグへの属性追加 | `id`, `alt` など | なし（styleに触れない） |
| B. 不可視メタ情報の修正 | 構造化データ、空タグ除去 | なし（ブラウザ表示に影響しない） |

---

## 改善項目一覧

### 1. h2 / h3 に自動 `id` 属性を付与

**目的**: Google のジャンプリンク（検索結果からセクション直リンク表示）、AIO のセクション参照精度向上

**現状**:
```html
<h2 style="font-size:22px;font-weight:900;...">M&A後の「人」の問題</h2>
```

**改善後**:
```html
<h2 id="section-1" style="font-size:22px;font-weight:900;...">M&A後の「人」の問題</h2>
```

**実装方法**: `convertToHtml` 関数内で h2/h3 を出力する全箇所に連番カウンターを設け、  
`id="section-{h2連番}"` / `id="section-{h2連番}-{h3連番}"` を自動付与する。  
FAQ の h2 (`buildFaqAccordionHtml`) にも `id="faq"` を付与する。

**影響範囲**: `convertToHtml` 関数、`buildFaqAccordionHtml` 関数

---

### 2. 記事トップ画像の `alt` 属性に記事タイトルを設定

**目的**: 検索エンジン・AI が画像内容を理解できるようにする。画像 SEO の基本要素。

**現状**:
```html
<img src="...nas-image-xxx.jpeg" style="..." alt="" />
```

**改善後**:
```html
<img src="...nas-image-xxx.jpeg" style="..." alt="M&Aアドバイザーの選び方 — 株式会社日本提携支援" />
```

**実装方法**: `buildPostContent` 関数で `bodyTopImageBlock` を生成する箇所で、  
`alt=""` → `alt="{記事タイトル} — 株式会社日本提携支援"` に変更。  
HTML特殊文字（`"`, `<`, `>`）はエスケープする。

**影響範囲**: `buildPostContent` 関数内の `bodyTopImageBlock` 生成部分

---

### 3. 構造化データ: `mainEntityOfPage` URL をWordPress実URLと整合

**目的**: Google Search Console で「参照されたページとURLが一致しない」警告を防止。

**現状**:
```json
"mainEntityOfPage": {
  "@id": "https://nihon-teikei.co.jp/news/column/{slug}"
}
```

**問題**: WordPress側の実URLは `https://nihon-teikei.co.jp/news/{slug}/` の形式。  
パスに `/column/` が入っている＆末尾スラッシュなしで不整合。

**改善後**:
```json
"mainEntityOfPage": {
  "@id": "https://nihon-teikei.co.jp/news/{slug}/"
}
```

**実装方法**: `buildArticleSchema` 関数内の `mainEntityOfPage.@id` のテンプレートを修正。

**影響範囲**: `buildArticleSchema` 関数

---

### 4. 構造化データ: `datePublished` / `dateModified` に予約投稿日を反映

**目的**: 予約投稿時に公開日がスキーマと一致するようにする。現状は `new Date()` で
NAS上で投稿ボタンを押した日時になってしまう。

**現状**:
```typescript
'datePublished': new Date().toISOString().split('T')[0],
```

**改善後**: `buildPostContent` / `buildArticleSchema` に `scheduledDate` パラメータを追加し、  
予約投稿時はその日付を、即時投稿時は `new Date()` を使用する。

**実装方法**:
1. `buildArticleSchema` の引数に `scheduledDate?: string` を追加
2. `buildPostContent` の `options` に `scheduledDate?: string` を追加
3. `postToWordPress` から `buildPostContent` への呼び出しで `scheduledDate` を渡す

**影響範囲**: `buildArticleSchema`, `buildPostContent`, `postToWordPress` の関数シグネチャ

---

### 5. 空 `<p>` タグの除去

**目的**: 無意味な空要素を減らし、HTML をクリーンに保つ（SEO クローラーの効率向上）。

**現状**: `convertToHtml` は空行を `flushParagraph` でスキップするが、
連続改行や末尾の空行処理で空の `<p>` が残る可能性がある。

**改善後**: `buildPostContent` の最終出力前に、空の `<p>` タグを除去するサニタイズ処理を追加。

**実装方法**: `buildPostContent` の `return` 直前で正規表現による除去:
```typescript
.replace(/<p[^>]*>\s*<\/p>/g, '')
```

**影響範囲**: `buildPostContent` 関数の最終出力

---

### 6. FAQPage Schema の重複防止

**目的**: `buildFaqAccordionHtml` で視覚的FAQアコーディオンを出力する際に `buildFaqSchema` も
呼ばれるが、将来的に2回呼ばれるケースや、WordPress側のFAQプラグインとの競合を防ぐ。

**現状**: `buildPostContent` で1回だけ呼ばれるので実害なし。ただし `faqSection` と `payload.content` の
両方から `extractFaqs` するフォールバックがあり、条件次第でFAQ項目が重複する可能性がある。

**改善後**: `extractFaqs` の結果を `question` テキストでデデュープする。

**実装方法**: `extractFaqs` の返り値に対して `question` の一致で重複除去フィルタを追加。

**影響範囲**: `buildPostContent` 関数内の `faqs` 処理

---

### 7. OG画像URLの `https` 強制

**目的**: Mixed Content 防止。SNS共有時の画像表示不具合を回避。

**現状**: `forceHttps` 関数が存在するが、`bodyTopImageUrl`（メディアアップロード結果）は
`uploadBase64ImageToWordPress` 内で `forceHttps` 適用済み。  
ただし Schema の `image.url` に渡す際の確認が不十分。

**改善後**: `buildArticleSchema` 内で `schemaImageUrl` に `forceHttps` を適用。

**実装方法**: `buildArticleSchema` で `schemaImageUrl` を設定する箇所で `forceHttps()` を追加。

**影響範囲**: `buildArticleSchema` 関数

---

## テスト方法

1. NAS から新しい記事を投稿（下書き or 予約投稿）
2. **公開ページで見た目に変化がないこと**を目視確認（最重要）
3. WordPress 管理画面の「コード」タブで確認:
   - `h2`, `h3` に `id` 属性が付いていること
   - 記事画像の `alt` が空でないこと
   - 空の `<p></p>` がないこと
4. Chrome DevTools → Elements で `<script type="application/ld+json">` を確認:
   - `mainEntityOfPage.@id` が `/news/{slug}/` 形式であること
   - `datePublished` が予約日と一致すること
   - `image.url` が `https://` であること
   - FAQPage の `mainEntity` に重複がないこと
5. [Google Rich Results Test](https://search.google.com/test/rich-results) で Article + FAQ Schema が有効であること
