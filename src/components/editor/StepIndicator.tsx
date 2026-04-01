import { Step } from '@/lib/types'

interface StepIndicatorProps {
  currentStep: Step
  /** 指定時は各ステップをクリックで切り替え可能 */
  onStepClick?: (step: Step) => void
}

const steps = [
  { number: 1 as Step, label: '一次執筆' },
  { number: 2 as Step, label: 'Gemini推敲' },
  { number: 3 as Step, label: '画像生成' },
  { number: 4 as Step, label: 'プレビュー' },
  { number: 5 as Step, label: '投稿' },
]

export default function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, index) => {
        const isCompleted = currentStep > step.number
        const isActive = currentStep === step.number
        const isClickable = typeof onStepClick === 'function'
        const isLast = index === steps.length - 1

        const rowClasses = `
          flex items-center gap-3 px-2 py-2
          ${isClickable ? 'rounded-lg -mx-1 w-full text-left hover:bg-[#E2E8F0]/70 active:bg-[#E2E8F0] transition-colors' : ''}
        `

        const labelClasses = `
          text-xs font-medium whitespace-nowrap
          ${isActive ? 'text-[#002C93] font-semibold' : ''}
          ${isCompleted ? 'text-[#002C93]' : ''}
          ${!isCompleted && !isActive ? 'text-[#64748B]' : ''}
        `

        const content = (
          <>
            {/* 左: アイコン＋縦線のカラム */}
            <div className="flex flex-col items-center w-8 flex-shrink-0">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
                  ${isCompleted ? 'bg-[#002C93] text-white' : ''}
                  ${isActive ? 'bg-[#002C93] text-white ring-4 ring-[#002C93]/20' : ''}
                  ${!isCompleted && !isActive ? 'bg-[#E2E8F0] text-[#64748B]' : ''}
                `}
              >
                {isCompleted ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M2 7L5.5 10.5L12 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span className="font-mono text-xs">{step.number}</span>
                )}
              </div>
              {!isLast && (
                <div
                  className={`
                    w-[2px] h-10
                    ${isCompleted ? 'bg-[#002C93]' : 'bg-[#E2E8F0]'}
                  `}
                />
              )}
            </div>

            {/* 右: ラベル */}
            <span className={labelClasses}>{step.label}</span>
          </>
        )

        return (
          <div key={step.number}>
            {isClickable ? (
              <button
                type="button"
                onClick={() => onStepClick(step.number)}
                className={rowClasses}
                aria-label={`${step.label}へ移動`}
              >
                {content}
              </button>
            ) : (
              <div className={rowClasses}>{content}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
