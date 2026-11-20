import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { warmUpApi } from './api/client.js'
import './index.css'

// Start waking the API immediately (it may be asleep on free hosting).
warmUpApi()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
