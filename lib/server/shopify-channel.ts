import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { appUrl } from '../site'
import { SHOPIFY_API_VERSION } from './shopify'
import type { ShopifyInstall, ShopifyInstallCredentials } from './shopify-install'

export const SHOPIFY_CHANNEL_SPECIFICATION_HANDLE = 'nexez-us'
const SHOPIFY_CHANNEL_TIMEOUT_MS = 12_000
const PRODUCT_FEED_TOPICS = [
  'PRODUCT_FEEDS_FULL_SYNC',
  'PRODUCT_FEEDS_FULL_SYNC_FINISH',
  'PRODUCT_FEEDS_INCREMENTAL_SYNC',
  'PRODUCT_FEEDS_UPDATE',
] as const

type UserError = { field?: string[] | null; message: string; code?: string | null }

type GraphqlEnvelope<T> = {
  data?: T
  errors?: Array<{ message?: string }>
}

export type ShopifyChannelConnection = {
  id: string
  handle: string
  specificationHandle: string
  connectedAt: string
}

function channelHandle(pageId: string): string {
  return `nexez-${pageId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`.slice(0, 64)
}

async function adminGraphql<T>(
  credentials: ShopifyInstallCredentials,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SHOPIFY_CHANNEL_TIMEOUT_MS)
  try {
    const response = await fetch(
      `https://${credentials.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-shopify-access-token': credentials.accessToken,
        },
        body: JSON.stringify({ query, variables }),
        redirect: 'error',
        signal: controller.signal,
      },
    )
    if (!response.ok) throw new Error(`Shopify Admin API returned ${response.status}.`)
    const payload = await response.json() as GraphqlEnvelope<T>
    if (!payload.data || payload.errors?.length) {
      throw new Error(payload.errors?.[0]?.message || 'Shopify Admin API returned an incomplete response.')
    }
    return payload.data
  } finally {
    clearTimeout(timer)
  }
}

function throwUserErrors(operation: string, errors: UserError[] | null | undefined): void {
  if (!errors?.length) return
  throw new Error(`${operation}: ${errors.map((error) => error.message).join(' ')}`)
}

async function createOrLoadChannel(
  credentials: ShopifyInstallCredentials,
  pageId: string,
  accountName: string,
): Promise<{ id: string; handle: string }> {
  const handle = channelHandle(pageId)
  const existing = await adminGraphql<{
    channelByHandle: { id: string; handle: string } | null
  }>(
    credentials,
    `query NexezChannelByHandle($handle: String!) {
      channelByHandle(handle: $handle) { id handle }
    }`,
    { handle },
  )
  if (existing.channelByHandle) return existing.channelByHandle

  const created = await adminGraphql<{
    channelCreate: {
      channel: { id: string; handle: string } | null
      userErrors: UserError[]
    }
  }>(
    credentials,
    `mutation NexezChannelCreate($input: ChannelCreateInput!) {
      channelCreate(input: $input) {
        channel { id handle }
        userErrors { field message code }
      }
    }`,
    {
      input: {
        handle,
        specificationHandle: SHOPIFY_CHANNEL_SPECIFICATION_HANDLE,
        accountId: pageId,
        accountName: accountName.slice(0, 120),
      },
    },
  )
  throwUserErrors('Shopify could not create the Nexez sales channel', created.channelCreate.userErrors)
  if (!created.channelCreate.channel) throw new Error('Shopify did not return the new sales channel.')
  return created.channelCreate.channel
}

async function ensureProductFeedSubscriptions(credentials: ShopifyInstallCredentials): Promise<void> {
  const uri = appUrl('/api/webhooks/shopify')
  for (const topic of PRODUCT_FEED_TOPICS) {
    const result = await adminGraphql<{
      webhookSubscriptionCreate: {
        webhookSubscription: { id: string; topic: string; uri: string } | null
        userErrors: UserError[]
      }
    }>(
      credentials,
      `mutation NexezProductFeedWebhook($topic: WebhookSubscriptionTopic!, $uri: URL!) {
        webhookSubscriptionCreate(
          topic: $topic
          webhookSubscription: { uri: $uri, format: JSON }
        ) {
          webhookSubscription { id topic uri }
          userErrors { field message }
        }
      }`,
      { topic, uri },
    )
    const errors = result.webhookSubscriptionCreate.userErrors
    const onlyDuplicateErrors = errors.length > 0 && errors.every((error) => /already|taken|exists/i.test(error.message))
    if (!onlyDuplicateErrors) throwUserErrors(`Shopify could not subscribe to ${topic}`, errors)
  }
}

async function triggerFullSync(credentials: ShopifyInstallCredentials, channelId: string): Promise<void> {
  const result = await adminGraphql<{
    channelFullSync: {
      fullSyncTraceInfo: Array<{ operationId: string; country: string; language: string }>
      userErrors: UserError[]
    }
  }>(
    credentials,
    `mutation NexezChannelFullSync($channelId: ID!) {
      channelFullSync(channelId: $channelId) {
        fullSyncTraceInfo { operationId country language }
        userErrors { message }
      }
    }`,
    { channelId },
  )
  throwUserErrors('Shopify could not start the Nexez product feed sync', result.channelFullSync.userErrors)
}

export async function ensureShopifySalesChannel(
  admin: Pick<SupabaseClient, 'from'>,
  install: ShopifyInstall,
  credentials: ShopifyInstallCredentials,
  input: { pageId: string; accountName: string },
): Promise<ShopifyChannelConnection> {
  const channel = install.channel_id && install.channel_handle
    ? { id: install.channel_id, handle: install.channel_handle }
    : await createOrLoadChannel(credentials, input.pageId, input.accountName)

  await ensureProductFeedSubscriptions(credentials)
  await triggerFullSync(credentials, channel.id)

  const connectedAt = new Date().toISOString()
  const { error } = await admin
    .from('shopify_installs')
    .update({
      channel_id: channel.id,
      channel_handle: channel.handle,
      channel_specification_handle: SHOPIFY_CHANNEL_SPECIFICATION_HANDLE,
      channel_connected_at: connectedAt,
      updated_at: connectedAt,
    })
    .eq('shop_domain', install.shop_domain)
    .is('uninstalled_at', null)
  if (error) throw new Error('Could not save the Shopify sales channel connection.')

  return {
    id: channel.id,
    handle: channel.handle,
    specificationHandle: SHOPIFY_CHANNEL_SPECIFICATION_HANDLE,
    connectedAt,
  }
}
