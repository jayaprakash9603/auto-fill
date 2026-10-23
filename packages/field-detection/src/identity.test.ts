import { afterEach, describe, expect, it, vi } from 'vitest'

import { PLUGIN_API_VERSION, type FieldDetector } from '@ufa/core'

import { BUILTIN_DETECTORS } from './detectors'
import { createFieldScanner } from './scanner'
import { loadHtml, type LoadedFixture } from './test-utils/fixtures'

const opened: LoadedFixture[] = []
afterEach(() => opened.splice(0).forEach((fixture) => fixture.close()))

function page(html: string) {
  const fixture = loadHtml(`<!doctype html><html><body>${html}</body></html>`)
  opened.push(fixture)
  return fixture
}

const FORM = `
  <form>
    <label for="a">First name</label><input id="a" name="first" />
    <label for="b">Last name</label><input id="b" name="last" />
  </form>`

describe('field identity', () => {
  it('keeps ids stable across rescans and unique across scanners', () => {
    const { document } = page(FORM)
    const scanner = createFieldScanner({ document })
    const first = scanner.scan().map((field) => field.id)
    expect(scanner.scan().map((field) => field.id)).toEqual(first)
    const other = createFieldScanner({ document })
      .scan()
      .map((field) => field.id)
    expect(other.some((id) => first.includes(id))).toBe(false)
  })

  it('gives a re-rendered control its previous id, but not a different control', () => {
    const { document } = page(FORM)
    const scanner = createFieldScanner({ document })
    const [firstName, lastName] = scanner.scan()

    const old = document.getElementById('a')!
    const clone = old.cloneNode(true) as HTMLInputElement
    old.replaceWith(clone)
    const afterRender = scanner.scan()
    expect(afterRender[0]?.id).toBe(firstName?.id)
    expect(afterRender[1]?.id).toBe(lastName?.id)

    const replacement = document.createElement('input')
    replacement.id = 'a'
    replacement.name = 'nickname'
    clone.replaceWith(replacement)
    expect(scanner.scan()[0]?.id).not.toBe(firstName?.id)
  })

  it('resolves live targets and rejects stale or changed fields', () => {
    const { document } = page(FORM)
    const scanner = createFieldScanner({ document })
    const [firstName, lastName] = scanner.scan()
    expect(scanner.resolve(firstName!.id, firstName!.fingerprint).element).toBe(
      document.getElementById('a'),
    )

    document.querySelector('label[for="a"]')!.textContent = 'Nickname'
    expect(() => scanner.resolve(firstName!.id, firstName!.fingerprint)).toThrow(
      expect.objectContaining({ code: 'FIELD_CHANGED' }),
    )
    expect(scanner.resolve(firstName!.id).field.label).toBe('Nickname')

    document.getElementById('b')!.remove()
    expect(() => scanner.resolve(lastName!.id)).toThrow(
      expect.objectContaining({ code: 'FIELD_NOT_FOUND' }),
    )
  })
})

describe('detector plugins', () => {
  it('runs custom detectors in order and lets them claim elements first', () => {
    const { document } = page(`
      <label for="salary">Salary</label><input id="salary" name="salary" />
      <div class="rating" data-question="Rate us"></div>`)
    const custom: FieldDetector = {
      id: 'test.custom',
      apiVersion: PLUGIN_API_VERSION,
      order: 10,
      detect: (root) => [
        ...Array.from(root.querySelectorAll('.rating'), (element) => ({
          kind: 'range' as const,
          element,
          labelOverride: element.getAttribute('data-question') ?? '',
          unsupportedReason: 'Ratings are not supported.',
        })),
        ...Array.from(root.querySelectorAll('#salary'), (element) => ({
          kind: 'number' as const,
          element,
          confidence: 0.6,
        })),
      ],
    }
    const fields = createFieldScanner({
      document,
      detectors: [...BUILTIN_DETECTORS, custom],
    }).scan()
    expect(
      fields.map(({ label, type, detectorId, labelSource }) => [
        label,
        type,
        detectorId,
        labelSource,
      ]),
    ).toEqual([
      ['Salary', 'number', 'test.custom', 'label-for'],
      ['Rate us', 'range', 'test.custom', 'adapter'],
    ])
    expect(fields[0]?.detectionConfidence).toBe(0.6)
    expect(fields[1]?.support).toBe('unsupported')
  })

  it('isolates failing and malformed detectors', () => {
    const { document } = page(FORM)
    const onPluginError = vi.fn()
    const broken: FieldDetector = {
      id: 'test.broken',
      apiVersion: PLUGIN_API_VERSION,
      order: 1,
      detect: () => {
        throw new Error('boom')
      },
    }
    const malformed: FieldDetector = {
      id: 'test.malformed',
      apiVersion: PLUGIN_API_VERSION,
      order: 2,
      detect: () => [{ kind: 'nope', element: 'not an element' } as never],
    }
    const fields = createFieldScanner({
      document,
      detectors: [broken, malformed, ...BUILTIN_DETECTORS],
      onPluginError,
    }).scan()
    expect(fields).toHaveLength(2)
    expect(onPluginError).toHaveBeenCalledWith('test.broken', expect.any(Error))
    expect(onPluginError).toHaveBeenCalledWith('test.malformed', expect.any(Error))
  })
})
