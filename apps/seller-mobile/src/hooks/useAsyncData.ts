import { useCallback, useEffect, useState } from 'react'

export function useAsyncData<T>(load: () => Promise<T>, deps: React.DependencyList = []) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // Full reload (swaps the screen to its loading state). Use for first load / retry.
  const reload = useCallback(() => run(false), [run])
  // Silent refresh (keeps current content mounted). Wire to pull-to-refresh.
  const refresh = useCallback(() => run(true), [run])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, loading, refreshing, error, reload, refresh }
}
