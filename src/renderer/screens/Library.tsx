import {
  ArrowRightIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  FolderIcon,
  FolderPlusIcon,
  MagnifyingGlassIcon,
  RectangleStackIcon,
  TagIcon,
} from '@heroicons/react/24/outline'
import { useMemo, useState } from 'react'
import { Button, Input, Menu, MenuItem, MenuSection, Header as AriaHeader, TextField } from 'react-aria-components'
import { DropdownButton } from '../components/DropdownButton'
import { AppModal } from '../components/AppModal'

type FolderDialog =
  | { readonly mode: 'create'; readonly parentFolderId: string | null; readonly title: string }
  | { readonly mode: 'rename'; readonly folder: Folder; readonly title: string }

type SortKey = 'recent' | 'name' | 'provider'

function providerLabel(providerId: string | null): string {
  if (!providerId || providerId === 'mock') return 'Development provider'
  return providerId[0].toUpperCase() + providerId.slice(1)
}

function TagChip({ tag, selected, onToggle, onRemove }: {
  readonly tag: Tag
  readonly selected?: boolean
  readonly onToggle?: () => void
  readonly onRemove?: () => void
}) {
  return (
    <span className="library-tag" data-color={tag.color} data-selected={selected || undefined}>
      {onToggle
        ? <Button className="library-tag-toggle" aria-pressed={selected} onPress={onToggle}>{tag.name}</Button>
        : <span className="library-tag-label">{tag.name}</span>}
      {onRemove && <Button className="library-tag-remove" aria-label={`Remove tag ${tag.name}`} onPress={onRemove}>×</Button>}
    </span>
  )
}

// The menu used to add/remove tags on a project or design, and to spin up a brand-new tag inline.
function TagAssignMenu({ tags, assigned, onToggle, onCreate }: {
  readonly tags: readonly Tag[]
  readonly assigned: readonly Tag[]
  readonly onToggle: (tag: Tag, next: boolean) => void
  readonly onCreate: (name: string) => void
}) {
  const [draft, setDraft] = useState('')
  const assignedIds = new Set(assigned.map((tag) => tag.id))
  return (
    <DropdownButton label="Tags" triggerClassName="icon-button" popoverClassName="project-popover library-tag-popover" placement="bottom" trigger={<TagIcon aria-hidden="true" />}>
      <div className="library-tag-menu">
        <TextField aria-label="New tag name" className="library-tag-create">
          <Input value={draft} placeholder="New tag…" maxLength={60} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && draft.trim()) { onCreate(draft.trim()); setDraft('') } }} />
        </TextField>
        {tags.length
          ? <Menu aria-label="Toggle tags" className="library-tag-options" selectionMode="none">
              {tags.map((tag) => <MenuItem key={tag.id} id={tag.id} textValue={tag.name} onAction={() => onToggle(tag, !assignedIds.has(tag.id))}>
                <span className="library-tag-dot" data-color={tag.color} aria-hidden="true" />
                <span>{tag.name}</span>
                {assignedIds.has(tag.id) && <span className="library-tag-check" aria-hidden="true">✓</span>}
              </MenuItem>)}
            </Menu>
          : <p className="library-tag-empty">No tags yet. Type a name above to create one.</p>}
      </div>
    </DropdownButton>
  )
}

interface FolderNode {
  readonly folder: Folder
  readonly children: FolderNode[]
  readonly projectCount: number
}

function buildFolderTree(folders: readonly Folder[], projects: readonly ProjectSummary[]): FolderNode[] {
  const directCounts = new Map<string, number>()
  for (const project of projects) if (project.folderId) directCounts.set(project.folderId, (directCounts.get(project.folderId) ?? 0) + 1)
  const byParent = new Map<string | null, Folder[]>()
  for (const folder of folders) {
    const key = folder.parentFolderId
    byParent.set(key, [...(byParent.get(key) ?? []), folder])
  }
  const build = (parentId: string | null): FolderNode[] =>
    (byParent.get(parentId) ?? []).map((folder) => ({ folder, children: build(folder.id), projectCount: directCounts.get(folder.id) ?? 0 }))
  return build(null)
}

