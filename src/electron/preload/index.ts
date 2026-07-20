import { contextBridge, ipcRenderer } from 'electron'
import type { ProviderActivity, ProviderPrompt } from '../provider/types.js'

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
})
