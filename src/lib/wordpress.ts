export interface WordPressPostPayload {
  title: string;
  content: string;          // 推敲済み本文（プレーンテキスト）
  targetKeyword?: string;
  imageUrl?: string;        // アイキャッチ画像URL (互換性維持のため残す)
  imageBase64?: string;     // Base64形式の画像データ
  imageBase64MimeType?: string; // 例：'image/png'
  category?: string;        // カテゴリ名（任意）
  slug?: string;            // URLスラッグ（任意・空の場合はWPが自動生成）
  /** 正規化済みタグ名（post_tag）。空ならタグを付けない */
  wordpressTags?: string[];
}

export interface WordPressPostResult {
  id: number;
  link: string;             // 投稿のURL
  editLink: string;         // 管理画面の編集URL
  status: 'draft' | 'publish' | 'future';
  /** WordPress REST の date_gmt（UTC ISO 相当の文字列） */
  dateGmt?: string;
  /** 画像アップロードに失敗した場合の警告メッセージ（投稿自体は成功） */
  imageUploadWarning?: string;
}

import { resolveCanonicalPostSlug } from './slugNormalize'
import { normalizeWordPressTagsFromRequest } from './wordpressTags'
import { decodeHtmlEntities } from './wpTagList'

/** Schema・記事URLのオリジン（WORDPRESS_URL があればその origin） */
function getWordPressSiteOrigin(): string {
  const u = process.env.WORDPRESS_URL?.trim()
  if (u) {
    try {
      return new URL(u).origin
    } catch {
      /* fall through */
    }
  }
  return 'https://www.smartboarding.net'
}

/**
 * WordPress REST API の URL を構築する。
 * Smart Boarding の WP は wp-json プリティURL が無効のため ?rest_route= 形式を使用。
 */
function wpRestUrl(wpUrl: string, route: string): string {
  const base = wpUrl.replace(/\/+$/, '')
  const cleanRoute = route.startsWith('/') ? route : `/${route}`
  return `${base}/?rest_route=${encodeURIComponent(cleanRoute)}`
}

/** URLが http:// の場合は https:// に変換（Mixed Content 防止） */
function forceHttps(url: string): string {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

/* CTA バナーは Smart Boarding コラムでは使用しないため無効化 */

/** メディアアップロード結果（アイキャッチ設定と本文挿入用URL） */
interface WordPressMediaUploadResult {
  id: number;
  sourceUrl: string;
}

/**
 * Base64画像をWordPressメディアライブラリにアップロードしてメディアIDとURLを返す
 */
async function uploadBase64ImageToWordPress(
  base64: string,
  mimeType: string,
  credentials: string,
  wpUrl: string
): Promise<WordPressMediaUploadResult> {
  const buffer = Buffer.from(base64, 'base64');
  const ext = mimeType.split('/')[1] ?? 'png';
  const fileName = `sb-image-${Date.now()}.${ext}`;

  const res = await fetch(wpRestUrl(wpUrl, '/wp/v2/media'), {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Type': mimeType,
    },
    body: buffer,
  });

  if (!res.ok) {
    throw new Error(`メディアアップロード失敗: ${res.status}`);
  }

  const media = await res.json();
  const rawUrl = media.source_url ?? media.link;
  return { id: media.id, sourceUrl: forceHttps(rawUrl) };
}

/**
 * インラインのマークダウン風記法をHTMLに変換（WordPress表示用）
 * - **太字** → <strong>
 * - __下線__ → <span style="text-decoration:underline;">
 * - *斜体* → <em>
 * - 既存の <strong>, <em>, <u>, <a>, <br> はそのまま通過
 */
/**
 * インライン書式: **太字** のみサポート。
 * 太字はテーマに馴染む黒（本文色）で表示。色付き太字や下線は参考サイトに倣い廃止。
 *
 * 注意: 段落テキストの大部分（80%超 または 40文字超の単一strong）が
 * <strong> で括られている場合はWordPressテーマのボックスCSSが適用されるため、
 * <strong> を除去して通常テキストとして表示する。
 */
function applyInlineFormatting(text: string): string {
  let result = text
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
    .replace(/\*\*/g, '');

  // 段落全体が <strong> 1つで覆われている場合はボックス表示を防ぐため除去
  // パターン: <strong>テキスト</strong> がテキスト全体を占める
  const fullStrongMatch = result.match(/^<strong>([\s\S]+)<\/strong>$/);
  if (fullStrongMatch) {
    const innerText = fullStrongMatch[1] ?? '';
    const hasNewline = innerText.includes('\n') || innerText.includes('<br');
    const tooLong = innerText.replace(/<[^>]*>/g, '').replace(/\s/g, '').length > 40;
    const multiSentence = (innerText.match(/。/g) ?? []).length >= 2;
    // いずれかに該当する場合は <strong> を除去（テーマのボックスCSSを回避）
    if (hasNewline || tooLong || multiSentence) {
      result = innerText;
    }
  }

  return result;
}

