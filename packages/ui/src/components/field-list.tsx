import {
  semanticKeyLabel,
  type AnswerRecord,
  type FieldDescriptor,
  type FieldValue,
  type ClearResult,
  type FillResult,
  type SyntheticGenerationResult,
  type LabelSource,
  type MatchCandidate,
  type MatchResult,
  type MatchState,
  type PolicyDecision,
} from '@ufa/core'
import { AppWindowIcon, FormInputIcon, LockIcon, ShieldAlertIcon } from 'lucide-react'
import { useId, useMemo } from 'react'

import { useTranslate, type MessageKey, type Translate } from '../i18n/messages'
import { cn } from '../lib/cn'
import { EmptyState } from './states'
import { Badge, type BadgeProps } from './ui/badge'
import { Checkbox, NativeSelect } from './ui/form-controls'
import { Spinner } from './ui/misc'

/** Match states with their own badge; skipped and unsupported fields already show why. */
const STATE_BADGES: Partial<Record<MatchState, BadgeProps['variant']>> = {
  matched: 'success',
  suggested: 'info',
  ambiguous: 'warning',
  incompatible: 'warning',
  missing: 'muted',
}

const REVIEW_STATES: ReadonlySet<MatchState> = new Set(['suggested', 'ambiguous', 'incompatible'])

const RESULT_BADGES: Record<FillResult['status'], BadgeProps['variant']> = {
  filled: 'success',
  unchanged: 'muted',
  skipped: 'muted',
  failed: 'destructive',
}

const CLEAR_RESULT_BADGES: Record<ClearResult['status'], BadgeProps['variant']> = {
  cleared: 'success',
  unchanged: 'muted',
  skipped: 'muted',
  failed: 'destructive',
}

/**
 * Whether the user may select a field for filling: the policies allow it, or the field is
 * ambiguous and the user has picked one of its answers.
 */
export function canSelectField(
  match: MatchResult | undefined,
  decision: PolicyDecision | undefined,
  hasChoice: boolean,
): boolean {
  if (!decision) return false
  if (decision.action === 'fill' || decision.action === 'confirm') return true
  return decision.action === 'suggest' && match?.state === 'ambiguous' && hasChoice
}

/** Fields selected up front: trusted fills and confident matches, never consent fields. */
export function isPreselected(
  field: FieldDescriptor,
  match: MatchResult | undefined,
  decision: PolicyDecision | undefined,
): boolean {
  if (field.sensitivity !== 'normal' || !decision) return false
  return decision.action === 'fill' || (decision.action === 'confirm' && match?.state === 'matched')
}

function choosable(match: MatchResult | undefined): MatchCandidate[] {
  if (match?.state !== 'ambiguous') return []
  return match.candidates.filter((candidate) => candidate.compatible && candidate.fillValue)
}

function describeFill(value: FieldValue, field: FieldDescriptor, t: Translate): string {
  switch (value.kind) {
    case 'text':
      return value.text
    case 'checked':
      return value.checked ? t('match.checked') : t('match.unchecked')
    case 'options':
      return value.values
        .map((wanted) => field.options.find((option) => option.value === wanted)?.label ?? wanted)
        .join(', ')
  }
}

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
  /** How each field matches the saved answers, by field id. */
  matches?: Readonly<Record<string, MatchResult>>
  /** What the policies allow for each field, by field id. */
  decisions?: Readonly<Record<string, PolicyDecision>>
  /** Outcome of the latest fill for each field it touched, by field id. */
  results?: Readonly<Record<string, FillResult>>
  /** In-memory generated previews, never persisted. */
  generated?: Readonly<Record<string, SyntheticGenerationResult>>
  /** Outcome of the latest clear for each field it touched, by field id. */
  clearResults?: Readonly<Record<string, ClearResult>>
  /** Fields selected for filling. Omit to show the list without selection controls. */
  selected?: ReadonlySet<string>
  onSelectedChange?: (fieldId: string, selected: boolean) => void
  /** The saved answer picked for each ambiguous field, by field id. */
  choices?: Readonly<Record<string, string>>
  onChoiceChange?: (fieldId: string, answerId: string) => void
  /** Saved answers, to name the choices of ambiguous fields. */
  answers?: readonly AnswerRecord[]
  scanning?: boolean
  className?: string
}

const NO_MATCHES: Readonly<Record<string, MatchResult>> = {}
const NO_DECISIONS: Readonly<Record<string, PolicyDecision>> = {}
const NO_RESULTS: Readonly<Record<string, FillResult>> = {}
const NO_GENERATED: Readonly<Record<string, SyntheticGenerationResult>> = {}
const NO_CLEAR_RESULTS: Readonly<Record<string, ClearResult>> = {}
const NO_CHOICES: Readonly<Record<string, string>> = {}
const NO_ANSWERS: readonly AnswerRecord[] = []

