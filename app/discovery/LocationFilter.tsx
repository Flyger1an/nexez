'use client'

import { useRef, useState } from 'react'
import { Crosshair, Loader2, MapPin, X } from 'lucide-react'

type LocationFilterProps = {
  defaultValue?: string
}

export function LocationFilter({ defaultValue = '' }: LocationFilterProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function useCurrentLocation() {
    setMessage(null)
    if (!('geolocation' in navigator)) {
      setMessage('Location is not available in this browser.')
      return
    }

    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const params = new URLSearchParams({
            lat: String(position.coords.latitude),
            lng: String(position.coords.longitude),
          })
          const res = await fetch(`/api/location/reverse?${params.toString()}`, { cache: 'no-store' })
          const data = await res.json()
          if (!res.ok || !data.query) throw new Error(data.error || 'Location lookup failed.')
          applyLocation(data.query)
        } catch (error: any) {
          setMessage(error?.message || 'Enter your city or region manually.')
        } finally {
          setLoading(false)
        }
      },
      (error) => {
        setLoading(false)
        if (error.code === error.PERMISSION_DENIED) setMessage('Location permission was not enabled.')
        else if (error.code === error.TIMEOUT) setMessage('Location lookup timed out.')
        else setMessage('Could not read your location.')
      },
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 10_000 },
    )
  }

  function applyLocation(nextValue: string) {
    setValue(nextValue)
    if (inputRef.current) inputRef.current.value = nextValue
    requestAnimationFrame(() => inputRef.current?.form?.requestSubmit())
  }

  function clearLocation() {
    setValue('')
    setMessage(null)
    if (inputRef.current) inputRef.current.value = ''
    requestAnimationFrame(() => inputRef.current?.form?.requestSubmit())
  }

  return (
    <div className="mt-3">
      <label className="relative block">
        <span className="mb-1 block text-xs font-medium text-[#9CA3AF]">Location</span>
        <MapPin className="absolute left-4 top-[39px] size-4 text-[#9CA3AF]" />
        <input
          ref={inputRef}
          name="location"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="input h-12 w-full !pl-11 pr-28 text-sm"
          placeholder="City, region, or service area"
          autoComplete="address-level2"
        />
        <div className="absolute bottom-1.5 right-1.5 flex gap-1">
          {value ? (
            <button
              type="button"
              onClick={clearLocation}
              className="inline-flex size-9 items-center justify-center rounded-md text-[#9CA3AF] hover:bg-white/10 hover:text-white"
              aria-label="Clear location filter"
            >
              <X className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs font-medium text-[#D1D5DB] hover:border-[var(--signal)]/30 hover:text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Crosshair className="size-3.5" />}
            Use current
          </button>
        </div>
      </label>
      {message ? <p className="mt-2 text-xs text-[var(--amber)]" aria-live="polite">{message}</p> : null}
    </div>
  )
}