/** リスト行「・ラベル: 説明」のラベル部分を太字に（・で始まる行のみ対象） */
function emphasizeListLabel(line: string): string {
  if (/^・/.test(line)) {
    const match = line.match(/^(・\s*)([^：:]+)([：:])\s*(.*)$/);
    if (match) {
      const [, bullet, label, colon, rest] = match;
      const safeLabel = label.trim().replace(/\*\*/g, '');
      const safeRest = applyInlineFormatting(rest);
      return `${bullet}<strong>${safeLabel}</strong>${colon} ${safeRest}`;
    }
  }
  return applyInlineFormatting(line);
}

/** プレビューと同一の見出し・本文スタイル（WordPress本文で使用） */
const H2_STYLE = "font-size:22px;font-weight:900;margin:48px 0 16px;padding-bottom:8px;border-bottom:3px solid #33B5E5;font-family:'Noto Sans JP',sans-serif;";
const H3_STYLE = 'font-size:18px;font-weight:400;margin:32px 0 12px;color:#111;';
const P_STYLE = 'margin-bottom:1.6em;';
const UL_LIST_STYLE = 'list-style:none;padding-left:0;margin:16px 0;';
const LI_LIST_STYLE = 'margin-bottom:1.2em;padding-left:1em;text-indent:-1em;';

/** 単独の区切り記号行は本文にも見出しにも出さない */
function isDecorativeSeparatorLine(trimmed: string): boolean {
  return /^[\-—―–─━=*＊]{1,10}$/.test(trimmed);
}

/** 記号見出し（■▶◆●▼）でも長文は本文扱いにして、見出しボックス連発を防ぐ */
function canUseSymbolLineAsHeading(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.length > 34) return false;
  if (/[。．！？]$/.test(t)) return false;
  return true;
}

/** h2/h3 が連続した場合、2個目以降は本文に降格して見出しボックス連発を防ぐ */
function demoteConsecutiveHeadings(html: string): string {
  const lines = html.split('\n');
  const out: string[] = [];
  let prevWasHeading = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const m = trimmed.match(/^<h[23][^>]*>([\s\S]*?)<\/h[23]>$/i);
    if (!m) {
      if (trimmed) prevWasHeading = false;
      out.push(line);
      continue;
    }
    if (prevWasHeading) {
      out.push(`<p style="${P_STYLE}">${m[1]}</p>`);
      prevWasHeading = false;
      continue;
    }
    out.push(line);
    prevWasHeading = true;
  }

  return out.join('\n');
}

/** 番号なしで単独行となる h2 見出しパターン（SEO: セクション構造を明示） */
const STANDALONE_H2_REGEXES: RegExp[] = [
  /^まとめ[：:]\s*.+/,
  /^まとめ[：:\s]*$/,
  /^【?\s*まとめ\s*】?[。．]?$/,
  /^【?\s*結論要約\s*】?$/,
  /^結論要約$/,
  /^よくある質問/,
  /^FAQ\b/i,
  /^Smart Boarding(?:（スマートボーディング）)?ならではの視点(（独自性）)?$/,
];

/** 【まとめ】等の h2 表示テキスト（装飾括弧のみ除去。見出しに本文が続く行はそのまま） */
function normalizeStandaloneH2PlainText(trimmed: string): string {
  if (/^【?\s*まとめ\s*】?[。．]?$/.test(trimmed)) return 'まとめ';
  if (/^【?\s*結論要約\s*】?$/.test(trimmed)) return '結論要約';
  return trimmed;
}

function isStandaloneH2Candidate(trimmed: string, lineIndex: number, prevRaw: string, paragraphLen: number): boolean {
  if (paragraphLen !== 0) return false;
  if (isDecorativeSeparatorLine(trimmed)) return false;
  if (STANDALONE_H2_REGEXES.some(re => re.test(trimmed))) return true;
  // 短文タイトル行: 直前行が空行または区切り線のときのみ（先頭行は対象外）
  if (
    lineIndex > 0 &&
    trimmed.length > 0 &&
    trimmed.length <= 30 &&
    !/[。、．！？]$/.test(trimmed) &&
    !/(?:です|ます|ません|でしょう|ました)$/.test(trimmed)
  ) {
    const pt = prevRaw.trim();
    if (pt === '' || pt === '---' || /^-{3,}$/.test(pt)) return true;
  }
  return false;
}

/** 箇条書き行（・/-）の1項目をHTML化（既存の「ラベル: 説明」太字とインライン記法を維持） */
function formatListItemHtml(item: string): string {
  const t = item.trim();
  const colonMatch = t.match(/^([^：:]+)([：:])\s*(.*)$/s);
  if (colonMatch) {
    const [, label, colon, rest] = colonMatch;
    const safeLabel = label!.trim().replace(/\*\*/g, '');
    const safeRest = applyInlineFormatting(rest ?? '');
    return `<strong>${safeLabel}</strong>${colon} ${safeRest}`;
  }
  return applyInlineFormatting(t);
}

