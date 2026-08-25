'use client'

/**
 * Visual Drag & Drop Offer Builder for Nexez
 * 
 * Directly serves the "Core Page Builder" + "Drag & Drop Builder" + "Rich Service Templates"
 * parts of the robust vision.
 *
 * Uses the already-installed @dnd-kit packages.
 * Offers are kept as the existing OfferItem shape for now (backward compat with DB).
 * Future: extend with pricingTiers array per the vision.
 */

import React, { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Copy, GripVertical, Plus, Trash2, Sparkles } from 'lucide-react'
import type { OfferItem, PricingTier } from '../lib/agent-page'
import { hasPaidNegotiationRules, stripPaidNegotiationRules } from '../lib/intake/negotiation-policy'
import { PlanBadge } from './billing/PlanGate'

export type OfferKind = 'services' | 'products'

interface VisualOfferBuilderProps {
  offers: OfferItem[]
  kind: OfferKind
  onChange: (offers: OfferItem[]) => void
  onAddFromTemplate?: (template: OfferItem) => void
  // Phase 1 A: context for smarter per-card AI enhancement
  businessName?: string
  audience?: string
  pageId?: string // enables real LLM-assist via /api/ai/enhance when the page opted in
  /** Server-resolved owner entitlement. Defaults false so pre-plan builders fail closed. */
  aiFeaturesEnabled?: boolean
  /** Server-resolved owner entitlement for negotiation and smart pricing. Defaults false. */
  negotiationEnabled?: boolean
}

const SERVICE_TEMPLATES: OfferItem[] = [
  // Professional Services
  {
    name: 'Strategy Session',
    price: '$450',
    description: '60-minute focused session. Clear deliverables, recommendations, and next-step plan.',
    url: '',
  },
  {
    name: 'Implementation Retainer',
    price: 'From $1,800/mo',
    description: 'Ongoing execution support with priority access and monthly reviews.',
    url: '',
  },
  {
    name: 'Leadership Coaching Package',
    price: '$2,400',
    description: '3-month engagement with bi-weekly sessions and async support.',
    url: '',
  },

  // Consumer / Local Bookable Services
  {
    name: 'Standard Plumbing Service',
    price: '$129',
    description: '60-minute visit for diagnosis and minor repairs. Includes basic parts.',
    duration: '60 min',
    serviceArea: 'Austin metro + 20 miles',
    isMobile: true,
    url: '',
  },
  {
    name: 'Deep House Cleaning',
    price: '$189',
    description: 'Full top-to-bottom clean for 1-2 bedroom homes. Eco-friendly products used.',
    duration: '2-3 hours',
    serviceArea: 'Greater Austin area',
    isMobile: true,
    url: '',
  },
  {
    name: '60-Minute Deep Tissue Massage',
    price: '$110',
    description: 'Therapeutic deep tissue massage. Includes hot stones and essential oils.',
    duration: '60 min',
    serviceArea: 'In-studio or mobile (travel fee applies)',
    isMobile: true,
    travelFee: '$25',
    url: '',
  },
  {
    name: 'Personal Training Session',
    price: '$75',
    description: 'One-on-one customized workout. All equipment provided.',
    duration: '45-60 min',
    serviceArea: 'Client home or park within 15 miles',
    isMobile: true,
    url: '',
  },
  {
    name: 'Full Grooming Package (Dogs)',
    price: '$85',
    description: 'Bath, haircut, nail trim, ear cleaning, and teeth brushing.',
    duration: '90-120 min',
    serviceArea: 'Mobile - we come to you',
    isMobile: true,
    url: '',
  },
  {
    name: 'Mobile Car Detailing',
    price: 'From $149',
    description: 'Interior + exterior hand wash and detail. Eco products.',
    duration: '2-3 hours',
    serviceArea: 'Austin + surrounding areas',
    isMobile: true,
    url: '',
  },
]

const PRODUCT_TEMPLATES: OfferItem[] = [
  {
    name: 'Founder OS Template Pack',
    price: '$99',
    description: 'Notion + Google Sheets system. Includes offer builder, pipeline tracker, and onboarding flows.',
    url: '',
  },
  {
    name: 'Agent-Ready Service Blueprint',
    price: '$149',
    description: 'Framework to turn any service into a structured, AI-optimized offer.',
    url: '',
  },
  {
    name: 'Client Onboarding Kit',
    price: '$79',
    description: 'Complete templates and automations for smooth client handoff.',
    url: '',
  },
]

