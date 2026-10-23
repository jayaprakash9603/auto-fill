import type { FieldDescriptor, LabelSource } from '@ufa/core'
import { AppWindowIcon, FormInputIcon, LockIcon, ShieldAlertIcon } from 'lucide-react'
import { useId, useMemo } from 'react'

import { useTranslate, type MessageKey, type Translate } from '../i18n/messages'
import { cn } from '../lib/cn'
import { EmptyState } from './states'
import { Badge } from './ui/badge'
import { Spinner } from './ui/misc'

/** Label sources worth surfacing: the label was inferred rather than declared by the page. */
const INFERRED_SOURCES: Partial<Record<LabelSource, MessageKey>> = {
  'adjacent-text': 'labelSource.adjacent-text',
  placeholder: 'labelSource.placeholder',
  title: 'labelSource.title',
  name: 'labelSource.name',
  none: 'labelSource.none',
}

interface FieldGroup {
  key: string
  title: string
  embedded: boolean
  fields: FieldDescriptor[]
}

function groupFields(fields: readonly FieldDescriptor[], t: Translate): FieldGroup[] {
  const groups = new Map<string, FieldGroup>()
  for (const field of fields) {
    const title = field.section ?? field.formTitle ?? t('fields.ungrouped')
    const frame = field.frameId ?? 0
    const key = `${frame}\u0000${title}`
    const group = groups.get(key) ?? { key, title, embedded: frame > 0, fields: [] }
    group.fields.push(field)
    groups.set(key, group)
  }
  return [...groups.values()]
}

export interface FieldListProps {
  fields: readonly FieldDescriptor[]
  scanning?: boolean
  className?: string
}

/** Read-only overview of detected fields, grouped by section, with safety and support badges. */
export function FieldList({ fields, scanning = false, className }: FieldListProps) {
  const t = useTranslate()
  const headingId = useId()
  const groups = useMemo(() => groupFields(fields, t), [fields, t])

  return (
    <section
      data-slot="field-list"
      aria-labelledby={headingId}
      aria-busy={scanning}
      className={cn('ufa:flex ufa:min-w-0 ufa:flex-col ufa:gap-2', className)}
    >
      <div className="ufa:flex ufa:items-center ufa:gap-2">
        <h3 id={headingId} className="ufa:flex-1 ufa:text-sm ufa:font-semibold">
          {t('fields.title')}
        </h3>
        {scanning ? (
          <span className="ufa:flex ufa:items-center ufa:gap-1.5 ufa:text-xs ufa:text-muted-foreground">
            <Spinner label={t('fields.scanning')} />
            {t('fields.scanning')}
          </span>
        ) : (
          <span className="ufa:text-xs ufa:text-muted-foreground">
            {fields.length === 1
              ? t('fields.countOne')
              : t('fields.count', { count: fields.length })}
          </span>
        )}
      </div>

      {fields.length === 0 && !scanning ? (
        <EmptyState
          icon={<FormInputIcon />}
          title={t('fields.emptyTitle')}
          description={t('fields.emptyBody')}
        />
      ) : null}

      {groups.map((group) => (
        <FieldGroupSection key={group.key} group={group} />
      ))}
    </section>
  )
}

function FieldGroupSection({ group }: { group: FieldGroup }) {
  const t = useTranslate()
  const headingId = useId()
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="ufa:overflow-hidden ufa:rounded-md ufa:border ufa:border-border ufa:bg-card"
    >
      <div className="ufa:flex ufa:items-center ufa:gap-2 ufa:border-b ufa:border-border ufa:bg-muted/50 ufa:px-3 ufa:py-1.5">
        <h4
          id={headingId}
          className="ufa:min-w-0 ufa:flex-1 ufa:truncate ufa:text-xs ufa:font-medium ufa:text-muted-foreground"
          title={group.title}
        >
          {group.title}
        </h4>
        {group.embedded ? (
          <Badge variant="outline">
            <AppWindowIcon aria-hidden />
            {t('fields.frame')}
          </Badge>
        ) : null}
      </div>
      <ul className="ufa:divide-y ufa:divide-border">
        {group.fields.map((field) => (
          <FieldRow key={field.id} field={field} />
        ))}
      </ul>
    </div>
  )
}

function FieldRow({ field }: { field: FieldDescriptor }) {
  const t = useTranslate()
  const inferred = INFERRED_SOURCES[field.labelSource]
  const details = [
    t(`fieldType.${field.type}`),
    field.options.length > 0
      ? field.options.length === 1
        ? t('fields.optionsOne')
        : t('fields.options', { count: field.options.length })
      : null,
    inferred ? t(inferred) : null,
  ].filter(Boolean)

  return (
    <li
      data-field-id={field.id}
      data-field-type={field.type}
      className="ufa:flex ufa:items-start ufa:gap-2 ufa:px-3 ufa:py-2"
    >
      <div className="ufa:min-w-0 ufa:flex-1">
        <p className="ufa:truncate ufa:text-sm" title={field.label}>
          {field.label || (
            <span className="ufa:text-muted-foreground ufa:italic">{t('fields.unlabeled')}</span>
          )}
          {field.required ? (
            <>
              <span className="ufa:text-destructive" aria-hidden>
                {' *'}
              </span>
              <span className="ufa:sr-only">{` (${t('fields.required')})`}</span>
            </>
          ) : null}
        </p>
        <p className="ufa:truncate ufa:text-xs ufa:text-muted-foreground">{details.join(' · ')}</p>
        {field.unsupportedReason ? (
          <p className="ufa:text-xs ufa:text-muted-foreground">{field.unsupportedReason}</p>
        ) : null}
      </div>
      <div className="ufa:flex ufa:shrink-0 ufa:flex-wrap ufa:justify-end ufa:gap-1">
        {field.sensitivity === 'prohibited' ? (
          <Badge
            variant="destructive"
            title={t('fields.protectedHint', { reason: field.sensitivityReason ?? '' })}
          >
            <LockIcon aria-hidden />
            {t('fields.protected')}
          </Badge>
        ) : null}
        {field.sensitivity === 'consent' ? (
          <Badge variant="warning" title={t('fields.consentHint')}>
            <ShieldAlertIcon aria-hidden />
            {t('fields.consent')}
          </Badge>
        ) : null}
        {field.support === 'unsupported' ? (
          <Badge variant="muted">{t('fields.unsupported')}</Badge>
        ) : null}
        {field.hasValue ? <Badge variant="info">{t('fields.hasValue')}</Badge> : null}
      </div>
    </li>
  )
}
