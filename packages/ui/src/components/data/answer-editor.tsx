import {
  describeAnswerValue,
  getSemanticCatalog,
  getSemanticKey,
  type AnswerCategory,
  type AnswerRecord,
  type AnswerValue,
} from '@ufa/core'
import type { AnswerDraft, AutofillStore } from '@ufa/storage'
import { ChevronDownIcon } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'

import { useAction, useStoreSnapshot } from '../../hooks/use-store'
import { useTranslate } from '../../i18n/messages'
import { Button } from '../ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Checkbox, Input, Label, Textarea } from '../ui/form-controls'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { SimpleSelect } from '../ui/select'
import { categoryOptions, ErrorMessage, FormField, splitList } from './shared'

type ValueKind = AnswerValue['kind']

interface EditorState {
  semanticKey: string
  label: string
  kind: ValueKind
  text: string
  bool: boolean
  list: string
  profileId: string
  category: AnswerCategory | ''
  aliases: string
  tags: string
  sites: string
  sections: string
  forms: string
  preferred: boolean
}

const GLOBAL = '__global__'

function initialState(answer: AnswerRecord | null, profileId: string | null): EditorState {
  const value = answer?.value
  return {
    semanticKey: answer?.semanticKey ?? '',
    label: answer?.label ?? '',
    kind: value?.kind ?? 'text',
    text: value?.kind === 'text' ? value.text : '',
    bool: value?.kind === 'boolean' ? value.value : true,
    list: value?.kind === 'list' ? value.items.join('\n') : '',
    profileId: (answer ? answer.profileId : profileId) ?? GLOBAL,
    category: answer?.category ?? '',
    aliases: answer?.aliases.map((alias) => alias.text).join(', ') ?? '',
    tags: answer?.tags.join(', ') ?? '',
    sites: answer?.context.sites.join(', ') ?? '',
    sections: answer?.context.sectionKeywords.join(', ') ?? '',
    forms: answer?.context.formKeywords.join(', ') ?? '',
    preferred: answer?.preferred ?? false,
  }
}

function toValue(state: EditorState): AnswerValue {
  if (state.kind === 'boolean') return { kind: 'boolean', value: state.bool }
  if (state.kind === 'list') return { kind: 'list', items: splitList(state.list, /\n/) }
  return { kind: 'text', text: state.text }
}

export interface AnswerEditorProps {
  store: AutofillStore
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The answer to edit; omit to add a new one. */
  answer?: AnswerRecord | null
  /** Scope preselected for new answers. `null` means all profiles. */
  defaultProfileId?: string | null
  onSaved?: (answer: AnswerRecord) => void
}

/** Adds or edits a saved answer: its field, value, scope, aliases, tags and context rules. */
export function AnswerEditor(props: AnswerEditorProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <EditorDialog {...props} /> : null}
    </Dialog>
  )
}

