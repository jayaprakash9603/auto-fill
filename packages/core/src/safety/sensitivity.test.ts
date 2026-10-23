import { describe, expect, it } from 'vitest'

import { classifySensitivity } from './sensitivity'

describe('classifySensitivity', () => {
  it.each([
    [{ type: 'password' as const }, 'password'],
    [{ type: 'text' as const, inputType: 'hidden' }, 'hidden input'],
    [{ type: 'file' as const }, 'file upload'],
    [{ type: 'text' as const, autocomplete: 'one-time-code' }, 'autocomplete=one-time-code'],
    [{ type: 'text' as const, autocomplete: 'section-pay cc-number' }, 'autocomplete=cc-number'],
    [{ type: 'text' as const, label: 'Enter OTP' }, 'one-time code'],
    [{ type: 'text' as const, label: 'Verification code' }, 'one-time code'],
    [{ type: 'text' as const, name: 'cardNumber' }, 'payment card'],
    [{ type: 'text' as const, label: 'CVV' }, 'card security code'],
    [{ type: 'text' as const, label: 'Social Security Number' }, 'government identifier'],
    [{ type: 'text' as const, label: 'API key' }, 'secret or token'],
    [{ type: 'text' as const, label: 'Username' }, 'authentication'],
    [{ type: 'text' as const, label: 'ATM PIN' }, 'PIN'],
  ])('blocks %o', (signals, reason) => {
    expect(classifySensitivity(signals)).toEqual({ sensitivity: 'prohibited', reason })
  })

  it('treats an Indian PIN code as a normal postal field', () => {
    expect(classifySensitivity({ type: 'text', label: 'PIN code' }).sensitivity).toBe('normal')
    expect(classifySensitivity({ type: 'text', name: 'pincode' }).sensitivity).toBe('normal')
  })

  it('marks agreement checkboxes as consent but not text fields with similar words', () => {
    expect(
      classifySensitivity({ type: 'checkbox', label: 'I agree to the Terms and Conditions' })
        .sensitivity,
    ).toBe('consent')
    expect(
      classifySensitivity({ type: 'checkbox', label: 'I certify that the information is accurate' })
        .sensitivity,
    ).toBe('consent')
    expect(
      classifySensitivity({ type: 'checkbox', label: 'Subscribe to our newsletter' }).sensitivity,
    ).toBe('consent')
    expect(
      classifySensitivity({ type: 'checkbox', label: 'Willing to relocate' }).sensitivity,
    ).toBe('normal')
    expect(
      classifySensitivity({ type: 'textarea', label: 'Terms you would like to negotiate' })
        .sensitivity,
    ).toBe('normal')
  })

  it('leaves ordinary fields alone', () => {
    for (const label of [
      'First name',
      'Email',
      'Phone number',
      'Current employer',
      'Expected salary',
    ]) {
      expect(classifySensitivity({ type: 'text', label }).sensitivity).toBe('normal')
    }
  })
})
