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
import { GripVertical, Plus, Trash2, Sparkles } from 'lucide-react'
import type { OfferItem, PricingTier } from '../lib/agent-page'
import { enhanceDescriptionForAgents } from '../lib/ai-optimize'

export type OfferKind = 'services' | 'products'

interface VisualOfferBuilderProps {
  offers: OfferItem[]
  kind: OfferKind
  onChange: (offers: OfferItem[]) => void
  onAddFromTemplate?: (template: OfferItem) => void
  // Phase 1 A: context for smarter per-card AI enhancement
  businessName?: string
  audience?: string
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
    serviceArea: 'Mobile — we come to you',
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

export function VisualOfferBuilder({ offers, kind, onChange, businessName, audience }: VisualOfferBuilderProps) {
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

  return (
    <div className="space-y-4">
      {/* Templates */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
          <Sparkles className="size-4 text-cyan-300" />
          Rich Service Templates
        </div>
        <div className="flex flex-wrap gap-2">
          {templates.map((tpl, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => addTemplate(tpl)}
              className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-left text-xs text-cyan-200 hover:bg-white/10 active:bg-white/10 md:py-1.5"
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
        const filteredOffers = sourceFilter === 'all' 
          ? offers 
          : offers.filter(o => o.source === sourceFilter)

        return (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={filteredOffers.map((o, i) => getOfferId(o, i))}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {filteredOffers.length === 0 && (
                  <div className="rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500">
                    No offers match the current filter.
                  </div>
                )}
                {filteredOffers.map((offer, index) => {
                  const originalIndex = offers.findIndex((o, i) => getOfferId(o, i) === getOfferId(offer, index))
                  return (
                    <SortableOfferCard
                      key={getOfferId(offer, index)}
                      id={getOfferId(offer, index)}
                      offer={offer}
                      index={originalIndex}
                      onUpdate={updateOffer}
                      onRemove={removeOffer}
                      onUpdateFull={updateFullOffer}
                      businessName={businessName}
                      audience={audience}
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
  onUpdateFull,
  businessName,
  audience,
}: {
  id: string
  offer: OfferItem
  index: number
  onUpdate: (index: number, field: keyof OfferItem, value: string) => void
  onRemove: (index: number) => void
  onUpdateFull?: (index: number, updated: Partial<OfferItem>) => void
  businessName?: string
  audience?: string
}) {
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
        >
          <GripVertical className="size-5 md:size-4" />
        </button>

        <div className="flex-1 space-y-3">
          {/* Basic Info */}
          <div className="relative grid grid-cols-1 gap-3 md:grid-cols-2">
            {typeof offer.confidence === 'number' && (
              <span className="absolute -top-1.5 right-0 rounded bg-emerald-400/10 px-1.5 py-px text-[9px] font-medium text-emerald-300">
                {Math.round(offer.confidence * 100)}% match
              </span>
            )}
            {offer.source && (
              <span className={`absolute -top-1.5 right-20 rounded px-1.5 py-px text-[9px] font-medium ${
                offer.source === 'stripe' ? 'bg-cyan-400/10 text-cyan-300' : 
                offer.source === 'shopify' ? 'bg-purple-400/10 text-purple-300' : 
                offer.source === 'square' ? 'bg-pink-400/10 text-pink-300' :
                offer.source === 'acuity' ? 'bg-orange-400/10 text-orange-300' :
                'bg-violet-400/10 text-violet-300'
              }`}>
                via {offer.source}
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
            <button
              type="button"
              onClick={() => {
                const bn = businessName || 'This business'
                const aud = audience || 'qualified buyers'
                const enhanced = enhanceDescriptionForAgents(offer.description || '', bn, aud)
                if (onUpdateFull) {
                  onUpdateFull(index, { description: enhanced })
                } else {
                  onUpdate(index, 'description', enhanced)
                }
              }}
              className="absolute top-2 right-2 text-[10px] flex items-center gap-1 rounded border border-cyan-300/40 bg-black/50 px-1.5 py-0.5 text-cyan-300 hover:bg-cyan-300/10"
              title="Enhance this offer description for AI agents"
            >
              <Sparkles className="size-3" /> Enhance
            </button>
          </div>

          {/* Pricing Tiers */}
          <div className="border border-white/10 rounded-lg p-3 bg-black/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#C4B5FD]">Pricing Tiers</span>
              <button type="button" onClick={addTier} className="text-xs text-cyan-300 hover:text-cyan-200">+ Add Tier</button>
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
                    <button onClick={() => {
                      const newTiers = tiers.filter((_, i) => i !== tIndex);
                      onUpdateFull ? onUpdateFull(index, { tiers: newTiers }) : onUpdate(index, 'description', JSON.stringify({ __tiers: newTiers }));
                    }} className="text-red-400 py-1 sm:col-span-1">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

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
                  className="size-3 accent-[#7C3AED]"
                />
                Book on original site for this offer
              </label>
              {offer.prefer_original_for_this && (
                <span className="text-[9px] text-emerald-300">Original site priority</span>
              )}
            </div>
            <input
              value={offer.url}
              onChange={(e) => onUpdate(index, 'url', e.target.value)}
              placeholder="Override booking URL (optional — used when this toggle or page-level 'Prefer original' is active)"
              className="w-full rounded border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white"
            />
            <div className="text-[9px] text-zinc-500 mt-1">When enabled, this offer directs to the original site (overrides page default).</div>
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
              <input
                type="checkbox"
                checked={!!offer.isMobile}
                onChange={(e) => updateConsumerField('isMobile', e.target.checked)}
                className="size-3 accent-[#7C3AED]"
              />
              Mobile / comes to you
            </label>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onRemove(index)}
          className="mt-1 min-h-[44px] min-w-[44px] rounded p-2 text-red-400 hover:bg-red-500/10 active:bg-red-500/20 md:mt-1 md:p-1"
          aria-label="Remove offer"
        >
          <Trash2 className="size-5 md:size-4" />
        </button>
      </div>
    </div>
  )
}
