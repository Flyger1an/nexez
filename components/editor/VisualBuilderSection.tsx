import { formatOfferLines } from '../../lib/agent-page'
import { AICoPilot } from '../AICoPilot'
import { VisualOfferBuilder } from '../VisualOfferBuilder'
import { ConditionalFulfillmentManager } from './ConditionalFulfillmentManager'
import { PageEditor } from './usePageEditor'
import { RecurringServiceManager } from './RecurringServiceManager'

export function VisualBuilderSection({ e }: { e: PageEditor }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-200">Visual Builder (Drag & Drop + Templates)</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={e.optimizeOffersWithAI}
            className="rounded-lg border border-[var(--signal)]/40 px-3 py-1 text-xs text-[var(--signal)] hover:bg-[var(--signal)]/10"
          >
            AI Optimize All
          </button>
          <button
            type="button"
            onClick={e.enhanceAllOffers}
            className="rounded-lg border border-[var(--signal)]/40 px-3 py-1 text-xs text-[var(--signal)] hover:bg-[var(--signal)]/10"
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
        <p className="mb-3 text-xs uppercase tracking-widest text-[var(--signal)]">Services</p>
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

      <RecurringServiceManager
        offers={e.parsedServices}
        onChange={(newOffers) => {
          e.setServicesOffers(newOffers)
          e.setServices(formatOfferLines(newOffers))
          e.setMessage('Recurring service contract updated. Save the listing to publish it.')
        }}
      />

      <ConditionalFulfillmentManager
        offers={e.parsedServices}
        onChange={(newOffers) => {
          e.setServicesOffers(newOffers)
          e.setServices(formatOfferLines(newOffers))
          e.setMessage('Conditional fulfillment policy updated. Save the listing to publish it.')
        }}
      />

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <p className="mb-3 text-xs uppercase tracking-widest text-[var(--signal)]">Products</p>
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