function EditorDialog({
  store,
  onOpenChange,
  answer = null,
  defaultProfileId = null,
  onSaved,
}: AnswerEditorProps) {
  const t = useTranslate()
  const snapshot = useStoreSnapshot(store)
  const action = useAction()
  const [state, setState] = useState(() => initialState(answer, defaultProfileId))
  const [notice, setNotice] = useState<string | null>(null)
  const preferredId = useId()
  const kindId = useId()
  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setState((current) => ({ ...current, [key]: value }))

  const catalogGroups = useMemo(() => {
    const groups = new Map<AnswerCategory, { key: string; label: string }[]>()
    for (const entry of getSemanticCatalog()) {
      groups.set(entry.category, [
        ...(groups.get(entry.category) ?? []),
        { key: entry.key, label: entry.label },
      ])
    }
    return [...groups.entries()]
  }, [])

  const chooseField = (semanticKey: string) => {
    const label =
      snapshot.customFields.find((field) => field.key === semanticKey)?.label ??
      getSemanticKey(semanticKey)?.label ??
      ''
    setState((current) => ({
      ...current,
      semanticKey,
      label: current.label.trim() ? current.label : label,
    }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setNotice(null)
    const draft: AnswerDraft = {
      label: state.label,
      value: toValue(state),
      semanticKey: state.semanticKey || null,
      profileId: state.profileId === GLOBAL ? null : state.profileId,
      ...(state.category ? { category: state.category } : {}),
      aliases: splitList(state.aliases),
      tags: splitList(state.tags),
      context: {
        sites: splitList(state.sites),
        sectionKeywords: splitList(state.sections),
        formKeywords: splitList(state.forms),
      },
      preferred: state.preferred,
    }
    if (answer) {
      const saved = await action.run(() => store.answers.update(answer.id, draft))
      if (saved) {
        onSaved?.(saved)
        onOpenChange(false)
      }
      return
    }
    const result = await action.run(() => store.answers.create(draft))
    if (!result) return
    if (!result.created) {
      setNotice(
        `${t('editor.duplicate')} ${result.answer.label}: ${describeAnswerValue(result.answer.value)}`,
      )
      return
    }
    onSaved?.(result.answer)
    onOpenChange(false)
  }

  return (
    <DialogContent closeLabel={t('common.cancel')} aria-describedby={undefined}>
      <DialogHeader>
        <DialogTitle>{answer ? t('editor.editTitle') : t('editor.newTitle')}</DialogTitle>
      </DialogHeader>
      <form className="ufa:flex ufa:flex-col ufa:gap-3" onSubmit={(event) => void submit(event)}>
        <FormField label={t('editor.field')}>
          {(field) => (
            <SimpleSelect
              {...field}
              value={state.semanticKey}
              onValueChange={chooseField}
              options={[{ value: '', label: t('editor.fieldNone') }]}
              groups={[
                {
                  label: t('editor.fieldCustom'),
                  options: snapshot.customFields.map((custom) => ({
                    value: custom.key,
                    label: custom.label,
                  })),
                },
                ...catalogGroups.map(([category, entries]) => ({
                  label: t(`category.${category}`),
                  options: entries.map((entry) => ({ value: entry.key, label: entry.label })),
                })),
              ]}
            />
          )}
        </FormField>

        <FormField label={t('editor.label')}>
          {(field) => (
            <Input
              {...field}
              value={state.label}
              maxLength={300}
              required
              onChange={(event) => set('label', event.target.value)}
            />
          )}
        </FormField>

        <div className="ufa:flex ufa:flex-col ufa:gap-1.5">
          <span id={kindId} className="ufa:text-xs ufa:font-medium">
            {t('editor.kind')}
          </span>
          <RadioGroup
            aria-labelledby={kindId}
            value={state.kind}
            onValueChange={(kind) => set('kind', kind as ValueKind)}
            className="ufa:flex ufa:flex-wrap ufa:gap-3"
          >
            {(['text', 'boolean', 'list'] as const).map((kind) => (
              <div key={kind} className="ufa:flex ufa:items-center ufa:gap-1.5">
                <RadioGroupItem id={`${kindId}-${kind}`} value={kind} />
                <Label htmlFor={`${kindId}-${kind}`} className="ufa:text-sm ufa:font-normal">
                  {t(`editor.kind.${kind}`)}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {state.kind === 'text' ? (
          <FormField label={t('editor.value')}>
            {(field) => (
              <Textarea
                {...field}
                value={state.text}
                rows={2}
                maxLength={20_000}
                onChange={(event) => set('text', event.target.value)}
              />
            )}
          </FormField>
        ) : state.kind === 'list' ? (
          <FormField label={t('editor.value')} hint={t('editor.listHint')}>
            {(field) => (
              <Textarea
                {...field}
                value={state.list}
                rows={3}
                onChange={(event) => set('list', event.target.value)}
              />
            )}
          </FormField>
        ) : (
          <FormField label={t('editor.value')}>
            {(field) => (
              <SimpleSelect
                {...field}
                value={state.bool ? 'yes' : 'no'}
                onValueChange={(value) => set('bool', value === 'yes')}
                options={[
                  { value: 'yes', label: t('editor.yes') },
                  { value: 'no', label: t('editor.no') },
                ]}
              />
            )}
          </FormField>
        )}

        <div className="ufa:grid ufa:grid-cols-2 ufa:gap-3">
          <FormField label={t('editor.scope')}>
            {(field) => (
              <SimpleSelect
                {...field}
                value={state.profileId}
                onValueChange={(profileId) => set('profileId', profileId)}
                options={[
                  { value: GLOBAL, label: t('answers.allProfiles') },
                  ...snapshot.profiles.map((profile) => ({
                    value: profile.id,
                    label: profile.name,
                  })),
                ]}
              />
            )}
          </FormField>
          <FormField label={t('editor.category')}>
            {(field) => (
              <SimpleSelect
                {...field}
                value={state.category}
                onValueChange={(category) => set('category', category as AnswerCategory | '')}
                options={[{ value: '', label: '—' }, ...categoryOptions(t)]}
              />
            )}
          </FormField>
        </div>

        <FormField label={t('editor.aliases')} hint={t('common.commaHint')}>
          {(field) => (
            <Input
              {...field}
              value={state.aliases}
              onChange={(event) => set('aliases', event.target.value)}
            />
          )}
        </FormField>
        <FormField label={t('editor.tags')} hint={t('common.commaHint')}>
          {(field) => (
            <Input
              {...field}
              value={state.tags}
              onChange={(event) => set('tags', event.target.value)}
            />
          )}
        </FormField>

        <Collapsible
          className="ufa:rounded-md ufa:border ufa:border-border ufa:px-3 ufa:py-2"
          defaultOpen={Boolean(state.sites || state.sections || state.forms)}
        >
          <CollapsibleTrigger className="ufa:group ufa:flex ufa:w-full ufa:items-center ufa:justify-between ufa:gap-2 ufa:rounded-sm ufa:text-left ufa:text-xs ufa:font-medium ufa:outline-none ufa:focus-visible:outline-2 ufa:focus-visible:outline-ring/40">
            {t('editor.context')}
            <ChevronDownIcon
              aria-hidden
              className="ufa:size-4 ufa:shrink-0 ufa:text-muted-foreground ufa:transition-transform ufa:group-data-[state=open]:rotate-180"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="ufa:mt-2 ufa:flex ufa:flex-col ufa:gap-3">
            <FormField label={t('editor.sites')} hint={t('editor.sitesHint')}>
              {(field) => (
                <Input
                  {...field}
                  value={state.sites}
                  onChange={(event) => set('sites', event.target.value)}
                />
              )}
            </FormField>
            <FormField label={t('editor.sections')} hint={t('common.commaHint')}>
              {(field) => (
                <Input
                  {...field}
                  value={state.sections}
                  onChange={(event) => set('sections', event.target.value)}
                />
              )}
            </FormField>
            <FormField label={t('editor.forms')} hint={t('common.commaHint')}>
              {(field) => (
                <Input
                  {...field}
                  value={state.forms}
                  onChange={(event) => set('forms', event.target.value)}
                />
              )}
            </FormField>
          </CollapsibleContent>
        </Collapsible>

        <div className="ufa:flex ufa:items-center ufa:gap-2">
          <Checkbox
            id={preferredId}
            checked={state.preferred}
            onCheckedChange={(checked) => set('preferred', checked === true)}
          />
          <Label htmlFor={preferredId}>{t('editor.preferred')}</Label>
        </div>

        <ErrorMessage message={action.error} />
        {notice ? (
          <p role="status" className="ufa:text-xs ufa:text-muted-foreground">
            {notice}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={action.pending}>
            {action.pending ? t('common.saving') : t('editor.save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
