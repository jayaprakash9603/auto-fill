import type { AnswerCategory } from '../domain/answers'
import type { FieldType } from '../domain/field'
import type { SyntheticCategory } from '../domain/settings'
import { normalizeLabel } from './normalize'

export interface SemanticKeyDefinition {
  key: string
  label: string
  category: AnswerCategory
  /** Label phrases (raw); normalized once on first use. */
  aliases: readonly string[]
  /** HTML `autocomplete` tokens that identify this key. */
  autocomplete?: readonly string[]
  /** Matched against the humanized `name`/`id` of the control. */
  identifierPatterns?: readonly RegExp[]
  /** Preferred control types; other compatible controls are still allowed. */
  types?: readonly FieldType[]
  /**
   * Synthetic data category, or null when synthetic values are never allowed because the key is a
   * factual claim (employment, education, eligibility, demographics, consent).
   */
  synthetic: SyntheticCategory | null
}

const DEFINITIONS: readonly SemanticKeyDefinition[] = [
  {
    key: 'firstName',
    label: 'First name',
    category: 'personal',
    aliases: ['first name', 'first', 'fname', 'legal first name'],
    autocomplete: ['given-name'],
    identifierPatterns: [/^(first ?name|fname|given ?name|forename|name first)$/],
    synthetic: 'name',
  },
  {
    key: 'middleName',
    label: 'Middle name',
    category: 'personal',
    aliases: ['middle name', 'middle initial'],
    autocomplete: ['additional-name'],
    identifierPatterns: [/^(middle ?name|mname|middle initial)$/],
    synthetic: 'name',
  },
  {
    key: 'lastName',
    label: 'Last name',
    category: 'personal',
    aliases: ['last name', 'last', 'lname', 'legal last name'],
    autocomplete: ['family-name'],
    identifierPatterns: [/^(last ?name|lname|surname|family ?name|name last)$/],
    synthetic: 'name',
  },
  {
    key: 'fullName',
    label: 'Full name',
    category: 'personal',
    aliases: ['full name', 'name', 'legal name', 'full legal name', 'complete name', 'your name'],
    autocomplete: ['name'],
    identifierPatterns: [/^(full ?name|name|your ?name|legal ?name)$/],
    synthetic: 'name',
  },
  {
    key: 'preferredName',
    label: 'Preferred name',
    category: 'personal',
    aliases: ['preferred name', 'preferred first name', 'nickname', 'what should we call you'],
    autocomplete: ['nickname'],
    identifierPatterns: [/^(preferred ?name|nick ?name)$/],
    synthetic: 'name',
  },
  {
    key: 'email',
    label: 'Email',
    category: 'contact',
    aliases: ['email', 'email address', 'personal email', 'contact email'],
    autocomplete: ['email'],
    identifierPatterns: [/^(e ?mail|email address|user email|contact email)$/],
    types: ['email', 'text'],
    synthetic: 'email',
  },
  {
    key: 'phone',
    label: 'Phone number',
    category: 'contact',
    aliases: ['phone', 'phone number', 'primary phone', 'contact phone', 'whatsapp number'],
    autocomplete: ['tel', 'tel-national'],
    identifierPatterns: [
      /^(phone|phone ?number|mobile|mobile ?number|tel|telephone|cell|cell ?phone|contact ?number)$/,
    ],
    types: ['tel', 'text'],
    synthetic: 'phone',
  },
  {
    key: 'phoneCountryCode',
    label: 'Phone country code',
    category: 'contact',
    aliases: ['country code', 'phone country code', 'dialing code', 'calling code'],
    autocomplete: ['tel-country-code'],
    identifierPatterns: [/^(country ?code|phone ?country ?code|dial ?code)$/],
    synthetic: 'phone',
  },
  {
    key: 'addressLine1',
    label: 'Address line 1',
    category: 'address',
    aliases: [
      'address',
      'street address',
      'address line 1',
      'street',
      'current address',
      'residential address',
      'home address',
      'address 1',
    ],
    autocomplete: ['street-address', 'address-line1'],
    identifierPatterns: [/^(address|address ?1|address ?line ?1|street|street ?address|addr1)$/],
    synthetic: 'address',
  },
  {
    key: 'addressLine2',
    label: 'Address line 2',
    category: 'address',
    aliases: ['address line 2', 'apartment', 'suite', 'apartment suite', 'apt', 'address 2'],
    autocomplete: ['address-line2'],
    identifierPatterns: [/^(address ?2|address ?line ?2|addr2|apt|suite)$/],
    synthetic: 'address',
  },
  {
    key: 'city',
    label: 'City',
    category: 'address',
    aliases: ['city', 'town', 'city town', 'current city', 'city of residence'],
    autocomplete: ['address-level2'],
    identifierPatterns: [/^(city|town|locality)$/],
    synthetic: 'address',
  },
  {
    key: 'state',
    label: 'State / province',
    category: 'address',
    aliases: [
      'state',
      'province',
      'region',
      'state province',
      'state region',
      'state province region',
    ],
    autocomplete: ['address-level1'],
    identifierPatterns: [/^(state|province|region|state ?province)$/],
    synthetic: 'address',
  },
  {
    key: 'postalCode',
    label: 'Postal code',
    category: 'address',
    aliases: ['postal code'],
    autocomplete: ['postal-code'],
    identifierPatterns: [/^(zip|zip ?code|postal ?code|post ?code|pin ?code|pincode)$/],
    synthetic: 'address',
  },
  {
    key: 'country',
    label: 'Country',
    category: 'address',
    aliases: ['country', 'country of residence', 'country region', 'current country'],
    autocomplete: ['country', 'country-name'],
    identifierPatterns: [/^(country|country ?name|country ?region)$/],
    synthetic: 'address',
  },
  {
    key: 'location',
    label: 'Current location',
    category: 'address',
    aliases: [
      'location',
      'current location',
      'where are you located',
      'where are you based',
      'based in',
    ],
    identifierPatterns: [/^(location|current ?location)$/],
    synthetic: 'address',
  },
  {
    key: 'currentEmployer',
    label: 'Current employer',
    category: 'professional',
    aliases: [
      'current employer',
      'current company',
      'employer',
      'company',
      'company name',
      'current organization',
      'organization',
      'present employer',
      'most recent employer',
    ],
    autocomplete: ['organization'],
    identifierPatterns: [
      /^(company|company ?name|employer|current ?company|current ?employer|organization|org)$/,
    ],
    synthetic: null,
  },
  {
    key: 'currentTitle',
    label: 'Current designation',
    category: 'professional',
    aliases: [
      'current title',
      'job title',
      'current designation',
      'designation',
      'current role',
      'current position',
      'title',
      'position',
      'current job title',
      'role',
    ],
    autocomplete: ['organization-title'],
    identifierPatterns: [/^(title|job ?title|designation|current ?title|position|role)$/],
    synthetic: null,
  },
  {
    key: 'yearsOfExperience',
    label: 'Years of experience',
    category: 'professional',
    aliases: [
      'years of experience',
      'total experience',
      'experience',
      'total years of experience',
      'how many years of experience do you have',
      'work experience',
      'relevant experience',
      'experience in years',
      'years of professional experience',
    ],
    identifierPatterns: [/^(experience|years ?of ?experience|total ?experience|exp ?years|yoe)$/],
    synthetic: null,
  },
  {
    key: 'currentSalary',
    label: 'Current salary',
    category: 'professional',
    aliases: [
      'current salary',
      'current ctc',
      'current compensation',
      'current annual salary',
      'present salary',
    ],
    identifierPatterns: [/^(current ?salary|current ?ctc|ctc)$/],
    synthetic: null,
  },
  {
    key: 'expectedSalary',
    label: 'Expected salary',
    category: 'professional',
    aliases: [
      'expected salary',
      'expected ctc',
      'salary expectation',
      'salary expectations',
      'desired salary',
      'desired compensation',
      'expected compensation',
      'salary requirements',
      'what are your salary expectations',
    ],
    identifierPatterns: [
      /^(expected ?salary|expected ?ctc|desired ?salary|salary ?expectations?)$/,
    ],
    synthetic: null,
  },
  {
    key: 'noticePeriod',
    label: 'Notice period',
    category: 'professional',
    aliases: [
      'notice period',
      'notice period in days',
      'current notice period',
      'how soon can you join',
      'joining time',
    ],
    identifierPatterns: [/^(notice ?period|notice)$/],
    synthetic: null,
  },
  {
    key: 'startDate',
    label: 'Earliest start date',
    category: 'professional',
    aliases: [
      'start date',
      'earliest start date',
      'available start date',
      'when can you start',
      'availability date',
      'date available',
    ],
    identifierPatterns: [/^(start ?date|available ?date|availability)$/],
    synthetic: null,
  },
  {
    key: 'skills',
    label: 'Skills',
    category: 'professional',
    aliases: [
      'skills',
      'key skills',
      'technical skills',
      'primary skills',
      'skill set',
      'core skills',
    ],
    identifierPatterns: [/^(skills?|key ?skills|skill ?set)$/],
    synthetic: null,
  },
  {
    key: 'education',
    label: 'Highest education',
    category: 'education',
    aliases: [
      'education',
      'highest education',
      'highest qualification',
      'qualification',
      'education level',
      'highest level of education',
      'level of education',
    ],
    identifierPatterns: [/^(education|qualification|highest ?education|education ?level)$/],
    synthetic: null,
  },
  {
    key: 'degree',
    label: 'Degree',
    category: 'education',
    aliases: ['degree', 'degree name', 'degree type'],
    identifierPatterns: [/^(degree|degree ?name|degree ?type)$/],
    synthetic: null,
  },
  {
    key: 'fieldOfStudy',
    label: 'Field of study',
    category: 'education',
    aliases: [
      'field of study',
      'major',
      'discipline',
      'specialization',
      'specialisation',
      'area of study',
    ],
    identifierPatterns: [/^(field ?of ?study|major|discipline|specialization)$/],
    synthetic: null,
  },
  {
    key: 'university',
    label: 'University',
    category: 'education',
    aliases: [
      'university',
      'school',
      'college',
      'institution',
      'school name',
      'university name',
      'college name',
      'school university',
      'educational institution',
    ],
    identifierPatterns: [/^(university|school|college|institution|school ?name)$/],
    synthetic: null,
  },
  {
    key: 'graduationYear',
    label: 'Graduation year',
    category: 'education',
    aliases: [
      'graduation year',
      'year of graduation',
      'passing year',
      'year of passing',
      'graduation date',
      'expected graduation',
    ],
    identifierPatterns: [/^(graduation ?year|grad ?year|passing ?year|year ?of ?passing)$/],
    synthetic: null,
  },
  {
    key: 'gpa',
    label: 'GPA / grade',
    category: 'education',
    aliases: ['gpa', 'cgpa', 'grade', 'percentage', 'grade point average'],
    identifierPatterns: [/^(gpa|cgpa|grade)$/],
    synthetic: null,
  },
  {
    key: 'workAuthorization',
    label: 'Work authorization',
    category: 'eligibility',
    aliases: [
      'work authorization',
      'authorized to work',
      'legally authorized to work',
      'are you legally authorized to work',
      'work permit',
      'eligible to work',
      'right to work',
      'work eligibility',
      'are you authorized to work',
    ],
    identifierPatterns: [
      /^(work ?authorization|authorized ?to ?work|work ?permit|right ?to ?work)$/,
    ],
    synthetic: null,
  },
  {
    key: 'requiresSponsorship',
    label: 'Requires visa sponsorship',
    category: 'eligibility',
    aliases: [
      'sponsorship',
      'require sponsorship',
      'visa sponsorship',
      'need visa sponsorship',
      'will you now or in the future require sponsorship',
      'require visa sponsorship',
      'will you require sponsorship',
    ],
    identifierPatterns: [/^(sponsorship|visa ?sponsorship|requires? ?sponsorship)$/],
    synthetic: null,
  },
  {
    key: 'willingToRelocate',
    label: 'Willing to relocate',
    category: 'preferences',
    aliases: [
      'willing to relocate',
      'relocation',
      'open to relocation',
      'willingness to relocate',
      'relocate',
      'are you willing to relocate',
      'open to relocate',
    ],
    identifierPatterns: [/^(relocate|relocation|willing ?to ?relocate)$/],
    synthetic: null,
  },
  {
    key: 'preferredLocation',
    label: 'Preferred location',
    category: 'preferences',
    aliases: [
      'preferred location',
      'preferred office location',
      'preferred work location',
      'location preference',
      'preferred city',
    ],
    identifierPatterns: [/^(preferred ?location|location ?preference)$/],
    synthetic: null,
  },
  {
    key: 'workMode',
    label: 'Work mode preference',
    category: 'preferences',
    aliases: [
      'work mode',
      'remote',
      'remote or onsite',
      'work arrangement',
      'preferred work mode',
      'workplace type',
    ],
    identifierPatterns: [/^(work ?mode|remote|work ?arrangement)$/],
    synthetic: null,
  },
  {
    key: 'linkedinUrl',
    label: 'LinkedIn profile',
    category: 'links',
    aliases: ['linkedin', 'linkedin profile', 'linkedin url', 'linkedin profile url'],
    identifierPatterns: [/linked ?in/],
    synthetic: 'url',
  },
  {
    key: 'githubUrl',
    label: 'GitHub profile',
    category: 'links',
    aliases: ['github', 'github profile', 'github url', 'github username'],
    identifierPatterns: [/git ?hub/],
    synthetic: 'url',
  },
  {
    key: 'portfolioUrl',
    label: 'Portfolio URL',
    category: 'links',
    aliases: ['portfolio', 'portfolio url', 'portfolio link', 'portfolio website'],
    identifierPatterns: [/portfolio/],
    synthetic: 'url',
  },
  {
    key: 'websiteUrl',
    label: 'Website',
    category: 'links',
    aliases: ['website', 'personal website', 'website url', 'homepage', 'blog', 'other website'],
    autocomplete: ['url'],
    identifierPatterns: [/^(website|web ?site|homepage|url|site)$/],
    types: ['url', 'text'],
    synthetic: 'url',
  },
  {
    key: 'dateOfBirth',
    label: 'Date of birth',
    category: 'personal',
    aliases: ['date of birth', 'dob', 'birth date', 'birthday', 'birthdate'],
    autocomplete: ['bday'],
    identifierPatterns: [/^(dob|birth ?date|date ?of ?birth|birthday)$/],
    synthetic: null,
  },
  {
    key: 'gender',
    label: 'Gender',
    category: 'personal',
    aliases: ['gender', 'sex', 'gender identity'],
    autocomplete: ['sex'],
    identifierPatterns: [/^(gender|sex)$/],
    synthetic: null,
  },
  {
    key: 'nationality',
    label: 'Nationality',
    category: 'eligibility',
    aliases: ['nationality', 'citizenship', 'country of citizenship'],
    identifierPatterns: [/^(nationality|citizenship)$/],
    synthetic: null,
  },
  {
    key: 'languages',
    label: 'Languages',
    category: 'professional',
    aliases: ['languages', 'languages spoken', 'languages known', 'language proficiency'],
    identifierPatterns: [/^languages?$/],
    synthetic: null,
  },
  {
    key: 'coverLetter',
    label: 'Cover letter',
    category: 'professional',
    aliases: ['cover letter', 'covering letter', 'motivation letter'],
    identifierPatterns: [/^(cover ?letter)$/],
    types: ['textarea'],
    synthetic: null,
  },
  {
    key: 'summary',
    label: 'Professional summary',
    category: 'professional',
    aliases: [
      'summary',
      'professional summary',
      'about you',
      'about yourself',
      'tell us about yourself',
      'bio',
      'profile summary',
    ],
    identifierPatterns: [/^(summary|bio|about|about ?me)$/],
    types: ['textarea'],
    synthetic: null,
  },
  {
    key: 'howDidYouHear',
    label: 'How did you hear about us',
    category: 'preferences',
    aliases: [
      'how did you hear about us',
      'how did you hear about this job',
      'how did you find us',
      'source',
      'referral source',
      'where did you hear about us',
    ],
    identifierPatterns: [/^(source|referral ?source|how ?did ?you ?hear)$/],
    synthetic: null,
  },
  {
    key: 'referredBy',
    label: 'Referred by',
    category: 'professional',
    aliases: ['referred by', 'referrer', 'referral name', 'employee referral', 'who referred you'],
    identifierPatterns: [/^(referred ?by|referrer|referral)$/],
    synthetic: null,
  },
  {
    key: 'subject',
    label: 'Subject',
    category: 'custom',
    aliases: ['subject', 'topic', 'regarding'],
    identifierPatterns: [/^subject$/],
    synthetic: 'text',
  },
  {
    key: 'message',
    label: 'Message',
    category: 'custom',
    aliases: [
      'message',
      'your message',
      'comments',
      'comment',
      'additional information',
      'additional comments',
      'notes',
      'inquiry',
    ],
    identifierPatterns: [/^(message|comments?|notes|inquiry|enquiry)$/],
    types: ['textarea', 'text'],
    synthetic: 'text',
  },
]

