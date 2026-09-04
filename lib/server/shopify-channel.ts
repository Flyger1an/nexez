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
  accountId: string
  accountName: string
  specificationHandle: string
  connectedAt: string
}

type ShopifyChannelNode = {
  id: string
  handle: string
  accountId: string
  accountName: string
  specificationHandle: string
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

async function channelById(
  credentials: ShopifyInstallCredentials,
  id: string,
): Promise<ShopifyChannelNode | null> {
  const result = await adminGraphql<{ channel: ShopifyChannelNode | null }>(
    credentials,
    `query NexezChannel($id: ID!) {
      channel(id: $id) { id handle accountId accountName specificationHandle }
    }`,
    { id },
  )
  return result.channel
}

async function channelByHandle(
  credentials: ShopifyInstallCredentials,
  handle: string,
): Promise<ShopifyChannelNode | null> {
  const result = await adminGraphql<{ channelByHandle: ShopifyChannelNode | null }>(
    credentials,
    `query NexezChannelByHandle($handle: String!) {
      channelByHandle(handle: $handle) { id handle accountId accountName specificationHandle }
    }`,
    { handle },
  )
  return result.channelByHandle
}

async function createChannel(
  credentials: ShopifyInstallCredentials,
  pageId: string,
  accountName: string,
): Promise<ShopifyChannelNode> {
  const handle = channelHandle(pageId)
  const created = await adminGraphql<{
    channelCreate: {
      channel: ShopifyChannelNode | null
      userErrors: UserError[]
    }
  }>(
    credentials,
    `mutation NexezChannelCreate($input: ChannelCreateInput!) {
      channelCreate(input: $input) {
        channel { id handle accountId accountName specificationHandle }
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

async function updateChannel(
  credentials: ShopifyInstallCredentials,
  channel: ShopifyChannelNode,
  input: { pageId: string; accountName: string; handle: string },
): Promise<ShopifyChannelNode> {
  const updated = await adminGraphql<{
    channelUpdate: {
      channel: ShopifyChannelNode | null
      userErrors: UserError[]
    }
  }>(
    credentials,
    `mutation NexezChannelUpdate($id: ID!, $input: ChannelUpdateInput!) {
      channelUpdate(id: $id, input: $input) {
        channel { id handle accountId accountName specificationHandle }
        userErrors { field message code }
      }
    }`,
    {
      id: channel.id,
      input: {
        handle: input.handle,
        specificationHandle: SHOPIFY_CHANNEL_SPECIFICATION_HANDLE,
        accountId: input.pageId,
        accountName: input.accountName,
      },
    },
  )
  throwUserErrors('Shopify could not update the Nexez sales channel', updated.channelUpdate.userErrors)
  if (!updated.channelUpdate.channel) throw new Error('Shopify did not return the updated sales channel.')
  return updated.channelUpdate.channel
}

async function resolveChannel(
  install: ShopifyInstall,
  credentials: ShopifyInstallCredentials,
  input: { pageId: string; accountName?: string },
): Promise<{ channel: ShopifyChannelNode; changed: boolean }> {
  const expectedHandle = channelHandle(input.pageId)
  const expectedAccountName = input.accountName?.trim().slice(0, 120) || null
  let channel = install.channel_id
    ? await channelById(credentials, install.channel_id)
    : null

  if (!channel || channel.handle !== expectedHandle) {
    const expectedChannel = await channelByHandle(credentials, expectedHandle)
    if (expectedChannel) channel = expectedChannel
  }

  if (!channel) {
    return {
      channel: await createChannel(credentials, input.pageId, expectedAccountName || 'Nexez catalog'),
      changed: true,
    }
  }

  const needsUpdate = channel.handle !== expectedHandle
    || channel.specificationHandle !== SHOPIFY_CHANNEL_SPECIFICATION_HANDLE
    || channel.accountId !== input.pageId
    || (expectedAccountName !== null && channel.accountName !== expectedAccountName)
  if (!needsUpdate) return { channel, changed: false }

  return {
    channel: await updateChannel(credentials, channel, {
      pageId: input.pageId,
      accountName: expectedAccountName || channel.accountName,
      handle: expectedHandle,
    }),
    changed: true,
  }
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
      `mutation NexezProductFeedWebhook($topic: WebhookSubscriptionTopic!, $uri: String!) {
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
  input: { pageId: string; accountName?: string; startFullSync?: boolean },
): Promise<ShopifyChannelConnection> {
  const resolved = await resolveChannel(install, credentials, input)
  const channel = resolved.channel

  if (resolved.changed || input.startFullSync !== false) {
    await ensureProductFeedSubscriptions(credentials)
    await triggerFullSync(credentials, channel.id)
  }

  const connectedAt = new Date().toISOString()
  let save = admin
    .from('shopify_installs')
    .update({
      channel_id: channel.id,
      channel_handle: channel.handle,
      channel_specification_handle: SHOPIFY_CHANNEL_SPECIFICATION_HANDLE,
      channel_connected_at: connectedAt,
      updated_at: connectedAt,
    })
    .eq('shop_domain', install.shop_domain)
    .eq('page_id', input.pageId)
    .is('mapping_transition_token', null)
    .is('uninstalled_at', null)
  if (Number.isSafeInteger(install.mapping_generation) && Number(install.mapping_generation) > 0) {
    save = save.eq('mapping_generation', Number(install.mapping_generation))
  }
  const { data: saved, error } = await save
    .select('shop_domain')
    .maybeSingle<{ shop_domain: string }>()
  if (error) throw new Error('Could not save the Shopify sales channel connection.')
  if (!saved) throw new Error('The Shopify listing connection changed while the sales channel was being verified.')

  return {
    id: channel.id,
    handle: channel.handle,
    accountId: channel.accountId,
    accountName: channel.accountName,
    specificationHandle: SHOPIFY_CHANNEL_SPECIFICATION_HANDLE,
    connectedAt,
  }
}
