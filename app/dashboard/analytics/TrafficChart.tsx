'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export function TrafficChart({ data }: { data: any[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="label" stroke="#666" />
          <YAxis stroke="#666" />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1A1625', border: '1px solid rgba(255,255,255,0.1)' }} 
          />
          <Line 
            type="monotone" 
            dataKey="total" 
            stroke="#7C3AED" 
            strokeWidth={2.5} 
            dot={{ fill: '#7C3AED', strokeWidth: 2 }} 
            name="Total Events"
          />
          <Line 
            type="monotone" 
            dataKey="conversions" 
            stroke="#00F5FF" 
            strokeWidth={2} 
            strokeDasharray="4 2"
            dot={false}
            name="Conversions"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}