/**
 * <strong> が <p> をまたぐ不正ネストを修正（タグの順序のみ。style は保持）
 */
function fixStrongParagraphNesting(html: string): string {
  let out = html;
  out = out.replace(
    /<strong([^>]*)>\s*<p([^>]*)>([\s\S]*?)<\/p>\s*<\/strong>/gi,
    '<p$2><strong$1>$3</strong></p>'
  );
  out = out.replace(
    /<strong([^>]*)>\s*<p([^>]*)>([\s\S]*?)<\/strong>\s*(?:<\/p>)?/gi,
    '<p$2><strong$1>$3</strong></p>'
  );
  out = out.replace(
    /<p([^>]*)><strong([^>]*)>([\s\S]*?)<\/p>\s*<\/strong>/gi,
    '<p$1><strong$2>$3</strong></p>'
  );
  return out;
}

/**
 * プレーンテキストの本文をHTMLに変換する
 * - 見出しは太字・色 #1e3a8a
 * - **テキスト** → <strong>、__テキスト__ → 下線
 * - 「・ラベル: 説明」のラベルを太字に
 */
export function convertToHtml(content: string): string {
  const lines = content.split('\n');
  const htmlLines: string[] = [];
  let currentParagraph: string[] = [];
  let h2Count = 0;
  let h3Count = 0;

  function flushParagraph() {
    if (currentParagraph.length === 0) return;
    const rawLines = currentParagraph.map(s => s.trim());
    let i = 0;
    while (i < rawLines.length) {
      const row = rawLines[i]!;
      if (isDecorativeSeparatorLine(row)) {
        i++;
        continue;
      }
      if (/^[・\-]\s/.test(row)) {
        const items: string[] = [];
        while (i < rawLines.length && /^[・\-]\s/.test(rawLines[i]!)) {
          const item = rawLines[i]!.replace(/^[・\-]\s*/, '').trim();
          if (item) items.push(item);
          i++;
        }
        if (items.length > 0) {
          const liBlocks = items
            .map(it => `<li style="${LI_LIST_STYLE}">${formatListItemHtml(it)}</li>`)
            .join('\n');
          htmlLines.push(`<ul style="${UL_LIST_STYLE}">\n${liBlocks}\n</ul>`);
        }
      } else {
        const plines: string[] = [];
        while (i < rawLines.length && !/^[・\-]\s/.test(rawLines[i]!)) {
          const line = rawLines[i]!;
          if (!isDecorativeSeparatorLine(line)) plines.push(line);
          i++;
        }
        const text = plines
          .map(emphasizeListLabel)
          .join('<br>')
          .trim();
        if (text) {
          const isBlockElement = /^<(p|h[1-6]|div|ul|ol|li|table|script|!--)/i.test(text.trim());
          if (isBlockElement) {
            htmlLines.push(text);
          } else {
            htmlLines.push(`<p style="${P_STYLE}">${text}</p>`);
          }
        }
      }
    }
    currentParagraph = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const prevRaw = i > 0 ? lines[i - 1]! : '';

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (isDecorativeSeparatorLine(trimmed)) {
      flushParagraph();
      continue;
    }

    if (isStandaloneH2Candidate(trimmed, i, prevRaw, currentParagraph.length)) {
      flushParagraph();
      h2Count++;
      h3Count = 0;
      const h2Plain = normalizeStandaloneH2PlainText(trimmed);
      htmlLines.push(`<h2 id="section-${h2Count}" style="${H2_STYLE}">${applyInlineFormatting(h2Plain)}</h2>`);
      continue;
    }

    // h2 見出し: "1. テキスト" — 直前が空行（段落バッファが空）の場合のみ見出しとして扱う
    // 本文中の番号リスト（"1. ..." が段落の途中にある場合）は通常テキストとして扱う
    // 注意: "5.2" のような小数点は除外（整数番号+スペースのみ対象）
    // 正規表現: 先頭が整数のみ（小数点なし）+ 全角/半角ピリオド + スペース + 1文字以上
    if (/^\d+[．.]\s+\S/.test(trimmed) && !/^\d+\.\d/.test(trimmed) && currentParagraph.length === 0) {
      h2Count++;
      h3Count = 0;
      const text = trimmed.replace(/^\d+[．.]\s*/, '');
      htmlLines.push(`<h2 id="section-${h2Count}" style="${H2_STYLE}">${applyInlineFormatting(text)}</h2>`);
      continue;
    }

    // h3 小見出し: "1-1. テキスト" — 直前が空行の場合のみ
    // 注意: "5.2" のような小数点の行は h3 には含めない（ハイフン区切りのみ対象）
    // 方針: 人間ライターのコラムに寄せるため、H3小見出しは「番号プレフィックスを除去した本文」として段落化する。
    // これにより目次（rTOC）が肥大化せず、自然な読み物として表示される。
    if (/^\d+-\d+[．.]\s+\S/.test(trimmed) && currentParagraph.length === 0) {
      const text = trimmed
        .replace(/^\d+-\d+[．.]\s*/, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*\*/g, '');
      currentParagraph.push(text);
      continue;
    }

    if (/^[■▶◆●▼]\s/.test(trimmed)) {
      flushParagraph();
      h3Count++;
      const text = trimmed
        .replace(/^[■▶◆●▼]\s*/, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*\*/g, '');
      if (canUseSymbolLineAsHeading(text)) {
        htmlLines.push(`<h3 id="section-${h2Count}-${h3Count}" style="${H3_STYLE}">${text}</h3>`);
      } else {
        currentParagraph.push(text);
        h3Count--;
      }
      continue;
    }

    currentParagraph.push(trimmed);
  }

  flushParagraph();
  return fixStrongParagraphNesting(demoteConsecutiveHeadings(htmlLines.join('\n')));
}

