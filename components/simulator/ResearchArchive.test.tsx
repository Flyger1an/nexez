// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '../../test/dom'
import { describe, expect, it, vi } from 'vitest'
import type { AgentLabResearchRun } from '../../lib/agent-lab-research'
import { ResearchArchive } from './ResearchArchive'

const runs: AgentLabResearchRun[] = [
  {
    id: 'new', kind: 'url_snapshot', targetUrl: 'https://example.test', targetHost: 'example.test',
    comparedPageId: null, comparedPageSlug: null, result: { agentReady: { readiness: 70 } } as any,
    evidence: {} as any, createdAt: '2026-08-21T00:00:00.000Z',
  },
  {
    id: 'old', kind: 'url_snapshot', targetUrl: 'https://example.test', targetHost: 'example.test',
    comparedPageId: null, comparedPageSlug: null, result: { agentReady: { readiness: 65 } } as any,
    evidence: {} as any, createdAt: '2026-08-20T00:00:00.000Z',
  },
]

describe('ResearchArchive', () => {
  it('shows target tracking and score movement', () => {
    render(
      <ResearchArchive
        title="Saved scans"
        description="Tracked history"
        empty="No history"
        runs={runs}
        loading={false}
        itemName="scan"
        onLoad={vi.fn()}
        onRemove={vi.fn(async () => true)}
      />,
    )

    expect(screen.getByLabelText('Research trend summary')).toHaveTextContent('Targets1With trend1Movement↑1')
    expect(screen.getByText('+5 score since prior snapshot')).toBeInTheDocument()
    expect(screen.getByText('Baseline snapshot')).toBeInTheDocument()
  })

  it('requires confirmation and keeps the item when removal fails', async () => {
    const remove = vi.fn(async () => false)
    render(
      <ResearchArchive
        title="Saved scans"
        description="Tracked history"
        empty="No history"
        runs={[runs[0]]}
        loading={false}
        itemName="scan"
        onLoad={vi.fn()}
        onRemove={remove}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove saved scan for example.test' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove scan' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('new'))
    expect(screen.getByRole('button', { name: 'Remove scan' })).toBeInTheDocument()
  })
})
