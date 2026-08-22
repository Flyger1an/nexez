import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../../utils/supabase/admin'

const APPROVAL_LEDGER = 'agent_action_approvals'

type ApprovalClientFactory = () => SupabaseClient

/**
 * Keep the Nexie turn RLS-bound for every buyer-owned table while routing only the
 * approval ledger through a server-only service-role client.
 *
 * Browser/mobile clients never receive this proxy. The authenticated request is
 * resolved first, and the privileged client is created lazily only if the turn
 * actually reads or writes an approval. Database grants and the approval state
 * machine remain the final authority.
 */
export function createNexieTurnDb(
  userDb: SupabaseClient,
  approvalClientFactory: ApprovalClientFactory = createAdminClient,
): SupabaseClient {
  let approvalDb: SupabaseClient | null = null

  const from = (relation: string) => {
    if (relation !== APPROVAL_LEDGER) return userDb.from(relation)
    approvalDb ??= approvalClientFactory()
    return approvalDb.from(relation)
  }

  return new Proxy(userDb, {
    get(target, property) {
      if (property === 'from') return from
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as SupabaseClient
}
