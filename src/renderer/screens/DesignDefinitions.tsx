import { useEffect, useRef, useState } from 'react'
import { Button, FieldError, Input, Label, TextArea, TextField } from 'react-aria-components'
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

const definitionNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

function definitionNameError(name: string, allNames: readonly string[]): string | null {
  const value = name.trim()
  if (!value) return 'Enter a semantic name.'
  if (value.length > 64) return 'Use 64 characters or fewer.'
  if (!definitionNamePattern.test(value)) return 'Use lowercase words separated by hyphens.'
  if (allNames.filter((candidate) => candidate.trim() === value).length > 1) return `The name “${value}” is already used in this section.`
  return null
}

function cssValueError(value: string, maximum = 500): string | null {
  const input = value.trim()
  if (!input) return 'Enter a CSS-compatible value.'
  if (input.length > maximum) return `Use ${maximum} characters or fewer.`
  if (/[;{}\u0000-\u001f\u007f]/.test(input) || /\/\*|\*\/|!\s*important/i.test(input)) return 'Use one CSS value without semicolons, braces, comments, or !important.'
  const stack: string[] = []
  let quote: '"' | "'" | null = null
  let escaped = false
  for (const character of input) {
    if (escaped) { escaped = false; continue }
    if (character === '\\') { escaped = true; continue }
    if (quote) { if (character === quote) quote = null; continue }
    if (character === '"' || character === "'") { quote = character; continue }
    if (character === '(' || character === '[') stack.push(character)
    else if (character === ')' || character === ']') {
      const expected = character === ')' ? '(' : '['
      if (stack.pop() !== expected) return 'Close CSS functions and brackets correctly.'
    }
  }
  return quote || escaped || stack.length ? 'Close CSS functions, brackets, and quotes correctly.' : null
}

function draftIsValid(draft: ProjectDesignDefinitions): boolean {
  const namedSections = [draft.colors, draft.spacing, draft.shape]
  if (namedSections.some((values) => values.some((value) => definitionNameError(value.name, values.map((item) => item.name)) || cssValueError(value.value)))) return false
  const typographyNames = draft.typography.map((value) => value.name)
  return draft.typography.every((value) => !definitionNameError(value.name, typographyNames)
    && !cssValueError(value.fontFamily)
    && !cssValueError(value.fontSize, 100)
    && !cssValueError(value.fontWeight, 100)
    && !cssValueError(value.lineHeight, 100)
    && (!value.letterSpacing || !cssValueError(value.letterSpacing, 100)))
}

function DefinitionField({ label, value, placeholder, maximum, error, onChange, className }: {
  readonly label: string
  readonly value: string
  readonly placeholder: string
  readonly maximum: number
  readonly error: string | null
  readonly onChange: (value: string) => void
  readonly className?: string
}) {
  return <TextField className={className} isInvalid={Boolean(error)}><Label>{label}</Label><Input value={value} maxLength={maximum} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />{error && <FieldError className="definition-field-error">{error}</FieldError>}</TextField>
}

