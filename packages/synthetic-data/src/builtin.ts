import type {
  FieldDescriptor,
  FieldValue,
  GeneratorContext,
  GeneratorProvider,
  SyntheticCategory,
} from '@ufa/core'

const FIRST = ['Ada', 'Grace', 'Alan', 'Katherine', 'Linus']
const LAST = ['Lovelace', 'Hopper', 'Turing', 'Johnson', 'Torvalds']

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!
}

function textGenerator(
  id: string,
  categories: readonly SyntheticCategory[],
  build: (field: FieldDescriptor, ctx: GeneratorContext) => FieldValue | null,
): GeneratorProvider {
  return {
    id,
    apiVersion: 1,
    name: id,
    description: id,
    categories,
    supports: (_field, category) => categories.includes(category),
    generate: (field, context) => build(field, context),
  }
}

export const BUILTIN_GENERATORS: readonly GeneratorProvider[] = [
  textGenerator('ufa.synthetic.name', ['name'], (_field, ctx) => ({
    kind: 'text',
    text: `${pick(FIRST, () => ctx.random())} ${pick(LAST, () => ctx.random())}`,
  })),
  textGenerator('ufa.synthetic.email', ['email'], (_field, ctx) => ({
    kind: 'text',
    text: `applicant${ctx.sequence('email')}@example.com`,
  })),
  textGenerator('ufa.synthetic.phone', ['phone'], (_field, ctx) => {
    const n = ctx.sequence('phone')
    const last = String(1000 + (n % 9000)).padStart(4, '0')
    const mid = String(100 + (n % 90)).padStart(2, '0')
    return { kind: 'text', text: `555-01${mid}-${last}` }
  }),
  textGenerator('ufa.synthetic.address', ['address'], (_field, ctx) => ({
    kind: 'text',
    text: `${100 + ctx.sequence('address')} Example Street`,
  })),
  textGenerator('ufa.synthetic.url', ['url'], (_field, ctx) => ({
    kind: 'text',
    text: `https://example.com/profile/${ctx.sequence('url')}`,
  })),
  textGenerator('ufa.synthetic.text', ['text', 'identifier'], (_field, ctx) => ({
    kind: 'text',
    text: `Sample response ${ctx.sequence('text')}`,
  })),
  textGenerator('ufa.synthetic.number', ['number'], (_field, ctx) => ({
    kind: 'text',
    text: String(1 + ctx.sequence('number')),
  })),
  textGenerator('ufa.synthetic.date', ['date'], (_field, ctx) => {
    const year = 2020 + (ctx.sequence('date') % 5)
    return { kind: 'text', text: `${year}-06-15` }
  }),
  textGenerator('ufa.synthetic.checkbox', ['checkbox'], () => ({
    kind: 'checked',
    checked: true,
  })),
  textGenerator('ufa.synthetic.select', ['select-option'], (field, ctx) => {
    const option = field.options.find((entry) => !entry.disabled && entry.value !== '')
    if (!option) return null
    const pickIndex = ctx.sequence('select') % Math.max(1, field.options.length)
    const chosen = field.options[pickIndex] ?? option
    if (chosen.disabled || chosen.value === '') return { kind: 'options', values: [option.value] }
    return { kind: 'options', values: [chosen.value] }
  }),
]
