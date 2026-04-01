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
}

import { getSupervisorBlockHtml } from './supervisorBlock'
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

/** 監修者画像のデフォルト（WORDPRESSメディア投入後は環境変数で上書き推奨） */
const DEFAULT_SUPERVISOR_IMAGE_URL = 'https://www.smartboarding.net/_cms_/wp-content/uploads/FCE_main_yokoRGB.png'

/** 旧S3の監修者画像URL（このURLの場合はWordPressのURLに差し替える） */
const LEGACY_S3_SUPERVISOR_PATTERN = /data-for-nas\.s3\.ap-northeast-1\.amazonaws\.com\/pictures\//i

/** URLが http:// の場合は https:// に変換（Mixed Content 防止） */
function forceHttps(url: string): string {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

/**
 * 監修者画像のURLを実行時に取得。
 * 左の丸画像は必ずWordPressメディアライブラリのお顔画像を使用。
 * 優先: WORDPRESS_SUPERVISOR_IMAGE_URL > デフォルト（お顔画像URL）。S3/CloudFrontは使わない。
 * 返却URLは必ず https に統一（Mixed Content 防止）。
 */
export function getSupervisorImageUrl(): string {
  const wp = process.env.WORDPRESS_SUPERVISOR_IMAGE_URL?.trim();
  if (wp) return forceHttps(wp);
  const direct = process.env.SUPERVISOR_IMAGE_URL?.trim();
  if (direct && !LEGACY_S3_SUPERVISOR_PATTERN.test(direct)) return forceHttps(direct);
  return DEFAULT_SUPERVISOR_IMAGE_URL;
}

/** WordPress投稿本文用の監修者画像URL。メディアライブラリのURLを優先（下書きで表示される）。必ず https。 */
export function getSupervisorImageUrlForWordPress(): string {
  const wpUrl = process.env.WORDPRESS_SUPERVISOR_IMAGE_URL?.trim();
  if (wpUrl) return forceHttps(wpUrl);
  return getSupervisorImageUrl();
}

/**
 * WordPress投稿用のCTAバナー画像URLを取得
 * 環境変数 NEXT_PUBLIC_CLOUDFRONT_URL があればCloudFront経由、なければS3直接URLを返す
 */
function getCtaBannerImageUrl(): string {
  const cloudFrontUrl = process.env.NEXT_PUBLIC_CLOUDFRONT_URL?.trim();
  if (cloudFrontUrl) {
    return `${cloudFrontUrl}/data-for-nas/pictures/NTS+CTA+%E9%9B%BB%E8%A9%B1%E7%95%AA%E5%8F%B7%E4%BB%98%E3%81%8D.png`;
  }
  return 'https://data-for-nas.s3.ap-northeast-1.amazonaws.com/pictures/NTS+CTA+%E9%9B%BB%E8%A9%B1%E7%95%AA%E5%8F%B7%E4%BB%98%E3%81%8D.png';
}

/**
 * CTAバナーのHTMLブロックを生成
 * クリックで Smart Boarding お問い合わせに遷移する（バナー画像は別途差し替え）
 */
function buildCtaBannerHtml(): string {
  const imageUrl = getCtaBannerImageUrl();
  return `<div style="text-align:center;margin:40px 0;padding:0;">
  <a href="https://www.smartboarding.net/contact/" target="_blank" rel="noopener noreferrer" style="display:inline-block;text-decoration:none;">
    <img src="${imageUrl}" alt="Smart Boarding へのお問い合わせ・ご相談" style="max-width:100%;width:700px;height:auto;border:none;border-radius:8px;" loading="lazy" />
  </a>
</div>`;
}

/**
 * 記事本文HTMLの「中盤」にCTAバナーを挿入する
 *
 * ロジック:
 * 1. htmlBody 内のすべての <h2 タグの出現位置を取得
 * 2. h2 が3個以上 → 中間のh2の直前に挿入
 * 3. h2 が2個 → 2番目のh2の直前に挿入
 * 4. h2 が1個以下 → 段落(<p>)の中間地点付近の直後に挿入（フォールバック）
 *
 * @param htmlBody convertToHtml + linkifyCtaUrls 適用済みの本文HTML
 * @returns CTAバナーが挿入された本文HTML
 */
function insertCtaBannerIntoBody(htmlBody: string): string {
  const ctaBannerHtml = buildCtaBannerHtml();

  // 優先: 「まとめ」を含む h2 タグの直前に挿入
  const matomeRegex = /<h2[^>]*>[^<]*まとめ[^<]*<\/h2>/gi;
  const matomeMatch = matomeRegex.exec(htmlBody);
  if (matomeMatch) {
    return htmlBody.slice(0, matomeMatch.index) + ctaBannerHtml + '\n' + htmlBody.slice(matomeMatch.index);
  }

  // 次点: 「まとめ」で始まる段落/小見出しの直前に挿入
  const matomeBlockRegex = /<(h2|h3|p)[^>]*>\s*(?:<strong>)?\s*まとめ[\s\S]*?<\/\1>/i;
  const matomeBlockMatch = matomeBlockRegex.exec(htmlBody);
  if (matomeBlockMatch && matomeBlockMatch.index !== undefined) {
    return htmlBody.slice(0, matomeBlockMatch.index) + ctaBannerHtml + '\n' + htmlBody.slice(matomeBlockMatch.index);
  }

  // フォールバック: 最後の h2 の直前に挿入
  const h2Regex = /<h2[\s>]/gi;
  const h2Positions: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = h2Regex.exec(htmlBody)) !== null) {
    h2Positions.push(match.index);
  }
  if (h2Positions.length >= 2) {
    const lastH2Pos = h2Positions[h2Positions.length - 1]!;
    return htmlBody.slice(0, lastH2Pos) + ctaBannerHtml + '\n' + htmlBody.slice(lastH2Pos);
  }

  return htmlBody + '\n' + ctaBannerHtml;
}

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
  const fileName = `nas-image-${Date.now()}.${ext}`;

  const res = await fetch(`${wpUrl}/wp-json/wp/v2/media`, {
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
 */
function applyInlineFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
    // 閉じ忘れなどで残った生の ** は投稿前に除去する
    .replace(/\*\*/g, '');
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
      if (/^[・\-]\s/.test(row)) {
        const items: string[] = [];
        while (i < rawLines.length && /^[・\-]\s/.test(rawLines[i]!)) {
          items.push(rawLines[i]!.replace(/^[・\-]\s*/, ''));
          i++;
        }
        const liBlocks = items
          .map(it => `<li style="${LI_LIST_STYLE}">${formatListItemHtml(it)}</li>`)
          .join('\n');
        htmlLines.push(`<ul style="${UL_LIST_STYLE}">\n${liBlocks}\n</ul>`);
      } else {
        const plines: string[] = [];
        while (i < rawLines.length && !/^[・\-]\s/.test(rawLines[i]!)) {
          plines.push(rawLines[i]!);
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
    if (/^\d+[．.]\s/.test(trimmed) && currentParagraph.length === 0) {
      h2Count++;
      h3Count = 0;
      const text = trimmed.replace(/^\d+[．.]\s*/, '');
      htmlLines.push(`<h2 id="section-${h2Count}" style="${H2_STYLE}">${applyInlineFormatting(text)}</h2>`);
      continue;
    }

    // h3 小見出し: "1-1. テキスト" — 同様に直前が空行の場合のみ
    if (/^\d+-\d+[．.]\s/.test(trimmed) && currentParagraph.length === 0) {
      h3Count++;
      const text = trimmed
        .replace(/^\d+-\d+[．.]\s*/, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*\*/g, '');
      htmlLines.push(`<h3 id="section-${h2Count}-${h3Count}" style="${H3_STYLE}">${text}</h3>`);
      continue;
    }

    if (/^[■▶◆●▼]\s/.test(trimmed)) {
      flushParagraph();
      h3Count++;
      const text = trimmed
        .replace(/^[■▶◆●▼]\s*/, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*\*/g, '');
      htmlLines.push(`<h3 id="section-${h2Count}-${h3Count}" style="${H3_STYLE}">${text}</h3>`);
      continue;
    }

    currentParagraph.push(trimmed);
  }

  flushParagraph();
  return fixStrongParagraphNesting(htmlLines.join('\n'));
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
  // FAQ見出しとして成立する行のみを対象にする（本文中の「Q&A」言及では分離しない）
  // "7. よくある質問（FAQ）" のような数字付き見出し形式にも対応
  const faqHeaderRegex = /^\s*(?:#+\s*)?(?:\d+[．.]\s*)?(?:よくある質問(?:\s*[\(（]FAQ[\)）])?|FAQ|Q\s*&\s*A)\s*[:：]?\s*$/im;
  const match = content.match(faqHeaderRegex);
  if (match && match.index !== undefined) {
    return {
      body: content.slice(0, match.index).trimEnd(),
      faqSection: content.slice(match.index).trim(),
    };
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

  // description：FAQ 前の本文＋監修者除去後からプレーン化（一覧用抜粋と整合）
  const bodyForDesc = splitFaqSection(stripLeadingSupervisorText(payload.content)).body;
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
    'author': [
      {
        '@type': 'Person',
        'name': '石川 淳悦',
        'jobTitle': '代表取締役社長',
        'worksFor': {
          '@type': 'Organization',
          'name': '株式会社FCE',
          'url': 'https://fce-hd.co.jp/',
        },
        'description': '法人向け教育研修・eラーニング事業を統括。Smart Boarding（スマートボーディング）を中心に人財育成ソリューションを展開。',
      },
    ],
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
      '@id': `${getWordPressSiteOrigin()}/news/${slug}/`,
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

/**
 * 本文先頭の「監修者：…」「実績：…」などの監修者テキストを除去する
 * （画像付き監修者ブロックを別挿入するため、テキストの二重表示を防ぐ）
 */
function stripLeadingSupervisorText(content: string): string {
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    if (
      /^監修者[：:]\s*/.test(trimmed) ||
      /^実績[：:]\s*/.test(trimmed) ||
      /^株式会社FCE\s+代表/.test(trimmed) ||
      /^石川\s*淳悦/.test(trimmed)
    ) {
      i++;
      continue;
    }
    break;
  }
  return lines.slice(i).join('\n').replace(/^\n+/, '');
}

const EXCERPT_MAX_LENGTH = 120;

/**
 * 記事本文から抜粋（excerpt）を生成する。
 * 監修者ブロック用テキストを除き、FAQ より前の本文の先頭段落から最大120文字を返す（一覧のリード表示用）。
 */
function generateExcerpt(content: string): string {
  const withoutSupervisor = stripLeadingSupervisorText(content);
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
 * 本文HTMLからテキスト版FAQ（「よくある質問」を含むH2見出し以降）を除去する。
 * アコーディオン版FAQが別途生成されるため、テキスト版は不要。
 */
function stripTextFaqFromHtml(html: string): string {
  const lines = html.split('\n');
  let faqStartIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].replace(/<[^>]*>/g, '').trim();
    if (/よくある質問/.test(stripped)) {
      faqStartIdx = i;
      break;
    }
  }

  if (faqStartIdx < 0) return html;

  // 「よくある質問」を含む行以降を全て除去
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
 * 順序: 本文最上部に記事画像（アイキャッチと同じ）→ 監修者ブロック（画像付き）→ 記事本文 → Schema
 * @param bodyTopImageUrl ウェブアプリで作成した画像のURL（WordPressメディア）。本文最上部とアイキャッチに使用
 */
export function buildPostContent(
  payload: WordPressPostPayload,
  options?: { bodyTopImageUrl?: string; scheduledDate?: string }
): string {
  const slug = resolveCanonicalPostSlug(payload.slug);

  // 0. 本文から先頭の監修者テキストを除去（画像付きブロックのみ表示するため）
  const contentWithoutSupervisorText = stripLeadingSupervisorText(payload.content);

  // 0-1. FAQセクションを本文から分離（convertToHtmlで見出し化されないように）
  const { body: bodyText, faqSection } = splitFaqSection(contentWithoutSupervisorText);

  // 1. 本文（FAQ除外）をHTMLに変換
  let htmlBody = convertToHtml(bodyText);
  htmlBody = linkifyCtaUrls(htmlBody);

  // 1-0. CTAバナーを本文中盤に挿入
  htmlBody = insertCtaBannerIntoBody(htmlBody);

  // 1-0a. テキスト版FAQ（「よくある質問」H2以降のQ/Aテキスト）を除去（アコーディオンで置換するため）
  htmlBody = stripTextFaqFromHtml(htmlBody);

  // 1-1. 本文最上部：記事画像（プレビューと同じスタイル）
  const escapedTitle = payload.title.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const bodyTopImageBlock =
    options?.bodyTopImageUrl
      ? `<img src="${options.bodyTopImageUrl}" style="width:100%;height:auto;margin-bottom:32px;display:block;" alt="${escapedTitle} — Smart Boarding" />`
      : '';

  // 1-2. 監修者ブロック（プレビューと同一HTML＝supervisorBlock.tsで単一ソース化）
  const supervisorImageUrl = getSupervisorImageUrlForWordPress();
  const supervisorBlock = getSupervisorBlockHtml(supervisorImageUrl);

  const fullBody = [bodyTopImageBlock, supervisorBlock, htmlBody].filter(Boolean).join('');

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

  // 3. Schema生成（投稿には必ず含める）
  const articleSchema = buildArticleSchema(payload, slug, { bodyTopImageUrl: options?.bodyTopImageUrl, scheduledDate: options?.scheduledDate });
  const faqSchema = buildFaqSchema(faqs);
  if (process.env.NODE_ENV === 'development' && faqs.length > 0) {
    console.log(`[FAQ] Schema generated: ${faqSchema ? 'yes' : 'no'}`);
  }

  // 4. 結合（本文 → FAQアコーディオン → Article Schema → FAQ Schema）
  const parts = [
    `<!-- Smart Boarding Article System -->`,
    fullBody,
    faqAccordionHtml,
    articleSchema,
    faqSchema,
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
  const searchUrl = `${wpUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}&per_page=30`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (searchRes.ok) {
    const tags = (await searchRes.json()) as WpTagRow[];
    const exact = tags.find((t) => decodeHtmlEntities(t.name) === name);
    if (exact) return exact.id;
  }

  const createRes = await fetch(`${wpUrl}/wp-json/wp/v2/tags`, {
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
  options?: { scheduledDate?: string }
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

  const rawCategoryId = process.env.WORDPRESS_CATEGORY_ID?.trim() || '115';
  const categoryId = parseInt(rawCategoryId, 10);
  const safeCategoryId = Number.isNaN(categoryId) || categoryId < 1 ? 115 : categoryId;

  // Basic認証のトークンを生成
  const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');

  // アイキャッチ画像を先にアップロード（本文最上部の画像URL取得のため）
  let mediaId: number | undefined;
  let bodyTopImageUrl: string | undefined;

  if (payload.imageBase64) {
    try {
      const mediaResult = await uploadBase64ImageToWordPress(
        payload.imageBase64,
        payload.imageBase64MimeType ?? 'image/png',
        credentials,
        wpUrl
      );
      mediaId = mediaResult.id;
      bodyTopImageUrl = mediaResult.sourceUrl;
    } catch (err) {
      console.error('アイキャッチ画像のアップロードに失敗しました（投稿は続行）:', err);
    }
  }

  // 投稿コンテンツ構築（本文最上部に記事画像 → 監修者ブロック → 本文）
  const canonicalSlug = resolveCanonicalPostSlug(payload.slug);
  const payloadWithSlug: WordPressPostPayload = { ...payload, slug: canonicalSlug };
  const postContent = buildPostContent(payloadWithSlug, { bodyTopImageUrl, scheduledDate: options?.scheduledDate });
  const excerpt = generateExcerpt(payload.content);

  const tagNames = normalizeWordPressTagsFromRequest(payload.wordpressTags ?? []);
  let tagIds: number[] | undefined;
  if (tagNames.length > 0) {
    tagIds = await resolveWordPressTagIds(tagNames, credentials, wpUrl);
  }

  const requestUrl = `${wpUrl}/wp-json/wp/v2/posts`;
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
        categories: [safeCategoryId],
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

    const data = await response.json();
    return {
      id: data.id,
      link: data.link,
      editLink: `${wpUrl}/wp-admin/post.php?post=${data.id}&action=edit`,
      status: data.status,
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