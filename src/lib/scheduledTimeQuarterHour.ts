/** 投稿予定時刻を 00 / 15 / 30 / 45 分に揃える（HTML input[type=time] step=900 と一致） */
export function snapScheduledTimeToQuarterHour(raw: string): string {
  const t = raw.trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (!m) return t
  let h = parseInt(m[1], 10)
  let min = parseInt(m[2], 10)
  if (Number.isNaN(h) || Number.isNaN(min)) return t
  h = Math.min(23, Math.max(0, h))
  min = Math.min(59, Math.max(0, min))
  const quarters = [0, 15, 30, 45] as const
  const snapped = quarters.reduce((best, q) =>
    Math.abs(q - min) < Math.abs(best - min) ? q : best
  )
  return `${String(h).padStart(2, '0')}:${String(snapped).padStart(2, '0')}`
}

/** YYYY-MM-DD と HH:mm（ローカル）の組が現在より後か */
export function isLocalScheduleInFuture(dateYmd: string, timeHm: string): boolean {
  const d = dateYmd.trim()
  const t = snapScheduledTimeToQuarterHour(timeHm.trim())
  const inst = new Date(`${d}T${t}:00`).getTime()
  return Number.isFinite(inst) && inst > Date.now()
}

/** モーダル初期値：少なくとも約45分後の日時（15分刻み） */
export function getDefaultFutureScheduleInputs(): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = new Date(Date.now() + 45 * 60 * 1000)
  const y = d.getFullYear()
  const mo = pad(d.getMonth() + 1)
  const da = pad(d.getDate())
  const timeStr = snapScheduledTimeToQuarterHour(`${d.getHours()}:${pad(d.getMinutes())}`)
  return { date: `${y}-${mo}-${da}`, time: timeStr }
}
