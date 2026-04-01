import { Step } from '@/lib/types'
import { RotateCcw } from 'lucide-react'

interface HeaderProps {
  currentStep: Step
  onReset?: () => void
}

export default function Header({ currentStep, onReset }: HeaderProps) {
  return (
    <header className="h-14 bg-[#1A9FCC] flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <span className="text-white text-xl font-bold tracking-wide">SBAS</span>
        <span className="text-white text-xs font-mono">Smart Boarding Article System</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[#64748B] text-xs font-mono">STEP</span>
          <span className="text-white text-sm font-mono font-medium">
            {currentStep} <span className="text-[#64748B]">/</span> 4
          </span>
        </div>

        {onReset && currentStep > 1 && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#94A3B8] hover:text-white hover:bg-white/10 border border-transparent hover:border-white/20 transition-colors"
            title="最初からやり直す（データを全て削除）"
          >
            <RotateCcw size={13} />
            最初からやり直す
          </button>
        )}
      </div>
    </header>
  )
}
