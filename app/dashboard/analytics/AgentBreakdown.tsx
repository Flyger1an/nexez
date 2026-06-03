'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { MeasuredChartFrame } from './MeasuredChartFrame'

function getAgentPlatform(ua: string | null | undefined): string {
  if (!ua) return 'Unknown'
  const lower = ua.toLowerCase()
  if (lower.includes('gptbot') || lower.includes('openai')) return 'ChatGPT / GPTBot'
  if (lower.includes('claude') || lower.includes('anthropic')) return 'Claude'
  if (lower.includes('grok') || lower.includes('xai')) return 'Grok'
  if (lower.includes('perplexity')) return 'Perplexity'
  if (lower.includes('google')) return 'Google'
  return 'Other'
}

export function AgentBreakdown({ events }: { events: any[] }) {
  const counts: Record<string, number> = {}

  events.forEach(e => {
    const platform = getAgentPlatform(e.agent_user_agent)
    counts[platform] = (counts[platform] || 0) + 1
  })

  const data = Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  if (data.length === 0) return <div className="text-sm text-zinc-500">No agent data yet.</div>

  return (
    <MeasuredChartFrame className="h-48">
      {({ width, height }) => (
        <BarChart width={width} height={height} data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis type="number" stroke="#666" />
          <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} stroke="#666" />
          <Tooltip contentStyle={{ backgroundColor: '#1A1625', border: '1px solid rgba(255,255,255,0.1)' }} />
          <Bar dataKey="value" fill="#00F5FF" radius={3} />
        </BarChart>
      )}
    </MeasuredChartFrame>
  )
}
