import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { OutputView } from './components/OutputView.tsx'
import { SettingsProvider } from './contexts/SettingsContext.tsx'

const isOutputMode = new URLSearchParams(window.location.search).has('output')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider isOutputMode={isOutputMode}>
      {isOutputMode ? <OutputView /> : <App />}
    </SettingsProvider>
  </StrictMode>,
)
