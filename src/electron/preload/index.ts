import { contextBridge, ipcRenderer } from 'electron'
import type { ProviderActivity, ProviderPrompt } from '../provider/types.js'
import type { GenerationActivity, GenerationSelection, Layout, PreviewRequest } from '../workspace/contracts.js'

contextBridge.exposeInMainWorld('omnidesign', {
  providers: {
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
    get: (designId: string) => ipcRenderer.invoke('workspace:get', { designId }),
    create: (prompt: string, providerId = 'mock', modelId = 'mock-v1', effort?: string, target?: { sourceProjectPath?: string | null; projectId?: string | null } | null) => ipcRenderer.invoke('workspace:create', { prompt, providerId, modelId, effort: effort ?? null, sourceProjectPath: target?.sourceProjectPath ?? null, projectId: target?.projectId ?? null }),
    generate: (designId: string, prompt: string, providerId = 'mock', modelId = 'mock-v1', effort?: string) => ipcRenderer.invoke('workspace:generate', { designId, prompt, providerId, modelId, effort: effort ?? null }),
    chooseProjectFolder: () => ipcRenderer.invoke('workspace:choose-project-folder'),
    cancelGeneration: (jobId: string) => ipcRenderer.invoke('workspace:cancel-generation', { jobId }),
    retryGeneration: (jobId: string) => ipcRenderer.invoke('workspace:retry-generation', { jobId }),
    selectRevision: (designId: string, revisionId: string) => ipcRenderer.invoke('workspace:select-revision', { designId, revisionId }),
    restoreRevision: (designId: string, revisionId: string) => ipcRenderer.invoke('workspace:restore-revision', { designId, revisionId }),
    saveDraft: (designId: string, draft: string) => ipcRenderer.invoke('workspace:save-draft', { designId, draft }),
    saveLayout: (designId: string, layout: Layout) => ipcRenderer.invoke('workspace:save-layout', { designId, layout }),
    saveSelection: (designId: string, selection: GenerationSelection) => ipcRenderer.invoke('workspace:save-design-selection', { designId, selection }),
    exportRevision: (designId: string, revisionId: string) => ipcRenderer.invoke('workspace:export', { designId, revisionId }),
    onActivity: (listener: (activity: GenerationActivity) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, activity: GenerationActivity) => listener(activity)
      ipcRenderer.on('workspace:activity', handler)
      return () => ipcRenderer.removeListener('workspace:activity', handler)
    },
  },
  settings: {
    getTheme: () => ipcRenderer.invoke('settings:get-theme'),
    saveTheme: (theme: 'dark' | 'light') => ipcRenderer.invoke('settings:save-theme', theme),
    getGenerationDefaults: () => ipcRenderer.invoke('settings:get-generation-defaults'),
    saveGenerationDefaults: (selection: GenerationSelection) => ipcRenderer.invoke('settings:save-generation-defaults', selection),
  },
  preview: {
    show: (request: PreviewRequest) => ipcRenderer.invoke('preview:show', request),
    resize: (bounds: PreviewRequest['bounds']) => ipcRenderer.invoke('preview:resize', bounds),
    hide: () => ipcRenderer.invoke('preview:hide'),
    popOut: (request: { designId: string; revisionId: string }) => ipcRenderer.invoke('preview:pop-out', request),
    setSuspended: (suspended: boolean) => ipcRenderer.invoke('preview:set-suspended', suspended),
    freeze: () => ipcRenderer.invoke('preview:freeze'),
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
