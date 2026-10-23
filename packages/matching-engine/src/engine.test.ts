import {
  PLUGIN_API_VERSION,
  type AnswerRecord,
  type FieldDescriptor,
  type FieldMapping,
  type MatchingStrategy,
} from '@ufa/core'
import { describe, expect, it, vi } from 'vitest'

import { catalogClassifier, classifyField } from './classify'
import { matchField, matchFields, type MatchInput } from './engine'
import { BUILTIN_STRATEGIES } from './strategies'
import { answer, field, list, options, yes, type AnswerOverrides } from './test-utils/fixtures'

const classified = (overrides: Partial<FieldDescriptor>) =>
  classifyField(field(overrides), { classifiers: [catalogClassifier] })

const LIBRARY: AnswerRecord[] = [
  answer('email', 'Email', {
    semanticKey: 'email',
    category: 'contact',
    value: 'person@example.com',
  }),
  answer('work-email', 'Work email', { category: 'contact', value: 'work@example.com' }),
  answer('notice', 'Notice period', { value: '30 days' }),
  answer('pronouns', 'Pronouns', { aliases: ['Preferred pronouns'], value: 'they/them' }),
  answer('ec-name', 'Emergency contact name', { category: 'personal', value: 'Sam Example' }),
  answer('ec-phone', 'Emergency contact phone', { value: '+1 555 0199' }),
  answer('team', 'Preferred team size range', { value: '5-10' }),
  answer('volunteer', 'Volunteer work', { value: 'Food bank' }),
  answer('years', 'Years of experience', { semanticKey: 'yearsOfExperience', value: '4' }),
  answer('full-name', 'Full name', {
    semanticKey: 'fullName',
    category: 'personal',
    value: 'Ada Example',
  }),
  answer('mode', 'Work mode', { value: 'Flexible' }),
]

const input = (overrides: Partial<MatchInput> = {}): MatchInput => ({
  answers: LIBRARY,
  mappings: [],
  customFields: [],
  activeProfileId: null,
  site: 'jobs.example.com',
  ...overrides,
})

