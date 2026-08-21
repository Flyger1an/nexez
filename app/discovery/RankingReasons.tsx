export function RankingReasons({ reasons }: { reasons: string[] }) {
  const visibleReasons = reasons.slice(0, 3)
  if (!visibleReasons.length) return null

  return (
    <div className="mt-4 border-t border-white/10 pt-3" aria-label="Why this result ranks">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#9CA3AF]">Why this ranks</p>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-[#9CA3AF]">
        {visibleReasons.map((reason) => <li key={reason}>→ {reason}</li>)}
      </ul>
    </div>
  )
}
