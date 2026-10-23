import '../shared/page.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { createHost } from '../shared/host'
import { Popup } from './popup'

const host = createHost()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup host={host} />
  </StrictMode>,
)
