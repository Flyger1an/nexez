export type TeamApproval = {
  id: string
  approver: string
  status: 'pending' | 'approved' | 'rejected'
  note?: string
  ts: string
  [key: string]: unknown
}

export type TeamCollaboration = {
  approvals?: TeamApproval[]
  [key: string]: unknown
}

export class TeamApprovalRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'TeamApprovalRequestError'
  }
}

export async function mutateTeamApproval(input: {
  pageId: string
  action: 'request' | 'approve_all' | 'clear'
  note?: string
  fetchImpl?: typeof fetch
}): Promise<TeamCollaboration> {
  const response = await (input.fetchImpl ?? fetch)(`/api/pages/${input.pageId}/team-approvals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: input.action, ...(input.note ? { note: input.note } : {}) }),
  })
  const data = (await response.json().catch(() => ({}))) as {
    error?: string
    code?: string
    teamCollaboration?: TeamCollaboration
  }
  if (!response.ok || !data.teamCollaboration) {
    throw new TeamApprovalRequestError(
      data.error || 'Team approval could not be updated.',
      response.status,
      data.code,
    )
  }
  return data.teamCollaboration
}
