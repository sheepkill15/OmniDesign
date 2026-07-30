import { useState } from 'react'
import { Button } from 'react-aria-components'
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, CommandLineIcon } from '@heroicons/react/24/outline'
import { AppModal } from '../components/AppModal'

type SetupProviderId = 'codex' | 'claude'

interface SetupGuide {
  readonly providerName: string
  readonly cliName: string
  readonly installCommand: string
  readonly signInCommand: string
}

function setupGuide(providerId: SetupProviderId, platform: string): SetupGuide {
  if (providerId === 'codex') {
    return {
      providerName: 'Codex',
      cliName: 'Codex CLI',
      installCommand: 'npm install --global @openai/codex',
      signInCommand: 'codex login',
    }
  }
  return {
    providerName: 'Claude',
    cliName: 'Claude Code CLI',
    installCommand: platform === 'win32'
      ? 'winget install Anthropic.ClaudeCode'
      : platform === 'darwin'
        ? 'brew install --cask claude-code'
        : 'curl -fsSL https://claude.ai/install.sh | bash',
    signInCommand: 'claude',
  }
}

export function Providers({ providers, loading, error, platform, onRefresh, onOpenSetup }: {
  readonly providers: readonly ProviderStatus[]
  readonly loading: boolean
  readonly error: string | null
  readonly platform: string
  readonly onRefresh: () => void
  readonly onOpenSetup: (providerId: SetupProviderId) => Promise<void>
}) {
  const [setupProviderId, setSetupProviderId] = useState<SetupProviderId | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const setupProvider = setupProviderId ? providers.find((provider) => provider.id === setupProviderId) : undefined
  const guide = setupProviderId ? setupGuide(setupProviderId, platform) : null
  const needsInstall = setupProvider?.installed === false

  const openOfficialGuide = async () => {
    if (!setupProviderId) return
    setSetupError(null)
    try {
      await onOpenSetup(setupProviderId)
    } catch (openError) {
      setSetupError(openError instanceof Error ? openError.message : 'The setup guide could not be opened.')
    }
  }

  return (
    <main className="settings-main">
      <div className="settings-content">
        <header className="page-heading"><h1>Providers</h1><p>OmniDesign uses the existing sign-in state of locally installed provider tools. No credentials are stored here.</p></header>
        <section className="settings-section" aria-labelledby="provider-availability-heading">
          <div className="section-heading"><h2 id="provider-availability-heading">Availability</h2><Button className="secondary-action" onPress={onRefresh} isDisabled={loading}><ArrowPathIcon className={loading ? 'spin' : undefined} aria-hidden="true" />Refresh</Button></div>
          {error && <div className="workspace-feedback" data-tone="error" role="alert"><span><strong>Provider availability could not be refreshed.</strong><small>{error}</small></span></div>}
          <div className="provider-list">
            {providers.map((provider) => {
              const ready = provider.installed && provider.authenticated
              const setupId = provider.id === 'codex' || provider.id === 'claude' ? provider.id : null
              return <article className="provider-row" key={provider.id}>
                <span className="provider-status" data-ready={ready || undefined} aria-hidden="true" />
                <span className="provider-row-copy"><strong>{provider.name}</strong><small>{provider.detail}</small>{provider.models.length > 0 && <em>{provider.models.length} model{provider.models.length === 1 ? '' : 's'} available</em>}</span>
                <div className="provider-row-actions">
                  <span className="provider-state">{ready ? 'Ready' : provider.installed ? 'Sign in required' : 'Unavailable'}</span>
                  {!ready && setupId && <Button className="secondary-action provider-setup-action" onPress={() => { setSetupError(null); setSetupProviderId(setupId) }}>{provider.installed ? `Sign in to ${setupId === 'codex' ? 'Codex' : 'Claude Code'}` : `Set up ${setupId === 'codex' ? 'Codex CLI' : 'Claude Code'}`}</Button>}
                </div>
              </article>
            })}
            {!loading && !providers.length && <p className="settings-empty">No provider availability information is available. Refresh to test local provider tools.</p>}
          </div>
        </section>
      </div>
      <AppModal isOpen={setupProviderId !== null} onOpenChange={(open) => { if (!open) { setSetupProviderId(null); setSetupError(null) } }} className="provider-setup-modal" title={`${needsInstall ? 'Set up' : 'Sign in to'} ${guide?.providerName ?? 'provider'}`}>
        {(close) => guide && <>
          <div className="provider-setup-intro"><CommandLineIcon aria-hidden="true" /><p>OmniDesign connects through the <strong>{guide.cliName}</strong> installed on this computer. Installation and sign-in stay with the provider.</p></div>
          <ol className="provider-setup-steps">
            {needsInstall && <li><span>1</span><div><strong>Install {guide.cliName}</strong><p>Run this in a terminal, or use the official guide for other installation options.</p><code>{guide.installCommand}</code></div></li>}
            <li><span>{needsInstall ? '2' : '1'}</span><div><strong>Sign in with your subscription</strong><p>Run this in a terminal and complete the provider&apos;s sign-in flow.</p><code>{guide.signInCommand}</code></div></li>
            <li><span>{needsInstall ? '3' : '2'}</span><div><strong>Refresh OmniDesign</strong><p>Return here after sign-in so OmniDesign can detect the CLI, account, models, and effort options.</p></div></li>
          </ol>
          <p className="provider-setup-privacy">OmniDesign does not run the installer and never receives or stores your provider password or sign-in token.</p>
          {setupError && <div className="workspace-feedback" data-tone="error" role="alert"><span><strong>The official guide could not be opened.</strong><small>{setupError}</small></span></div>}
          <div className="clone-modal-actions"><Button className="secondary-action" onPress={() => void openOfficialGuide()}><ArrowTopRightOnSquareIcon aria-hidden="true" />Open official guide</Button><Button className="primary-action" onPress={() => { close(); onRefresh() }}><ArrowPathIcon aria-hidden="true" />Refresh status</Button></div>
        </>}
      </AppModal>
    </main>
  )
}
