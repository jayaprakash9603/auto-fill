import type { AnswerCategory, CustomFieldDefinition } from '@ufa/core'
import type { AutofillStore } from '@ufa/storage'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { useAction, useStoreSnapshot } from '../../hooks/use-store'
import { useTranslate } from '../../i18n/messages'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/form-controls'
import { SimpleSelect } from '../ui/select'
import {
  categoryLabel,
  categoryOptions,
  ConfirmDialog,
  ErrorMessage,
  FormField,
  Section,
  splitList,
} from './shared'

export interface CustomFieldsManagerProps {
  store: AutofillStore
  className?: string
}

/** Lists, adds, edits and removes the user's own fields. */
export function CustomFieldsManager({ store, className }: CustomFieldsManagerProps) {
  const t = useTranslate()
  const snapshot = useStoreSnapshot(store)
  const removal = useAction()
  const [editing, setEditing] = useState<CustomFieldDefinition | 'new' | null>(null)
  const [deleting, setDeleting] = useState<CustomFieldDefinition | null>(null)

  return (
    <Section
      className={className}
      title={t('custom.title')}
      description={t('custom.hint')}
      actions={
        <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
          <PlusIcon /> {t('custom.add')}
        </Button>
      }
    >
      {snapshot.customFields.length === 0 ? (
        <p className="ufa:text-xs ufa:text-muted-foreground">{t('custom.empty')}</p>
      ) : (
        <ul
          aria-label={t('custom.title')}
          className="ufa:flex ufa:flex-col ufa:divide-y ufa:divide-border ufa:rounded-md ufa:border ufa:border-border"
        >
          {snapshot.customFields.map((field) => (
            <li key={field.key} className="ufa:flex ufa:items-center ufa:gap-2 ufa:px-2.5 ufa:py-2">
              <div className="ufa:flex ufa:min-w-0 ufa:flex-1 ufa:flex-col">
                <span className="ufa:truncate ufa:text-sm ufa:font-medium">{field.label}</span>
                <span className="ufa:truncate ufa:text-xs ufa:text-muted-foreground">
                  {[
                    categoryLabel(t, field.category),
                    ...field.aliases.map((alias) => alias.text),
                  ].join(' · ')}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditing(field)}
                aria-label={t('custom.editLabel', { label: field.label })}
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleting(field)}
                aria-label={t('custom.deleteLabel', { label: field.label })}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        {editing !== null ? (
          <CustomFieldDialog
            store={store}
            field={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('custom.deleteTitle', { label: deleting?.label ?? '' })}
        description={t('custom.deleteBody')}
        confirmLabel={t('common.delete')}
        pending={removal.pending}
        error={removal.error}
        onConfirm={() =>
          void removal.run(async () => {
            if (deleting) await store.customFields.remove(deleting.key)
            setDeleting(null)
          })
        }
      />
    </Section>
  )
}

function CustomFieldDialog({
  store,
  field,
  onDone,
}: {
  store: AutofillStore
  field: CustomFieldDefinition | null
  onDone: () => void
}) {
  const t = useTranslate()
  const action = useAction()
  const [label, setLabel] = useState(field?.label ?? '')
  const [aliases, setAliases] = useState(field?.aliases.map((alias) => alias.text).join(', ') ?? '')
  const [category, setCategory] = useState<AnswerCategory>(field?.category ?? 'custom')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const draft = { label, aliases: splitList(aliases), category }
    const saved = await action.run(() =>
      field ? store.customFields.update(field.key, draft) : store.customFields.create(draft),
    )
    if (saved) onDone()
  }

  return (
    <DialogContent
      closeLabel={t('common.cancel')}
      aria-describedby={undefined}
      className="ufa:max-w-sm"
    >
      <DialogHeader>
        <DialogTitle>{field ? t('custom.editTitle') : t('custom.newTitle')}</DialogTitle>
      </DialogHeader>
      <form className="ufa:flex ufa:flex-col ufa:gap-3" onSubmit={(event) => void submit(event)}>
        <FormField label={t('custom.label')}>
          {(props) => (
            <Input
              {...props}
              value={label}
              required
              maxLength={300}
              onChange={(event) => setLabel(event.target.value)}
            />
          )}
        </FormField>
        <FormField label={t('custom.aliases')} hint={t('common.commaHint')}>
          {(props) => (
            <Input
              {...props}
              value={aliases}
              onChange={(event) => setAliases(event.target.value)}
            />
          )}
        </FormField>
        <FormField label={t('editor.category')}>
          {(props) => (
            <SimpleSelect
              {...props}
              value={category}
              onValueChange={(next) => setCategory(next as AnswerCategory)}
              options={categoryOptions(t)}
            />
          )}
        </FormField>
        <ErrorMessage message={action.error} />
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={action.pending}>
            {action.pending ? t('common.saving') : t('custom.save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
