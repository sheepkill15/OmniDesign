import { useState } from 'react'
import { Button, Radio, RadioGroup, Switch } from 'react-aria-components'

export function Settings({ theme, notificationsEnabled, generationDetail, initialError, onThemeChange, onNotificationsChange, onGenerationDetailChange }: { readonly theme: 'dark' | 'light'; readonly notificationsEnabled: boolean; readonly generationDetail: 'full' | 'concise'; readonly initialError: string | null; readonly onThemeChange: (theme: 'dark' | 'light') => Promise<void>; readonly onNotificationsChange: (enabled: boolean) => Promise<void>; readonly onGenerationDetailChange: (detail: 'full' | 'concise') => Promise<void> }) {
  const [saving, setSaving] = useState<'appearance' | 'notifications' | 'details' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const save = async (section: 'appearance' | 'notifications' | 'details', action: () => Promise<void>) => {
    setSaving(section)
    setError(null)
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'The setting could not be saved.')
    } finally {
      setSaving(null)
    }
  }
  return (
    <main className="settings-main">
      <div className="settings-content">
        <header className="page-heading"><h1>Settings</h1><p>Choose how OmniDesign’s trusted workspace appears on this device.</p></header>
        {(error || initialError) && <div className="workspace-feedback" data-tone="error" role="alert"><span><strong>Settings could not be synchronized.</strong><small>{error ?? initialError}</small></span>{error && <Button className="text-button" onPress={() => setError(null)}>Dismiss</Button>}</div>}
        <section className="settings-section" aria-labelledby="appearance-heading">
          <div className="section-heading"><h2 id="appearance-heading">Appearance</h2><span>{saving === 'appearance' ? 'Saving…' : 'Saved locally'}</span></div>
          <RadioGroup aria-label="Application theme" className="theme-options" value={theme} isDisabled={saving !== null} onChange={(value) => void save('appearance', () => onThemeChange(value as 'dark' | 'light'))}>
            <Radio className="theme-option" value="dark"><span className="theme-swatch theme-swatch-dark" aria-hidden="true" /><span><strong>Dark</strong><small>Default for focused design work</small></span></Radio>
            <Radio className="theme-option" value="light"><span className="theme-swatch theme-swatch-light" aria-hidden="true" /><span><strong>Light</strong><small>A bright, low-glare workspace</small></span></Radio>
          </RadioGroup>
        </section>
        <section className="settings-section" aria-labelledby="notifications-heading">
          <div className="section-heading"><h2 id="notifications-heading">Notifications</h2><span>{saving === 'notifications' ? 'Saving…' : 'Saved locally'}</span></div>
          <div className="settings-row"><span><strong>System notifications</strong><small>Notify when generation completes or needs attention.</small></span><Switch aria-label="System notifications" className="settings-switch" isDisabled={saving !== null} isSelected={notificationsEnabled} onChange={(value) => void save('notifications', () => onNotificationsChange(value))}><span className="settings-switch-state">{notificationsEnabled ? 'On' : 'Off'}</span><span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb" /></span></Switch></div>
        </section>
        <section className="settings-section" aria-labelledby="generation-detail-heading">
          <div className="section-heading"><h2 id="generation-detail-heading">Generation details</h2><span>{saving === 'details' ? 'Saving…' : 'Saved locally'}</span></div>
          <RadioGroup aria-label="Generation detail level" className="theme-options" value={generationDetail} isDisabled={saving !== null} onChange={(value) => void save('details', () => onGenerationDetailChange(value as 'full' | 'concise'))}>
            <Radio className="theme-option" value="full"><span><strong>Full</strong><small>Provider activity, tool work, stages, and validation details</small></span></Radio>
            <Radio className="theme-option" value="concise"><span><strong>Concise</strong><small>Queue and final outcomes only</small></span></Radio>
          </RadioGroup>
        </section>
      </div>
    </main>
  )
}