/** HTMLタグ・マークダウン記法除去と主要なHTMLエンティティのデコード（Schema/FAQ用プレーンテキスト化） */
function stripHtmlAndDecodeEntities(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\*\*/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * FAQセクション（「よくある質問」見出し以降）を本文から分離する。
 * 返り値: { body: FAQ前の本文, faqSection: FAQセクション部分（空の場合もある） }
 */
function splitFaqSection(content: string): { body: string; faqSection: string } {
  // FAQ見出しとして成立する「行単独」のみを対象にする
  // 条件: 行全体がFAQ見出しのみで構成されている（本文中の言及は分離しない）
  // - 行頭に数字+区切り記号の見出し番号がある場合も対応（例: "7. よくある質問"）
  // - 行末に文章が続く場合（例: "よくある質問を確認しておきましょう"）は除外
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // 「よくある質問」単独行（Q&A・FAQの見出しとして独立している行のみ）
    // 本文の一部として「よくある質問」が含まれる行（文章が続く）は除外
    const isFaqHeader = /^(?:#+\s*)?(?:\d+[．.]\s*)?(?:よくある質問(?:\s*[\(（]FAQ[\)）])?|FAQ)\s*[:：]?\s*$/i.test(trimmed);
    if (isFaqHeader) {
      const bodyPart = lines.slice(0, i).join('\n').trimEnd();
      const faqPart = lines.slice(i).join('\n').trim();
      // bodyPart が空すぎる場合（誤検出の可能性）は分離しない
      if (bodyPart.length < 100) {
        return { body: content, faqSection: '' };
      }
      return { body: bodyPart, faqSection: faqPart };
    }
  }
  return { body: content, faqSection: '' };
}

/**
 * 本文からFAQ候補を抽出する（Q&A形式の箇所を検出）
 * 対応形式: "Q1. 質問文\n\nA1. 回答文" / "Q. 質問\nA. 回答" / "Q：質問\nA：回答" など
 */
function extractFaqs(content: string): Array<{ question: string; answer: string }> {
  const faqs: Array<{ question: string; answer: string }> = [];

  // パターン: "Q数字. 質問" → 改行 → "A数字. 回答"（次の Q または末尾まで）
  const qaRegex = /Q\d*[.．、]\s*(.+?)[\n\r]+(?:<br\s*\/?>)*[\n\r]*A\d*[.．、]\s*([\s\S]*?)(?=Q\d*[.．、]|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = qaRegex.exec(content)) !== null) {
    const question = stripHtmlAndDecodeEntities(match[1].trim());
    const answer = stripHtmlAndDecodeEntities(match[2].trim());
    if (question.length > 0 && answer.length > 0) {
      faqs.push({ question, answer });
    }
  }

  // フォールバック: "Q. / Q: / Q：" と "A. / A:" のペア
  if (faqs.length === 0) {
    const fallbackRegex = /Q[.．：:\s]+(.+?)[\n\r]+(?:<br\s*\/?>)*[\n\r]*A[.．：:\s]+([\s\S]*?)(?=Q[.．：:\s]|$)/gs;
    while ((match = fallbackRegex.exec(content)) !== null) {
      const question = stripHtmlAndDecodeEntities(match[1].trim());
      const answer = stripHtmlAndDecodeEntities(match[2].trim());
      if (question && answer) faqs.push({ question, answer });
    }
  }

  return faqs;
}

