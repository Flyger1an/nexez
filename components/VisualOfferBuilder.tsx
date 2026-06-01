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

import React from 'react'
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
import type { OfferItem } from '../lib/agent-page'

export type OfferKind = 'services' | 'products'

interface VisualOfferBuilderProps {
  offers: OfferItem[]
  kind: OfferKind
  onChange: (offers: OfferItem[]) => void
  onAddFromTemplate?: (template: OfferItem) => void
}

const SERVICE_TEMPLATES: OfferItem[] = [
  {
    name: 'Strategy Session',
    price: '$450',
    description: '60-minute focused session. Clear deliverables, recommendations, and next-step plan. Best for founders and leadership teams with a specific growth or positioning goal.',
    url: '',
  },
  {
    name: 'Implementation Retainer',
    price: 'From $1,800/mo',
    description: 'Ongoing execution support. Includes priority access, monthly reviews, and direct help shipping the strategy we defined together.',
    url: '',
  },
  {
    name: 'Discovery & Roadmap Workshop',
    price: '$1,200',
    description: 'Half-day workshop to map your current state, identify gaps, and produce a prioritized 90-day roadmap with clear owners and milestones.',
    url: '',
  },
]

const PRODUCT_TEMPLATES: OfferItem[] = [
  {
    name: 'Founder OS Template Pack',
    price: '$99',
    description: 'Notion + Google Sheets system for running a services business. Includes offer builder, pipeline tracker, and client onboarding flows.',
    url: '',
  },
  {
    name: 'Agent-Ready Service Blueprint',
    price: '$149',
    description: 'Complete framework + templates to turn any service into a structured, AI-optimized offer page that converts agents and humans.',
    url: '',
  },
]

export function VisualOfferBuilder({ offers, kind, onChange }: VisualOfferBuilderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
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

  function updateOffer(index: number, field: keyof OfferItem, value: string) {
    const next = [...offers]
    next[index] = { ...next[index], [field]: value }
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
              className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-1.5 text-left text-xs text-cyan-200 hover:bg-white/10"
            >
              + {tpl.name}
            </button>
          ))}
          <button
            type="button"
            onClick={addBlank}
            className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
          >
            <Plus className="mr-1 inline size-3" /> Blank offer
          </button>
        </div>
      </div>

      {/* Draggable List */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={offers.map((o, i) => getOfferId(o, i))}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {offers.length === 0 && (
              <div className="rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500">
                No offers yet. Add from templates above or create a blank one.
              </div>
            )}
            {offers.map((offer, index) => (
              <SortableOfferCard
                key={getOfferId(offer, index)}
                id={getOfferId(offer, index)}
                offer={offer}
                index={index}
                onUpdate={updateOffer}
                onRemove={removeOffer}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

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
}: {
  id: string
  offer: OfferItem
  index: number
  onUpdate: (index: number, field: keyof OfferItem, value: string) => void
  onRemove: (index: number) => void
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
          className="mt-2 cursor-grab text-zinc-500 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>

        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              value={offer.name}
              onChange={(e) => onUpdate(index, 'name', e.target.value)}
              placeholder="Offer name"
              className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <input
              value={offer.price}
              onChange={(e) => onUpdate(index, 'price', e.target.value)}
              placeholder="Price (e.g. $450 or From $1,800/mo)"
              className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>

          <textarea
            value={offer.description}
            onChange={(e) => onUpdate(index, 'description', e.target.value)}
            placeholder="Clear description optimized for agents and buyers. What do they get? Who is it for?"
            className="min-h-[72px] w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />

          <input
            value={offer.url}
            onChange={(e) => onUpdate(index, 'url', e.target.value)}
            placeholder="Direct booking / checkout URL for this offer (optional)"
            className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </div>

        <button
          type="button"
          onClick={() => onRemove(index)}
          className="mt-1 rounded p-1 text-red-400 hover:bg-red-500/10"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  )
}