describe('strategy order and explanations', () => {
  it.each<[string, Partial<FieldDescriptor>, string, string, string, string]>([
    [
      'semantic key',
      { label: 'Contact', autocomplete: 'email', type: 'email' },
      'email',
      'ufa.semantic-key',
      'high',
      'Recognized as Email from its autocomplete="email"',
    ],
    [
      'exact label',
      { label: 'Notice period' },
      'notice',
      'ufa.exact-label',
      'high',
      'Same label as your answer "Notice period"',
    ],
    [
      'alias',
      { label: 'Preferred pronouns' },
      'pronouns',
      'ufa.alias',
      'high',
      'Matches "Preferred pronouns", another label of "Pronouns"',
    ],
    [
      'context',
      { label: 'Name', section: 'Emergency contact' },
      'ec-name',
      'ufa.context',
      'high',
      '"Name" under "Emergency contact" reads as "Emergency contact name"',
    ],
    [
      'partial context',
      { label: 'Phone', section: 'Emergency contact details', type: 'tel' },
      'ec-phone',
      'ufa.context',
      'medium',
      '"Phone" with "Emergency contact details" covers "Emergency contact phone"',
    ],
    [
      'fuzzy',
      { label: 'Preferred team size' },
      'team',
      'ufa.fuzzy',
      'medium',
      'Label resembles "Preferred team size range"',
    ],
    [
      'suggestion',
      { label: 'Volunteer activities', type: 'textarea' },
      'volunteer',
      'ufa.suggestion',
      'low',
      'Shares the word "volunteer"',
    ],
  ])('%s', (_name, overrides, answerId, strategyId, level, explanation) => {
    const result = matchField(classified(overrides), input())
    expect(result.best).toMatchObject({ answerId, strategyId, confidence: { level } })
    expect(result.best?.explanation).toContain(explanation)
    expect(result.state).toBe(level === 'high' ? 'matched' : 'suggested')
  })

  it('consults an explicit mapping before everything else', () => {
    const mapping: FieldMapping = {
      id: 'm1',
      site: 'example.com',
      fieldSignature: 'email|email',
      answerId: 'work-email',
      profileId: null,
      createdAt: 1,
    }
    const result = matchField(
      classified({ label: 'Email', type: 'email' }),
      input({ mappings: [mapping] }),
    )
    expect(result.best).toMatchObject({
      answerId: 'work-email',
      strategyId: 'ufa.explicit-mapping',
      confidence: { score: 1, level: 'high' },
      explanation: 'You linked this field to "Work email" on example.com',
    })
    expect(result.candidates.map((candidate) => candidate.answerId)).toEqual([
      'work-email',
      'email',
    ])
  })

  it('ignores mappings for other sites and other profiles', () => {
    const mapping = (site: string, profileId: string | null): FieldMapping => ({
      id: `${site}-${profileId}`,
      site,
      fieldSignature: 'email|email',
      answerId: 'work-email',
      profileId,
      createdAt: 1,
    })
    const result = matchField(
      classified({ label: 'Email', type: 'email' }),
      input({
        mappings: [mapping('other.test', null), mapping('example.com', 'p2')],
        activeProfileId: 'p1',
      }),
    )
    expect(result.best?.answerId).toBe('email')
  })

  it('never lets a contained phrase reach high confidence', () => {
    const result = matchField(
      classified({ label: 'Describe your work experience', type: 'textarea' }),
      input(),
    )
    expect(result.best).toMatchObject({ answerId: 'years', strategyId: 'ufa.semantic-key' })
    expect(result.best?.confidence.level).toBe('medium')
    expect(result.state).toBe('suggested')
  })

  it('caps fuzzy matches below high even with a context bonus', () => {
    const site = answer('site-team', 'Team size preferred', {
      value: '5-10',
      context: { sites: ['example.com'], formKeywords: ['engineering'] },
    })
    const result = matchField(
      classified({ label: 'Preferred team size', formTitle: 'Engineering application' }),
      input({ answers: [site] }),
    )
    expect(result.best).toMatchObject({ strategyId: 'ufa.fuzzy', confidence: { score: 0.85 } })
    expect(result.state).toBe('suggested')
  })
})

describe('field states', () => {
  it.each<[string, Partial<FieldDescriptor>, string, string | null]>([
    [
      'nothing fits',
      { label: 'Favourite colour' },
      'missing',
      'No saved answer fits "Favourite colour".',
    ],
    [
      'protected field',
      { label: 'Email', sensitivity: 'prohibited', sensitivityReason: 'one-time code' },
      'skipped',
      'Protected field (one-time code): never filled.',
    ],
    [
      'unsupported control',
      {
        label: 'Resume',
        type: 'file',
        support: 'unsupported',
        unsupportedReason: 'File uploads are not filled.',
      },
      'unsupported',
      'File uploads are not filled.',
    ],
    [
      'read-only field',
      { label: 'Email', editable: false },
      'skipped',
      'The field cannot be edited.',
    ],
    [
      'answer that is not an option',
      { label: 'Work mode', type: 'select', options: options('Remote', 'Hybrid', 'On-site') },
      'incompatible',
      'Your answer "Work mode" does not fit: "Flexible" is not one of the options.',
    ],
  ])('%s → %s', (_name, overrides, state, reason) => {
    const result = matchField(classified(overrides), input())
    expect(result.state).toBe(state)
    expect(result.reason).toBe(reason)
    if (state !== 'incompatible') expect(result.best).toBeNull()
  })

  it('reports an answer that fits several options as ambiguous', () => {
    const result = matchField(
      classified({
        label: 'Country',
        type: 'select',
        options: options('United States', 'United Kingdom'),
      }),
      input({
        answers: [answer('country', 'Country', { semanticKey: 'country', value: 'United' })],
      }),
    )
    expect(result.state).toBe('ambiguous')
    expect(result.best).toBeNull()
    expect(result.reason).toContain('fits several options')
  })

  it('lowers confidence for inferred options and explains them', () => {
    const result = matchField(
      classified({
        label: 'Years of experience',
        type: 'select',
        options: options('0-2', '3-5', '6+'),
      }),
      input(),
    )
    expect(result.best).toMatchObject({
      answerId: 'years',
      fillValue: { kind: 'options', values: ['3-5'] },
      confidence: { score: 0.926, level: 'high' },
    })
    expect(result.best?.explanation).toContain('Option "3-5" contains the number')
  })

  it('applies configurable thresholds', () => {
    const field = classified({ label: 'Notice period' })
    expect(matchField(field, input()).state).toBe('matched')
    const strict = matchField(field, input({ thresholds: { high: 0.97, medium: 0.8 } }))
    expect(strict.state).toBe('suggested')
    expect(strict.best?.confidence.level).toBe('medium')
  })

  it('drops low-confidence answers that do not fit the control', () => {
    const result = matchField(
      classified({ label: 'Email me job alerts', type: 'checkbox' }),
      input(),
    )
    expect(result.state).toBe('missing')
    expect(result.candidates).toEqual([])
  })
})

