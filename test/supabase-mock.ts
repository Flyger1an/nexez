import { vi } from 'vitest'

/** A single resolved query result, mirroring supabase-js `{ data, error }`. */
export type MockResult = { data?: any; error?: any }

/** Context handed to the response handler for every resolved query. */
export type QueryContext = {
  table: string
  /** The mutating verb, or 'select' for reads. */
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
  /** Column → value for every `.eq(col, val)` applied (last wins per column). */
  eqs: Record<string, any>
  /** Ordered log of every builder call: `[method, ...args]`. */
  calls: Array<[string, ...any[]]>
  /** Payload passed to insert/update/upsert. */
  payload?: any
}

export type QueryHandler = (ctx: QueryContext) => MockResult

export type SupabaseMockOptions = {
  /** Returned by `auth.getUser()` as `{ data: { user }, error: userError }`. */
  user?: any
  userError?: any
}

/**
 * Build a chainable, awaitable Supabase client mock for route-handler tests.
 *
 * Every query-builder method returns the builder; awaiting it (or calling
 * `.single()` / `.maybeSingle()`) invokes `handler(ctx)` and resolves to its
 * `{ data, error }`. Lets each test declare exactly what the DB returns for a
 * given table/op without standing up a database.
 */
export function createSupabaseMock(handler: QueryHandler, opts: SupabaseMockOptions = {}) {
  const fromMock = vi.fn((table: string) => {
    const ctx: QueryContext = { table, op: 'select', eqs: {}, calls: [] }
    const resolve = () => Promise.resolve(handler(ctx))

    const builder: any = {
      // read / projection
      select: (...args: any[]) => (ctx.calls.push(['select', ...args]), builder),
      order: (...args: any[]) => (ctx.calls.push(['order', ...args]), builder),
      limit: (...args: any[]) => (ctx.calls.push(['limit', ...args]), builder),
      range: (...args: any[]) => (ctx.calls.push(['range', ...args]), builder),
      returns: () => builder,
      // mutations
      insert: (payload: any) => ((ctx.op = 'insert'), (ctx.payload = payload), ctx.calls.push(['insert', payload]), builder),
      update: (payload: any) => ((ctx.op = 'update'), (ctx.payload = payload), ctx.calls.push(['update', payload]), builder),
      upsert: (payload: any) => ((ctx.op = 'upsert'), (ctx.payload = payload), ctx.calls.push(['upsert', payload]), builder),
      delete: () => ((ctx.op = 'delete'), ctx.calls.push(['delete']), builder),
      // filters
      eq: (k: string, v: any) => ((ctx.eqs[k] = v), ctx.calls.push(['eq', k, v]), builder),
      gt: (k: string, v: any) => (ctx.calls.push(['gt', k, v]), builder),
      gte: (k: string, v: any) => (ctx.calls.push(['gte', k, v]), builder),
      lt: (k: string, v: any) => (ctx.calls.push(['lt', k, v]), builder),
      lte: (k: string, v: any) => (ctx.calls.push(['lte', k, v]), builder),
      neq: (k: string, v: any) => (ctx.calls.push(['neq', k, v]), builder),
      in: (k: string, v: any) => (ctx.calls.push(['in', k, v]), builder),
      or: (f: string) => (ctx.calls.push(['or', f]), builder),
      like: (k: string, v: any) => (ctx.calls.push(['like', k, v]), builder),
      ilike: (k: string, v: any) => (ctx.calls.push(['ilike', k, v]), builder),
      is: (k: string, v: any) => (ctx.calls.push(['is', k, v]), builder),
      not: (k: string, op: string, v: any) => (ctx.calls.push(['not', k, op, v]), builder),
      contains: (k: string, v: any) => (ctx.calls.push(['contains', k, v]), builder),
      // terminals
      single: () => resolve(),
      maybeSingle: () => resolve(),
      then: (onFulfilled: any, onRejected: any) => resolve().then(onFulfilled, onRejected),
    }
    return builder
  })

  return {
    from: fromMock,
    rpc: vi.fn((fn: string, payload: Record<string, unknown>) => Promise.resolve(handler({
      table: `rpc:${fn}`,
      op: 'select',
      eqs: {},
      calls: [['rpc', fn, payload]],
      payload,
    }))),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: opts.user ?? null }, error: opts.userError ?? null })),
    },
  }
}
