import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import './styles.css'

// Apply the persisted theme before the first render; the preload bridge resolved it synchronously.
const initialTheme = window.omnidesign?.initialTheme
if (initialTheme === 'light' || initialTheme === 'dark') document.documentElement.dataset.theme = initialTheme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
)
