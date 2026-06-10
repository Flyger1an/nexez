import { formatOfferLines } from '../../lib/agent-page'
import { AICoPilot } from '../AICoPilot'
import { VisualOfferBuilder } from '../VisualOfferBuilder'
import { PageEditor } from './usePageEditor'

export function VisualBuilderSection({ e }: { e: PageEditor }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-200">Visual Builder (Drag & Drop + Templates)</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={e.optimizeOffersWithAI}
            className="rounded-lg border border-cyan-300/40 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-300/10"
          >
            AI Optimize All
          </button>
          <button
            type="button"
            onClick={e.enhanceAllOffers}
            className="rounded-lg border border-cyan-300/40 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-300/10"
          >
            Enhance All
          </button>
        </div>
      </div>

      {/* Phase 7 Co-Pilot: before/after + pricing/FAQ/schema suggestions + usage tracking */}
      <AICoPilot
        businessName={e.name}
        audience={e.audience}
        servicesOffers={e.servicesOffers}
        productsOffers={e.productsOffers}
        onApplyServices={(text, offers) => {
          e.setServicesOffers(offers)
          e.setServices(text)
          e.setMessage('Co-Pilot suggestion applied to services.')
        }}
        onApplyProducts={(text, offers) => {
          e.setProductsOffers(offers)
          e.setProducts(text)
          e.setMessage('Co-Pilot suggestion applied to products.')
        }}
        onTrackUse={() => {
          e.setMessage((m) => (m || '') + ' (AI Co-Pilot use tracked)')
        }}
        llmOptIn={(e.page as any)?.llm_opt_in || false}
        pageId={e.id}
      />

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <p className="mb-3 text-xs uppercase tracking-widest text-cyan-300">Services</p>
        <VisualOfferBuilder
          offers={e.parsedServices}
          kind="services"
          pageId={e.id}
          businessName={e.name}
          audience={e.audience}
          onChange={(newOffers) => {
            e.setServicesOffers(newOffers)
            e.setServices(formatOfferLines(newOffers))
          }}
        />
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <p className="mb-3 text-xs uppercase tracking-widest text-cyan-300">Products</p>
        <VisualOfferBuilder
          offers={e.parsedProducts}
          kind="products"
          pageId={e.id}
          businessName={e.name}
          audience={e.audience}
          onChange={(newOffers) => {
            e.setProductsOffers(newOffers)
            e.setProducts(formatOfferLines(newOffers))
          }}
        />
      </div>
    </div>
  )
}