describe('competing answers', () => {
  const twoEmails = (a: AnswerOverrides = {}, b: AnswerOverrides = {}) => [
    answer('home', 'Personal email', { semanticKey: 'email', value: 'home@example.com', ...a }),
    answer('other', 'Other email', { semanticKey: 'email', value: 'other@example.com', ...b }),
  ]
  const emailField = () => classified({ label: 'Email', type: 'email' })

  it('refuses to choose between equally good answers with different values', () => {
    const result = matchField(emailField(), input({ answers: twoEmails() }))
    expect(result.state).toBe('ambiguous')
    expect(result.best).toBeNull()
    expect(result.reason).toBe('2 saved answers fit "Email" equally well. Choose one.')
    expect(result.candidates).toHaveLength(2)
  })

  it('does not call identical values ambiguous', () => {
    const result = matchField(
      emailField(),
      input({ answers: twoEmails({}, { value: { kind: 'text', text: 'home@example.com' } }) }),
    )
    expect(result.state).toBe('matched')
  })

  it.each<[string, AnswerOverrides, AnswerOverrides, string]>([
    ['the preferred answer', {}, { preferred: true }, 'other'],
    ['the active profile’s own answer', {}, { profileId: 'p1' }, 'other'],
  ])('picks %s', (_name, a, b, winner) => {
    const result = matchField(
      emailField(),
      input({ answers: twoEmails(a, b), activeProfileId: 'p1' }),
    )
    expect(result.state).toBe('matched')
    expect(result.best?.answerId).toBe(winner)
  })

  it('hides answers that belong to another profile', () => {
    const result = matchField(
      emailField(),
      input({ answers: twoEmails({ profileId: 'p2' }), activeProfileId: 'p1' }),
    )
    expect(result.best?.answerId).toBe('other')
    expect(result.candidates.map((candidate) => candidate.answerId)).toEqual(['other'])
  })

  it('prefers a site-specific answer where its context applies, with the reason', () => {
    const answers = [
      answer('general', 'Why do you want to work here?', { value: 'General answer' }),
      answer('acme', 'Why do you want to work here?', {
        value: 'Acme answer',
        context: { sites: ['acme.example'] },
      }),
    ]
    const field = classified({ label: 'Why do you want to work here?', type: 'textarea' })
    const onAcme = matchField(field, input({ answers, site: 'careers.acme.example' }))
    expect(onAcme.best).toMatchObject({ answerId: 'acme', confidence: { score: 0.97 } })
    expect(onAcme.best?.explanation).toContain('Context: site acme.example')
    expect(matchField(field, input({ answers })).best?.answerId).toBe('general')
  })

  it.each<[string, AnswerOverrides, Partial<FieldDescriptor>]>([
    [
      'section keywords',
      { context: { sectionKeywords: ['education'] } },
      { section: 'Work history' },
    ],
    ['form keywords', { context: { formKeywords: ['internship'] } }, { formTitle: 'Senior role' }],
    ['application types', { context: { applicationTypes: ['job-application'] } }, {}],
    ['control types', { controlTypes: ['textarea'] }, { type: 'text' }],
  ])('excludes answers whose %s do not apply', (_name, restriction, overrides) => {
    const restricted = answer('restricted', 'Notice period', { value: '30 days', ...restriction })
    const result = matchField(
      classified({ label: 'Notice period', ...overrides }),
      input({ answers: [restricted] }),
    )
    expect(result.state).toBe('missing')
  })

  it('never offers the user’s own details for someone else’s fields', () => {
    const answers = [
      ...LIBRARY,
      answer('name', 'Name', { value: 'Ada Example' }),
      answer('phone', 'Phone', { semanticKey: 'phone', category: 'contact', value: '+1 555 0100' }),
    ]
    const result = matchField(
      classified({ label: 'Name', section: 'Emergency contact' }),
      input({ answers }),
    )
    expect(result.best?.answerId).toBe('ec-name')
    expect(result.candidates.map((candidate) => candidate.answerId)).not.toEqual(
      expect.arrayContaining(['name', 'full-name']),
    )
    const phone = matchField(
      classified({ label: 'Phone', section: 'Next of kin', type: 'tel' }),
      input({ answers }),
    )
    expect(phone.candidates.map((candidate) => candidate.answerId)).not.toContain('phone')
    expect(phone.best?.confidence.level).not.toBe('high')
  })
})