/** ターゲットKW文字列をカンマ・読点区切りで分割し、重複を除いた配列にする（JSON-LD keywords 用） */
function splitTargetKeywordPhrases(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(/[,、，\n]/).map(s => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}

/** Article.description 用：文末・読点で切れ目を取り、途中で文が途切れないようにする */
function buildSchemaDescription(plainContent: string, maxLen = 160): string {
  const text = plainContent.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;

  const slice = text.slice(0, maxLen);
  const sentenceEnders = new Set(['。', '！', '？', '.', '!', '?']);
  let cut = -1;
  const scanFrom = Math.max(0, slice.length - 140);
  for (let i = slice.length - 1; i >= scanFrom; i--) {
    const ch = slice[i];
    if (ch && sentenceEnders.has(ch)) {
      cut = i + 1;
      break;
    }
  }
  if (cut >= 80) {
    return slice.slice(0, cut).trim();
  }

  const commaCut = Math.max(slice.lastIndexOf('、'), slice.lastIndexOf('，'), slice.lastIndexOf(','));
  if (commaCut >= 100) {
    return slice.slice(0, commaCut + 1).trim();
  }

  const spaceCut = slice.lastIndexOf(' ');
  if (spaceCut >= 120) {
    return `${slice.slice(0, spaceCut).trim()}…`;
  }

  return `${slice.trim()}…`;
}

/** about.name：タイトル丸写しを避け、先頭の【…】を除いた短い主題、または KW の先頭フレーズ */
function buildSchemaAboutName(payload: WordPressPostPayload): string {
  const phrases = splitTargetKeywordPhrases(payload.targetKeyword);
  if (phrases.length >= 1) {
    const primary = phrases[0]!;
    if (phrases.length >= 2 && primary.length < 14) {
      return `${primary}、${phrases[1]}`.slice(0, 100);
    }
    return primary.slice(0, 100);
  }
  let t = payload.title.trim().replace(/^【[^】]+】\s*/, '');
  return t.slice(0, 80);
}

/**
 * Article Schema（構造化データ）を生成（AIO/LLMO最適化）
 * image.url には必ず HTTPS のURLのみを使用し、data URL(base64)は入れない
 */
function buildArticleSchema(
  payload: WordPressPostPayload,
  slug: string,
  options?: { bodyTopImageUrl?: string; scheduledDate?: string }
): string {
  // Schema用の画像URL決定ロジック
  // 1. WordPressメディアにアップロード済みのURL（bodyTopImageUrl）があれば最優先
  // 2. payload.imageUrl が data: で始まらない通常のURLならそれを使用
  // 3. どちらも無ければ image プロパティ自体を省略
  let schemaImageUrl: string | null = null;
  if (options?.bodyTopImageUrl) {
    schemaImageUrl = forceHttps(options.bodyTopImageUrl);
  } else if (payload.imageUrl && !payload.imageUrl.startsWith('data:')) {
    schemaImageUrl = forceHttps(payload.imageUrl);
  }

  const bodyForDesc = splitFaqSection(payload.content).body;
  const plainContent = stripHtmlAndDecodeEntities(bodyForDesc);
  const description = buildSchemaDescription(plainContent);

  const keywordPhrases = splitTargetKeywordPhrases(payload.targetKeyword);
  const keywordsJoined = keywordPhrases.join(', ');

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': payload.title,
    'description': description,
    'datePublished': options?.scheduledDate?.slice(0, 10) || new Date().toISOString().split('T')[0],
    'dateModified': options?.scheduledDate?.slice(0, 10) || new Date().toISOString().split('T')[0],
    'author': {
      '@type': 'Organization',
      'name': '株式会社FCE',
      'url': 'https://fce-hd.co.jp/',
    },
    'publisher': {
      '@type': 'Organization',
      'name': '株式会社FCE',
      'url': 'https://fce-hd.co.jp/',
      'logo': {
        '@type': 'ImageObject',
        'url': 'https://www.smartboarding.net/favicon.ico',
      },
    },
    'mainEntityOfPage': {
      '@type': 'WebPage',
      '@id': `${getWordPressSiteOrigin()}/column/${slug}/`,
    },
    'about': {
      '@type': 'Thing',
      'name': buildSchemaAboutName(payload),
    },
  };

  if (keywordsJoined) {
    schema.keywords = keywordsJoined;
  }

  if (schemaImageUrl) {
    schema.image = {
      '@type': 'ImageObject',
      'url': schemaImageUrl,
    };
  }

  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

/**
 * FAQセクションのアコーディオンHTMLを生成（本文内表示用）
 * <details><summary> を使ったシンプルなアコーディオン
 */
function buildFaqAccordionHtml(faqs: Array<{ question: string; answer: string }>): string {
  if (!faqs || faqs.length === 0) return '';

  const itemsHtml = faqs
    .map(faq => {
      const question = faq.question.replace(/\*\*/g, '');
      const answerHtml = faq.answer.replace(/\*\*/g, '').replace(/\n/g, '<br>');
      return `
<details class="nts-faq-item" style="border:1px solid #E2E8F0;border-radius:12px;padding:12px 16px;background:#FFFFFF;">
  <summary style="list-style:none;cursor:pointer;font-weight:700;color:#1A1A2E;display:flex;align-items:center;justify-content:space-between;outline:none;">
    <span>${question}</span>
    <span style="margin-left:12px;font-size:18px;line-height:1;color:#94A3B8;">＋</span>
  </summary>
  <div style="margin-top:10px;font-size:14px;color:#475569;line-height:1.8;">
    ${answerHtml}
  </div>
</details>`.trim();
    })
    .join('\n');

  return `
<div class="nts-faq" style="margin:40px 0;">
  <h2 id="faq" style="${H2_STYLE}">よくある質問（FAQ）</h2>
  <div class="nts-faq-list" style="display:flex;flex-direction:column;gap:12px;">
${itemsHtml}
  </div>
</div>`.trim();
}

/**
 * FAQPage Schema を生成（FAQが存在する場合のみ）
 */
function buildFaqSchema(faqs: Array<{ question: string; answer: string }>): string {
  if (!faqs || faqs.length === 0) return '';

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': faqs.map(faq => ({
      '@type': 'Question',
      'name': faq.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': faq.answer,
      },
    })),
  };

  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

