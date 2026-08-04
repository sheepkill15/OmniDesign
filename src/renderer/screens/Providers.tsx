import { useState } from 'react'
import { Button } from 'react-aria-components'
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, CommandLineIcon } from '@heroicons/react/24/outline'
import { AppModal } from '../components/AppModal'

type SetupProviderId = 'codex' | 'claude'
type SetupDependencyId = 'git'
type SetupTarget = { readonly kind: 'provider'; readonly id: SetupProviderId } | { readonly kind: 'dependency'; readonly id: SetupDependencyId }

interface SetupGuide {
  readonly name: string
  readonly toolName: string
  readonly purpose: string
  readonly installCommand: string | null
  readonly signInCommand: string | null
}

function providerSetupGuide(providerId: SetupProviderId, platform: string): SetupGuide {
  return providerId === 'codex'
    ? { name: 'Codex', toolName: 'Codex CLI', purpose: 'connect to your Codex subscription', installCommand: 'npm install --global @openai/codex', signInCommand: 'codex login' }
    : {
        name: 'Claude',
        toolName: 'Claude Code CLI',
        purpose: 'connect to your Claude subscription',
        installCommand: platform === 'win32'
          ? 'winget install Anthropic.ClaudeCode'
          : platform === 'darwin'
            ? 'brew install --cask claude-code'
            : 'curl -fsSL https://claude.ai/install.sh | bash',
        signInCommand: 'claude',
      }
}

function dependencySetupGuide(dependencyId: SetupDependencyId, platform: string): SetupGuide {
  if (dependencyId !== 'git') throw new Error('Unsupported local dependency.')
  return {
    name: 'Git',
    toolName: 'Git',
    purpose: 'keep design history and clone project repositories',
    installCommand: platform === 'win32'
      ? 'winget install --id Git.Git -e --source winget'
      : platform === 'darwin'
        ? 'xcode-select --install'
        : null,
    signInCommand: null,
  }
}

