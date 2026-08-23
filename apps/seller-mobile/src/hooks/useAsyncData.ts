import { useCallback, useEffect, useState } from 'react'

export function useAsyncData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (silent: boolean) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      setData(await load())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      if (silent) setRefreshing(false)
      else setLoading(false)
    }
  }, [load])

  // Full reload (swaps the screen to its loading state). Use for first load / retry.
  const reload = useCallback(() => run(false), [run])
  // Silent refresh (keeps current content mounted). Wire to pull-to-refresh.
  const refresh = useCallback(() => run(true), [run])

  useEffect(() => {
    let active = true
    load()
      .then((value) => {
        if (active) setData(value)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Something went wrong.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [load])

  return { data, loading, refreshing, error, reload, refresh }
}
