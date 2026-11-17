import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { captureInviteFromUrl } from './api'
import './index.css'

// Save ?invite=… before anything renders, then remove it from the address bar.
captureInviteFromUrl()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
