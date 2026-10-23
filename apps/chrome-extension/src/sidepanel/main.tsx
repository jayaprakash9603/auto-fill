import '../shared/page.css'

import { AutofillPanel } from '@ufa/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { createHost } from '../shared/host'

const host = createHost()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AutofillPanel host={host} embedded className="ufa:h-full" />
  </StrictMode>,
)