function FolderRow({ node, depth, selectedFolderId, onSelect, onRename, onDelete, onAddSubfolder }: {
  readonly node: FolderNode
  readonly depth: number
  readonly selectedFolderId: string | null
  readonly onSelect: (folderId: string) => void
  readonly onRename: (folder: Folder) => void
  readonly onDelete: (folder: Folder) => void
  readonly onAddSubfolder: (folder: Folder) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0
  return (
    <div className="library-folder-node">
      <div className="library-folder-row" data-active={node.folder.id === selectedFolderId || undefined} style={{ paddingLeft: `${8 + depth * 14}px` }}>
        {hasChildren
          ? <Button className="library-folder-disclosure" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.folder.name}`} aria-expanded={expanded} onPress={() => setExpanded((value) => !value)}><ChevronRightIcon aria-hidden="true" data-expanded={expanded || undefined} /></Button>
          : <span className="library-folder-disclosure-spacer" aria-hidden="true" />}
        <Button className="library-folder-open" onPress={() => onSelect(node.folder.id)}>
          <FolderIcon aria-hidden="true" />
          <span>{node.folder.name}</span>
          <span className="library-folder-count" aria-hidden="true">{node.projectCount || ''}</span>
        </Button>
        <DropdownButton label={`Manage ${node.folder.name}`} triggerClassName="icon-button library-folder-menu" popoverClassName="project-popover" placement="bottom" trigger={<span aria-hidden="true">⋯</span>}>
          <Menu aria-label={`${node.folder.name} actions`}>
            <MenuItem id="subfolder" onAction={() => onAddSubfolder(node.folder)}>New subfolder…</MenuItem>
            <MenuItem id="rename" onAction={() => onRename(node.folder)}>Rename…</MenuItem>
            <MenuItem id="delete" onAction={() => onDelete(node.folder)}>Delete folder</MenuItem>
          </Menu>
        </DropdownButton>
      </div>
      {expanded && hasChildren && <div className="library-folder-children">{node.children.map((child) => <FolderRow key={child.folder.id} node={child} depth={depth + 1} selectedFolderId={selectedFolderId} onSelect={onSelect} onRename={onRename} onDelete={onDelete} onAddSubfolder={onAddSubfolder} />)}</div>}
    </div>
  )
}

export interface LibraryProps {
  readonly projects: readonly ProjectSummary[]
  readonly designs: readonly OmniDesignDocument[]
  readonly folders: readonly Folder[]
  readonly tags: readonly Tag[]
  readonly onOpenProject: (project: ProjectSummary) => void
  readonly onOpenDesign: (design: OmniDesignDocument) => void
  readonly onCreateFolder: (name: string, parentFolderId: string | null) => Promise<void>
  readonly onRenameFolder: (folderId: string, name: string) => Promise<void>
  readonly onDeleteFolder: (folderId: string) => Promise<void>
  readonly onMoveProjectToFolder: (projectId: string, folderId: string | null) => Promise<void>
  readonly onCreateTag: (name: string) => Promise<Tag | null>
  readonly onDeleteTag: (tagId: string) => Promise<void>
  readonly onToggleTag: (targetKind: 'project' | 'design', targetId: string, tag: Tag, next: boolean) => Promise<void>
  readonly onDuplicateDesign: (design: OmniDesignDocument) => Promise<void>
  readonly onMoveDesign: (design: OmniDesignDocument, projectId: string) => Promise<void>
  readonly onTrashDesign: (design: OmniDesignDocument) => Promise<void>
}

// The Library is the "browse everything" surface: every project and design in one place, organized by
// folders, cross-cut by tags, and filterable by text, provider, and tag. Filtering and sorting are all
// client-side over the data the app already loaded.
export function Library(props: LibraryProps) {
  const { projects, designs, folders, tags } = props
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null) // null = all
  const [unfiledOnly, setUnfiledOnly] = useState(false)
  const [activeTagIds, setActiveTagIds] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [folderDialog, setFolderDialog] = useState<FolderDialog | null>(null)
  const [folderDraft, setFolderDraft] = useState('')

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setError(null)
    try { await action() } catch (reason) { setError(`${failure}${reason instanceof Error && reason.message ? ` ${reason.message}` : ''}`) }
  }

  const folderTree = useMemo(() => buildFolderTree(folders, projects), [folders, projects])
  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const linkedProjects = useMemo(() => projects.filter((project) => project.kind === 'linked'), [projects])

  const matchesFolder = (project: ProjectSummary | undefined): boolean => {
    if (unfiledOnly) return !project?.folderId
    if (!selectedFolderId) return true
    return project?.folderId === selectedFolderId
  }
  const matchesTags = (ownTags: readonly Tag[], project: ProjectSummary | undefined): boolean => {
    if (!activeTagIds.length) return true
    const combined = new Set([...ownTags.map((tag) => tag.id), ...(project?.tags ?? []).map((tag) => tag.id)])
    return activeTagIds.some((id) => combined.has(id))
  }
  const matchesQuery = (design: OmniDesignDocument, project: ProjectSummary | undefined): boolean => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    const haystack = [design.title, project?.name ?? design.projectName, providerLabel(design.lastSelection.providerId), ...design.tags.map((tag) => tag.name), ...(project?.tags ?? []).map((tag) => tag.name)].join(' ').toLowerCase()
    return haystack.includes(needle)
  }

  const filteredDesigns = useMemo(() => {
    const list = designs.filter((design) => {
      const project = projectsById.get(design.projectId)
      return matchesFolder(project) && matchesTags(design.tags, project) && matchesQuery(design, project)
    })
    const sorted = [...list]
    if (sort === 'name') sorted.sort((a, b) => a.title.localeCompare(b.title))
    else if (sort === 'provider') sorted.sort((a, b) => providerLabel(a.lastSelection.providerId).localeCompare(providerLabel(b.lastSelection.providerId)) || b.updatedAt.localeCompare(a.updatedAt))
    else sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return sorted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designs, projectsById, sort, query, selectedFolderId, unfiledOnly, activeTagIds])

  const visibleProjects = useMemo(() => projects.filter((project) => matchesFolder(project) && matchesTags([], project) && (!query.trim() || project.name.toLowerCase().includes(query.trim().toLowerCase()))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, selectedFolderId, unfiledOnly, activeTagIds, query])

  const toggleTagFilter = (tagId: string) => setActiveTagIds((current) => current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId])
  const openFolderDialog = (dialog: FolderDialog) => { setFolderDraft(dialog.mode === 'rename' ? dialog.folder.name : ''); setFolderDialog(dialog) }
  const addRootFolder = () => openFolderDialog({ mode: 'create', parentFolderId: null, title: 'New folder' })
  const addSubfolder = (parent: Folder) => openFolderDialog({ mode: 'create', parentFolderId: parent.id, title: `New subfolder in ${parent.name}` })
  const renameFolder = (folder: Folder) => openFolderDialog({ mode: 'rename', folder, title: `Rename ${folder.name}` })
  const submitFolderDialog = async (close: () => void) => {
    const name = folderDraft.trim()
    if (!folderDialog || !name) return
    await run(() => folderDialog.mode === 'create' ? props.onCreateFolder(name, folderDialog.parentFolderId) : props.onRenameFolder(folderDialog.folder.id, name), 'The folder could not be saved.')
    close()
    setFolderDialog(null)
  }
  const deleteFolder = (folder: Folder) => { if (window.confirm(`Delete “${folder.name}”? Projects inside it return to the library root; no designs are deleted.`)) void run(() => props.onDeleteFolder(folder.id), 'The folder could not be deleted.') }

  const folderName = selectedFolderId ? folders.find((folder) => folder.id === selectedFolderId)?.name ?? 'Folder' : unfiledOnly ? 'Unfiled' : 'All projects'

  return (
    <main className="library-main">
      <aside className="library-rail" aria-label="Folders">
        <div className="library-rail-heading"><span>Folders</span><Button className="icon-button" aria-label="New folder" onPress={addRootFolder}><FolderPlusIcon aria-hidden="true" /></Button></div>
        <div className="library-folder-tree">
          <Button className="library-folder-open library-folder-root" data-active={!selectedFolderId && !unfiledOnly || undefined} onPress={() => { setSelectedFolderId(null); setUnfiledOnly(false) }}><RectangleStackIcon aria-hidden="true" /><span>All projects</span></Button>
          <Button className="library-folder-open library-folder-root" data-active={unfiledOnly || undefined} onPress={() => { setSelectedFolderId(null); setUnfiledOnly(true) }}><FolderIcon aria-hidden="true" /><span>Unfiled</span></Button>
          {folderTree.map((node) => <FolderRow key={node.folder.id} node={node} depth={0} selectedFolderId={selectedFolderId} onSelect={(id) => { setSelectedFolderId(id); setUnfiledOnly(false) }} onRename={renameFolder} onDelete={deleteFolder} onAddSubfolder={addSubfolder} />)}
          {!folders.length && <p className="library-rail-empty">Create folders to organize your projects.</p>}
        </div>
        {tags.length > 0 && <div className="library-rail-tags">
          <div className="library-rail-heading"><span>Tags</span></div>
          <div className="library-tag-filter">
            {tags.map((tag) => <TagChip key={tag.id} tag={tag} selected={activeTagIds.includes(tag.id)} onToggle={() => toggleTagFilter(tag.id)} onRemove={() => void run(() => props.onDeleteTag(tag.id), 'The tag could not be deleted.')} />)}
          </div>
        </div>}
      </aside>
      <div className="library-content">
        <header className="page-heading library-heading">
          <div><h1>Library</h1><p>Browse every project and design. Organize with folders, label with tags.</p></div>
          <div className="library-controls">
            <TextField aria-label="Search the library" className="library-search">
              <MagnifyingGlassIcon aria-hidden="true" />
              <Input value={query} placeholder={`Search ${folderName}…`} onChange={(event) => setQuery(event.target.value)} />
            </TextField>
            <DropdownButton label="Sort designs" triggerClassName="secondary-action" popoverClassName="project-popover" placement="bottom" trigger={<span>Sort: {sort === 'recent' ? 'Recent' : sort === 'name' ? 'Name' : 'Provider'}</span>}>
              <Menu aria-label="Sort by" onAction={(key) => setSort(key as SortKey)}>
                <MenuItem id="recent">Recently updated</MenuItem>
                <MenuItem id="name">Name</MenuItem>
                <MenuItem id="provider">Provider</MenuItem>
              </Menu>
            </DropdownButton>
          </div>
        </header>
        {error && <div className="workspace-feedback" data-tone="error" role="alert"><span><strong>Library action failed.</strong><small>{error}</small></span><Button className="text-button" onPress={() => setError(null)}>Dismiss</Button></div>}
        {activeTagIds.length > 0 && <div className="library-active-filters"><span>Filtering by:</span>{activeTagIds.map((id) => { const tag = tags.find((candidate) => candidate.id === id); return tag ? <TagChip key={id} tag={tag} selected onToggle={() => toggleTagFilter(id)} /> : null })}<Button className="text-button" onPress={() => setActiveTagIds([])}>Clear</Button></div>}

        <section className="library-section" aria-labelledby="library-projects">
          <div className="section-heading"><h2 id="library-projects">Projects</h2><span>{visibleProjects.length ? `${visibleProjects.length} project${visibleProjects.length === 1 ? '' : 's'}` : 'None here'}</span></div>
          <div className="library-project-rows">
            {visibleProjects.map((project) => (
              <article className="library-project-row" key={project.id}>
                <Button className="library-project-open" aria-label={`Open ${project.name}`} onPress={() => props.onOpenProject(project)}>
                  {project.kind === 'linked' ? <FolderIcon aria-hidden="true" /> : <DocumentDuplicateIcon aria-hidden="true" />}
                  <span className="library-project-copy"><strong>{project.name}</strong><small>{project.designCount} design{project.designCount === 1 ? '' : 's'} · {providerLabel(project.lastProviderId)}</small></span>
                </Button>
                {project.tags.length > 0 && <span className="library-row-tags">{project.tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}</span>}
                <span className="library-row-actions">
                  <TagAssignMenu tags={tags} assigned={project.tags} onToggle={(tag, next) => void run(() => props.onToggleTag('project', project.id, tag, next), 'The tag could not be updated.')} onCreate={(name) => void run(async () => { const tag = await props.onCreateTag(name); if (tag) await props.onToggleTag('project', project.id, tag, true) }, 'The tag could not be created.')} />
                  <DropdownButton label={`Move ${project.name} to a folder`} triggerClassName="icon-button" popoverClassName="project-popover" placement="bottom" trigger={<FolderIcon aria-hidden="true" />}>
                    <Menu aria-label="Move to folder" onAction={(key) => void run(() => props.onMoveProjectToFolder(project.id, key === 'root' ? null : String(key)), 'The project could not be moved.')}>
                      <MenuItem id="root">Library root</MenuItem>
                      {folders.length > 0 && <MenuSection><AriaHeader className="project-popover-header">Folders</AriaHeader>{folders.map((folder) => <MenuItem key={folder.id} id={folder.id}>{folder.name}</MenuItem>)}</MenuSection>}
                    </Menu>
                  </DropdownButton>
                </span>
              </article>
            ))}
            {!visibleProjects.length && <p className="settings-empty">No projects match the current folder and filters.</p>}
          </div>
        </section>

        <section className="library-section" aria-labelledby="library-designs">
          <div className="section-heading"><h2 id="library-designs">Designs</h2><span>{filteredDesigns.length ? `${filteredDesigns.length} design${filteredDesigns.length === 1 ? '' : 's'}` : 'None here'}</span></div>
          {filteredDesigns.length
            ? <div className="design-grid library-design-grid" role="group" aria-label="Designs">
                {filteredDesigns.map((design) => {
                  const project = projectsById.get(design.projectId)
                  return (
                    <article className="design-card" key={design.id}>
                      <Button aria-label={`Open ${design.title}`} className="design-card-open" onPress={() => props.onOpenDesign(design)}>
                        <span className="design-card-thumb">{design.thumbnailDataUrl ? <img alt={`Preview of ${design.title}`} className="mini-preview-image" src={design.thumbnailDataUrl} /> : <span className="mini-preview preview-sand" aria-hidden="true"><span className="preview-rail" /><span className="preview-line preview-line-long" /><span className="preview-line" /><span className="preview-block" /></span>}</span>
                      </Button>
                      <span className="design-card-body">
                        <strong className="library-card-title">{design.title}</strong>
                        <small>{project?.name ?? design.projectName}</small>
                        {design.tags.length > 0 && <span className="library-row-tags">{design.tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}</span>}
                        <span className="design-card-meta"><span>{new Date(design.updatedAt).toLocaleDateString()}</span><span>{providerLabel(design.lastSelection.providerId)}</span></span>
                        <span className="library-card-actions">
                          <TagAssignMenu tags={tags} assigned={design.tags} onToggle={(tag, next) => void run(() => props.onToggleTag('design', design.id, tag, next), 'The tag could not be updated.')} onCreate={(name) => void run(async () => { const tag = await props.onCreateTag(name); if (tag) await props.onToggleTag('design', design.id, tag, true) }, 'The tag could not be created.')} />
                          <DropdownButton label={`Actions for ${design.title}`} triggerClassName="icon-button" popoverClassName="project-popover" placement="bottom" trigger={<span aria-hidden="true">⋯</span>}>
                            <Menu aria-label={`${design.title} actions`}>
                              <MenuItem id="open" onAction={() => props.onOpenDesign(design)}>Open</MenuItem>
                              <MenuItem id="duplicate" onAction={() => void run(() => props.onDuplicateDesign(design), 'The design could not be duplicated.')}>Duplicate</MenuItem>
                              {linkedProjects.filter((candidate) => candidate.id !== design.projectId).length > 0 && <MenuSection>
                                <AriaHeader className="project-popover-header">Move to project</AriaHeader>
                                {linkedProjects.filter((candidate) => candidate.id !== design.projectId).map((candidate) => <MenuItem key={candidate.id} id={`move:${candidate.id}`} onAction={() => void run(() => props.onMoveDesign(design, candidate.id), 'The design could not be moved.')}>{candidate.name}</MenuItem>)}
                              </MenuSection>}
                              <MenuItem id="trash" onAction={() => void run(() => props.onTrashDesign(design), 'The design could not be removed.')}>Remove</MenuItem>
                            </Menu>
                          </DropdownButton>
                          <ArrowRightIcon className="row-arrow" aria-hidden="true" />
                        </span>
                      </span>
                    </article>
                  )
                })}
              </div>
            : <div className="empty-designs"><DocumentDuplicateIcon aria-hidden="true" /><strong>No designs here</strong><p>{query || activeTagIds.length || selectedFolderId || unfiledOnly ? 'Adjust the folder, tags, or search to see more.' : 'Create a design from Home to fill your library.'}</p></div>}
        </section>
      </div>
      <AppModal isOpen={folderDialog !== null} onOpenChange={(open) => { if (!open) setFolderDialog(null) }} title={folderDialog?.title ?? 'Folder'}>
        {(close) => <>
          <TextField aria-label="Folder name">
            <Input autoFocus value={folderDraft} placeholder="Folder name" maxLength={120} onChange={(event) => setFolderDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submitFolderDialog(close) }} />
          </TextField>
          <div className="clone-modal-actions"><Button className="secondary-action" onPress={close}>Cancel</Button><Button className="clone-confirm-action" isDisabled={!folderDraft.trim()} onPress={() => void submitFolderDialog(close)}>{folderDialog?.mode === 'rename' ? 'Rename' : 'Create folder'}</Button></div>
        </>}
      </AppModal>
    </main>
  )
}
