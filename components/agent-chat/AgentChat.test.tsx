// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('AgentChat streaming (streamTurn)', () => {
  // A streamTurn that lets the test drive tokens, then resolves with the
  // authoritative final response.
  function deferredStream() {
    let emit!: (delta: string) => void
    let finish!: (r: { message: string; cards?: TestCard[] }) => void
    let fail!: (e: Error) => void
    const streamTurn = vi.fn(
      (_input: { text: string; mode: string }, { onToken }: { onToken: (d: string) => void }) => {
        emit = onToken
        return new Promise<{ message: string; cards?: TestCard[] }>((resolve, reject) => {
          finish = resolve
          fail = reject
        })
      },
    )
    return { streamTurn, emit: (d: string) => emit(d), finish: (r: any) => finish(r), fail: (e: Error) => fail(e) }
  }

  it('renders tokens progressively, then replaces the preview with the authoritative done', async () => {
    const s = deferredStream()
    render(<AgentChat config={makeConfig({ streamTurn: s.streamTurn as any })} />)
    await sendText('find me a photographer')

    // The generic "thinking" indicator shows before the first token.
    expect(screen.getByText(/TestBot is thinking/)).toBeInTheDocument()

    s.emit('Search')
    await waitFor(() => expect(screen.getByText('Search')).toBeInTheDocument())
    // Once tokens flow, the thinking indicator yields to the live bubble.
    expect(screen.queryByText(/TestBot is thinking/)).not.toBeInTheDocument()
    s.emit('ing offers…')
    await waitFor(() => expect(screen.getByText('Searching offers…')).toBeInTheDocument())

    // done is authoritative: the streamed preview is replaced by message + cards.
    s.finish({ message: 'Here are 2 matches.', cards: [{ id: 'c1', label: 'Card one' }] })
    await waitFor(() => expect(screen.getByText('Here are 2 matches.')).toBeInTheDocument())
    expect(screen.queryByText('Searching offers…')).not.toBeInTheDocument()
    expect(screen.getByTestId('card-c1')).toBeInTheDocument()
  })

  it('surfaces a stream error in place of the live bubble', async () => {
    const s = deferredStream()
    render(<AgentChat config={makeConfig({ streamTurn: s.streamTurn as any })} />)
    await sendText('go')
    s.emit('partial…')
    await waitFor(() => expect(screen.getByText('partial…')).toBeInTheDocument())
    s.fail(new Error('Nexxi hit a snag.'))
    await waitFor(() => expect(screen.getByText('Nexxi hit a snag.')).toBeInTheDocument())
    expect(screen.queryByText('partial…')).not.toBeInTheDocument()
  })

  it('an error before any token still shows the message (falls back to a fresh bubble)', async () => {
    const s = deferredStream()
    render(<AgentChat config={makeConfig({ streamTurn: s.streamTurn as any })} />)
    await sendText('go')
    s.fail(new Error('Rate limited.'))
    await waitFor(() => expect(screen.getByText('Rate limited.')).toBeInTheDocument())
  })

  it('uses sendTurn (non-streaming) when no streamTurn is configured', async () => {
    const sendTurn = vi.fn(async () => ({ message: 'plain reply', cards: [] }))
    const streamTurn = vi.fn()
    render(<AgentChat config={makeConfig({ sendTurn, streamTurn: undefined })} />)
    await sendText('hi')
    await waitFor(() => expect(screen.getByText('plain reply')).toBeInTheDocument())
    expect(sendTurn).toHaveBeenCalledWith({ text: 'hi', mode: 'text' })
    expect(streamTurn).not.toHaveBeenCalled()
  })
})

// Web Speech capture paths. jsdom has no SpeechRecognition, so the mock below
// stands in for the browser engine and the tests drive its event handlers in
// the REAL browser order (error is always followed by end).
class MockRecognition {
  static instances: MockRecognition[] = []
  static failStart = false
  lang = ''
  interimResults = false
  continuous = false
  onstart: (() => void) | null = null
  onresult: ((event: unknown) => void) | null = null
  onerror: (() => void) | null = null
  onend: (() => void) | null = null
  stopped = 0
  constructor() {
    MockRecognition.instances.push(this)
  }
  start() {
    if (MockRecognition.failStart) throw new DOMException('not allowed', 'NotAllowedError')
    this.onstart?.()
  }
  stop() {
    this.stopped += 1
    this.onend?.()
  }
}

