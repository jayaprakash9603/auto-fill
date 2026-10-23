import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'

/** Every user-visible string in the UI package. Hosts pass partial overrides to localize. */
export const defaultMessages = {
  'panel.title': 'Form Autofill',
  'panel.refresh': 'Refresh',
  'panel.connecting': 'Connecting to the page…',
  'status.idle': 'Not connected',
  'status.connecting': 'Connecting',
  'status.ready': 'Connected',
  'status.error': 'Unavailable',
  'status.destroyed': 'Closed',
  'page.frames': '{count} frames',
  'page.frame': '1 frame',
  'page.adapter': 'Portal: {name}',
  'page.runtime': 'Runtime {version}',
  'permission.title': 'Allow access to this site',
  'permission.body':
    'Autofill needs permission to read the form on {site}. Access is limited to this site and you can revoke it at any time.',
  'permission.thisSite': 'this site',
  'permission.hint':
    'Autofill cannot see this page yet. Open the extension from the browser toolbar while the page is active to grant access for this visit, then try again.',
  'permission.allow': 'Allow access',
  'permission.denied': 'Access was not granted. Autofill stays off for this site.',
  'restricted.title': "This page can't be autofilled",
  'restricted.body':
    'Browser pages, the extension store and other protected pages do not allow extensions to read forms.',
  'noTab.title': 'No page to autofill',
  'noTab.body': 'Open a website with a form in this window, then refresh.',
  'error.title': 'Something went wrong',
  'error.retry': 'Try again',
  'empty.title': 'Nothing here yet',
  'fields.title': 'Detected fields',
  'fields.count': '{count} fields',
  'fields.countOne': '1 field',
  'fields.scanning': 'Scanning…',
  'fields.emptyTitle': 'No form fields found',
  'fields.emptyBody':
    'Open the form, or its next step, and refresh. Closed components and cross-site frames are not visible to autofill.',
  'fields.ungrouped': 'Other fields',
  'fields.unlabeled': 'Unlabeled field',
  'fields.required': 'required',
  'fields.options': '{count} options',
  'fields.optionsOne': '1 option',
  'fields.protected': 'Protected',
  'fields.protectedHint': 'Never read or filled: {reason}',
  'fields.consent': 'Needs your OK',
  'fields.consentHint': 'Terms, consent and declarations are never changed automatically.',
  'fields.unsupported': 'Unsupported',
  'fields.hasValue': 'Has value',
  'fields.frame': 'Embedded frame',
  'labelSource.adjacent-text': 'label from nearby text',
  'labelSource.placeholder': 'label from placeholder',
  'labelSource.title': 'label from tooltip',
  'labelSource.name': 'label from field name',
  'labelSource.none': 'no label found',
  'fieldType.text': 'Text',
  'fieldType.email': 'Email',
  'fieldType.tel': 'Phone',
  'fieldType.url': 'URL',
  'fieldType.number': 'Number',
  'fieldType.date': 'Date',
  'fieldType.datetime-local': 'Date and time',
  'fieldType.month': 'Month',
  'fieldType.week': 'Week',
  'fieldType.time': 'Time',
  'fieldType.search': 'Search',
  'fieldType.password': 'Password',
  'fieldType.textarea': 'Long text',
  'fieldType.select': 'Dropdown',
  'fieldType.multiselect': 'Multi-select',
  'fieldType.checkbox': 'Checkbox',
  'fieldType.checkbox-group': 'Checkboxes',
  'fieldType.radio-group': 'Single choice',
  'fieldType.combobox': 'Combo box',
  'fieldType.contenteditable': 'Rich text',
  'fieldType.file': 'File upload',
  'fieldType.range': 'Slider',
  'fieldType.color': 'Color',
  'fieldType.unknown': 'Unknown',
} as const

export type MessageKey = keyof typeof defaultMessages
export type AutofillMessages = Partial<Record<MessageKey, string>>
export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string

const MessagesContext = createContext<AutofillMessages>({})

export function MessagesProvider({
  messages,
  children,
}: {
  messages?: AutofillMessages
  children: ReactNode
}) {
  const value = useMemo(() => messages ?? {}, [messages])
  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>
}

export function formatMessage(template: string, values?: Record<string, string | number>): string {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  )
}

export function useTranslate(): Translate {
  const overrides = useContext(MessagesContext)
  return useCallback<Translate>(
    (key, values) => formatMessage(overrides[key] ?? defaultMessages[key], values),
    [overrides],
  )
}
