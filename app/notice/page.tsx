import Link from 'next/link'

/**
 * 一次執筆の注意事項（ターゲットキーワード・ひな形 V2 推奨）を表示するページ
 */
export default function NoticePage() {
  return (
    <div className="w-full py-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">注意書き</h1>
      <p className="text-sm text-[#64748B] mb-6">
        基本プロンプトひな形 V2 の推奨とターゲットキーワードに関する注意です。システム側の出力形式（番号見出し・太字ルール等）と併せてご利用ください。
      </p>

      <div
        className="rounded-xl border border-[#1a9a7b]/40 bg-[#ecfdf5]/90 p-5 sm:p-6 mb-8"
        style={{ boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)' }}
      >
        <p className="text-xs font-semibold text-[#0f766e] mb-2">2026年3月30日時点</p>
        <p className="text-sm text-[#134e4a] leading-relaxed mb-2">
          一次執筆用のプロンプトは、<strong className="font-semibold text-[#0f766e]">基本プロンプト ひな形 V2</strong>
          の利用を推奨します。
          <Link
            href="/prompts"
            className="ml-1 text-[#33B5E5] font-semibold underline underline-offset-2 hover:opacity-80"
          >
            プロンプトライブラリ
          </Link>
          から該当テンプレートを選択してください。
        </p>
        <p className="text-sm text-[#334155] leading-relaxed">
          <span className="font-semibold text-[#1A1A2E]">理由：</span>
          最終アウトプット時のレイアウト・体裁・見出しなどの表現における<strong>デザインの揺れ防止</strong>のためです。ひな形
          V2 をベースに必要な指示を追加する運用を想定しています。
        </p>
      </div>

      <div
        className="rounded-xl border border-[#33B5E5]/20 bg-[#f8fafc] p-6 sm:p-8 shadow-sm mb-8"
        style={{ boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)' }}
      >
        <h2 className="text-lg font-bold text-[#33B5E5] border-b-2 border-[#33B5E5] pb-2 mb-4">
          ■ ターゲットキーワード（必須・構造化データ）
        </h2>
        <p className="text-sm text-[#334155] leading-relaxed mb-4">
          一次執筆の際の<strong className="font-semibold text-[#1A1A2E]">ターゲットキーワードは必ず入れてください</strong>。
        </p>
        <p className="text-sm text-[#334155] leading-relaxed mb-4">
          入力内容は、WordPress 投稿に含まれる構造化データ（JSON-LD）の{' '}
          <code className="rounded bg-white px-1.5 py-0.5 text-xs font-mono text-[#33B5E5] border border-slate-200">
            keywords
          </code>{' '}
          に反映されます。コード（裏側）の記述例は次の通りです。
        </p>
        <pre
          className="mb-4 overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 text-xs leading-relaxed text-[#1e293b] font-mono"
          tabIndex={0}
        >{`"keywords": "M&A 手数料 高い, ma 手数料, M&A手数料, M&A コスト",`}</pre>
        <p className="text-sm text-[#334155] leading-relaxed">
          Google でユーザーがそれらの検索をしたときに表示される仕組みになっているため、
          <strong className="font-semibold text-[#1A1A2E]">とても重要な項目</strong>です。
        </p>
      </div>
    </div>
  )
}
