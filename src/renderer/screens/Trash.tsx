import { useState } from 'react'
import { Button } from 'react-aria-components'
import { AppModal } from '../components/AppModal'

export function Trash({ items, onRestore, onPurge, onEmpty }: { readonly items: readonly TrashItem[]; readonly onRestore: (item: TrashItem) => Promise<void>; readonly onPurge: (item: TrashItem) => Promise<void>; readonly onEmpty: (items: readonly TrashItem[]) => Promise<void> }) {
  const [pendingPurge, setPendingPurge] = useState<TrashItem | 'all' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<void>, close?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      close?.()
      setPendingPurge(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The trash action could not be completed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="settings-main">
      <div className="settings-content">
        <header className="page-heading"><h1>Trash</h1><p>Deleted projects and designs are recoverable for 30 days. Linked source folders are never deleted.</p></header>
        <section className="settings-section" aria-labelledby="trash-heading">
          <div className="section-heading"><h2 id="trash-heading">Recently deleted</h2><span className="section-heading-actions"><span>{items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'Empty'}</span>{items.length > 0 && <Button className="secondary-action danger-action" onPress={() => setPendingPurge('all')}>Empty trash</Button>}</span></div>
          <div className="generation-list">
            {items.map((item) => <article className="generation-row" key={`${item.kind}-${item.id}`}>
              <span className="generation-copy"><strong>{item.name}</strong><small>{item.kind === 'project' ? 'Project' : `Design in ${item.projectName ?? 'project'}`} · Purges {new Date(item.purgeAt).toLocaleDateString()}</small></span>
              <Button className="secondary-action" isDisabled={busy} onPress={() => void run(() => onRestore(item))}>Restore</Button>
              <Button className="secondary-action danger-action" isDisabled={busy} onPress={() => setPendingPurge(item)}>Delete permanently</Button>
            </article>)}
            {!items.length && <p className="settings-empty">No deleted projects or designs.</p>}
          </div>
          {error && <p className="trash-error" role="alert">{error}</p>}
        </section>
      </div>
      <AppModal isOpen={pendingPurge !== null} onOpenChange={(open) => { if (!open && !busy) setPendingPurge(null) }} title={pendingPurge === 'all' ? 'Empty trash?' : `Permanently delete ${pendingPurge?.name ?? 'item'}?`}>
        {(close) => <>
          <p>{pendingPurge === 'all' ? `This permanently deletes all ${items.length} trashed item${items.length === 1 ? '' : 's'} and their OmniDesign history.` : 'This permanently deletes the design and its OmniDesign history.'} This cannot be undone. Linked source folders remain untouched.</p>
          <div className="clone-modal-actions"><Button className="secondary-action" isDisabled={busy} onPress={close}>Cancel</Button><Button className="clone-confirm-action danger-confirm-action" isDisabled={busy} onPress={() => void run(() => pendingPurge === 'all' ? onEmpty(items) : pendingPurge ? onPurge(pendingPurge) : Promise.resolve(), close)}>{busy ? 'Deleting…' : pendingPurge === 'all' ? 'Empty trash' : 'Delete permanently'}</Button></div>
        </>}
      </AppModal>
    </main>
  )
}
