import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { AuthProvider } from './lib/auth'
import ViewAsBanner from './components/ViewAsBanner'

// A successful start clears the one-time reload flag used when a deploy replaces page files.
window.setTimeout(() => { try { sessionStorage.removeItem('pluribus.reloaded') } catch { /* storage blocked */ } }, 10000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <ViewAsBanner />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
