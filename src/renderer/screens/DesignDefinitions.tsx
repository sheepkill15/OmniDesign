import { useEffect, useState } from 'react'
import { Button, Input, Label, TextArea, TextField } from 'react-aria-components'
import { ArrowLeftIcon, PlusIcon, SparklesIcon, TrashIcon } from '@heroicons/react/24/outline'
import { GenerationSettingsMenu, type ProviderId } from '../components/composer'

const emptyDefinitions: ProjectDesignDefinitions = {
  schemaVersion: 1,
  colors: [],
  typography: [],
  spacing: [],
  shape: [],
  visualGuidance: '',
  aiAgentInstructions: '',
}

type NamedSection = 'colors' | 'spacing' | 'shape'

function NamedDefinitions({ title, description, values, valuePlaceholder, onChange }: {
  readonly title: string
  readonly description: string
  readonly values: readonly NamedDesignDefinition[]
  readonly valuePlaceholder: string
  readonly onChange: (values: readonly NamedDesignDefinition[]) => void
}) {
  const update = (index: number, patch: Partial<NamedDesignDefinition>) => onChange(values.map((value, valueIndex) => valueIndex === index ? { ...value, ...patch } : value))
  return (
    <section className="definition-section" aria-labelledby={`definition-${title.toLowerCase()}`}>
      <div className="definition-section-heading">
        <span><h2 id={`definition-${title.toLowerCase()}`}>{title}</h2><p>{description}</p></span>
        <Button className="secondary-action" onPress={() => onChange([...values, { name: '', value: '', description: null }])}><PlusIcon aria-hidden="true" />Add {title.toLowerCase().replace(/s$/, '')}</Button>
      </div>
      {values.length ? <div className="definition-token-list">
        {values.map((value, index) => <div className="definition-token-row" key={index}>
          <TextField><Label>Name</Label><Input value={value.name} placeholder="semantic-name" onChange={(event) => update(index, { name: event.target.value })} /></TextField>
          <TextField><Label>Value</Label><Input value={value.value} placeholder={valuePlaceholder} onChange={(event) => update(index, { value: event.target.value })} /></TextField>
          <TextField><Label>Description</Label><Input value={value.description ?? ''} placeholder="Optional role guidance" onChange={(event) => update(index, { description: event.target.value || null })} /></TextField>
          <Button className="icon-button definition-remove" aria-label={`Remove ${value.name || title.toLowerCase()} definition`} onPress={() => onChange(values.filter((_, valueIndex) => valueIndex !== index))}><TrashIcon aria-hidden="true" /></Button>
        </div>)}
      </div> : <p className="definition-empty">No {title.toLowerCase()} defined yet.</p>}
    </section>
  )
}