/** Everything a row needs besides its field; shared by all rows of the list. */
interface RowContext {
  matches: Readonly<Record<string, MatchResult>>
  decisions: Readonly<Record<string, PolicyDecision>>
  results: Readonly<Record<string, FillResult>>
  generated: Readonly<Record<string, SyntheticGenerationResult>>
  clearResults: Readonly<Record<string, ClearResult>>
  selected: ReadonlySet<string> | undefined
  onSelectedChange: ((fieldId: string, selected: boolean) => void) | undefined
  choices: Readonly<Record<string, string>>
  onChoiceChange: ((fieldId: string, answerId: string) => void) | undefined
  answerLabels: ReadonlyMap<string, string>
}

function summarize(matches: Readonly<Record<string, MatchResult>>) {
  let ready = 0
  let review = 0
  let missing = 0
  for (const result of Object.values(matches)) {
    if (result.state === 'matched') ready += 1
    else if (REVIEW_STATES.has(result.state)) review += 1
    else if (result.state === 'missing') missing += 1
  }
  return { ready, review, missing, total: ready + review + missing }
}

/**
 * Overview of detected fields, grouped by section: safety and support badges, what each field
 * was recognized as, the saved answer proposed for it with confidence and explanation, and, when
 * selection is enabled, a checkbox for each field the policies let the user fill.
 */
export function FieldList({
  fields,
  matches = NO_MATCHES,
  decisions = NO_DECISIONS,
  results = NO_RESULTS,
  generated = NO_GENERATED,
  clearResults = NO_CLEAR_RESULTS,
  selected,
  onSelectedChange,
  choices = NO_CHOICES,
  onChoiceChange,
  answers = NO_ANSWERS,
  scanning = false,
  className,
}: FieldListProps) {
  const t = useTranslate()
  const headingId = useId()
  const groups = useMemo(() => groupFields(fields, t), [fields, t])
  const summary = useMemo(() => summarize(matches), [matches])
  const answerLabels = useMemo(
    () => new Map(answers.map((answer) => [answer.id, answer.label])),
    [answers],
  )
  const context: RowContext = {
    matches,
    decisions,
    results,
    generated,
    clearResults,
    selected,
    onSelectedChange,
    choices,
    onChoiceChange,
    answerLabels,
  }

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

      {summary.total > 0 ? (
        <p data-slot="match-summary" className="ufa:text-xs ufa:text-muted-foreground">
          {t('match.summary', summary)}
        </p>
      ) : null}

      {fields.length === 0 && !scanning ? (
        <EmptyState
          icon={<FormInputIcon />}
          title={t('fields.emptyTitle')}
          description={t('fields.emptyBody')}
        />
      ) : null}

      {groups.map((group) => (
        <FieldGroupSection key={group.key} group={group} context={context} />
      ))}
    </section>
  )
}

function FieldGroupSection({ group, context }: { group: FieldGroup; context: RowContext }) {
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
          <FieldRow key={field.id} field={field} context={context} />
        ))}
      </ul>
    </div>
  )
}