describe('plugins and determinism', () => {
  it('runs plugin strategies in order and isolates failures', () => {
    const onPluginError = vi.fn()
    const pinned: MatchingStrategy = {
      id: 'test.pinned',
      apiVersion: PLUGIN_API_VERSION,
      order: 15,
      match: () => [
        { answerId: 'work-email', score: 0.93, explanation: 'Pinned by a test plugin' },
      ],
    }
    const broken: MatchingStrategy = {
      id: 'test.broken',
      apiVersion: PLUGIN_API_VERSION,
      order: 5,
      match: () => {
        throw new Error('boom')
      },
    }
    const ghost: MatchingStrategy = {
      id: 'test.ghost',
      apiVersion: PLUGIN_API_VERSION,
      order: 1,
      match: () => [{ answerId: 'missing-answer', score: 1, explanation: 'Not in the library' }],
    }
    const result = matchField(classified({ label: 'Email', type: 'email' }), input(), {
      strategies: [...BUILTIN_STRATEGIES, pinned, broken, ghost],
      onPluginError,
    })
    expect(result.best).toMatchObject({ answerId: 'work-email', strategyId: 'test.pinned' })
    expect(onPluginError).toHaveBeenCalledWith('test.broken', expect.any(Error))
  })

  it('returns the same results whatever the order of the saved answers', () => {
    const fields = [
      classified({ label: 'Email', type: 'email' }),
      classified({ label: 'Preferred team size' }),
      classified({ label: 'Volunteer experience details', type: 'textarea' }),
      classified({ label: 'Name', section: 'Emergency contact' }),
      classified({ label: 'Skills', type: 'checkbox-group', options: options('Go', 'Rust') }),
    ]
    const withSkills = [
      ...LIBRARY,
      answer('skills', 'Skills', { semanticKey: 'skills', value: list('Rust') }),
    ]
    const first = matchFields(fields, input({ answers: withSkills }))
    const second = matchFields(fields, input({ answers: [...withSkills].reverse() }))
    expect(second).toEqual(first)
    expect(first.map((result) => result.state)).toEqual([
      'matched',
      'suggested',
      'suggested',
      'matched',
      'matched',
    ])
  })

  it('fills checkboxes from yes/no answers', () => {
    const result = matchField(
      classified({ label: 'Willing to relocate', type: 'checkbox' }),
      input({ answers: [answer('relocate', 'Willing to relocate', { value: yes })] }),
    )
    expect(result.best?.fillValue).toEqual({ kind: 'checked', checked: true })
  })
})
