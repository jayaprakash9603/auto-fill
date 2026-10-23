import type { AutofillEvent, PageDriver } from '@ufa/core'
import { createAutofillStore, createMemoryStorage } from '@ufa/storage'
import { describe, expect, it, vi } from 'vitest'

import { createAutofill } from './create-autofill'

function idleDriver(): PageDriver {
  return {
    connect: vi.fn(async () => {
      throw new Error('not used')
    }),
    scan: vi.fn(),
    subscribe: () => () => undefined,
    dispose: async () => undefined,
  } as unknown as PageDriver
}

describe('controller data', () => {
  it('exposes the store without a page and reports data and profile changes as events', async () => {
    const controller = createAutofill({ driver: idleDriver(), storage: createMemoryStorage() })
    const events: AutofillEvent[] = []
    controller.on('data:changed', (event) => events.push(event))
    controller.on('profile:changed', (event) => events.push(event))

    await controller.store.ready()
    expect(events).toEqual([])
    const profile = await controller.store.profiles.create({ name: 'Tester' })
    await controller.store.profiles.setActive(profile.id)

    expect(events).toEqual([
      { type: 'data:changed', collection: 'profiles' },
      { type: 'data:changed', collection: 'settings' },
      { type: 'profile:changed', profileId: profile.id },
    ])
    expect(controller.getState().status).toBe('idle')
  })

  it('disposes its own store on destroy but leaves a shared one alone', async () => {
    const storage = createMemoryStorage()
    const shared = createAutofillStore({ adapter: storage })
    const borrowing = createAutofill({ driver: idleDriver(), storage, store: shared })
    const owning = createAutofill({ driver: idleDriver(), storage })
    expect(borrowing.store).toBe(shared)

    await Promise.all([borrowing.destroy(), owning.destroy()])
    await expect(shared.profiles.create({ name: 'Still works' })).resolves.toMatchObject({
      name: 'Still works',
    })
    await expect(owning.store.profiles.create({ name: 'Gone' })).rejects.toMatchObject({
      code: 'DESTROYED',
    })
  })
})