export function Providers({ providers, loading, error, dependencies, dependenciesLoading, dependenciesError, platform, onRefresh, onOpenSetup, onOpenDependencySetup }: {
  readonly providers: readonly ProviderStatus[]
  readonly loading: boolean
  readonly error: string | null
  readonly dependencies: readonly LocalDependencyStatus[]
  readonly dependenciesLoading: boolean
  readonly dependenciesError: string | null
  readonly platform: string
  readonly onRefresh: () => void
  readonly onOpenSetup: (providerId: SetupProviderId) => Promise<void>
  readonly onOpenDependencySetup: (dependencyId: SetupDependencyId) => Promise<void>
}) {
  const [setupTarget, setSetupTarget] = useState<SetupTarget | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const setupProvider = setupTarget?.kind === 'provider' ? providers.find((provider) => provider.id === setupTarget.id) : undefined
  const setupDependency = setupTarget?.kind === 'dependency' ? dependencies.find((dependency) => dependency.id === setupTarget.id) : undefined
  const guide = setupTarget?.kind === 'provider' ? providerSetupGuide(setupTarget.id, platform) : setupTarget?.kind === 'dependency' ? dependencySetupGuide(setupTarget.id, platform) : null
  const needsInstall = setupTarget?.kind === 'dependency' ? setupDependency?.installed === false : setupProvider?.installed === false
  const needsSignIn = setupTarget?.kind === 'provider' && setupProvider?.installed === true && setupProvider.authenticated === false
  const refreshing = loading || dependenciesLoading

  const openOfficialGuide = async () => {
    if (!setupTarget) return
    setSetupError(null)
    try {
      if (setupTarget.kind === 'provider') await onOpenSetup(setupTarget.id)
      else await onOpenDependencySetup(setupTarget.id)
    } catch (openError) {
      setSetupError(openError instanceof Error ? openError.message : 'The setup guide could not be opened.')
    }
  }

  const closeSetup = () => { setSetupTarget(null); setSetupError(null) }
  const beginSetup = (target: SetupTarget) => { setSetupError(null); setSetupTarget(target) }

  return (
    <main className="settings-main">
      <div className="settings-content">
        <header className="page-heading"><h1>Providers</h1><p>Check the provider CLIs and local tools OmniDesign uses. Setup stays in your terminal and with the tool&apos;s official installer.</p></header>
        <section className="settings-section" aria-labelledby="provider-availability-heading">
          <div className="section-heading"><h2 id="provider-availability-heading">Availability</h2><Button className="secondary-action" onPress={onRefresh} isDisabled={refreshing}><ArrowPathIcon className={refreshing ? 'spin' : undefined} aria-hidden="true" />Refresh</Button></div>
          {error && <div className="workspace-feedback" data-tone="error" role="alert"><span><strong>Provider availability could not be refreshed.</strong><small>{error}</small></span></div>}
          <div className="provider-list">
            {providers.map((provider) => {
              const ready = provider.installed && provider.authenticated && provider.models.length > 0
              const state = ready ? 'Ready' : !provider.installed ? 'Unavailable' : !provider.authenticated ? 'Sign in required' : 'Models unavailable'
              const setupId = provider.id === 'codex' || provider.id === 'claude' ? provider.id : null
              return <article className="provider-row" key={provider.id}>
                <span className="provider-status" data-ready={ready || undefined} aria-hidden="true" />
                <span className="provider-row-copy"><strong>{provider.name}</strong><small>{provider.detail}</small>{provider.models.length > 0 && <em>{provider.models.length} model{provider.models.length === 1 ? '' : 's'} available</em>}</span>
                <div className="provider-row-actions">
                  <span className="provider-state">{state}</span>
                  {setupId && (!provider.installed || !provider.authenticated) && <Button className="secondary-action provider-setup-action" onPress={() => beginSetup({ kind: 'provider', id: setupId })}>{provider.installed ? `Sign in to ${setupId === 'codex' ? 'Codex' : 'Claude Code'}` : `Set up ${setupId === 'codex' ? 'Codex CLI' : 'Claude Code'}`}</Button>}
                </div>
              </article>
            })}
            {!loading && !providers.length && <p className="settings-empty">No provider availability information is available. Refresh to test local provider tools.</p>}
          </div>
        </section>
        <section className="settings-section" aria-labelledby="local-tools-heading">
          <div className="section-heading"><h2 id="local-tools-heading">Local tools</h2></div>
          <p className="local-tools-intro">Required utilities are checked quietly in the background. OmniDesign never installs or updates them automatically.</p>
          {dependenciesError && <div className="workspace-feedback" data-tone="error" role="alert"><span><strong>Local tools could not be checked.</strong><small>{dependenciesError}</small></span></div>}
          <div className="provider-list local-tool-list">
            {dependencies.map((dependency) => <article className="provider-row" key={dependency.id}>
              <span className="provider-status" data-ready={dependency.installed || undefined} aria-hidden="true" />
              <span className="provider-row-copy"><strong>{dependency.name}</strong><small>{dependency.detail}</small></span>
              <div className="provider-row-actions">
                <span className="provider-state">{dependency.installed ? 'Ready' : 'Missing'}</span>
                {!dependency.installed && <Button className="secondary-action provider-setup-action" onPress={() => beginSetup({ kind: 'dependency', id: dependency.id })}>Set up {dependency.name}</Button>}
              </div>
            </article>)}
            {dependenciesLoading && !dependencies.length && <p className="settings-empty" role="status">Checking local tools…</p>}
          </div>
        </section>
      </div>
      <AppModal isOpen={setupTarget !== null} onOpenChange={(open) => { if (!open) closeSetup() }} className="provider-setup-modal" title={`${needsSignIn ? 'Sign in to' : 'Set up'} ${guide?.name ?? 'tool'}`}>
        {(close) => guide && <>
          <div className="provider-setup-intro"><CommandLineIcon aria-hidden="true" /><p>OmniDesign uses <strong>{guide.toolName}</strong> installed on this computer to {guide.purpose}.</p></div>
          <ol className="provider-setup-steps">
            {needsInstall && <li><span>1</span><div><strong>Install {guide.toolName}</strong><p>{guide.installCommand ? 'Run this in a terminal, or use the official guide for other installation options.' : 'Open the official guide for the installation option that matches your system.'}</p>{guide.installCommand && <code>{guide.installCommand}</code>}</div></li>}
            {guide.signInCommand && <li><span>{needsInstall ? '2' : '1'}</span><div><strong>Sign in with your subscription</strong><p>Run this in a terminal and complete the provider&apos;s sign-in flow.</p><code>{guide.signInCommand}</code></div></li>}
            <li><span>{needsInstall && guide.signInCommand ? '3' : needsInstall || guide.signInCommand ? '2' : '1'}</span><div><strong>Check again</strong><p>Return here and refresh. If a newly installed tool is still missing, reopen OmniDesign so it can read your updated PATH.</p></div></li>
          </ol>
          <p className="provider-setup-privacy">{setupTarget?.kind === 'provider' ? 'OmniDesign does not run the installer and never receives or stores your provider password or sign-in token.' : 'OmniDesign only checks whether Git can run. It does not install Git or change your Git configuration.'}</p>
          {setupError && <div className="workspace-feedback" data-tone="error" role="alert"><span><strong>The official guide could not be opened.</strong><small>{setupError}</small></span></div>}
          <div className="clone-modal-actions"><Button className="secondary-action" onPress={() => void openOfficialGuide()}><ArrowTopRightOnSquareIcon aria-hidden="true" />Open official guide</Button><Button className="primary-action" onPress={() => { close(); onRefresh() }}><ArrowPathIcon aria-hidden="true" />Check again</Button></div>
        </>}
      </AppModal>
    </main>
  )
}
