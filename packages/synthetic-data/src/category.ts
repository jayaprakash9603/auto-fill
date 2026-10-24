import { isChoiceFieldType, isTextFieldType, type FieldDescriptor, type SyntheticCategory } from '@ufa/core'

/** Maps a field to a generator category, or null when none applies. */
export function syntheticCategoryFor(field: FieldDescriptor): SyntheticCategory | null {
  const key = field.semanticKey
  if (key === 'email' || field.type === 'email') return 'email'
  if (key === 'phone' || field.type === 'tel') return 'phone'
  if (key === 'firstName' || key === 'lastName' || key === 'fullName' || key === 'preferredName')
    return 'name'
  if (
    key === 'addressLine1' ||
    key === 'addressLine2' ||
    key === 'city' ||
    key === 'state' ||
    key === 'postalCode' ||
    key === 'country' ||
    key === 'location'
  )
    return 'address'
  if (
    key === 'linkedinUrl' ||
    key === 'githubUrl' ||
    key === 'portfolioUrl' ||
    key === 'websiteUrl' ||
    field.type === 'url'
  )
    return 'url'
  if (field.type === 'number' || field.type === 'date' || field.type === 'month') {
    if (field.type === 'date' || field.type === 'month') return 'date'
    return 'number'
  }
  if (field.type === 'checkbox') return 'checkbox'
  if (isChoiceFieldType(field.type)) return 'select-option'
  if (isTextFieldType(field.type)) return 'text'
  return null
}
