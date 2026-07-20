import { contextBridge, ipcRenderer } from 'electron'
import type { ProviderPrompt } from '../provider/types.js'

contextBridge.exposeInMainWorld('omnidesign', {
  providers: {
    discover: () => ipcRenderer.invoke('providers:discover'),
    prompt: (request: ProviderPrompt) => ipcRenderer.invoke('providers:prompt', request),
  },
})
