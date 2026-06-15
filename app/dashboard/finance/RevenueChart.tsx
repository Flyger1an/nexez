'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { MeasuredChartFrame } from '../analytics/MeasuredChartFrame'
import { formatCurrencyAmount } from '../../../lib/currency'

/** Daily GMV trend for the selected settlement currency. Money axis + tooltip. */
export function RevenueChart({ data, currency }: { data: { label: string; revenueCents: number }[]; currency: string }) {
  const fmt = (v: number) => formatCurrencyAmount(Math.round(Number(v) || 0), currency)
  return (
    <MeasuredChartFrame className="h-64">
      {({ width, height }) => (
        <AreaChart width={width} height={height} data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="finance-revenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ready)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--ready)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="label" stroke="var(--fg-muted-2)" minTickGap={24} />
          <YAxis stroke="var(--fg-muted-2)" width={72} tickFormatter={fmt} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--fg)' }}
            formatter={(v: any) => [fmt(v), 'Revenue']}
          />
          <Area type="monotone" dataKey="revenueCents" stroke="var(--ready)" strokeWidth={2.5} fill="url(#finance-revenue)" name="Revenue" />
        </AreaChart>
      )}
    </MeasuredChartFrame>
  )
}
