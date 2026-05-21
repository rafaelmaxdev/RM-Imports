import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.tsx'

// Initialize Mercado Pago SDK
import { initMercadoPago } from '@mercadopago/sdk-react'
const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY
if (MP_PUBLIC_KEY) {
  initMercadoPago(MP_PUBLIC_KEY)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
)
