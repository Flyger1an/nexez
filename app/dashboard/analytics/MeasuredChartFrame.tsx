'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'

type ChartSize = {
  width: number
  height: number
}

export function MeasuredChartFrame({
  className,
  children,
}: {
  className: string
  children: (size: ChartSize) => ReactNode
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<ChartSize | null>(null)

  useEffect(() => {
    const node = frameRef.current
    if (!node) return

    let animationFrame = 0
    const updateSize = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect()
        const nextSize = {
          width: Math.floor(rect.width),
          height: Math.floor(rect.height),
        }

        if (nextSize.width <= 0 || nextSize.height <= 0) return

        setSize((current) => {
          if (current?.width === nextSize.width && current.height === nextSize.height) {
            return current
          }

          return nextSize
        })
      })
    }

    updateSize()

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null
    observer?.observe(node)
    window.addEventListener('resize', updateSize)

    return () => {
      cancelAnimationFrame(animationFrame)
      observer?.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [])

  return (
    <div ref={frameRef} className={`${className} min-w-0`}>
      {size ? children(size) : null}
    </div>
  )
}
