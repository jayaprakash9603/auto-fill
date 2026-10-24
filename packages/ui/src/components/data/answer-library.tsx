import {
  describeAnswerValue,
  semanticKeyLabel,
  type AnswerCategory,
  type AnswerRecord,
} from '@ufa/core'
import {
  findDuplicateAnswers,
  queryAnswers,
  type AnswerScope,
  type AutofillStore,
} from '@ufa/storage'
import { CopyIcon, PencilIcon, PlusIcon, SearchXIcon, StarIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useAction, useStoreSnapshot } from '../../hooks/use-store'
import { useTranslate } from '../../i18n/messages'
import { EmptyState } from '../states'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Checkbox, Input } from '../ui/form-controls'
import { SimpleSelect } from '../ui/select'
import { Alert } from '../ui/misc'
import { AnswerEditor } from './answer-editor'
import { categoryOptions, ConfirmDialog, ErrorMessage, scopeLabel, Section } from './shared'

const GLOBAL = '__global__'
const ALL = '__all__'

export interface AnswerLibraryProps {
  store: AutofillStore
  className?: string
}

/** Searchable list of saved answers with editing, bulk actions and duplicate handling. */
export function AnswerLibrary({ store, className }: AnswerLibraryProps) {
  const t = useTranslate()
  const snapshot = useStoreSnapshot(store)
  const action = useAction()
  const [text, setText] = useState('')
  const [scope, setScope] = useState(ALL)
  const [category, setCategory] = useState<AnswerCategory | ''>('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [editing, setEditing] = useState<AnswerRecord | null | 'new'>(null)
  const [deleting, setDeleting] = useState<readonly string[] | null>(null)
  const [moveTo, setMoveTo] = useState(GLOBAL)
  const [tag, setTag] = useState('')

  const shown = useMemo(() => {
    const answerScope: AnswerScope =
      scope === ALL ? 'all' : scope === GLOBAL ? 'global' : { profileId: scope }
    return queryAnswers(
      snapshot.answers,
      { text, scope: answerScope, category: category || null },
      snapshot.customFields,
    )
  }, [snapshot.answers, snapshot.customFields, text, scope, category])
  const duplicates = useMemo(() => findDuplicateAnswers(snapshot.answers), [snapshot.answers])
  const selectedIds = [...selected].filter((id) =>
    snapshot.answers.some((answer) => answer.id === id),
  )
  const allShownSelected = shown.length > 0 && shown.every((answer) => selected.has(answer.id))

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const fieldName = (answer: AnswerRecord) =>
    answer.semanticKey
      ? (snapshot.customFields.find((field) => field.key === answer.semanticKey)?.label ??
        semanticKeyLabel(answer.semanticKey))
      : null

  const mergeDuplicates = () =>
    action.run(async () => {
      for (const group of duplicates.duplicates) {
        const [keep, ...rest] = [...group].sort(
          (a, b) => b.usageCount - a.usageCount || a.createdAt - b.createdAt,
        )
        if (keep && rest.length)
          await store.answers.merge(
            keep.id,
            rest.map((answer) => answer.id),
          )
      }
    })

  const duplicateCount = duplicates.duplicates.reduce((sum, group) => sum + group.length, 0)
  const defaultScope = scope === ALL || scope === GLOBAL ? null : scope

  return (
    <Section
      className={className}
      title={t('answers.title')}
      description={
        snapshot.answers.length === 1
          ? t('answers.countOne')
          : t('answers.count', { count: snapshot.answers.length })
      }
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          <PlusIcon /> {t('answers.add')}
        </Button>
      }
    >
      <div className="ufa:flex ufa:flex-col ufa:gap-2">
        <Input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('answers.search')}
          aria-label={t('answers.search')}
        />
        <div className="ufa:grid ufa:grid-cols-2 ufa:gap-2">
          <SimpleSelect
            aria-label={t('answers.scope')}
            value={scope}
            onValueChange={setScope}
            className="ufa:h-8"
            options={[
              { value: ALL, label: t('answers.scopeAll') },
              { value: GLOBAL, label: t('answers.scopeGlobal') },
              ...snapshot.profiles.map((profile) => ({
                value: profile.id,
                label: t('answers.scopeProfile', { name: profile.name }),
              })),
            ]}
          />
          <SimpleSelect
            aria-label={t('answers.category')}
            value={category}
            onValueChange={(next) => setCategory(next as AnswerCategory | '')}
            className="ufa:h-8"
            options={[{ value: '', label: t('answers.categoryAll') }, ...categoryOptions(t)]}
          />
        </div>
      </div>

      {duplicateCount ? (
        <Alert
          tone="warning"
          icon={<CopyIcon />}
          title={t('answers.duplicates', { count: duplicateCount })}
        >
          <Button
            variant="outline"
            size="sm"
            className="ufa:mt-1"
            onClick={() => void mergeDuplicates()}
            disabled={action.pending}
          >
            {t('answers.merge')}
          </Button>
        </Alert>
      ) : null}
      {duplicates.conflicts.length ? (
        <Alert tone="info">{t('answers.conflicts', { count: duplicates.conflicts.length })}</Alert>
      ) : null}
      <ErrorMessage message={action.error} />

      {selectedIds.length ? (
        <div
          role="toolbar"
          aria-label={t('answers.selected', { count: selectedIds.length })}
          className="ufa:flex ufa:flex-wrap ufa:items-center ufa:gap-2 ufa:rounded-md ufa:border ufa:border-border ufa:bg-muted/50 ufa:p-2"
        >
          <span className="ufa:text-xs ufa:font-medium">
            {t('answers.selected', { count: selectedIds.length })}
          </span>
          <SimpleSelect
            aria-label={t('answers.moveTo')}
            value={moveTo}
            onValueChange={setMoveTo}
            className="ufa:h-8 ufa:w-auto ufa:flex-1"
            options={[
              { value: GLOBAL, label: t('answers.allProfiles') },
              ...snapshot.profiles.map((profile) => ({ value: profile.id, label: profile.name })),
            ]}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={action.pending}
            onClick={() =>
              void action.run(() =>
                store.answers.bulkUpdate(selectedIds, {
                  profileId: moveTo === GLOBAL ? null : moveTo,
                }),
              )
            }
          >
            {t('answers.move')}
          </Button>
          <div className="ufa:flex ufa:w-full ufa:gap-2">
            <Input
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder={t('answers.tagPlaceholder')}
              aria-label={t('answers.addTag')}
              className="ufa:h-8"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!tag.trim() || action.pending}
              onClick={() =>
                void action.run(async () => {
                  await store.answers.bulkUpdate(selectedIds, { addTags: [tag] })
                  setTag('')
                })
              }
            >
              {t('answers.addTag')}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleting(selectedIds)}>
              <Trash2Icon /> {t('answers.deleteSelected')}
            </Button>
          </div>
        </div>
      ) : null}

      {snapshot.answers.length === 0 ? (
        <EmptyState
          className="ufa:py-6"
          title={t('answers.emptyTitle')}
          description={t('answers.emptyBody')}
        />
      ) : shown.length === 0 ? (
        <EmptyState className="ufa:py-6" icon={<SearchXIcon />} title={t('answers.noResults')} />
      ) : (
        <>
          <label className="ufa:flex ufa:items-center ufa:gap-2 ufa:px-1 ufa:text-xs ufa:text-muted-foreground">
            <Checkbox
              checked={allShownSelected}
              onCheckedChange={(checked) =>
                setSelected(
                  checked === true ? new Set(shown.map((answer) => answer.id)) : new Set(),
                )
              }
            />
            {t('answers.selectAll')}
          </label>
          <ul
            aria-label={t('answers.title')}
            className="ufa:flex ufa:flex-col ufa:divide-y ufa:divide-border ufa:rounded-md ufa:border ufa:border-border"
          >
            {shown.map((answer) => {
              const field = fieldName(answer)
              const contextual =
                answer.context.sites.length +
                  answer.context.sectionKeywords.length +
                  answer.context.formKeywords.length >
                0
              return (
                <li
                  key={answer.id}
                  data-answer-id={answer.id}
                  className="ufa:flex ufa:items-start ufa:gap-2 ufa:px-2.5 ufa:py-2"
                >
                  <Checkbox
                    className="ufa:mt-0.5"
                    checked={selected.has(answer.id)}
                    onCheckedChange={(checked) => toggle(answer.id, checked === true)}
                    aria-label={t('answers.select', { label: answer.label })}
                  />
                  <div className="ufa:flex ufa:min-w-0 ufa:flex-1 ufa:flex-col ufa:gap-0.5">
                    <div className="ufa:flex ufa:items-center ufa:gap-1.5">
                      <span className="ufa:truncate ufa:text-sm ufa:font-medium">
                        {answer.label}
                      </span>
                      {answer.preferred ? (
                        <StarIcon
                          className="ufa:size-3.5 ufa:shrink-0 ufa:fill-warning ufa:text-warning"
                          aria-label={t('answers.preferred')}
                        />
                      ) : null}
                    </div>
                    <p
                      className="ufa:truncate ufa:text-xs ufa:text-muted-foreground"
                      title={describeAnswerValue(answer.value)}
                    >
                      {describeAnswerValue(answer.value)}
                    </p>
                    <div className="ufa:flex ufa:flex-wrap ufa:gap-1 ufa:pt-0.5">
                      <Badge variant="outline">
                        {scopeLabel(t, snapshot.profiles, answer.profileId)}
                      </Badge>
                      {field && field !== answer.label ? (
                        <Badge variant="muted">{field}</Badge>
                      ) : null}
                      {contextual ? <Badge variant="info">{t('answers.contextual')}</Badge> : null}
                      {answer.tags.map((entry) => (
                        <Badge key={entry} variant="secondary">
                          {entry}
                        </Badge>
                      ))}
                      {answer.usageCount ? (
                        <span className="ufa:text-[11px] ufa:text-muted-foreground">
                          {t('answers.used', { count: answer.usageCount })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditing(answer)}
                    aria-label={t('answers.editLabel', { label: answer.label })}
                    title={t('common.edit')}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleting([answer.id])}
                    aria-label={t('answers.deleteLabel', { label: answer.label })}
                    title={t('common.delete')}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <AnswerEditor
        store={store}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        answer={editing === 'new' ? null : editing}
        defaultProfileId={defaultScope}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={
          deleting?.length === 1
            ? t('answers.deleteTitleOne')
            : t('answers.deleteTitle', { count: deleting?.length ?? 0 })
        }
        description={t('answers.deleteBody')}
        confirmLabel={t('common.delete')}
        pending={action.pending}
        onConfirm={() =>
          void action.run(async () => {
            if (!deleting) return
            await store.answers.remove(deleting)
            setSelected((current) => new Set([...current].filter((id) => !deleting.includes(id))))
            setDeleting(null)
          })
        }
      />
    </Section>
  )
}
