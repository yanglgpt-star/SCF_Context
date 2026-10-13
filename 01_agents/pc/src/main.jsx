import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { TabProvider } from './stores/tabStore'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <TabProvider>
        <App />
      </TabProvider>
    </BrowserRouter>
  </React.StrictMode>
)
