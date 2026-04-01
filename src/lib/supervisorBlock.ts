/**
 * 監修者ボックスのHTMLを単一ソースで生成。
 * プレビューとWordPress投稿で同一表示にするため、ここだけを編集する。
 * 丸写真128px。顔写真URLは環境変数またはデフォルト。
 */
export function getSupervisorBlockHtml(imageUrl: string): string {
  return `
<div class="nas-supervisor-box" style="max-width:780px;margin:31px auto 42px;background:#f3f4f6;border-radius:13px;padding:18px 23px;">
  <p style="font-weight:700;font-size:18px;color:#1e293b;margin:0 0 13px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;text-align:center;">監修者</p>
  <div style="display:flex;gap:16px;align-items:center;">
    <img src="${imageUrl}" alt="石川 淳悦" style="width:128px;height:128px;border-radius:50%;object-fit:cover;object-position:center 25%;flex-shrink:0;display:block;" />
    <div style="flex:1;min-width:0;font-size:16px;line-height:1.6;color:#374151;">
      <p style="margin:0 0 3px;font-weight:700;font-size:17px;color:#6b7280;">株式会社FCE 代表取締役社長</p>
      <p style="margin:0 0 8px;font-weight:700;font-size:18px;color:#111827;">石川 淳悦</p>
      <p style="margin:0;font-weight:700;font-size:14px;color:#4b5563;">法人向けオンライントレーニング「Smart Boarding（スマートボーディング）」をはじめとする人財育成・教育研修サービスを展開。FCEグループとして、eラーニングと対面研修・人財コンサルティングを組み合わせた支援を推進している。</p>
    </div>
  </div>
</div>
`.trim();
}
