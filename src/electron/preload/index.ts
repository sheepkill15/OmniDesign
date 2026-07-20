import { contextBridge, ipcRenderer } from 'electron'
import type { ProviderActivity, ProviderPrompt } from '../provider/types.js'
import type { GenerationActivity, Layout, PreviewRequest } from '../workspace/contracts.js'

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
    get: (designId: string) => ipcRenderer.invoke('workspace:get', { designId }),
    create: (prompt: string) => ipcRenderer.invoke('workspace:create', { prompt }),
    generate: (designId: string, prompt: string) => ipcRenderer.invoke('workspace:generate', { designId, prompt }),
    selectRevision: (designId: string, revisionId: string) => ipcRenderer.invoke('workspace:select-revision', { designId, revisionId }),
    restoreRevision: (designId: string, revisionId: string) => ipcRenderer.invoke('workspace:restore-revision', { designId, revisionId }),
    saveDraft: (designId: string, draft: string) => ipcRenderer.invoke('workspace:save-draft', { designId, draft }),
    saveLayout: (designId: string, layout: Layout) => ipcRenderer.invoke('workspace:save-layout', { designId, layout }),
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
  },
  preview: {
    show: (request: PreviewRequest) => ipcRenderer.invoke('preview:show', request),
    resize: (bounds: PreviewRequest['bounds']) => ipcRenderer.invoke('preview:resize', bounds),
    hide: () => ipcRenderer.invoke('preview:hide'),
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
  },
})
