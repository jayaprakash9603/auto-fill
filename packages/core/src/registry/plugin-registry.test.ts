import { describe, expect, it, vi } from 'vitest'

import { AutofillError } from '../errors'
import type { MatchingStrategy } from '../interfaces/plugins'
import { invokePlugin, PluginRegistry } from './plugin-registry'

const matcher = (id: string, order: number): MatchingStrategy => ({
  id,
  apiVersion: 1,
  order,
  match: () => [],
})

describe('PluginRegistry', () => {
  it('lists registrations in deterministic (order, id) order', () => {
    const registry = new PluginRegistry()
    registry
      .registerMatcher(matcher('zeta', 10))
      .registerMatcher(matcher('alpha', 10))
      .registerMatcher(matcher('first', 1))
    expect(registry.list('matcher').map((entry) => entry.id)).toEqual(['first', 'alpha', 'zeta'])
  })

  it('rejects duplicates unless replace is requested', () => {
    const registry = new PluginRegistry().registerMatcher(matcher('dup', 1))
    expect(() => registry.registerMatcher(matcher('dup', 2))).toThrowError(AutofillError)
    registry.registerMatcher(matcher('dup', 3), { replace: true })
    expect(registry.get('matcher', 'dup')?.order).toBe(3)
  })

  it('validates ids, api version and required methods', () => {
    const registry = new PluginRegistry()
    expect(() => registry.registerMatcher(matcher('Bad Id', 1))).toThrow(/Invalid matcher id/)
    expect(() => registry.registerMatcher({ ...matcher('v2', 1), apiVersion: 2 as never })).toThrow(
      /API v2/,
    )
    expect(() =>
      registry.registerMatcher({ id: 'nomatch', apiVersion: 1, order: 1 } as never),
    ).toThrow(/missing match/)
  })

  it('registers plugin bundles atomically', () => {
    const registry = new PluginRegistry().registerMatcher(matcher('taken', 1))
    expect(() =>
      registry.use({
        id: 'bundle',
        apiVersion: 1,
        matchers: [matcher('fresh', 1), matcher('taken', 2)],
      }),
    ).toThrow(AutofillError)
    expect(registry.has('matcher', 'fresh')).toBe(false)
  })

  it('isolates plugin errors', () => {
    const onError = vi.fn()
    const result = invokePlugin(
      'broken',
      () => {
        throw new Error('boom')
      },
      onError,
    )
    expect(result).toBeUndefined()
    expect(onError).toHaveBeenCalledWith('broken', expect.any(Error))
  })
})
