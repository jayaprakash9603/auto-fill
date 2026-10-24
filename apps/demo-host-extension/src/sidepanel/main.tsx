import '@universal-form-autofill/sdk/style.css'

import { AutofillPanel } from '@universal-form-autofill/sdk/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { createHost } from '../shared/host'

const host = createHost()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AutofillPanel host={host} embedded className="ufa:h-full" />
  </StrictMode>,
)
