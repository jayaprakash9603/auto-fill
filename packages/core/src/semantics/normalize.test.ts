import { describe, expect, it } from 'vitest'

import { getSemanticCatalog, customSemanticKey, semanticKeyLabel } from './catalog'
import { humanizeIdentifier, normalizeLabel, normalizeValue } from './normalize'
import { containsPhrase, labelSimilarity } from './similarity'

describe('normalizeLabel', () => {
  it.each([
    ['First Name', 'first name'],
    ['First name *', 'first name'],
    ['Candidate First Name', 'first name'],
    ['Enter your first name', 'first name'],
    ['  FIRST   NAME (required) ', 'first name'],
    ['Please enter your First Name:', 'first name'],
    ['Given name', 'first name'],
    ['Surname', 'last name'],
    ['E-mail address', 'email address'],
    ['Mobile Number', 'phone'],
    ['Phone number', 'phone'],
    ['ZIP / Postal code', 'postal code'],
    ['PIN code', 'postal code'],
    ["What's your expected CTC?", 'expected ctc'],
    ['Organisation', 'organization'],
    ['Résumé headline', 'resume headline'],
    ['Select', 'select'],
    ['', ''],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeLabel(raw)).toBe(expected)
  })

  it('never empties a label made only of filler words', () => {
    expect(normalizeLabel('The')).toBe('the')
  })
})

describe('humanizeIdentifier', () => {
  it.each([
    ['firstName', 'first name'],
    ['first_name', 'first name'],
    ['applicant[first-name]', 'applicant first name'],
    ['URLField', 'url field'],
  ])('%s -> %s', (raw, expected) => {
    expect(humanizeIdentifier(raw)).toBe(expected)
  })
})

describe('normalizeValue', () => {
  it('keeps plus signs for dialing codes and strips punctuation', () => {
    expect(normalizeValue('India (+91)')).toBe('india +91')
  })
})

describe('labelSimilarity', () => {
  it('scores identical labels as 1 and unrelated labels low', () => {
    expect(labelSimilarity('first name', 'first name')).toBe(1)
    expect(labelSimilarity('first name', 'graduation year')).toBeLessThan(0.3)
  })

  it('scores reordered phrases higher than unrelated ones', () => {
    expect(labelSimilarity('expected salary', 'salary expected')).toBeGreaterThan(0.6)
  })

  it('matches whole-word phrases only', () => {
    expect(containsPhrase('preferred office location', 'office location')).toBe(true)
    expect(containsPhrase('nameplate', 'name')).toBe(false)
  })
})

describe('semantic catalog', () => {
  it('has unique keys and non-empty normalized aliases', () => {
    const catalog = getSemanticCatalog()
    expect(new Set(catalog.map((entry) => entry.key)).size).toBe(catalog.length)
    for (const entry of catalog) expect(entry.normalizedAliases.length).toBeGreaterThan(0)
  })

  it('never allows synthetic values for factual claims', () => {
    const factual = [
      'currentEmployer',
      'yearsOfExperience',
      'workAuthorization',
      'degree',
      'gender',
      'dateOfBirth',
    ]
    for (const key of factual) {
      expect(getSemanticCatalog().find((entry) => entry.key === key)?.synthetic).toBeNull()
    }
  })

  it('builds readable custom keys', () => {
    const key = customSemanticKey('Preferred Office Location *')
    expect(key).toBe('custom:preferred-office-location')
    expect(semanticKeyLabel(key)).toBe('Preferred office location')
  })
})
