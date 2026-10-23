import {
  SHARED_PROFILE_FIELDS,
  describeAnswerValue,
  getProfileTemplate,
  getSemanticKey,
  type AnswerValue,
  type Profile,
} from '@ufa/core'
import { answerForKey, type AutofillStore } from '@ufa/storage'
import { useMemo, useState, type FormEvent } from 'react'

import { useAction, useStoreSnapshot } from '../../hooks/use-store'
import { useTranslate } from '../../i18n/messages'
import { Button } from '../ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Input, Textarea } from '../ui/form-controls'
import { ErrorMessage, FormField, splitList } from './shared'

interface DetailField {
  key: string
  label: string
  profileId: string | null
  multiline: boolean
  inputType: 'text' | 'email' | 'tel' | 'url'
}

function describeField(key: string, profileId: string | null): DetailField {
  const entry = getSemanticKey(key)
  const types = entry?.types ?? []
  return {
    key,
    label: entry?.label ?? key,
    profileId,
    multiline: types[0] === 'textarea',
    inputType: types.includes('email')
      ? 'email'
      : types.includes('tel')
        ? 'tel'
        : types.includes('url')
          ? 'url'
          : 'text',
  }
}

const slot = (field: DetailField) => `${field.profileId ?? '*'}|${field.key}`

/**
 * The profile's details as a form: fields shared by every profile, then the fields its template
 * suggests. Saving writes only what changed; clearing a field removes its answer.
 */
export function ProfileDetailsDialog({
  store,
  profile,
  onDone,
}: {
  store: AutofillStore
  profile: Profile
  onDone: () => void
}) {
  const t = useTranslate()
  const snapshot = useStoreSnapshot(store)
  const action = useAction()
  const [saved, setSaved] = useState(false)

  const shared = useMemo(() => SHARED_PROFILE_FIELDS.map((key) => describeField(key, null)), [])
  const own = useMemo(
    () =>
      (getProfileTemplate(profile.templateId)?.fields ?? []).map((key) =>
        describeField(key, profile.id),
      ),
    [profile.templateId, profile.id],
  )

  const [initial] = useState(() => {
    const values: Record<string, { text: string; list: boolean }> = {}
    for (const field of [...shared, ...own]) {
      const answer = answerForKey(snapshot.answers, field.profileId, field.key)
      values[slot(field)] = {
        text: answer ? describeAnswerValue(answer.value) : '',
        list: answer?.value.kind === 'list',
      }
    }
    return values
  })
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, value.text])),
  )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaved(false)
    const done = await action.run(async () => {
      for (const field of [...shared, ...own]) {
        const key = slot(field)
        const text = values[key] ?? ''
        if (text === initial[key]?.text) continue
        const value: AnswerValue | null = !text.trim()
          ? null
          : initial[key]?.list
            ? { kind: 'list', items: splitList(text) }
            : { kind: 'text', text }
        await store.answers.setForField({
          semanticKey: field.key,
          label: field.label,
          profileId: field.profileId,
          value,
        })
      }
      return true
    })
    if (done) {
      setSaved(true)
      onDone()
    }
  }

  const renderField = (field: DetailField) => (
    <FormField key={slot(field)} label={field.label}>
      {(props) =>
        field.multiline ? (
          <Textarea
            {...props}
            rows={3}
            value={values[slot(field)] ?? ''}
            onChange={(event) =>
              setValues((current) => ({ ...current, [slot(field)]: event.target.value }))
            }
          />
        ) : (
          <Input
            {...props}
            type={field.inputType}
            autoComplete="off"
            value={values[slot(field)] ?? ''}
            onChange={(event) =>
              setValues((current) => ({ ...current, [slot(field)]: event.target.value }))
            }
          />
        )
      }
    </FormField>
  )

  return (
    <DialogContent closeLabel={t('common.cancel')}>
      <DialogHeader>
        <DialogTitle>{t('profile.detailsTitle', { name: profile.name })}</DialogTitle>
        <DialogDescription>{t('profile.detailsHint')}</DialogDescription>
      </DialogHeader>
      <form className="ufa:flex ufa:flex-col ufa:gap-4" onSubmit={(event) => void submit(event)}>
        <fieldset className="ufa:flex ufa:flex-col ufa:gap-3">
          <legend className="ufa:mb-2 ufa:text-sm ufa:font-semibold">{t('profile.shared')}</legend>
          {shared.map(renderField)}
        </fieldset>
        <fieldset className="ufa:flex ufa:flex-col ufa:gap-3">
          <legend className="ufa:mb-2 ufa:text-sm ufa:font-semibold">
            {t('profile.own', { name: profile.name })}
          </legend>
          {own.length ? (
            own.map(renderField)
          ) : (
            <p className="ufa:text-xs ufa:text-muted-foreground">{t('profile.noOwnFields')}</p>
          )}
        </fieldset>
        <ErrorMessage message={action.error} />
        {saved ? (
          <p role="status" className="ufa:text-xs ufa:text-success">
            {t('common.saved')}
          </p>
        ) : null}
        <DialogFooter className="ufa:sticky ufa:bottom-0 ufa:bg-popover ufa:pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={action.pending}>
            {action.pending ? t('common.saving') : t('profile.saveDetails')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
