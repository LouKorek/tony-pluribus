import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { AuthProvider } from './lib/auth'
import { NotificationsProvider } from './lib/notifications'
import ViewAsBanner from './components/ViewAsBanner'
import './lib/install'
import './lib/theme'

// A successful start clears the one-time reload flag used when a deploy replaces page files.
window.setTimeout(() => { try { sessionStorage.removeItem('tonynext.reloaded') } catch { /* storage blocked */ } }, 10000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <NotificationsProvider>
          <App />
          <ViewAsBanner />
        </NotificationsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
