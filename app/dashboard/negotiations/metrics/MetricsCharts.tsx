'use client'

import { PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, ResponsiveContainer } from 'recharts'
import { MeasuredChartFrame } from '../../analytics/MeasuredChartFrame'

const DONUT_COLORS = ['var(--signal)', 'var(--ready)', 'var(--amber)', '#ef4444', 'var(--fg-muted)', 'var(--fg-muted-2)', 'var(--signal)', 'var(--ready)']

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-white/5 text-sm text-zinc-500">
      {label}
    </div>
  )
}

/** Donut for status / decision distributions. data = [{ name, value }] (zeros filtered out). */
export function MetricsDonut({ data, emptyLabel = 'No data yet' }: { data: Array<{ name: string; value: number }>; emptyLabel?: string }) {
  const filtered = data.filter((d) => d.value > 0)
  if (filtered.length === 0) return <EmptyChart label={emptyLabel} />

  return (
    <MeasuredChartFrame className="h-48">
      {({ width, height }) => (
        <PieChart width={width} height={height}>
          <Pie data={filtered} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" nameKey="name">
            {filtered.map((_, i) => (
              <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      )}
    </MeasuredChartFrame>
  )
}

/** Daily negotiation volume bar chart. data = [{ date: 'YYYY-MM-DD', count }]. */
export function ThroughputChart({ data }: { data: Array<{ date: string; count: number }> }) {
  if (!data.some((d) => d.count > 0)) return <EmptyChart label="No negotiations in this window" />

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="date" hide />
          <Tooltip cursor={{ fill: 'rgba(255,106,51,0.12)' }} labelFormatter={(d) => String(d)} />
          <Bar dataKey="count" fill="var(--signal)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
