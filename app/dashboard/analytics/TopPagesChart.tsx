'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { MeasuredChartFrame } from './MeasuredChartFrame'

interface PageActivity {
  slug: string
  name: string
  total: number
}

export function TopPagesChart({ pages, max }: { pages: PageActivity[]; max: number }) {
  const chartData = pages.map(p => ({
    name: p.name.length > 16 ? p.name.slice(0, 13) + '...' : p.name,
    slug: p.slug,
    total: p.total,
  }))

  return (
    <MeasuredChartFrame className="h-64">
      {({ width, height }) => (
        <BarChart 
          width={width}
          height={height}
          data={chartData} 
          layout="vertical"
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis type="number" stroke="#666" />
          <YAxis 
            dataKey="name" 
            type="category" 
            width={100}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--fg)' }}
          />
          <Bar dataKey="total" fill="var(--signal)" radius={2} />
        </BarChart>
      )}
    </MeasuredChartFrame>
  )
}
