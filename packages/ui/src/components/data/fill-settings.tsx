import {
  AUTOFILL_MODES,
  SYNTHETIC_CATEGORIES,
  type AutofillMode,
  type AutofillSettingsInput,
} from '@ufa/core'
import type { AutofillStore } from '@ufa/storage'
import { PlusIcon, XIcon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'

import { useAction, useStoreSnapshot } from '../../hooks/use-store'
import { useTranslate } from '../../i18n/messages'
import { cn } from '../../lib/cn'
import { Button } from '../ui/button'
import { Input, Label, Switch } from '../ui/form-controls'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { SimpleSelect } from '../ui/select'

const HOST = /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
const MIN_CONFIDENCE_CHOICES = [0.9, 0.95, 0.98] as const

/** "https://Jobs.Example.com/apply" and "jobs.example.com" both become "jobs.example.com". */
export function normalizeSite(input: string): string | null {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null
  let host = trimmed
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(trimmed)) host = new URL(trimmed).hostname
  } catch {
    return null
  }
  host = host.replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/\.$/, '')
  return host.length <= 253 && HOST.test(host) ? host : null
}

export interface FillSettingsProps {
  store: AutofillStore
  /** The site of the connected page, offered as a one-click trusted site. */
  currentSite?: string | null
  className?: string
}

