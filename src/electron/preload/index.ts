import { contextBridge, ipcRenderer } from 'electron'
import type { ProviderActivity, ProviderPrompt } from '../provider/types.js'
import type { GenerationActivity, GenerationSelection, Layout } from '../workspace/contracts.js'

contextBridge.exposeInMainWorld('omnidesign', {
  providers: {
    developmentProviderEnabled: Boolean(process.env.VITE_DEV_SERVER_URL || process.env.OMNIDESIGN_ENABLE_MOCK_PROVIDER === '1'),
    discover: () => ipcRenderer.invoke('providers:discover'),
    prompt: (request: ProviderPrompt) => ipcRenderer.invoke('providers:prompt', request),
    onActivity: (listener: (activity: ProviderActivity) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, activity: ProviderActivity) => listener(activity)
      ipcRenderer.on('providers:activity', handler)
      return () => ipcRenderer.removeListener('providers:activity', handler)
    },
  },
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    listProjects: () => ipcRenderer.invoke('workspace:list-projects'),
    getProject: (projectId: string) => ipcRenderer.invoke('workspace:get-project', { projectId }),
    getProjectDesignDefinitions: (projectId: string) => ipcRenderer.invoke('workspace:get-project-design-definitions', { projectId }),
    saveProjectDesignDefinitions: (projectId: string, definitions: import('../workspace/contracts.js').ProjectDesignDefinitions) => ipcRenderer.invoke('workspace:save-project-design-definitions', { projectId, definitions }),
    setProjectDefinitionPromptSuppressed: (projectId: string, suppressed: boolean) => ipcRenderer.invoke('workspace:set-project-definition-prompt-suppressed', { projectId, suppressed }),
    associateDesign: (designId: string, projectId: string) => ipcRenderer.invoke('workspace:associate-design', { designId, projectId }),
    duplicateDesign: (designId: string) => ipcRenderer.invoke('workspace:duplicate-design', { designId }),
    associateAndRestart: (designId: string, projectId: string) => ipcRenderer.invoke('workspace:associate-and-restart', { designId, projectId }),
    dismissAdaptation: (designId: string) => ipcRenderer.invoke('workspace:dismiss-adaptation', { designId }),
    listFolders: () => ipcRenderer.invoke('workspace:list-folders'),
    createFolder: (name: string, parentFolderId?: string | null) => ipcRenderer.invoke('workspace:create-folder', { name, parentFolderId: parentFolderId ?? null }),
    renameFolder: (folderId: string, name: string) => ipcRenderer.invoke('workspace:rename-folder', { folderId, name }),
    deleteFolder: (folderId: string) => ipcRenderer.invoke('workspace:delete-folder', { folderId }),
    moveProjectToFolder: (projectId: string, folderId: string | null) => ipcRenderer.invoke('workspace:move-project-to-folder', { projectId, folderId }),
    listTags: () => ipcRenderer.invoke('workspace:list-tags'),
    createTag: (name: string, color: string) => ipcRenderer.invoke('workspace:create-tag', { name, color }),
    deleteTag: (tagId: string) => ipcRenderer.invoke('workspace:delete-tag', { tagId }),
    tag: (targetKind: 'project' | 'design', targetId: string, tagId: string) => ipcRenderer.invoke('workspace:tag', { targetKind, targetId, tagId }),
    untag: (targetKind: 'project' | 'design', targetId: string, tagId: string) => ipcRenderer.invoke('workspace:untag', { targetKind, targetId, tagId }),
    listTrash: () => ipcRenderer.invoke('workspace:list-trash'),
    cloneProject: (remoteUrl: string, destinationPath: string) => ipcRenderer.invoke('workspace:clone-project', { remoteUrl, destinationPath }),
    registerLinkedProject: (sourceProjectPath: string) => ipcRenderer.invoke('workspace:register-linked-project', { sourceProjectPath }),
    reconnectProject: (projectId: string, sourceProjectPath: string) => ipcRenderer.invoke('workspace:reconnect-project', { projectId, sourceProjectPath }),
    convertProjectToStandalone: (projectId: string) => ipcRenderer.invoke('workspace:convert-project-to-standalone', { projectId }),
    trash: (kind: 'project' | 'design', id: string) => ipcRenderer.invoke('workspace:trash', { kind, id }),
    restoreTrash: (kind: 'project' | 'design', id: string) => ipcRenderer.invoke('workspace:restore-trash', { kind, id }),
    purgeTrash: (kind: 'project' | 'design', id: string) => ipcRenderer.invoke('workspace:purge-trash', { kind, id }),
    get: (designId: string) => ipcRenderer.invoke('workspace:get', { designId }),
    renameDesign: (designId: string, title: string) => ipcRenderer.invoke('workspace:rename-design', { designId, title }),
    renameProject: (projectId: string, name: string) => ipcRenderer.invoke('workspace:rename-project', { projectId, name }),
    create: (prompt: string, providerId = 'mock', modelId = 'mock-v1', effort?: string, target?: { sourceProjectPath?: string | null; projectId?: string | null; cloneRemoteUrl?: string | null; cloneDestinationDirectory?: string | null } | null, attachments: readonly import('../workspace/contracts.js').Attachment[] = []) => ipcRenderer.invoke('workspace:create', { prompt, providerId, modelId, effort: effort ?? null, sourceProjectPath: target?.sourceProjectPath ?? null, projectId: target?.projectId ?? null, cloneRemoteUrl: target?.cloneRemoteUrl ?? null, cloneDestinationDirectory: target?.cloneDestinationDirectory ?? null, attachments }),
    generate: (designId: string, prompt: string, providerId = 'mock', modelId = 'mock-v1', effort?: string, attachments: readonly import('../workspace/contracts.js').Attachment[] = []) => ipcRenderer.invoke('workspace:generate', { designId, prompt, providerId, modelId, effort: effort ?? null, attachments }),
    chooseProjectFolder: () => ipcRenderer.invoke('workspace:choose-project-folder'),
    chooseAttachments: (kind: 'files' | 'folder') => ipcRenderer.invoke('workspace:choose-attachments', { kind }),
    openAttachment: (attachment: import('../workspace/contracts.js').Attachment) => ipcRenderer.invoke('workspace:open-attachment', attachment),
    cancelGeneration: (jobId: string) => ipcRenderer.invoke('workspace:cancel-generation', { jobId }),
    removeGeneration: (jobId: string) => ipcRenderer.invoke('workspace:remove-generation', { jobId }),
    retryGeneration: (jobId: string) => ipcRenderer.invoke('workspace:retry-generation', { jobId }),
    continueGeneration: (jobId: string) => ipcRenderer.invoke('workspace:continue-generation', { jobId }),
    resumeGenerationQueue: (designId: string) => ipcRenderer.invoke('workspace:resume-generation-queue', { designId }),
    selectRevision: (designId: string, revisionId: string) => ipcRenderer.invoke('workspace:select-revision', { designId, revisionId }),
    restoreRevision: (designId: string, revisionId: string) => ipcRenderer.invoke('workspace:restore-revision', { designId, revisionId }),
    saveDraft: (designId: string, draft: string, attachments: readonly import('../workspace/contracts.js').Attachment[] = []) => ipcRenderer.invoke('workspace:save-draft', { designId, draft, attachments }),
    saveLayout: (designId: string, layout: Layout) => ipcRenderer.invoke('workspace:save-layout', { designId, layout }),
    saveSelection: (designId: string, selection: GenerationSelection) => ipcRenderer.invoke('workspace:save-design-selection', { designId, selection }),
    exportRevision: (designId: string, revisionId: string) => ipcRenderer.invoke('workspace:export', { designId, revisionId }),
    revisionPages: (designId: string, revisionId: string) => ipcRenderer.invoke('workspace:revision-pages', { designId, revisionId }),
    setEntryPage: (designId: string, entryPagePath: string | null) => ipcRenderer.invoke('workspace:set-entry-page', { designId, entryPagePath }),
    savePageMetadata: (designId: string, path: string, title: string | null, order: number) => ipcRenderer.invoke('workspace:save-page-metadata', { designId, path, title, order }),
    onActivity: (listener: (activity: GenerationActivity) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, activity: GenerationActivity) => listener(activity)
      ipcRenderer.on('workspace:activity', handler)
      return () => ipcRenderer.removeListener('workspace:activity', handler)
    },
    onChanged: (listener: (event: { readonly designId: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, value: { readonly designId: string }) => listener(value)
      ipcRenderer.on('workspace:changed', handler)
      return () => ipcRenderer.removeListener('workspace:changed', handler)
    },
    onCloneActivity: (listener: (detail: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, detail: string) => listener(detail)
      ipcRenderer.on('workspace:clone-activity', handler)
      return () => ipcRenderer.removeListener('workspace:clone-activity', handler)
    },
  },
  settings: {
    getTheme: () => ipcRenderer.invoke('settings:get-theme'),
    saveTheme: (theme: 'dark' | 'light') => ipcRenderer.invoke('settings:save-theme', theme),
    getNotificationsEnabled: () => ipcRenderer.invoke('settings:get-notifications-enabled'),
    saveNotificationsEnabled: (enabled: boolean) => ipcRenderer.invoke('settings:save-notifications-enabled', enabled),
    getGenerationDetail: () => ipcRenderer.invoke('settings:get-generation-detail'),
    saveGenerationDetail: (detail: 'full' | 'concise') => ipcRenderer.invoke('settings:save-generation-detail', detail),
    getGenerationDefaults: () => ipcRenderer.invoke('settings:get-generation-defaults'),
    saveGenerationDefaults: (selection: GenerationSelection) => ipcRenderer.invoke('settings:save-generation-defaults', selection),
    getLastOpenDesignId: () => ipcRenderer.invoke('settings:get-last-open-design'),
    saveLastOpenDesignId: (designId: string | null) => ipcRenderer.invoke('settings:save-last-open-design', designId),
  },
  preview: {
    register: (designId: string, revisionId: string) => ipcRenderer.invoke('preview:register', { designId, revisionId }),
    reportDiagnostic: (designId: string, revisionId: string, diagnostic: { level: 'warning' | 'error'; message: string; source: string | null; line: number | null }) => ipcRenderer.invoke('preview:report-diagnostic', { designId, revisionId, diagnostic }),
    capture: (designId: string, revisionId: string): Promise<boolean> => ipcRenderer.invoke('preview:capture', { designId, revisionId }),
    popOut: (request: { designId: string; revisionId: string; page?: string }) => ipcRenderer.invoke('preview:pop-out', request),
    closePopOut: () => ipcRenderer.invoke('preview:close-pop-out'),
    onDiagnostic: (listener: (event: { designId: string; revisionId: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, diagnostic: { designId: string; revisionId: string }) => listener(diagnostic)
      ipcRenderer.on('preview:diagnostic', handler)
      return () => ipcRenderer.removeListener('preview:diagnostic', handler)
    },
    onThumbnail: (listener: (event: { designId: string; revisionId: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, thumbnail: { designId: string; revisionId: string }) => listener(thumbnail)
      ipcRenderer.on('preview:thumbnail', handler)
      return () => ipcRenderer.removeListener('preview:thumbnail', handler)
    },
    onPoppedIn: (listener: (event: { designId: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { designId: string }) => listener(payload)
      ipcRenderer.on('preview:popped-in', handler)
      return () => ipcRenderer.removeListener('preview:popped-in', handler)
    },
  },
})
