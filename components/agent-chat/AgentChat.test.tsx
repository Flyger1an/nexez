// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import { AgentChat } from './AgentChat'
import type { AgentChatConfig, AgentChatController } from './types'

type TestCard = { id: string; label: string; action?: boolean }

function makeConfig(overrides: Partial<AgentChatConfig<TestCard>> = {}): AgentChatConfig<TestCard> {
  return {
    agentName: 'TestBot',
    badge: 'test agent',
    tagline: 'Testing things.',
    welcome: 'Hello from TestBot.',
    starters: ['Starter one', 'Starter two'],
    placeholder: 'Say something...',
    footnote: 'TestBot footnote.',
    errorFallback: 'TestBot fell over.',
    sendTurn: vi.fn(async () => ({ message: 'reply', cards: [] })),
    cardKey: (card) => card.id,
    renderCard: (card, controller) => <TestCardView card={card} controller={controller} />,
    ...overrides,
  }
}

function TestCardView({ card, controller }: { card: TestCard; controller: AgentChatController<TestCard> }) {
  return (
    <div data-testid={`card-${card.id}`}>
      {card.label}
      {card.action ? (
        <button
          type="button"
          onClick={() => void controller.runAction('Working...', async () => ({ message: 'action done' }))}
        >
          Run action
        </button>
      ) : null}
    </div>
  )
}

async function sendText(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Say something...'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
}

describe('AgentChat primitive', () => {
  it('renders the configured identity: name, badge, tagline, welcome, starters, footnote', () => {
    render(<AgentChat config={makeConfig()} />)
    expect(screen.getByRole('heading', { name: 'TestBot' })).toBeInTheDocument()
    expect(screen.getByText('test agent')).toBeInTheDocument()
    expect(screen.getByText('Testing things.')).toBeInTheDocument()
    expect(screen.getByText('Hello from TestBot.')).toBeInTheDocument()
    expect(screen.getByText('Starter one')).toBeInTheDocument()
    expect(screen.getByText('TestBot footnote.')).toBeInTheDocument()
  })

  it('sends a typed turn and renders the reply', async () => {
    const sendTurn = vi.fn(async () => ({ message: 'Here is my reply.', cards: [] }))
    render(<AgentChat config={makeConfig({ sendTurn })} />)
    await sendText('hello there')
    await waitFor(() => expect(screen.getByText('Here is my reply.')).toBeInTheDocument())
    expect(sendTurn).toHaveBeenCalledWith({ text: 'hello there', mode: 'text' })
    expect(screen.getByText('hello there')).toBeInTheDocument() // the user bubble
  })

  it('clicking a starter sends it as a turn', async () => {
    const sendTurn = vi.fn(async () => ({ message: 'starter reply' }))
    render(<AgentChat config={makeConfig({ sendTurn })} />)
    fireEvent.click(screen.getByText('Starter one'))
    await waitFor(() => expect(sendTurn).toHaveBeenCalledWith({ text: 'Starter one', mode: 'text' }))
  })

  it('renders cards through the injected renderer and hides starters once cards exist', async () => {
    const sendTurn = vi.fn(async () => ({ message: 'with cards', cards: [{ id: 'c1', label: 'Card one' }] }))
    render(<AgentChat config={makeConfig({ sendTurn })} />)
    await sendText('show cards')
    await waitFor(() => expect(screen.getByTestId('card-c1')).toBeInTheDocument())
    expect(screen.queryByText('Starter one')).not.toBeInTheDocument()
  })

  it('a failed turn surfaces the error message, falling back to the configured copy', async () => {
    const sendTurn = vi.fn(async () => {
      throw new Error('Backend said no.')
    })
    render(<AgentChat config={makeConfig({ sendTurn })} />)
    await sendText('break please')
    await waitFor(() => expect(screen.getByText('Backend said no.')).toBeInTheDocument())

    const sendTurnBare = vi.fn(async () => {
      throw new Error('')
    })
    render(<AgentChat config={makeConfig({ sendTurn: sendTurnBare })} />)
    const inputs = screen.getAllByPlaceholderText('Say something...')
    fireEvent.change(inputs[inputs.length - 1], { target: { value: 'again' } })
    const sends = screen.getAllByRole('button', { name: 'Send message' })
    fireEvent.click(sends[sends.length - 1])
    await waitFor(() => expect(screen.getByText('TestBot fell over.')).toBeInTheDocument())
  })

  it('card-initiated runAction appends the action response like an agent turn', async () => {
    const sendTurn = vi.fn(async () => ({ message: 'with action card', cards: [{ id: 'c2', label: 'Actionable', action: true }] }))
    render(<AgentChat config={makeConfig({ sendTurn })} />)
    await sendText('go')
    await waitFor(() => expect(screen.getByTestId('card-c2')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Run action' }))
    await waitFor(() => expect(screen.getByText('action done')).toBeInTheDocument())
  })

  it('the send button is disabled while the input is empty', () => {
    render(<AgentChat config={makeConfig()} />)
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('a quick-prompt window event prefills the composer when configured', () => {
    render(<AgentChat config={makeConfig({ quickPromptEvent: 'test:quick-prompt' })} />)
    fireEvent(window, new CustomEvent('test:quick-prompt', { detail: 'prefilled text' }))
    expect(screen.getByPlaceholderText('Say something...')).toHaveValue('prefilled text')
  })

  it('voice: false hides the mic affordance', () => {
    render(<AgentChat config={makeConfig({ voice: false })} />)
    expect(screen.queryByRole('button', { name: 'Start voice input' })).not.toBeInTheDocument()
  })
})
