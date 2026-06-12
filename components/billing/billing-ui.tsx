'use client'

import React from 'react'

/**
 * Shared glassmorphic UI primitives for the billing dashboard tabs.
 * Hoisted at module level so no "components during render" issues.
 */
export function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-white/15 bg-white/[0.025] backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.35)] ${className}`}>
      {children}
    </div>
  )
}

export function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="rounded-xl bg-white/5 p-2">
        <Icon className="size-4 text-[#9CA3AF]" />
      </div>
      <div>
        <div className="text-lg font-semibold tracking-[-0.3px]">{title}</div>
        {subtitle && <div className="text-sm text-[#9CA3AF]">{subtitle}</div>}
      </div>
    </div>
  )
}

export function ProgressRing({ current, limit, size = 64 }: { current: number; limit: number; size?: number }) {
  const pct = Math.min(100, Math.max(0, Math.round((current / (limit || 1)) * 100)))
  const radius = 26
  const circumference = radius * 2 * Math.PI
  const strokeDash = (pct / 100) * circumference
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--signal)"
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - strokeDash}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-lg font-semibold tracking-tighter">{pct}</div>
        <div className="text-[9px] -mt-1 text-[#9CA3AF]">%</div>
      </div>
    </div>
  )
}
