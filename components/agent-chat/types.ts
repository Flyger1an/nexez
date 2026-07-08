// Shared agent-chat primitive - types (spec §6: one chat system, two agents).
// The shell owns the conversation mechanics (message list, busy states, starter
// prompts, mic affordance, input form); each agent parameterizes endpoint
// behavior via sendTurn and its own card renderers. No agent logic lives here.
import type { ReactNode } from 'react'

export type AgentChatMessage<TCard> = {
  id: string
  role: 'assistant' | 'user'
  content: string
  cards?: TCard[]
}

export type AgentTurnResponse<TCard> = {
  message: string
  cards?: TCard[]
}

/** Handed to card renderers so cards can drive the conversation (approve /
 *  decline, quick prompts) without owning any chat state. */
export type AgentChatController<TCard> = {
  busy: boolean
  /** Prefill the composer (e.g. a card's suggested prompt). */
  setInput: (text: string) => void
  /** Send a text turn immediately. */
  send: (text: string) => void
  /** Run a card-initiated action (e.g. an approval decision); the response is
   *  appended to the conversation like any agent turn. */
  runAction: (notice: string, action: () => Promise<AgentTurnResponse<TCard>>) => Promise<void>
}

export type AgentChatConfig<TCard> = {
  /** Shown in the header, the assistant chip, and the thinking indicator. */
  agentName: string
  badge?: string
  tagline?: string
  welcome: string
  starters?: string[]
  placeholder?: string
  footnote?: string
  headerIcon?: ReactNode
  /** Optional window CustomEvent<string> name that prefills the composer
   *  (kept for existing integrations like 'nexie:quick-prompt'). */
  quickPromptEvent?: string
  /** Fallback error copy when a turn fails without a message. */
  errorFallback?: string
  /** Seed the conversation (e.g. resuming a persisted session, or an opening
   *  agent turn with cards). When present it replaces the default welcome. */
  initialMessages?: AgentChatMessage<TCard>[]
  /** Show the mic affordance (Web Speech API where available). */
  voice?: boolean
  sendTurn: (input: { text: string; mode: 'text' | 'voice' }) => Promise<AgentTurnResponse<TCard>>
  /** Optional streaming variant of a turn. When present, the shell renders the
   *  agent's reply progressively (each `onToken` delta grows the live bubble)
   *  and then replaces that preview with the resolved response — which is
   *  AUTHORITATIVE (message + cards), since the streamed preview can differ
   *  (e.g. a pre-tool-call preamble). Falls back to `sendTurn` when absent.
   *  Card-initiated actions (runAction) always use the non-streaming path. */
  streamTurn?: (
    input: { text: string; mode: 'text' | 'voice' },
    handlers: { onToken: (delta: string) => void },
  ) => Promise<AgentTurnResponse<TCard>>
  renderCard: (card: TCard, controller: AgentChatController<TCard>) => ReactNode
  cardKey: (card: TCard) => string
}