function TypographyDefinitions({ values, onChange }: { readonly values: readonly TypographyDesignDefinition[]; readonly onChange: (values: readonly TypographyDesignDefinition[]) => void }) {
  const update = (index: number, patch: Partial<TypographyDesignDefinition>) => onChange(values.map((value, valueIndex) => valueIndex === index ? { ...value, ...patch } : value))
  return (
    <section className="definition-section" aria-labelledby="definition-typography">
      <div className="definition-section-heading">
        <span><h2 id="definition-typography">Typography</h2><p>Define semantic text roles rather than component-specific font declarations.</p></span>
        <Button className="secondary-action" onPress={() => onChange([...values, { name: '', fontFamily: '', fontSize: '', fontWeight: '', lineHeight: '', letterSpacing: null, description: null }])}><PlusIcon aria-hidden="true" />Add text role</Button>
      </div>
      {values.length ? <div className="definition-token-list">
        {values.map((value, index) => <div className="definition-typography-row" key={index}>
          <TextField><Label>Name</Label><Input value={value.name} placeholder="body" onChange={(event) => update(index, { name: event.target.value })} /></TextField>
          <TextField><Label>Font family</Label><Input value={value.fontFamily} placeholder="Inter, sans-serif" onChange={(event) => update(index, { fontFamily: event.target.value })} /></TextField>
          <TextField><Label>Size</Label><Input value={value.fontSize} placeholder="1rem" onChange={(event) => update(index, { fontSize: event.target.value })} /></TextField>
          <TextField><Label>Weight</Label><Input value={value.fontWeight} placeholder="400" onChange={(event) => update(index, { fontWeight: event.target.value })} /></TextField>
          <TextField><Label>Line height</Label><Input value={value.lineHeight} placeholder="1.5" onChange={(event) => update(index, { lineHeight: event.target.value })} /></TextField>
          <TextField><Label>Letter spacing</Label><Input value={value.letterSpacing ?? ''} placeholder="Optional" onChange={(event) => update(index, { letterSpacing: event.target.value || null })} /></TextField>
          <TextField className="definition-description-field"><Label>Description</Label><Input value={value.description ?? ''} placeholder="Optional role guidance" onChange={(event) => update(index, { description: event.target.value || null })} /></TextField>
          <Button className="icon-button definition-remove" aria-label={`Remove ${value.name || 'typography'} definition`} onPress={() => onChange(values.filter((_, valueIndex) => valueIndex !== index))}><TrashIcon aria-hidden="true" /></Button>
        </div>)}
      </div> : <p className="definition-empty">No typography roles defined yet.</p>}
    </section>
  )
}