const EXCERPT_MAX_LENGTH = 120;

/**
 * 記事本文から抜粋（excerpt）を生成する。
 * FAQ より前の本文の先頭段落から最大120文字を返す（一覧のリード表示用）。
 */
function generateExcerpt(content: string): string {
  const withoutSupervisor = content;
  const { body } = splitFaqSection(withoutSupervisor);
  const lines = body.split('\n');
  const paragraphLines: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inParagraph) break;
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      if (inParagraph) break;
      continue;
    }
    if (/^\d+[．.]\s/.test(trimmed) && trimmed.length < 50) {
      if (inParagraph) break;
      continue;
    }
    if (/^\d+-\d+[．.]\s/.test(trimmed) && trimmed.length < 50) {
      if (inParagraph) break;
      continue;
    }
    if (/^[■▶◆●▼]\s/.test(trimmed) && trimmed.length < 50) {
      if (inParagraph) break;
      continue;
    }
    inParagraph = true;
    paragraphLines.push(trimmed);
  }

  const plain = stripHtmlAndDecodeEntities(paragraphLines.join(' '));
  if (!plain) return '';
  if (plain.length <= EXCERPT_MAX_LENGTH) return plain;
  return `${plain.slice(0, EXCERPT_MAX_LENGTH).trim()}…`;
}

/** 本文HTML内の末尾CTAをハイパーリンクに変換（WordPress投稿でクリック可能にする） */
function linkifyCtaUrls(html: string): string {
  return html
    .replace(
      /導入事例・事例集はこちらから\s+https?:\/\/www\.smartboarding\.net\/documents\/1978\/?/g,
      '<a href="https://www.smartboarding.net/documents/1978/">導入事例・事例集はこちらから</a>'
    )
    .replace(
      /14日間無料トライアルはこちら\s+https?:\/\/www\.smartboarding\.net\/trial\/?/g,
      '<a href="https://www.smartboarding.net/trial/">14日間無料トライアルはこちら</a>'
    )
    .replace(
      /導入事例はこちらから\s+https?:\/\/nihon-teikei\.co\.jp\/news\/casestudy\/?/g,
      '<a href="https://www.smartboarding.net/documents/1978/">導入事例はこちらから</a>'
    );
}

/**
 * 本文HTMLからテキスト版FAQ（「よくある質問」を含むH2/H3見出し以降）を除去する。
 * アコーディオン版FAQが別途生成されるため、テキスト版は不要。
 *
 * 重要: 「よくある質問」は見出しタグ（<h2>/<h3>）内にある場合のみ除去対象とする。
 * 本文段落（<p>）内に「よくある質問」という言葉が含まれても除去しない。
 */
function stripTextFaqFromHtml(html: string): string {
  const lines = html.split('\n');
  let faqStartIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // h2 または h3 タグ内に「よくある質問」が含まれる行のみ対象
    const isHeadingLine = /^<h[23][^>]*>/i.test(line.trim());
    if (!isHeadingLine) continue;

    const stripped = line.replace(/<[^>]*>/g, '').trim();
    // 見出し行の中で「よくある質問」単独（文章の一部ではない）
    if (/^(?:\d+[．.]\s*)?よくある質問(?:\s*[\(（]FAQ[\)）])?\s*[:：]?\s*$/.test(stripped)) {
      faqStartIdx = i;
      break;
    }
  }

  if (faqStartIdx < 0) return html;

  // 「よくある質問」を含む見出し行以降を全て除去
  let cleaned = lines.slice(0, faqStartIdx).join('\n');

  // 末尾に残った水平線的な要素（—, ---, ―, ─）も除去
  cleaned = cleaned.replace(/<p[^>]*>\s*[—―─\-]{1,5}\s*<\/p>\s*$/i, '');

  // 末尾に残ったQ&Aテキストブロックも除去
  cleaned = cleaned.replace(
    /(?:<p[^>]*>\s*(?:<strong>)?Q\d*[.．]\s*[\s\S]*?)$/i,
    ''
  );

  return cleaned.replace(/\s+$/, '');
}

