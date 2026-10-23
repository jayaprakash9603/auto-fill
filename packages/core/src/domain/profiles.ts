import type { ProfileKind } from './answers'

/**
 * A blank starting point for a profile: which fields its editor lists. Templates carry semantic
 * keys only, never values.
 */
export interface ProfileTemplate {
  id: string
  name: string
  description: string
  kind: ProfileKind
  /** Fields that usually differ per profile, in editor order. Saved as profile-specific answers. */
  fields: readonly string[]
}

/** Details that rarely change between roles. Every profile editor lists them; they are saved once, globally. */
export const SHARED_PROFILE_FIELDS: readonly string[] = [
  'firstName',
  'lastName',
  'preferredName',
  'email',
  'phone',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
  'linkedinUrl',
  'githubUrl',
  'portfolioUrl',
  'websiteUrl',
]

export const DEFAULT_PROFILE_TEMPLATE_ID = 'general'

export const PROFILE_TEMPLATES: readonly ProfileTemplate[] = [
  {
    id: 'general',
    name: 'General',
    description: 'Everyday details for most forms.',
    kind: 'general',
    fields: [
      'currentTitle',
      'currentEmployer',
      'yearsOfExperience',
      'noticePeriod',
      'expectedSalary',
      'workMode',
      'willingToRelocate',
      'summary',
    ],
  },
  {
    id: 'software-developer',
    name: 'Software developer',
    description: 'Engineering roles: stack, experience and education.',
    kind: 'role',
    fields: [
      'currentTitle',
      'currentEmployer',
      'yearsOfExperience',
      'skills',
      'languages',
      'degree',
      'fieldOfStudy',
      'university',
      'graduationYear',
      'noticePeriod',
      'expectedSalary',
      'workMode',
      'willingToRelocate',
      'summary',
      'coverLetter',
    ],
  },
  {
    id: 'software-testing',
    name: 'Software testing',
    description: 'QA and test automation roles.',
    kind: 'role',
    fields: [
      'currentTitle',
      'currentEmployer',
      'yearsOfExperience',
      'skills',
      'degree',
      'university',
      'noticePeriod',
      'expectedSalary',
      'workMode',
      'summary',
      'coverLetter',
    ],
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Start empty and add your own answers.',
    kind: 'custom',
    fields: [],
  },
]

export function getProfileTemplate(id: string | null | undefined): ProfileTemplate | undefined {
  return id ? PROFILE_TEMPLATES.find((template) => template.id === id) : undefined
}
