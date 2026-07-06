'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { MeasuredChartFrame } from './MeasuredChartFrame'

export function TrafficChart({ data }: { data: any[] }) {
  return (
    <MeasuredChartFrame className="h-64">
      {({ width, height }) => (
        <LineChart width={width} height={height} data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="label" stroke="var(--fg-muted-2)" />
          <YAxis stroke="var(--fg-muted-2)" />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--fg)' }}
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke="var(--fg-muted)"
            strokeWidth={2.5}
            dot={{ fill: 'var(--fg-muted)', strokeWidth: 2 }}
            name="Total Events"
          />
          <Line
            type="monotone"
            dataKey="agentVisits"
            stroke="var(--signal)"
            strokeWidth={2}
            dot={false}
            name="Listing visits"
          />
          <Line
            type="monotone"
            dataKey="discovery"
            stroke="var(--amber)"
            strokeWidth={2}
            dot={false}
            name="Discovery"
          />
          <Line
            type="monotone"
            dataKey="conversions"
            stroke="var(--ready)"
            strokeWidth={2}
            strokeDasharray="4 2"
            dot={false}
            name="Conversions"
          />
        </LineChart>
      )}
    </MeasuredChartFrame>
  )
}
