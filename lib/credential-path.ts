import type { CredentialRecord } from './agent-page'

/** Bind a storage capability to its owner, page, document ID, and file type. */
export function credentialPathBelongsToPage(
  record: Pick<CredentialRecord, 'id' | 'file_path'>,
  ownerId: string,
  pageId: string,
): boolean {
  if (![ownerId, pageId, record.id].every((id) => typeof id === 'string' && /^[a-zA-Z0-9-]+$/.test(id))) return false
  const prefix = `${ownerId}/${pageId}/${record.id}.`
  return typeof record.file_path === 'string'
    && record.file_path.startsWith(prefix)
    && /^(pdf|png|jpg|jpeg|webp)$/.test(record.file_path.slice(prefix.length))
}
