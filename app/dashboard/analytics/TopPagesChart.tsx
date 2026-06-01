'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart 
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
            contentStyle={{ backgroundColor: '#1A1625', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <Bar dataKey="total" fill="#C4B5FD" radius={2} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}