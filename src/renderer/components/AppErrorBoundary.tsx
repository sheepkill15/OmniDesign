import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from 'react-aria-components'

interface AppErrorBoundaryProps {
  readonly children: ReactNode
  readonly onReload?: () => void
}

interface AppErrorBoundaryState {
  readonly error: Error | null
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public state: AppErrorBoundaryState = { error: null }

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('OmniDesign renderer failed.', error, info.componentStack)
  }

  public render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <main className="fatal-error" role="alert">
        <span className="fatal-error-mark" aria-hidden="true">OD</span>
        <p className="fatal-error-eyebrow">OmniDesign encountered a problem</p>
        <h1>Reload the workspace</h1>
        <p>Your local projects, designs, drafts, and history remain stored on this device. Reloading restarts only the trusted application interface.</p>
        <Button className="primary-action" onPress={() => (this.props.onReload ?? (() => window.location.reload()))()}>Reload OmniDesign</Button>
        <details><summary>Technical details</summary><pre>{error.stack ?? error.message}</pre></details>
      </main>
    )
  }
}
