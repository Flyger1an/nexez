'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { MeasuredChartFrame } from './MeasuredChartFrame'

interface OfferStat {
  name: string
  pageSlug: string
  total: number
  attempts: number
  conversions: number
}

export function TopOffersChart({ offers, max }: { offers: OfferStat[]; max: number }) {
  const chartData = offers.map(o => ({
    name: o.name.length > 18 ? o.name.slice(0, 15) + '...' : o.name,
    total: o.total,
    conversions: o.conversions,
    fullName: o.name,
    slug: o.pageSlug,
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
            stroke="#666" 
            width={110}
            tick={{ fontSize: 11 }}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1A1625', border: '1px solid rgba(255,255,255,0.1)' }}
            formatter={(value, name) => [value, name === 'total' ? 'Total Events' : 'Conversions']}
          />
          <Bar dataKey="total" fill="#7C3AED" radius={2} name="Total Events" />
          <Bar dataKey="conversions" fill="#00F5FF" radius={2} name="Conversions" />
        </BarChart>
      )}
    </MeasuredChartFrame>
  )
}
