'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { MeasuredChartFrame } from './MeasuredChartFrame'

export function TrafficChart({ data }: { data: any[] }) {
  return (
    <MeasuredChartFrame className="h-64">
      {({ width, height }) => (
        <LineChart width={width} height={height} data={data}>
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
            dataKey="agentVisits"
            stroke="#10B981"
            strokeWidth={2}
            dot={false}
            name="Agent Page Visits"
          />
          <Line
            type="monotone"
            dataKey="discovery"
            stroke="#F59E0B"
            strokeWidth={2}
            dot={false}
            name="Discovery"
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
      )}
    </MeasuredChartFrame>
  )
}
