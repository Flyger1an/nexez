'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    // In future: send to observability (Phase 5)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <div className="font-medium">Something went wrong in this section.</div>
          <div className="mt-1 text-xs text-red-300/80">
            {this.state.error?.message || 'Unexpected error.'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="mt-2 text-xs underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