function FieldRow({ field, context }: { field: FieldDescriptor; context: RowContext }) {
  const t = useTranslate()
  const choiceId = useId()
  const match = context.matches[field.id]
  const decision = context.decisions[field.id]
  const result = context.results[field.id]
  const generated = context.generated[field.id]
  const clearResult = context.clearResults[field.id]
  const choice = context.choices[field.id]
  const options = choosable(match)
  const inferred = INFERRED_SOURCES[field.labelSource]
  const stateBadge = match ? STATE_BADGES[match.state] : undefined
  const chosen = choice ? options.find((candidate) => candidate.answerId === choice) : undefined
  const best = chosen ?? match?.best ?? null
  const generatedText = generated
    ? describeFill(generated.value, field, t)
    : null
  const proposed = generatedText ?? (best?.fillValue ? describeFill(best.fillValue, field, t) : null)
  const selectable = canSelectField(match, decision, chosen !== undefined)
  const isSelected = selectable && !!context.selected?.has(field.id)
  const label = field.label || t('fields.unlabeled')
  /** A usable answer the policies hold back, e.g. because the field already has a value. */
  const heldBack =
    !result &&
    !clearResult &&
    decision &&
    (decision.action === 'skip' || decision.action === 'block') &&
    (match?.state === 'matched' || match?.state === 'suggested')
      ? decision.reason
      : null
  const resultVariant = clearResult
    ? clearResult.status === 'cleared' && !clearResult.verified
      ? 'warning'
      : CLEAR_RESULT_BADGES[clearResult.status]
    : result
      ? result.status === 'filled' && !result.verified
        ? 'warning'
        : RESULT_BADGES[result.status]
      : undefined
  const resultKey: MessageKey | null = clearResult
    ? clearResult.status === 'cleared' && !clearResult.verified
      ? 'clear.result.unverified'
      : `clear.result.${clearResult.status}`
    : result
      ? result.status === 'filled' && !result.verified
        ? 'fill.result.unverified'
        : `fill.result.${result.status}`
      : null
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
      data-match-state={match?.state}
      data-decision={decision?.action}
      data-fill-status={result?.status}
      className="ufa:flex ufa:items-start ufa:gap-2 ufa:px-3 ufa:py-2"
    >
      {context.selected ? (
        <Checkbox
          className="ufa:mt-0.5"
          checked={isSelected}
          disabled={!selectable}
          aria-label={t('fill.select', { label })}
          onCheckedChange={(checked) => context.onSelectedChange?.(field.id, checked === true)}
        />
      ) : null}
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
        {field.semanticKey ? (
          <p
            className="ufa:truncate ufa:text-xs ufa:text-muted-foreground"
            title={field.semanticReason ?? undefined}
          >
            {t('match.recognized', { key: semanticKeyLabel(field.semanticKey) })}
          </p>
        ) : null}
        {field.unsupportedReason ? (
          <p className="ufa:text-xs ufa:text-muted-foreground">{field.unsupportedReason}</p>
        ) : null}
        {proposed !== null ? (
          <div data-slot="match-proposal" className="ufa:mt-1 ufa:flex ufa:flex-col ufa:gap-0.5">
            <p className="ufa:flex ufa:min-w-0 ufa:items-baseline ufa:gap-1 ufa:text-xs">
              <span className="ufa:sr-only">
                {`${generated ? t('match.generated') : t('match.proposed')}: `}
              </span>
              <span className="ufa:truncate ufa:font-medium" title={proposed}>
                {proposed}
              </span>
              {generated ? (
                <span className="ufa:shrink-0 ufa:text-muted-foreground">· {t('match.generated')}</span>
              ) : best ? (
                <span className="ufa:shrink-0 ufa:text-muted-foreground">
                  {`· ${t(`match.level.${best.confidence.level}`)}`}
                </span>
              ) : null}
            </p>
            {generated && !generated.valid ? (
              <p className="ufa:text-xs ufa:text-destructive">
                {generated.validationMessage ?? t('match.generatedInvalid')}
              </p>
            ) : best ? (
              <p className="ufa:text-xs ufa:text-muted-foreground">{best.explanation}</p>
            ) : null}
          </div>
        ) : match?.reason && stateBadge && match.state !== 'missing' ? (
          <p className="ufa:mt-1 ufa:text-xs ufa:text-muted-foreground">{match.reason}</p>
        ) : null}
        {context.selected && options.length > 1 ? (
          <div className="ufa:mt-1 ufa:flex ufa:flex-col ufa:gap-1">
            <label htmlFor={choiceId} className="ufa:text-xs ufa:font-medium">
              {t('fill.choose')}
            </label>
            <NativeSelect
              id={choiceId}
              className="ufa:h-8 ufa:text-xs"
              value={choice ?? ''}
              onChange={(event) => context.onChoiceChange?.(field.id, event.target.value)}
            >
              <option value="" disabled>
                {t('fill.chooseHint')}
              </option>
              {options.map((candidate) => {
                const value = candidate.fillValue ? describeFill(candidate.fillValue, field, t) : ''
                const answerLabel = context.answerLabels.get(candidate.answerId)
                return (
                  <option key={candidate.answerId} value={candidate.answerId}>
                    {answerLabel && answerLabel !== field.label
                      ? `${value} (${answerLabel})`
                      : value}
                  </option>
                )
              })}
            </NativeSelect>
          </div>
        ) : null}
        {heldBack ? (
          <p data-slot="fill-decision" className="ufa:mt-1 ufa:text-xs ufa:text-muted-foreground">
            {heldBack}
          </p>
        ) : null}
        {result?.reason ? (
          <p
            data-slot="fill-result"
            className={cn(
              'ufa:mt-1 ufa:text-xs',
              result.status === 'failed' ? 'ufa:text-destructive' : 'ufa:text-muted-foreground',
            )}
          >
            {result.reason}
          </p>
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
        {field.hasValue && !result ? <Badge variant="info">{t('fields.hasValue')}</Badge> : null}
        {generated && !clearResult && !result ? (
          <Badge variant="outline">{t('match.generated')}</Badge>
        ) : null}
        {(clearResult || result) && resultKey && resultVariant ? (
          <Badge variant={resultVariant}>{t(resultKey)}</Badge>
        ) : match && stateBadge ? (
          <Badge variant={stateBadge}>{t(`match.${match.state}` as MessageKey)}</Badge>
        ) : null}
      </div>
    </li>
  )
}