export function DesignDefinitions({ project, providers, onBack, onSaved }: {
  readonly project: ProjectSummary
  readonly providers: readonly ProviderStatus[]
  readonly onBack: () => void
  readonly onSaved: (version: ProjectDesignDefinitionVersion) => void
}) {
  const [draft, setDraft] = useState<ProjectDesignDefinitions>(emptyDefinitions)
  const [currentVersion, setCurrentVersion] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [proposing, setProposing] = useState(false)
  const [proposalReady, setProposalReady] = useState(false)
  const firstProvider = providers.find((provider) => provider.installed && provider.authenticated && provider.models.length)
  const [selection, setSelection] = useState<GenerationSelection>({ providerId: firstProvider?.id ?? 'mock', modelId: firstProvider?.models[0]?.id ?? 'mock-v1', effort: firstProvider?.models[0]?.effortLevels.find((effort) => effort.isDefault)?.id ?? null })

  useEffect(() => {
    const available = providers.find((provider) => provider.id === selection.providerId && provider.installed && provider.authenticated && provider.models.some((model) => model.id === selection.modelId))
    if (available) return
    const next = providers.find((provider) => provider.installed && provider.authenticated && provider.models.length)
    if (next) setSelection({ providerId: next.id, modelId: next.models[0].id, effort: next.models[0].effortLevels.find((effort) => effort.isDefault)?.id ?? null })
  }, [providers, selection.modelId, selection.providerId])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void window.omnidesign.workspace.getProjectDesignDefinitions(project.id).then((state) => {
      if (!active) return
      setDraft(state?.current?.definitions ?? emptyDefinitions)
      setCurrentVersion(state?.current?.version ?? null)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error && reason.message ? reason.message : 'Design definitions could not be loaded.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [project.id])

  const setNamed = (section: NamedSection, values: readonly NamedDesignDefinition[]) => setDraft((current) => ({ ...current, [section]: values }))
  const save = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const version = await window.omnidesign.workspace.saveProjectDesignDefinitions(project.id, draft)
      setDraft(version.definitions)
      setCurrentVersion(version.version)
      setSaved(true)
      onSaved(version)
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'Design definitions could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const propose = async () => {
    setProposing(true)
    setError(null)
    setSaved(false)
    setProposalReady(false)
    try {
      const proposal = await window.omnidesign.workspace.proposeProjectDesignDefinitions(project.id, selection.providerId, selection.modelId, selection.effort)
      setDraft(proposal)
      setProposalReady(true)
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'A design-definition proposal could not be generated.')
    } finally {
      setProposing(false)
    }
  }

  return (
    <main className="definitions-main">
      <div className="definitions-content">
        <header className="definitions-heading">
          <Button className="icon-button" aria-label="Back" onPress={onBack}><ArrowLeftIcon aria-hidden="true" /></Button>
          <span><h1>Design definitions</h1><p>{project.name} · {currentVersion ? `Version ${currentVersion}` : 'Not set up'}</p></span>
          <Button className="primary-action" isDisabled={loading || saving} onPress={() => void save()}>{saving ? 'Saving…' : 'Save definitions'}</Button>
        </header>
        {error && <div className="workspace-feedback" data-tone="error" role="alert"><span><strong>Definitions unavailable.</strong><small>{error}</small></span><Button className="text-button" onPress={() => setError(null)}>Dismiss</Button></div>}
        {saved && <div className="workspace-feedback" data-tone="success" role="status"><span><strong>Definitions saved.</strong><small>Existing designs can decide whether to apply this version.</small></span></div>}
        {proposalReady && <div className="workspace-feedback" data-tone="success" role="status"><span><strong>Proposal ready for review.</strong><small>Nothing has been saved yet. Adjust any field, then save when it reflects the project.</small></span></div>}
        {loading ? <p className="settings-empty">Loading design definitions…</p> : <div className="definition-editor">
          <section className="definition-section definition-proposal" aria-labelledby="definition-proposal">
            <div className="definition-section-heading"><span><h2 id="definition-proposal">Start from the project</h2><p>Ask an installed provider to inspect {project.kind === 'linked' ? 'the linked project and completed designs' : 'completed designs'} directly and prepare an editable proposal.</p></span></div>
            <div className="definition-proposal-controls">
              <GenerationSettingsMenu providers={providers} providerId={selection.providerId as ProviderId} modelId={selection.modelId} effort={selection.effort} onChange={setSelection} />
              <Button className="secondary-action" isDisabled={proposing || !firstProvider} onPress={() => void propose()}><SparklesIcon aria-hidden="true" />{proposing ? 'Generating proposal…' : 'Generate proposal'}</Button>
            </div>
            {!firstProvider && <p className="definition-empty">Connect an installed provider to generate a proposal, or fill in the sections manually.</p>}
          </section>
          <NamedDefinitions title="Colors" description="Semantic project colors used across new designs." values={draft.colors} valuePlaceholder="#725d78 or oklch(… )" onChange={(values) => setNamed('colors', values)} />
          <TypographyDefinitions values={draft.typography} onChange={(typography) => setDraft((current) => ({ ...current, typography }))} />
          <NamedDefinitions title="Spacing" description="Reusable spacing values for layout and component rhythm." values={draft.spacing} valuePlaceholder="1rem" onChange={(values) => setNamed('spacing', values)} />
          <NamedDefinitions title="Shape" description="Semantic radii, border widths, and related shape values." values={draft.shape} valuePlaceholder="0.625rem" onChange={(values) => setNamed('shape', values)} />
          <section className="definition-section" aria-labelledby="definition-visual-guidance">
            <div className="definition-section-heading"><span><h2 id="definition-visual-guidance">Visual guidance</h2><p>Describe composition, density, imagery, motion, or other direction that tokens cannot express.</p></span></div>
            <TextField><Label>Visual guidance</Label><TextArea value={draft.visualGuidance} maxLength={20_000} onChange={(event) => setDraft((current) => ({ ...current, visualGuidance: event.target.value }))} /></TextField>
          </section>
          <section className="definition-section" aria-labelledby="definition-agent-instructions">
            <div className="definition-section-heading"><span><h2 id="definition-agent-instructions">AI Agent instructions</h2><p>These instructions are included with the initial prompt for every new design in this project.</p></span></div>
            <TextField><Label>AI Agent instructions</Label><TextArea value={draft.aiAgentInstructions} maxLength={50_000} onChange={(event) => setDraft((current) => ({ ...current, aiAgentInstructions: event.target.value }))} /></TextField>
          </section>
        </div>}
      </div>
    </main>
  )
}
