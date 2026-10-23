import { describe, expect, it, vi } from 'vitest'

import { createEventBus } from '../events'
import { redact, redactText } from '../utils/logger'
import { hostnameMatchesSite, siteFromUrl } from '../utils/ids'
import { answerRecordSchema } from './answers'
import { fieldValuesEqual, isFieldValueEmpty } from './field'
import { autofillSettingsSchema, createDefaultSettings } from './settings'

describe('settings', () => {
  it('defaults to review mode with synthetic data, overwrite and trusted sites disabled', () => {
    const settings = createDefaultSettings()
    expect(settings.mode).toBe('review')
    expect(settings.synthetic.enabled).toBe(false)
    expect(settings.synthetic.allowedCategories).toEqual([])
    expect(settings.overwriteExisting).toBe(false)
    expect(settings.trusted.sites).toEqual([])
    expect(settings.thresholds).toEqual({ high: 0.9, medium: 0.7 })
  })

  it('rejects inverted thresholds', () => {
    expect(
      autofillSettingsSchema.safeParse({ thresholds: { high: 0.5, medium: 0.8 } }).success,
    ).toBe(false)
  })
})

describe('answer schema', () => {
  it('fills optional collections with defaults', () => {
    const parsed = answerRecordSchema.parse({
      id: 'a1',
      label: 'Email',
      semanticKey: 'email',
      value: { kind: 'text', text: 'x' },
      profileId: null,
      category: 'contact',
      createdAt: 1,
      updatedAt: 1,
    })
    expect(parsed.aliases).toEqual([])
    expect(parsed.context.sites).toEqual([])
    expect(parsed.usageCount).toBe(0)
  })
})

describe('field values', () => {
  it('compares option sets independent of order', () => {
    expect(
      fieldValuesEqual(
        { kind: 'options', values: ['a', 'b'] },
        { kind: 'options', values: ['b', 'a'] },
      ),
    ).toBe(true)
    expect(fieldValuesEqual({ kind: 'text', text: 'a' }, { kind: 'checked', checked: true })).toBe(
      false,
    )
  })

  it('detects empty values', () => {
    expect(isFieldValueEmpty({ kind: 'text', text: '  ' })).toBe(true)
    expect(isFieldValueEmpty({ kind: 'checked', checked: false })).toBe(true)
    expect(isFieldValueEmpty({ kind: 'options', values: ['x'] })).toBe(false)
  })
})

describe('event bus', () => {
  it('isolates throwing handlers', () => {
    const onError = vi.fn()
    const bus = createEventBus(onError)
    const good = vi.fn()
    bus.on('scan:start', () => {
      throw new Error('bad handler')
    })
    bus.on('scan:start', good)
    bus.emit({ type: 'scan:start' })
    expect(good).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
  })
})

describe('redaction', () => {
  it('masks emails and phone numbers in text', () => {
    expect(redactText('Contact jane.doe@example.com or +1 (555) 010-0199')).toBe(
      'Contact [email] or [number]',
    )
  })

  it('redacts values under personal-data keys', () => {
    expect(redact({ fieldId: 'f1', value: 'secret', count: 3 })).toEqual({
      fieldId: 'f1',
      value: '[redacted]',
      count: 3,
    })
  })
})

describe('site helpers', () => {
  it('extracts and matches sites', () => {
    expect(siteFromUrl('https://www.Example.com/jobs')).toBe('example.com')
    expect(hostnameMatchesSite('careers.example.com', 'example.com')).toBe(true)
    expect(hostnameMatchesSite('example.com.evil.io', 'example.com')).toBe(false)
  })
})
