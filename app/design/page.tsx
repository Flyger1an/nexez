'use client'

import React from 'react'

export default function DesignSystemShowcase() {
  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-6xl font-semibold tracking-tighter mb-2">Nexez Design System</h1>
        <p className="text-[#9CA3AF] text-xl">v1.0 — Human-first management. Agent-first consumption.</p>

        {/* Colors */}
        <section className="mt-16">
          <h2 className="text-2xl font-semibold mb-6 tracking-tight">Color Palette</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { name: 'Deep Void', hex: '#0A0A0F' },
              { name: 'Midnight Purple', hex: '#1A1625' },
              { name: 'Electric Purple', hex: '#7C3AED' },
              { name: 'Neon Teal', hex: '#00F5FF' },
              { name: 'Soft Lavender', hex: '#C4B5FD' },
            ].map((c) => (
              <div key={c.name} className="card p-4">
                <div className="h-16 rounded-xl mb-3" style={{ background: c.hex }} />
                <div className="font-medium">{c.name}</div>
                <div className="font-mono text-sm text-[#9CA3AF]">{c.hex}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Buttons */}
        <section className="mt-16">
          <h2 className="text-2xl font-semibold mb-6 tracking-tight">Buttons</h2>
          <div className="flex flex-wrap gap-4">
            <button className="btn-primary">Primary CTA</button>
            <button className="btn-secondary">Secondary</button>
            <button className="btn-ghost">Ghost</button>
          </div>
        </section>

        {/* Cards */}
        <section className="mt-16">
          <h2 className="text-2xl font-semibold mb-6 tracking-tight">Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card">
              <div className="text-[#00F5FF] mb-2">Premium</div>
              <h3 className="text-2xl font-semibold">Standard Card</h3>
              <p className="text-[#9CA3AF] mt-2">Used across dashboard and public surfaces.</p>
            </div>
            <div className="card border-[#7C3AED]/30">
              <div className="text-[#C4B5FD]">Highlighted</div>
              <h3 className="text-2xl font-semibold mt-1">With Accent Border</h3>
            </div>
          </div>
        </section>

        <div className="mt-20 text-sm text-[#9CA3AF]">
          This page exists to validate the design system during implementation.
        </div>
      </div>
    </main>
  )
}
