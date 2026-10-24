import { createMemoryStorage } from '@ufa/storage'
import { afterEach, describe, expect, it } from 'vitest'

import { createDomPageDriver } from '../dom/dom-page-driver'
import { createAutofill } from './create-autofill'

const FORM = `
  <form>
    <label for="phone">Phone</label>
    <input id="phone" type="tel">
  </form>`

let controller: ReturnType<typeof createAutofill> | null = null

afterEach(async () => {
  await controller?.destroy()
  controller = null
  document.body.innerHTML = ''
})

describe('learning', () => {
  it('captures a typed value when armed and saves it as an answer', async () => {
    document.body.innerHTML = FORM
    controller = createAutofill({
      driver: createDomPageDriver({ observe: false }),
      storage: createMemoryStorage(),
    })
    await controller.store.ready()
    await controller.connect()
    await controller.setLearningArmed(true)
    const input = document.getElementById('phone') as HTMLInputElement
    input.value = '555-010-1234'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 500))
    const candidates = Object.values(controller.getState().learningCandidates)
    expect(candidates).toHaveLength(1)
    await controller.confirmLearning(candidates[0]!.id, {
      label: 'Phone',
      value: candidates[0]!.value,
    })
    expect(controller.store.getSnapshot().answers.some((answer) => answer.label === 'Phone')).toBe(
      true,
    )
    expect(controller.getState().matches).not.toEqual({})
  })
})