export function VisualOfferBuilder({
  offers,
  kind,
  onChange,
  businessName,
  audience,
  pageId,
  aiFeaturesEnabled = false,
  negotiationEnabled = false,
}: VisualOfferBuilderProps) {
  // Normalize offers to ensure tiers is always an array
  const normalizedOffers = offers.map(o => ({
    ...o,
    tiers: o.tiers || []
  }))

  // Source filter state (Phase 3)
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Better mobile / touch support: require small move to activate drag so taps on inputs/buttons still work
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const templates = kind === 'services' ? SERVICE_TEMPLATES : PRODUCT_TEMPLATES

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = offers.findIndex((o, i) => getOfferId(o, i) === active.id)
      const newIndex = offers.findIndex((o, i) => getOfferId(o, i) === over.id)
      if (oldIndex < 0 || newIndex < 0) return
      onChange(arrayMove(offers, oldIndex, newIndex))
    }
  }

  function addTemplate(template: OfferItem) {
    onChange([...offers, { ...template }])
  }

  function addBlank() {
    onChange([
      ...offers,
      { name: 'New Offer', price: '', description: '', url: '' },
    ])
  }

  function updateOffer(index: number, field: keyof OfferItem, value: string | boolean | PricingTier[]) {
    const next = [...offers]
    next[index] = { ...next[index], [field]: value as any }
    onChange(next)
  }

  // Helper for updating the entire offer object (better for complex fields)
  function updateFullOffer(index: number, updatedOffer: Partial<OfferItem>) {
    const next = [...offers]
    next[index] = { ...next[index], ...updatedOffer }
    onChange(next)
  }

  function removeOffer(index: number) {
    onChange(offers.filter((_, i) => i !== index))
  }

  // A/B testing: duplicate an offer as a variant inserted right after it. The
  // original and copy share an `ab_test` id so the public page serves ONE variant
  // per visitor (sticky) and attributes conversions per label in Analytics → A/B.
  function duplicateOffer(index: number) {
    const original = offers[index]
    if (!original) return
    // Reuse the original's test if it's already in one; otherwise start a new test
    // and label the original 'A'. The copy gets the next free label.
    const test = original.ab_test || `ab_${Math.random().toString(36).slice(2, 10)}`
    const usedLabels = new Set(
      offers.filter((o) => o.ab_test === test).map((o) => o.ab_label).filter(Boolean) as string[],
    )
    if (!original.ab_test) usedLabels.add('A')
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const nextLabel = [...alphabet].find((l) => !usedLabels.has(l)) || 'B'
    const tagged = offers.map((o, i) =>
      i === index && !original.ab_test ? { ...o, ab_test: test, ab_label: 'A' } : o,
    )
    const variant: OfferItem = {
      ...original,
      name: `${(original.name || 'Offer').replace(/\s*\(Variant [A-Z]\)$/, '')} (Variant ${nextLabel})`,
      ab_test: test,
      ab_label: nextLabel,
    }
    onChange([...tagged.slice(0, index + 1), variant, ...tagged.slice(index + 1)])
  }

  return (
    <div className="space-y-4">
      {/* Templates */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
          <Sparkles className="size-4 text-[var(--signal)]" />
          Rich Service Templates
        </div>
        <div className="flex flex-wrap gap-2">
          {templates.map((tpl, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => addTemplate(tpl)}
              className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-left text-xs text-[var(--signal)] hover:bg-white/10 active:bg-white/10 md:py-1.5"
            >
              + {tpl.name}
            </button>
          ))}
          <button
            type="button"
            onClick={addBlank}
            className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 active:bg-white/10 md:py-1.5"
          >
            <Plus className="mr-1 inline size-3" /> Blank offer
          </button>
        </div>
      </div>

      {/* Source Filter (Phase 3) */}
      {offers.some(o => o.source) && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-400">Filter by source:</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded border border-white/15 bg-black/30 px-2 py-1 text-xs text-white"
          >
            <option value="all">All</option>
            {Array.from(new Set(offers.map(o => o.source).filter(Boolean))).map(src => (
              <option key={src} value={src}>{src}</option>
            ))}
          </select>
        </div>
      )}

      {/* Draggable List with optional source filter */}
      {(() => {
        const visibleOffers = offers
          .map((offer, originalIndex) => ({
            offer,
            originalIndex,
            id: getOfferId(offer, originalIndex),
          }))
          .filter((row) => sourceFilter === 'all' || row.offer.source === sourceFilter)

        return (
          <DndContext
            id={`offer-builder-${pageId || 'draft'}-${kind}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleOffers.map((row) => row.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {visibleOffers.length === 0 && (
                  <div className="rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500">
                    No offers match the current filter.
                  </div>
                )}
                {visibleOffers.map(({ offer, originalIndex, id }) => {
                  return (
                    <SortableOfferCard
                      key={id}
                      id={id}
                      offer={offer}
                      index={originalIndex}
                      onUpdate={updateOffer}
                      onRemove={removeOffer}
                      onDuplicate={duplicateOffer}
                      onUpdateFull={updateFullOffer}
                      businessName={businessName}
                      audience={audience}
                      pageId={pageId}
                      aiFeaturesEnabled={aiFeaturesEnabled}
                      negotiationEnabled={negotiationEnabled}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        )
      })()}

      <p className="text-[10px] text-zinc-500">
        Drag cards to reorder. Changes sync to the structured data agents read.
      </p>
    </div>
  )
}

function getOfferId(offer: OfferItem, index: number) {
  return `${offer.name || 'offer'}-${index}`
}

function SortableOfferCard({
  id,
  offer,
  index,
  onUpdate,
  onRemove,
  onDuplicate,
  onUpdateFull,
  businessName,
  audience,
  pageId,
  aiFeaturesEnabled,
  negotiationEnabled,
}: {
  id: string
  offer: OfferItem
  index: number
  onUpdate: (index: number, field: keyof OfferItem, value: string) => void
  onRemove: (index: number) => void
  onDuplicate?: (index: number) => void
  onUpdateFull?: (index: number, updated: Partial<OfferItem>) => void
  businessName?: string
  audience?: string
  pageId?: string
  aiFeaturesEnabled: boolean
  negotiationEnabled: boolean
}) {
  const [enhancing, setEnhancing] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const tiers = offer.tiers || []
  const hasPaidRules = hasPaidNegotiationRules(offer)
  const hasRetainedNegotiation = offer.offerType === 'negotiable' || hasPaidRules
  const negotiationStatusId = `negotiation-paused-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

  const updateConsumerField = (field: string, value: any) => {
    if (onUpdateFull) {
      onUpdateFull(index, { [field]: value })
    } else {
      // Fallback for legacy usage
      onUpdate(index, field as any, String(value))
    }
  }

  function addTier() {
    const newTiers = [...tiers, { name: 'New Tier', price: '', description: '' }]
    if (onUpdateFull) {
      onUpdateFull(index, { tiers: newTiers })
    } else {
      onUpdate(index, 'description', JSON.stringify({ __tiers: newTiers, desc: offer.description }))
    }
  }

  // Smart Rules: merge a rules patch, pruning empty values so an empty rules
  // object is never persisted/serialized (absent = no rules).
  function updateRules(patch: Record<string, unknown>) {
    if (!onUpdateFull) return
    const merged: Record<string, unknown> = { ...(offer.rules || {}), ...patch }
    for (const key of Object.keys(merged)) {
      const v = merged[key]
      if (v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0)) {
        delete merged[key]
      }
    }
    onUpdateFull(index, { rules: Object.keys(merged).length ? (merged as OfferItem['rules']) : undefined })
  }

  function clearPaidNegotiationRules() {
    if (!onUpdateFull) return
    const cleaned = stripPaidNegotiationRules(offer)
    onUpdateFull(index, { rules: cleaned.rules })
  }

  function switchToFixed() {
    if (!onUpdateFull) return
    const cleaned = stripPaidNegotiationRules(offer)
    onUpdateFull(index, {
      offerType: undefined,
      rules: cleaned.rules,
    })
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-white/10 bg-white/[0.04] p-4"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1 min-h-[44px] min-w-[44px] cursor-grab touch-manipulation rounded p-2 text-zinc-400 active:cursor-grabbing active:bg-white/5 hover:text-white md:mt-2"
          aria-label="Drag to reorder offer"
          title="Drag to reorder"
        >
          <GripVertical className="size-5 md:size-4" />
        </button>

        <div className="flex-1 space-y-3">
          {/* Basic Info */}
          <div className="relative grid grid-cols-1 gap-3 md:grid-cols-2">
            {typeof offer.confidence === 'number' && (
              <span className="absolute -top-1.5 right-0 rounded bg-[var(--ready)]/10 px-1.5 py-px text-[9px] font-medium text-[var(--ready)]">
                {Math.round(offer.confidence * 100)}% match
              </span>
            )}
            {offer.source && (
              <span className={`absolute -top-1.5 right-20 rounded px-1.5 py-px text-[9px] font-medium ${
                offer.source === 'stripe' ? 'bg-[var(--signal)]/10 text-[var(--signal)]' :
                offer.source === 'shopify' ? 'bg-[var(--signal)]/10 text-[var(--signal)]' :
                offer.source === 'square' ? 'bg-[var(--signal)]/10 text-[var(--signal)]' :
                offer.source === 'acuity' ? 'bg-[var(--amber)]/10 text-[var(--amber)]' :
                'bg-[var(--signal)]/10 text-[var(--signal)]'
              }`}>
                via {offer.source}
              </span>
            )}
            {offer.ab_test && (
              <span
                className="absolute -top-1.5 left-0 rounded bg-[var(--signal)]/10 px-1.5 py-px text-[9px] font-medium text-[var(--signal)]"
                title="A/B test variant - visitors are split across variants; compare in Analytics → A/B Tests"
              >
                A/B · Variant {offer.ab_label || '?'}
              </span>
            )}
            <input
              value={offer.name}
              onChange={(e) => onUpdate(index, 'name', e.target.value)}
              placeholder="Offer name"
              className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <input
              value={offer.price}
              onChange={(e) => onUpdate(index, 'price', e.target.value)}
              placeholder="Price (e.g. $129 or From $249)"
              className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="relative">
            <textarea
              value={offer.description}
              onChange={(e) => onUpdate(index, 'description', e.target.value)}
              placeholder="Description optimized for agents and customers"
              className="min-h-[72px] w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white pr-16"
            />
            {aiFeaturesEnabled ? (
              <button
                type="button"
                disabled={enhancing}
                onClick={async () => {
                  const bn = businessName || 'This business'
                  const aud = audience || 'qualified buyers'
                  setEnhancing(true)
                  try {
                    // The server re-checks the current owner entitlement and returns
                    // an entitled deterministic fallback if the LLM is unavailable.
                    const res = await fetch('/api/ai/enhance', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ description: offer.description || '', businessName: bn, audience: aud, pageId }),
                    })
                    if (res.ok) {
                      const data = await res.json()
                      if (typeof data.enhanced === 'string' && data.enhanced.trim()) {
                        onUpdateFull
                          ? onUpdateFull(index, { description: data.enhanced })
                          : onUpdate(index, 'description', data.enhanced)
                      }
                    }
                  } catch {
                    // Keep the seller's original copy. Any fallback must come from
                    // the server after it re-checks the current entitlement.
                  } finally {
                    setEnhancing(false)
                  }
                }}
                className="absolute top-2 right-2 text-[10px] flex items-center gap-1 rounded border border-[var(--signal)]/40 bg-black/50 px-1.5 py-0.5 text-[var(--signal)] hover:bg-[var(--signal)]/10 disabled:opacity-50"
                title="Enhance this offer description for AI agents"
              >
                <Sparkles className="size-3" /> {enhancing ? 'Enhancing…' : 'Enhance'}
              </button>
            ) : null}
          </div>

          {/* Pricing Tiers */}
          <div className="border border-white/10 rounded-lg p-3 bg-black/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--signal)]">Pricing Tiers</span>
              <button type="button" onClick={addTier} className="text-xs text-[var(--signal)] hover:text-[var(--signal)]">+ Add Tier</button>
            </div>
            {tiers.length > 0 && (
              <div className="space-y-2">
                {tiers.map((tier, tIndex) => (
                  <div key={tIndex} className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-12 sm:items-center">
                    <input value={tier.name} placeholder="Tier" className="rounded border border-white/10 bg-black/30 px-2 py-1.5 sm:col-span-3 sm:py-1" onChange={(e) => {
                      const newTiers = [...tiers]; newTiers[tIndex].name = e.target.value;
                      onUpdateFull ? onUpdateFull(index, { tiers: newTiers }) : onUpdate(index, 'description', JSON.stringify({ __tiers: newTiers }));
                    }} />
                    <input value={tier.price} placeholder="Price" className="rounded border border-white/10 bg-black/30 px-2 py-1.5 sm:col-span-3 sm:py-1" onChange={(e) => {
                      const newTiers = [...tiers]; newTiers[tIndex].price = e.target.value;
                      onUpdateFull ? onUpdateFull(index, { tiers: newTiers }) : onUpdate(index, 'description', JSON.stringify({ __tiers: newTiers }));
                    }} />
                    <input value={tier.description || ''} placeholder="What's included" className="rounded border border-white/10 bg-black/30 px-2 py-1.5 sm:col-span-5 sm:py-1" onChange={(e) => {
                      const newTiers = [...tiers]; newTiers[tIndex].description = e.target.value;
                      onUpdateFull ? onUpdateFull(index, { tiers: newTiers }) : onUpdate(index, 'description', JSON.stringify({ __tiers: newTiers }));
                    }} />
                    <button type="button" onClick={() => {
                      const newTiers = tiers.filter((_, i) => i !== tIndex);
                      onUpdateFull ? onUpdateFull(index, { tiers: newTiers }) : onUpdate(index, 'description', JSON.stringify({ __tiers: newTiers }));
                    }} className="text-red-400 py-1 sm:col-span-1">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Offer type, public terms, and seller decision rules. */}
          {onUpdateFull && (
            <div className="border border-white/10 rounded-lg p-3 bg-black/20">
              <div className="flex items-center justify-between mb-2">
                <span className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--signal)]">
                  Offer type & rules
                  {!negotiationEnabled ? <PlanBadge feature="negotiation" /> : null}
                </span>
                <div className="flex gap-1" role="group" aria-label="Offer type">
                  <button
                    type="button"
                    aria-pressed={offer.offerType !== 'negotiable'}
                    onClick={switchToFixed}
                    className={`rounded px-2 py-0.5 text-[10px] border ${offer.offerType !== 'negotiable' ? 'border-[var(--signal)]/60 bg-[var(--signal)]/10 text-[var(--signal)]' : 'border-white/15 text-zinc-400 hover:text-white'}`}
                  >
                    Fixed
                  </button>
                  <button
                    type="button"
                    aria-pressed={offer.offerType === 'negotiable'}
                    aria-describedby={!negotiationEnabled && hasRetainedNegotiation ? negotiationStatusId : undefined}
                    disabled={!negotiationEnabled}
                    onClick={() => {
                      if (negotiationEnabled) onUpdateFull(index, { offerType: 'negotiable' })
                    }}
                    title={!negotiationEnabled ? 'Negotiation and smart pricing require Pro or above' : undefined}
                    className={`rounded px-2 py-0.5 text-[10px] border disabled:cursor-not-allowed disabled:opacity-60 ${offer.offerType === 'negotiable' ? 'border-[var(--signal)]/60 bg-[var(--signal)]/10 text-[var(--signal)]' : 'border-white/15 text-zinc-400 hover:text-white'}`}
                  >
                    Negotiable
                  </button>
                </div>
              </div>

              {!negotiationEnabled && hasRetainedNegotiation ? (
                <div
                  id={negotiationStatusId}
                  role="status"
                  className="mb-2 flex flex-col gap-2 rounded border border-[var(--amber)]/30 bg-[var(--amber)]/10 p-2 text-[10px] text-zinc-300 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    Negotiation is configured but paused on this plan. {offer.offerType === 'negotiable'
                      ? 'Switch to Fixed to atomically remove its paid posture and rules.'
                      : 'Clear all paid rules to remove the retained configuration.'}
                  </span>
                  {offer.offerType !== 'negotiable' && hasPaidRules ? (
                    <button
                      type="button"
                      onClick={clearPaidNegotiationRules}
                      className="shrink-0 rounded border border-red-400/40 px-2 py-1 font-medium text-red-300 hover:bg-red-400/10"
                    >
                      Clear paid negotiation rules
                    </button>
                  ) : null}
                </div>
              ) : null}

              {offer.offerType === 'negotiable' && (
                <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="text-[10px] text-zinc-400">
                    Minimum acceptable price
                    <input
                      value={offer.rules?.minPrice || ''}
                      placeholder="e.g. $800"
                      readOnly={!negotiationEnabled}
                      aria-describedby={!negotiationEnabled ? negotiationStatusId : undefined}
                      onChange={(e) => {
                        if (negotiationEnabled) updateRules({ minPrice: e.target.value })
                      }}
                      className="mt-0.5 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white read-only:cursor-not-allowed read-only:opacity-60"
                    />
                  </label>
                  <label className="text-[10px] text-zinc-400">
                    Maximum discount (%)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={offer.rules?.maxDiscountPercent ?? ''}
                      placeholder="10"
                      readOnly={!negotiationEnabled}
                      onChange={(e) => {
                        if (negotiationEnabled) updateRules({ maxDiscountPercent: e.target.value ? Number(e.target.value) : undefined })
                      }}
                      className="mt-0.5 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white read-only:cursor-not-allowed read-only:opacity-60"
                    />
                  </label>
                  <label className="text-[10px] text-zinc-400">
                    Auto-accept range (%)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={offer.rules?.autoAcceptWithinPercent ?? ''}
                      placeholder="5"
                      readOnly={!negotiationEnabled}
                      onChange={(e) => {
                        if (negotiationEnabled) updateRules({ autoAcceptWithinPercent: e.target.value ? Number(e.target.value) : undefined })
                      }}
                      className="mt-0.5 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white read-only:cursor-not-allowed read-only:opacity-60"
                    />
                  </label>
                  <div className="space-y-2 pt-1">
                    <label className="flex items-center gap-2 text-[10px] text-zinc-300">
                      <input
                        type="checkbox"
                        checked={!!offer.rules?.autoAccept}
                        disabled={!negotiationEnabled}
                        onChange={(e) => {
                          if (negotiationEnabled) updateRules({ autoAccept: e.target.checked })
                        }}
                        className="size-3 accent-[var(--signal)] disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      Auto-accept proposals that meet every rule
                    </label>
                    <label className="flex items-center gap-2 text-[10px] text-zinc-300">
                      <input
                        type="checkbox"
                        checked={!!offer.rules?.autoCounter}
                        disabled={!negotiationEnabled}
                        onChange={(e) => {
                          if (negotiationEnabled) updateRules({ autoCounter: e.target.checked })
                        }}
                        className="size-3 accent-[var(--signal)] disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      Automatically counter at your lowest allowed price
                    </label>
                  </div>
                </div>
              )}

              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-[10px] text-zinc-400">
                  What&apos;s included
                  <textarea
                    value={offer.rules?.includedScope || ''}
                    placeholder="Logo design, brand guide"
                    onChange={(e) => updateRules({ includedScope: e.target.value })}
                    className="mt-0.5 min-h-16 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white"
                  />
                </label>
                <label className="text-[10px] text-zinc-400">
                  What&apos;s not included
                  <textarea
                    value={offer.rules?.excludedScope || ''}
                    placeholder="Website development, source files"
                    onChange={(e) => updateRules({ excludedScope: e.target.value })}
                    className="mt-0.5 min-h-16 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white"
                  />
                </label>
                <label className="text-[10px] text-zinc-400">
                  Included revisions
                  <input
                    type="number"
                    min={0}
                    value={offer.rules?.maxRevisions ?? ''}
                    placeholder="2"
                    onChange={(e) => updateRules({ maxRevisions: e.target.value ? Number(e.target.value) : undefined })}
                    className="mt-0.5 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white"
                  />
                </label>
                <label className="text-[10px] text-zinc-400">
                  Maximum project length (weeks)
                  <input
                    type="number"
                    min={1}
                    value={offer.rules?.maxProjectWeeks ?? ''}
                    placeholder="4"
                    onChange={(e) => updateRules({ maxProjectWeeks: e.target.value ? Number(e.target.value) : undefined })}
                    className="mt-0.5 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white"
                  />
                </label>
              </div>

              <p className="mb-3 text-[9px] text-zinc-500">
                These offer terms are shown to buyers and agents. For negotiable offers, Nexez checks them before any automatic acceptance.
              </p>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="text-[10px] text-zinc-400">
                  Minimum notice (hours)
                  <input
                    type="number"
                    min={0}
                    value={offer.rules?.minNoticeHours ?? ''}
                    placeholder="48"
                    onChange={(e) => updateRules({ minNoticeHours: e.target.value ? Number(e.target.value) : undefined })}
                    className="mt-0.5 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white"
                  />
                </label>
                <label className="text-[10px] text-zinc-400">
                  Unavailable dates (YYYY-MM-DD, comma-separated)
                  <input
                    value={(offer.rules?.blackoutDates || []).join(', ')}
                    placeholder="2026-07-04, 2026-12-25"
                    onChange={(e) =>
                      updateRules({ blackoutDates: e.target.value.split(',').map((d) => d.trim()).filter(Boolean) })
                    }
                    className="mt-0.5 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white"
                  />
                </label>
                <label className="text-[10px] text-zinc-400">
                  Maximum bookings per week
                  <input
                    type="number"
                    min={0}
                    value={offer.rules?.maxBookingsPerWeek ?? ''}
                    placeholder="5"
                    onChange={(e) => updateRules({ maxBookingsPerWeek: e.target.value ? Number(e.target.value) : undefined })}
                    className="mt-0.5 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white"
                  />
                </label>
              </div>
              <p className="mt-1.5 text-[9px] text-zinc-500">
                Pricing rules stay private. Offer terms, notice, unavailable dates, and booking limits are shared so agents can respect them.
              </p>
            </div>
          )}

          {/* Per-offer "Book on original site" control (Phase 4) */}
          <div className="border border-white/10 rounded-lg p-2 bg-black/20">
            <div className="flex items-center justify-between mb-1">
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={!!offer.prefer_original_for_this}
                  onChange={(e) => {
                    if (onUpdateFull) {
                      onUpdateFull(index, { prefer_original_for_this: e.target.checked });
                    } else {
                      onUpdate(index, 'prefer_original_for_this' as any, String(e.target.checked));
                    }
                  }}
                  className="size-3 accent-[var(--signal)]"
                />
                Book on original site for this offer
              </label>
              {offer.prefer_original_for_this && (
                <span className="text-[9px] text-[var(--ready)]">Original site priority</span>
              )}
            </div>
            <input
              value={offer.url}
              onChange={(e) => onUpdate(index, 'url', e.target.value)}
              placeholder="Override booking URL (optional - used when this toggle or listing-level 'Prefer original' is active)"
              className="w-full rounded border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white"
            />
            <div className="text-[9px] text-zinc-500 mt-1">When enabled, this offer directs to the original site (overrides listing default).</div>
          </div>

          {/* Consumer / Local Service Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-white/10">
            <input
              value={offer.duration || ''}
              onChange={(e) => updateConsumerField('duration', e.target.value)}
              placeholder="Duration (e.g. 60 min)"
              className="text-xs rounded border border-white/10 bg-black/30 px-2 py-1"
            />
            <input
              value={offer.serviceArea || ''}
              onChange={(e) => updateConsumerField('serviceArea', e.target.value)}
              placeholder="Service Area"
              className="text-xs rounded border border-white/10 bg-black/30 px-2 py-1"
            />
            <input
              value={offer.travelFee || ''}
              onChange={(e) => updateConsumerField('travelFee', e.target.value)}
              placeholder="Travel fee (if any)"
              className="text-xs rounded border border-white/10 bg-black/30 px-2 py-1"
            />
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              Availability
              <select
                value={offer.availability || 'available'}
                onChange={(e) => updateConsumerField('availability', e.target.value)}
                className="flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white"
              >
                <option value="available">Available</option>
                <option value="limited">Limited</option>
                <option value="sold_out">Sold out</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={!!offer.isMobile}
                onChange={(e) => updateConsumerField('isMobile', e.target.checked)}
                className="size-3 accent-[var(--signal)]"
              />
              Mobile / comes to you
            </label>
          </div>
        </div>

        <div className="mt-1 flex flex-col gap-1">
          {onDuplicate && (
            <button
              type="button"
              onClick={() => onDuplicate(index)}
              className="min-h-[44px] min-w-[44px] rounded p-2 text-[var(--signal)] hover:bg-[var(--signal)]/10 active:bg-[var(--signal)]/20 md:p-1"
              aria-label="Duplicate offer as A/B variant"
              title="Duplicate as A/B variant - visitors are split 50/50 and served one variant each; compare in Analytics → A/B Tests"
            >
              <Copy className="size-5 md:size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="min-h-[44px] min-w-[44px] rounded p-2 text-red-400 hover:bg-red-500/10 active:bg-red-500/20 md:p-1"
            aria-label="Remove offer"
            title="Remove offer"
          >
            <Trash2 className="size-5 md:size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