function finalResult(transcript: string) {
  const result: any = [{ transcript }]
  result.isFinal = true
  return { results: [result] }
}

describe('AgentChat voice capture', () => {
  beforeEach(() => {
    MockRecognition.instances = []
    MockRecognition.failStart = false
    ;(window as any).SpeechRecognition = MockRecognition
  })
  afterEach(() => {
    delete (window as any).SpeechRecognition
    delete (window as any).webkitSpeechRecognition
  })

  const mic = () => screen.getByRole('button', { name: /voice input/i })

  it('unsupported browser (no SpeechRecognition at all) falls back to the typing notice', () => {
    delete (window as any).SpeechRecognition
    render(<AgentChat config={makeConfig()} />)
    fireEvent.click(mic())
    expect(screen.getByText('Voice input is not supported in this browser yet.')).toBeInTheDocument()
  })

  it('a final transcript is sent as a voice-mode turn', async () => {
    const sendTurn = vi.fn(async () => ({ message: 'heard you' }))
    render(<AgentChat config={makeConfig({ sendTurn })} />)
    fireEvent.click(mic())
    expect(screen.getByRole('button', { name: 'Stop voice input' })).toBeInTheDocument()
    const recognition = MockRecognition.instances[0]
    recognition.onresult?.(finalResult('book me friday'))
    await waitFor(() => expect(sendTurn).toHaveBeenCalledWith({ text: 'book me friday', mode: 'voice' }))
    expect(recognition.stopped).toBeGreaterThan(0)
    await waitFor(() => expect(screen.getByText('heard you')).toBeInTheDocument())
  })

  it('the error notice SURVIVES the end event that follows it (browsers fire error then end)', async () => {
    render(<AgentChat config={makeConfig()} />)
    fireEvent.click(mic())
    const recognition = MockRecognition.instances[0]
    recognition.onerror?.()
    recognition.onend?.()
    await waitFor(() =>
      expect(screen.getByText('Voice capture stopped. Try again or type instead.')).toBeInTheDocument(),
    )
    // and the mic returned to its idle state
    expect(screen.getByRole('button', { name: 'Start voice input' })).toBeInTheDocument()
  })

  it('a clean end (no error) clears the transient listening notice', async () => {
    render(<AgentChat config={makeConfig()} />)
    fireEvent.click(mic())
    expect(screen.getByText('Listening...')).toBeInTheDocument()
    MockRecognition.instances[0].onend?.()
    await waitFor(() => expect(screen.queryByText('Listening...')).not.toBeInTheDocument())
  })

  it('start() throwing (permission/security) degrades to a notice instead of crashing', () => {
    MockRecognition.failStart = true
    render(<AgentChat config={makeConfig()} />)
    fireEvent.click(mic())
    expect(screen.getByText('Voice capture could not start. Try again or type instead.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start voice input' })).toBeInTheDocument()
  })

  it('clicking the mic while listening stops recognition', () => {
    render(<AgentChat config={makeConfig()} />)
    fireEvent.click(mic())
    const recognition = MockRecognition.instances[0]
    fireEvent.click(screen.getByRole('button', { name: 'Stop voice input' }))
    expect(recognition.stopped).toBe(1)
    expect(screen.getByRole('button', { name: 'Start voice input' })).toBeInTheDocument()
  })

  it('webkit-prefixed engines are used when the unprefixed one is absent', () => {
    delete (window as any).SpeechRecognition
    ;(window as any).webkitSpeechRecognition = MockRecognition
    render(<AgentChat config={makeConfig()} />)
    fireEvent.click(mic())
    expect(MockRecognition.instances).toHaveLength(1)
    expect(screen.getByText('Listening...')).toBeInTheDocument()
  })
})