export interface CompiledSemanticKey extends SemanticKeyDefinition {
  normalizedAliases: readonly string[]
}

let compiled: readonly CompiledSemanticKey[] | null = null
let byKey: ReadonlyMap<string, CompiledSemanticKey> | null = null

export function getSemanticCatalog(): readonly CompiledSemanticKey[] {
  if (!compiled) {
    compiled = DEFINITIONS.map((definition) => ({
      ...definition,
      normalizedAliases: [
        ...new Set([definition.label, ...definition.aliases].map(normalizeLabel).filter(Boolean)),
      ],
    }))
    byKey = new Map(compiled.map((entry) => [entry.key, entry]))
  }
  return compiled
}

export function getSemanticKey(key: string | null | undefined): CompiledSemanticKey | undefined {
  if (!key) return undefined
  getSemanticCatalog()
  return byKey?.get(key)
}

export const CUSTOM_KEY_PREFIX = 'custom:'

/** Builds a stable custom semantic key from a user label, e.g. "Preferred Office Location" -> "custom:preferred-office-location". */
export function customSemanticKey(label: string): string {
  const slug = normalizeLabel(label).replace(/\s+/g, '-').slice(0, 100)
  return `${CUSTOM_KEY_PREFIX}${slug || 'field'}`
}

export function isCustomSemanticKey(key: string | null | undefined): boolean {
  return Boolean(key?.startsWith(CUSTOM_KEY_PREFIX))
}

export function semanticKeyLabel(key: string | null | undefined): string {
  if (!key) return 'Unknown'
  const known = getSemanticKey(key)
  if (known) return known.label
  if (isCustomSemanticKey(key)) {
    const slug = key.slice(CUSTOM_KEY_PREFIX.length).replace(/-/g, ' ')
    return slug.charAt(0).toUpperCase() + slug.slice(1)
  }
  return key
}