/**
 * メインの投稿コンテンツを構築
 * 順序: 本文最上部に記事画像（アイキャッチと同じ）→ 記事本文 → Schema
 */
export function buildPostContent(
  payload: WordPressPostPayload,
  options?: { bodyTopImageUrl?: string; scheduledDate?: string }
): string {
  const slug = resolveCanonicalPostSlug(payload.slug);

  const { body: bodyText, faqSection } = splitFaqSection(payload.content);

  // 1. 本文（FAQ除外）をHTMLに変換
  let htmlBody = convertToHtml(bodyText);
  htmlBody = linkifyCtaUrls(htmlBody);

  // 1-0a. テキスト版FAQ（「よくある質問」H2以降のQ/Aテキスト）を除去（アコーディオンで置換するため）
  htmlBody = stripTextFaqFromHtml(htmlBody);

  // 本文上部への <img> 埋め込みは行わない。
  // アイキャッチ（featured_media）をテーマが本文上部に自動表示するため、
  // 本文内に画像を入れると一覧ページのサムネが焼き込みなし画像になってしまう問題を防ぐ。
  const fullBody = htmlBody;

  // 2. FAQを抽出（分離したFAQセクション or 全文から）＋ question 重複除去
  const faqSource = faqSection || payload.content;
  const rawFaqs = extractFaqs(faqSource);
  const seenQuestions = new Set<string>();
  const faqs = rawFaqs.filter(f => {
    const key = f.question.trim();
    if (seenQuestions.has(key)) return false;
    seenQuestions.add(key);
    return true;
  });
  if (process.env.NODE_ENV === 'development') {
    console.log(`[FAQ] Extracted ${faqs.length} FAQs (deduped from ${rawFaqs.length}) from ${faqSection ? 'faqSection' : 'fullContent'}`);
  }

  // 2-1. FAQアコーディオンHTML
  const faqAccordionHtml = buildFaqAccordionHtml(faqs);

  // 3. 結合（本文 → FAQアコーディオン）
  // ※ JSON-LDスキーマはWordPressのwp_kses_post()によって<script>タグが除去され
  //    JSONテキストが本文に露出するため、post contentには含めない。
  //    スキーマはWordPress側のSEOプラグイン（Yoast等）が管理する。
  const parts = [
    `<!-- Smart Boarding Article System -->`,
    fullBody,
    faqAccordionHtml,
  ].filter(Boolean);

  return parts.join('\n\n').replace(/<p[^>]*>\s*<\/p>/g, '');
}

interface WpTagRow {
  id: number;
  name: string;
  slug: string;
}

async function findOrCreateWordPressTagId(
  name: string,
  credentials: string,
  wpUrl: string
): Promise<number> {
  const searchUrl = `${wpRestUrl(wpUrl, '/wp/v2/tags')}&search=${encodeURIComponent(name)}&per_page=30`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (searchRes.ok) {
    const tags = (await searchRes.json()) as WpTagRow[];
    const exact = tags.find((t) => decodeHtmlEntities(t.name) === name);
    if (exact) return exact.id;
  }

  const createRes = await fetch(wpRestUrl(wpUrl, '/wp/v2/tags'), {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  if (createRes.ok) {
    const created = (await createRes.json()) as { id: number };
    return created.id;
  }

  const errBody = (await createRes.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
    data?: { status?: number; term_id?: number };
  };
  if (errBody.code === 'term_exists' && errBody.data?.term_id) {
    return errBody.data.term_id;
  }

  throw new Error(
    errBody.message || `タグ「${name}」の取得・作成に失敗しました (${createRes.status})`
  );
}

async function resolveWordPressTagIds(
  names: string[],
  credentials: string,
  wpUrl: string
): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) {
    const id = await findOrCreateWordPressTagId(name, credentials, wpUrl);
    ids.push(id);
  }
  return ids;
}

/**
 * WordPress REST APIに投稿する
 */
