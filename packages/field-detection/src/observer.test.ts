import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFieldObserver } from './observer'
import { createFieldScanner } from './scanner'
import { fieldsSignature } from './signature'
import { loadFixture, wait, type LoadedFixture } from './test-utils/fixtures'

const opened: LoadedFixture[] = []
afterEach(() => opened.splice(0).forEach((fixture) => fixture.close()))

describe('field observer', () => {
  it('signals once per burst of mutations, including inside shadow roots after refresh', async () => {
    const fixture = loadFixture('shadow-dom.html')
    opened.push(fixture)
    const scanner = createFieldScanner({ document: fixture.document })
    scanner.scan()
    const onChange = vi.fn()
    const observer = createFieldObserver({
      document: fixture.document,
      onChange,
      getRoots: () => scanner.shadowRoots,
      debounceMs: 20,
    })
    observer.start()

    fixture.document.getElementById('notes')!.setAttribute('hidden', '')
    fixture.document.getElementById('notes')!.setAttribute('placeholder', 'Anything else?')
    await wait(60)
    expect(onChange).toHaveBeenCalledTimes(1)

    const shadowInput = scanner.shadowRoots[0]!.querySelector('input')!
    shadowInput.setAttribute('disabled', '')
    await wait(60)
    expect(onChange).toHaveBeenCalledTimes(2)

    observer.stop()
    shadowInput.removeAttribute('disabled')
    await wait(60)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('distinguishes structural changes from value changes', () => {
    const fixture = loadFixture('multi-step.html')
    opened.push(fixture)
    const scanner = createFieldScanner({ document: fixture.document })
    const before = fieldsSignature(scanner.scan())
    fixture.document.querySelector<HTMLInputElement>('#full-name')!.value = 'Ada Lovelace'
    expect(fieldsSignature(scanner.scan())).toBe(before)
    fixture.document.querySelector<HTMLButtonElement>('#to-step-2')!.click()
    expect(fieldsSignature(scanner.scan())).not.toBe(before)
  })
})
