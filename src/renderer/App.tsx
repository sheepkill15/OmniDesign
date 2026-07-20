import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

interface Message { readonly role: 'user' | 'assistant'; readonly text: string }

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function App() {
  const [providers, setProviders] = useState<readonly ProviderStatus[]>([])
  const [providerId, setProviderId] = useState<'codex' | 'claude'>('codex')
  const [modelId, setModelId] = useState('')
  const [effort, setEffort] = useState('')
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<readonly Message[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [activities, setActivities] = useState<readonly ProviderActivity[]>([])

  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === providerId), [providers, providerId])
  const selectedModel = useMemo(() => selectedProvider?.models.find((model) => model.id === modelId), [selectedProvider, modelId])
  const refresh = async () => {
    setError('')
    const next = await window.omnidesign.providers.discover()
    setProviders(next)
    const available = next.find((provider) => provider.installed && provider.authenticated)
    if (available) { setProviderId(available.id); setModelId(available.models[0]?.id ?? '') }
  }
  useEffect(() => { void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not check providers.')) }, [])
  useEffect(() => window.omnidesign.providers.onActivity((activity) => setActivities((current) => [...current, activity])), [])
  useEffect(() => setModelId(selectedProvider?.models[0]?.id ?? ''), [selectedProvider?.id])
  useEffect(() => setEffort(selectedModel?.effortLevels.find((level) => level.isDefault)?.id ?? ''), [selectedModel?.id])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!prompt.trim() || !modelId) return
    const outgoing = prompt.trim()
    const requestId = createRequestId()
    setMessages((current) => [...current, { role: 'user', text: outgoing }])
    setPrompt(''); setBusy(true); setError('')
    try {
      const reply = await window.omnidesign.providers.prompt({ requestId, providerId, modelId, ...(effort ? { effort } : {}), prompt: outgoing })
      setMessages((current) => [...current, { role: 'assistant', text: reply.text }])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The provider could not complete this prompt.')
    } finally { setBusy(false) }
  }

  return <main className="app-shell">
    <header><p className="eyebrow">OmniDesign · Provider connection</p><h1>Talk through your installed subscriptions.</h1><p>Codex and Claude remain authenticated by their own local applications. No API key is stored here.</p></header>
    <section className="provider-panel" aria-label="Available providers">
      <div><h2>Installed providers</h2><button className="quiet" type="button" onClick={() => void refresh()} disabled={busy}>Refresh</button></div>
      {providers.map((provider) => <button type="button" key={provider.id} className={`provider ${provider.installed && provider.authenticated ? 'ready' : ''}`} onClick={() => setProviderId(provider.id)} disabled={!provider.installed || !provider.authenticated || busy} aria-pressed={provider.id === providerId}>
        <strong>{provider.name}</strong><span>{provider.installed && provider.authenticated ? 'Ready' : 'Unavailable'}</span><p>{provider.detail}</p>
      </button>)}
    </section>
    <section className="conversation" aria-label="Provider conversation">
      <div className="messages" aria-live="polite">
        {messages.length === 0 && activities.length === 0 ? <p className="empty">Choose an available provider and start a conversation.</p> : messages.map((message, index) => <article className={`message ${message.role}`} key={`${message.role}-${index}`}><strong>{message.role === 'user' ? 'You' : selectedProvider?.name}</strong><p>{message.text}</p></article>)}
        {activities.length > 0 && <section className="activity-log" aria-label="Agent activity"><h2>Agent activity</h2>{activities.map((activity, index) => <article className={`activity ${activity.kind}`} key={`${activity.requestId}-${index}`}><header><span>{activity.kind}</span><strong>{activity.label}</strong></header>{activity.detail && <p>{activity.detail}</p>}{activity.raw !== undefined && <details><summary>Raw provider event</summary><pre>{JSON.stringify(activity.raw, null, 2)}</pre></details>}</article>)}</section>}
      </div>
      <form onSubmit={(event) => void send(event)}>
        <fieldset><legend>Provider</legend><p>{selectedProvider?.name ?? 'No available provider'}</p></fieldset>
        <fieldset><legend>Model</legend><div className="model-list" role="radiogroup" aria-label="Model">{selectedProvider?.models.map((model) => <button type="button" className="model" key={model.id} role="radio" aria-checked={model.id === modelId} onClick={() => setModelId(model.id)} disabled={busy}>{model.name}</button>)}</div></fieldset>
        <fieldset><legend>Effort</legend><div className="model-list" role="radiogroup" aria-label="Effort"><button type="button" className="model" role="radio" aria-checked={effort === ''} onClick={() => setEffort('')} disabled={busy}>Provider default</button>{selectedModel?.effortLevels.map((level) => <button type="button" className="model" key={level.id} role="radio" aria-checked={effort === level.id} onClick={() => setEffort(level.id)} disabled={busy}>{level.name}</button>)}</div></fieldset>
        <label className="prompt-label">Prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask the selected model anything…" disabled={busy || !modelId} /></label>
        {error && <p className="error" role="alert">{error}</p>}<button type="submit" disabled={busy || !prompt.trim() || !modelId}>{busy ? 'Waiting for provider…' : 'Send prompt'}</button>
      </form>
    </section>
  </main>
}