export async function postToWordPress(
  payload: WordPressPostPayload,
  status: 'draft' | 'publish' | 'future' = 'draft',
  options?: {
    scheduledDate?: string
    categoryIds?: number[]
    preUploadedMediaId?: number
    preUploadedImageUrl?: string
    /** 記事本文上部に表示する焼き込みなし元画像のURL。指定がなければ preUploadedImageUrl を使用 */
    rawImageUrl?: string
  }
): Promise<WordPressPostResult> {
  const wpUrl = process.env.WORDPRESS_URL?.trim();
  const username = process.env.WORDPRESS_USERNAME?.trim();
  const appPassword = process.env.WORDPRESS_APP_PASSWORD?.trim();

  if (!wpUrl || !username || !appPassword) {
    const missing = [
      !wpUrl && 'WORDPRESS_URL',
      !username && 'WORDPRESS_USERNAME',
      !appPassword && 'WORDPRESS_APP_PASSWORD',
    ].filter(Boolean);
    throw new Error(`WordPressの環境変数が設定されていません: ${missing.join(', ')}`);
  }

  const rawCategoryId = process.env.WORDPRESS_CATEGORY_ID?.trim() || '68';
  const defaultCategoryId = parseInt(rawCategoryId, 10);
  const safeDefaultCategoryId = Number.isNaN(defaultCategoryId) || defaultCategoryId < 1 ? 68 : defaultCategoryId;
  const resolvedCategoryIds = options?.categoryIds?.length ? options.categoryIds : [safeDefaultCategoryId];

  // Basic認証のトークンを生成
  const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');

  // アイキャッチ画像のアップロード
  // クライアントが事前アップロード済みの場合はそれを優先使用（2ステップフロー）
  let mediaId: number | undefined;
  let bodyTopImageUrl: string | undefined;
  let imageUploadWarning: string | undefined;

  if (options?.preUploadedMediaId) {
    // 事前アップロード済み: mediaIdとURLをそのまま使用
    mediaId = options.preUploadedMediaId;
    // 記事本文画像: rawImageUrl（焼き込みなし）があれば優先、なければアイキャッチと同じ
    bodyTopImageUrl = options.rawImageUrl ?? options.preUploadedImageUrl;
    console.log('[WordPress] 事前アップロード済み画像を使用: mediaId=', mediaId);
  } else if (payload.imageBase64) {
    // フォールバック: インラインアップロード（直接base64が渡された場合）
    try {
      const mediaResult = await uploadBase64ImageToWordPress(
        payload.imageBase64,
        payload.imageBase64MimeType ?? 'image/png',
        credentials,
        wpUrl
      );
      mediaId = mediaResult.id;
      bodyTopImageUrl = mediaResult.sourceUrl;
      console.log('[WordPress] 画像アップロード成功:', bodyTopImageUrl);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      imageUploadWarning = `アイキャッチ画像のアップロードに失敗しました: ${errMsg}`;
      console.error('[WordPress] ' + imageUploadWarning);
    }
  }

  // 投稿コンテンツ構築（本文最上部に記事画像 → 本文）
  const canonicalSlug = resolveCanonicalPostSlug(payload.slug);
  const payloadWithSlug: WordPressPostPayload = { ...payload, slug: canonicalSlug };
  const postContent = buildPostContent(payloadWithSlug, { bodyTopImageUrl, scheduledDate: options?.scheduledDate });
  const excerpt = generateExcerpt(payload.content);

  const tagNames = normalizeWordPressTagsFromRequest(payload.wordpressTags ?? []);
  let tagIds: number[] | undefined;
  if (tagNames.length > 0) {
    tagIds = await resolveWordPressTagIds(tagNames, credentials, wpUrl);
  }

  const requestUrl = wpRestUrl(wpUrl, '/wp/v2/column');
  const authHeaderValue = `Basic ***`; // ログ用（パスワードは出さない）

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: payload.title,
        content: postContent,
        excerpt,
        status: status,
        slug: canonicalSlug,
        ...(mediaId ? { featured_media: mediaId } : {}),
        ...(status === 'future' && options?.scheduledDate ? { date: options.scheduledDate } : {}),
        column__category: resolvedCategoryIds,
        ...(tagIds && tagIds.length > 0 ? { tags: tagIds } : {}),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        (errorData as { message?: string }).message ||
        (errorData as { code?: string }).code ||
        response.statusText;

      // 403 等の原因特定用：詳細をコンソールに出力
      console.error('[WordPress 403 デバッグ] リクエストURL:', requestUrl);
      console.error('[WordPress 403 デバッグ] レスポンスステータス:', response.status);
      console.error('[WordPress 403 デバッグ] レスポンスボディ:', JSON.stringify(errorData, null, 2));
      console.error('[WordPress 403 デバッグ] 認証ヘッダー:', authHeaderValue);

      throw new Error(`WordPress API error: ${response.status} - ${message}`);
    }

    const data = await response.json() as {
      id: number;
      link: string;
      status: 'draft' | 'publish' | 'future';
      date_gmt?: string;
      date?: string;
    };
    const dateGmt =
      typeof data.date_gmt === 'string' && data.date_gmt.trim()
        ? data.date_gmt.trim()
        : typeof data.date === 'string' && data.date.trim()
          ? data.date.trim()
          : undefined;
    return {
      id: data.id,
      link: data.link,
      editLink: `${wpUrl}/wp-admin/post.php?post=${data.id}&action=edit`,
      status: data.status,
      ...(dateGmt ? { dateGmt } : {}),
      ...(imageUploadWarning ? { imageUploadWarning } : {}),
    };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('WordPress API error:')) {
      throw err;
    }
    // ネットワークエラー等
    console.error('[WordPress デバッグ] リクエストURL:', requestUrl);
    console.error('[WordPress デバッグ] 認証ヘッダー:', authHeaderValue);
    console.error('[WordPress デバッグ] エラー:', err);
    throw err;
  }
}