/** Mode, overwriting and trusted sites: everything that decides which fields may be filled. */
export function FillSettings({ store, currentSite, className }: FillSettingsProps) {
  const t = useTranslate()
  const { settings } = useStoreSnapshot(store)
  const action = useAction()
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const ids = { overwrite: useId(), site: useId(), confidence: useId(), hint: useId() }
  const sites = settings.trusted.sites

  const update = (patch: AutofillSettingsInput) =>
    void action.run(() => store.settings.update(patch))
  const addSite = (raw: string) => {
    const site = normalizeSite(raw)
    if (!site) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setDraft('')
    if (!sites.includes(site)) update({ trusted: { sites: [...sites, site] } })
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    addSite(draft)
  }
  const current = currentSite ? normalizeSite(currentSite) : null

  return (
    <section
      data-slot="fill-settings"
      aria-labelledby={`${ids.hint}-title`}
      className={cn('ufa:flex ufa:flex-col ufa:gap-4', className)}
    >
      <h3 id={`${ids.hint}-title`} className="ufa:text-sm ufa:font-semibold">
        {t('settings.title')}
      </h3>

      <div className="ufa:flex ufa:flex-col ufa:gap-2">
        <span id={`${ids.hint}-mode`} className="ufa:text-xs ufa:font-medium">
          {t('settings.mode')}
        </span>
        <RadioGroup
          aria-labelledby={`${ids.hint}-mode`}
          value={settings.mode}
          onValueChange={(mode) => update({ mode: mode as AutofillMode })}
        >
          {AUTOFILL_MODES.map((mode) => {
            const itemId = `${ids.hint}-mode-${mode}`
            return (
              <Label
                key={mode}
                htmlFor={itemId}
                className={cn(
                  'ufa:cursor-pointer ufa:items-start ufa:gap-2 ufa:rounded-md ufa:border ufa:border-border ufa:px-3 ufa:py-2 ufa:font-normal ufa:transition-colors ufa:hover:bg-accent/30',
                  settings.mode === mode && 'ufa:border-primary ufa:bg-accent/40',
                )}
              >
                <RadioGroupItem
                  id={itemId}
                  value={mode}
                  className="ufa:mt-0.5"
                  aria-labelledby={`${itemId}-title`}
                  aria-describedby={`${itemId}-hint`}
                />
                <span className="ufa:flex ufa:flex-col">
                  <span id={`${itemId}-title`} className="ufa:text-sm ufa:font-medium">
                    {t(`mode.${mode}`)}
                  </span>
                  <span id={`${itemId}-hint`} className="ufa:text-xs ufa:text-muted-foreground">
                    {t(`mode.${mode}Hint`)}
                  </span>
                </span>
              </Label>
            )
          })}
        </RadioGroup>
      </div>

      <div className="ufa:flex ufa:items-start ufa:gap-3">
        <Switch
          id={`${ids.hint}-learning`}
          checked={settings.learning.allowed}
          onCheckedChange={(checked) => update({ learning: { allowed: checked } })}
        />
        <div className="ufa:flex ufa:flex-col ufa:gap-0.5">
          <Label htmlFor={`${ids.hint}-learning`}>{t('settings.learning')}</Label>
          <p className="ufa:text-xs ufa:text-muted-foreground">{t('settings.learningHint')}</p>
        </div>
      </div>

      <div className="ufa:flex ufa:items-start ufa:gap-3">
        <Switch
          id={`${ids.hint}-synthetic`}
          checked={settings.synthetic.enabled}
          aria-label={t('settings.synthetic')}
          onCheckedChange={(checked) =>
            update({
              synthetic: {
                enabled: checked,
                ...(checked && settings.synthetic.allowedCategories.length === 0
                  ? { allowedCategories: [...SYNTHETIC_CATEGORIES] }
                  : {}),
              },
            })
          }
        />
        <div className="ufa:flex ufa:flex-col ufa:gap-0.5">
          <Label htmlFor={`${ids.hint}-synthetic`}>{t('settings.synthetic')}</Label>
          <p className="ufa:text-xs ufa:text-muted-foreground">{t('settings.syntheticHint')}</p>
        </div>
      </div>

      <div className="ufa:flex ufa:items-start ufa:gap-3">
        <Switch
          id={ids.overwrite}
          checked={settings.overwriteExisting}
          onCheckedChange={(checked) => update({ overwriteExisting: checked })}
          aria-describedby={`${ids.overwrite}-hint`}
        />
        <div className="ufa:flex ufa:flex-col ufa:gap-0.5">
          <Label htmlFor={ids.overwrite}>{t('settings.overwrite')}</Label>
          <p id={`${ids.overwrite}-hint`} className="ufa:text-xs ufa:text-muted-foreground">
            {t('settings.overwriteHint')}
          </p>
        </div>
      </div>

      <div className="ufa:flex ufa:flex-col ufa:gap-2">
        <h4 className="ufa:text-xs ufa:font-medium">{t('settings.trustedSites')}</h4>
        <p id={ids.hint} className="ufa:text-xs ufa:text-muted-foreground">
          {t('settings.trustedSitesHint')}
        </p>
        {sites.length === 0 ? (
          <p className="ufa:text-xs ufa:text-muted-foreground ufa:italic">
            {t('settings.trustedSitesEmpty')}
          </p>
        ) : (
          <ul
            aria-label={t('settings.trustedSites')}
            className="ufa:flex ufa:flex-wrap ufa:gap-1.5"
          >
            {sites.map((site) => (
              <li
                key={site}
                className="ufa:flex ufa:items-center ufa:gap-1 ufa:rounded-md ufa:border ufa:border-border ufa:py-0.5 ufa:pr-0.5 ufa:pl-2 ufa:font-mono ufa:text-xs"
              >
                {site}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ufa:size-6"
                  aria-label={t('settings.removeSite', { site })}
                  onClick={() =>
                    update({ trusted: { sites: sites.filter((entry) => entry !== site) } })
                  }
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit} className="ufa:flex ufa:items-start ufa:gap-2">
          <div className="ufa:flex ufa:flex-1 ufa:flex-col ufa:gap-1">
            <Label htmlFor={ids.site} className="ufa:sr-only">
              {t('settings.addSite')}
            </Label>
            <Input
              id={ids.site}
              value={draft}
              placeholder={t('settings.sitePlaceholder')}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${ids.site}-error` : ids.hint}
              onChange={(event) => {
                setDraft(event.target.value)
                setInvalid(false)
              }}
            />
            {invalid ? (
              <p id={`${ids.site}-error`} className="ufa:text-xs ufa:text-destructive">
                {t('settings.siteInvalid')}
              </p>
            ) : null}
          </div>
          <Button type="submit" variant="outline">
            <PlusIcon />
            {t('settings.addSite')}
          </Button>
        </form>
        {current && !sites.includes(current) ? (
          <Button
            variant="link"
            size="sm"
            className="ufa:self-start ufa:px-0"
            onClick={() => addSite(current)}
          >
            {t('fill.trustSite', { site: current })}
          </Button>
        ) : null}
        <div className="ufa:flex ufa:items-center ufa:gap-2">
          <Label htmlFor={ids.confidence} className="ufa:flex-1">
            {t('settings.minConfidence')}
          </Label>
          <SimpleSelect
            id={ids.confidence}
            className="ufa:w-24"
            value={String(settings.trusted.minConfidence)}
            onValueChange={(value) => update({ trusted: { minConfidence: Number(value) } })}
            options={[...new Set([...MIN_CONFIDENCE_CHOICES, settings.trusted.minConfidence])]
              .sort((a, b) => a - b)
              .map((value) => ({ value: String(value), label: `${Math.round(value * 100)}%` }))}
          />
        </div>
      </div>

      {action.error ? (
        <p role="alert" className="ufa:text-xs ufa:text-destructive">
          {action.error}
        </p>
      ) : null}
    </section>
  )
}