function NamedDefinitions({ section, title, description, values, valuePlaceholder, onChange }: {
  readonly section: NamedSection
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
        {values.map((value, index) => <div className="definition-token-row" data-section={section} key={index}>
          <DefinitionField label="Name" value={value.name} maximum={64} placeholder="semantic-name" error={definitionNameError(value.name, values.map((item) => item.name))} onChange={(name) => update(index, { name })} />
          <DefinitionField label="Value" value={value.value} maximum={500} placeholder={valuePlaceholder} error={cssValueError(value.value)} onChange={(nextValue) => update(index, { value: nextValue })} />
          <DefinitionField label="Description" value={value.description ?? ''} maximum={500} placeholder="Optional role guidance" error={null} onChange={(description) => update(index, { description: description || null })} />
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
          <DefinitionField label="Name" value={value.name} maximum={64} placeholder="body" error={definitionNameError(value.name, values.map((item) => item.name))} onChange={(name) => update(index, { name })} />
          <DefinitionField label="Font family" value={value.fontFamily} maximum={500} placeholder="Inter, sans-serif" error={cssValueError(value.fontFamily)} onChange={(fontFamily) => update(index, { fontFamily })} />
          <DefinitionField label="Size" value={value.fontSize} maximum={100} placeholder="1rem" error={cssValueError(value.fontSize, 100)} onChange={(fontSize) => update(index, { fontSize })} />
          <DefinitionField label="Weight" value={value.fontWeight} maximum={100} placeholder="400" error={cssValueError(value.fontWeight, 100)} onChange={(fontWeight) => update(index, { fontWeight })} />
          <DefinitionField label="Line height" value={value.lineHeight} maximum={100} placeholder="1.5" error={cssValueError(value.lineHeight, 100)} onChange={(lineHeight) => update(index, { lineHeight })} />
          <DefinitionField label="Letter spacing" value={value.letterSpacing ?? ''} maximum={100} placeholder="Optional" error={value.letterSpacing ? cssValueError(value.letterSpacing, 100) : null} onChange={(letterSpacing) => update(index, { letterSpacing: letterSpacing || null })} />
          <DefinitionField className="definition-description-field" label="Description" value={value.description ?? ''} maximum={500} placeholder="Optional role guidance" error={null} onChange={(description) => update(index, { description: description || null })} />
          <Button className="icon-button definition-remove" aria-label={`Remove ${value.name || 'typography'} definition`} onPress={() => onChange(values.filter((_, valueIndex) => valueIndex !== index))}><TrashIcon aria-hidden="true" /></Button>
        </div>)}
      </div> : <p className="definition-empty">No typography roles defined yet.</p>}
    </section>
  )
}

export function DesignDefinitions({ project, providers, onBack, onSaved, initialSetupPath = null }: {
  readonly project: ProjectSummary
  readonly providers: readonly ProviderStatus[]
  readonly onBack: () => void
  readonly onSaved: (version: ProjectDesignDefinitionVersion) => void
  readonly initialSetupPath?: 'proposal' | 'manual' | null
}) {
  const [draft, setDraft] = useState<ProjectDesignDefinitions>(emptyDefinitions)
  const [currentVersion, setCurrentVersion] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [proposing, setProposing] = useState(false)
  const [proposalReady, setProposalReady] = useState(false)
  const autoProposalStarted = useRef(false)
  const firstProvider = providers.find((provider) => provider.installed && provider.authenticated && provider.models.length)
  const valid = draftIsValid(draft)
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

  useEffect(() => {
    if (initialSetupPath !== 'proposal' || loading || !firstProvider || autoProposalStarted.current) return
    autoProposalStarted.current = true
    void propose()
  }, [initialSetupPath, loading, firstProvider])

  return (
    <main className="definitions-main">
      <div className="definitions-content">
        <header className="definitions-heading">
          <Button className="icon-button" aria-label="Back" onPress={onBack}><ArrowLeftIcon aria-hidden="true" /></Button>
          <span><h1>Design definitions</h1><p>{project.name} · {currentVersion ? `Version ${currentVersion}` : 'Not set up'}</p></span>
          <Button className="primary-action" isDisabled={loading || saving || !valid} onPress={() => void save()}>{saving ? 'Saving…' : 'Save definitions'}</Button>
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
          <NamedDefinitions section="colors" title="Colors" description="Semantic project colors used across new designs." values={draft.colors} valuePlaceholder="#725d78 or oklch(… )" onChange={(values) => setNamed('colors', values)} />
          <TypographyDefinitions values={draft.typography} onChange={(typography) => setDraft((current) => ({ ...current, typography }))} />
          <NamedDefinitions section="spacing" title="Spacing" description="Reusable spacing values for layout and component rhythm." values={draft.spacing} valuePlaceholder="1rem" onChange={(values) => setNamed('spacing', values)} />
          <NamedDefinitions section="shape" title="Shape" description="Semantic radii, border widths, and related shape values." values={draft.shape} valuePlaceholder="0.625rem" onChange={(values) => setNamed('shape', values)} />
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
