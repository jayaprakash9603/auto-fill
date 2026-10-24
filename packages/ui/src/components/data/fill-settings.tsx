import {
  AUTOFILL_MODES,
  SYNTHETIC_CATEGORIES,
  type AutofillMode,
  type AutofillSettingsInput,
} from '@ufa/core'
import type { AutofillStore } from '@ufa/storage'
import { PlusIcon, ShieldCheckIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'

import { useAction, useStoreSnapshot } from '../../hooks/use-store'
import { useTranslate } from '../../i18n/messages'
import { cn } from '../../lib/cn'
import { Button } from '../ui/button'
import { Input, Label, Switch } from '../ui/form-controls'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { SimpleSelect } from '../ui/select'
import { Section } from './shared'

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

/** A label and hint on the left, its switch on the right. */
function SwitchRow({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: ReactNode
  hint: ReactNode
  children: ReactNode
}) {
  return (
    <div className="ufa:flex ufa:items-start ufa:gap-3 ufa:border-t ufa:border-border ufa:px-3 ufa:py-2.5">
      <div className="ufa:flex ufa:min-w-0 ufa:flex-1 ufa:flex-col ufa:gap-0.5">
        <Label htmlFor={id} className="ufa:text-[13px]">
          {label}
        </Label>
        <p id={`${id}-hint`} className="ufa:text-xs ufa:text-muted-foreground">
          {hint}
        </p>
      </div>
      {children}
    </div>
  )
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
    <div data-slot="fill-settings" className={cn('ufa:flex ufa:flex-col ufa:gap-3', className)}>
      <Section
        icon={<SlidersHorizontalIcon />}
        title={t('settings.title')}
        bodyClassName="ufa:gap-0 ufa:p-0"
      >
        <div className="ufa:flex ufa:flex-col ufa:gap-2 ufa:p-3">
          <span
            id={`${ids.hint}-mode`}
            className="ufa:text-xs ufa:font-medium ufa:text-muted-foreground"
          >
            {t('settings.mode')}
          </span>
          <RadioGroup
            aria-labelledby={`${ids.hint}-mode`}
            value={settings.mode}
            className="ufa:gap-1.5"
            onValueChange={(mode) => update({ mode: mode as AutofillMode })}
          >
            {AUTOFILL_MODES.map((mode) => {
              const itemId = `${ids.hint}-mode-${mode}`
              const checked = settings.mode === mode
              return (
                <Label
                  key={mode}
                  htmlFor={itemId}
                  className={cn(
                    'ufa:cursor-pointer ufa:items-start ufa:gap-2.5 ufa:rounded-lg ufa:border ufa:px-3 ufa:py-2 ufa:font-normal ufa:transition-colors',
                    checked
                      ? 'ufa:border-primary/60 ufa:bg-primary/5'
                      : 'ufa:border-border ufa:hover:bg-muted/50',
                  )}
                >
                  <RadioGroupItem
                    id={itemId}
                    value={mode}
                    className="ufa:mt-0.5"
                    aria-labelledby={`${itemId}-title`}
                    aria-describedby={`${itemId}-hint`}
                  />
                  <span className="ufa:flex ufa:min-w-0 ufa:flex-col">
                    <span id={`${itemId}-title`} className="ufa:text-[13px] ufa:font-medium">
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

        <SwitchRow
          id={`${ids.hint}-learning`}
          label={t('settings.learning')}
          hint={t('settings.learningHint')}
        >
          <Switch
            id={`${ids.hint}-learning`}
            className="ufa:mt-0.5"
            checked={settings.learning.allowed}
            aria-describedby={`${ids.hint}-learning-hint`}
            onCheckedChange={(checked) => update({ learning: { allowed: checked } })}
          />
        </SwitchRow>

        <SwitchRow
          id={`${ids.hint}-synthetic`}
          label={t('settings.synthetic')}
          hint={t('settings.syntheticHint')}
        >
          <Switch
            id={`${ids.hint}-synthetic`}
            className="ufa:mt-0.5"
            checked={settings.synthetic.enabled}
            aria-label={t('settings.synthetic')}
            aria-describedby={`${ids.hint}-synthetic-hint`}
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
        </SwitchRow>

        <SwitchRow
          id={ids.overwrite}
          label={t('settings.overwrite')}
          hint={t('settings.overwriteHint')}
        >
          <Switch
            id={ids.overwrite}
            className="ufa:mt-0.5"
            checked={settings.overwriteExisting}
            onCheckedChange={(checked) => update({ overwriteExisting: checked })}
            aria-describedby={`${ids.overwrite}-hint`}
          />
        </SwitchRow>
      </Section>

      <Section
        icon={<ShieldCheckIcon />}
        title={t('settings.trustedSites')}
        count={sites.length}
        description={t('settings.trustedSitesHint')}
        descriptionId={ids.hint}
      >
        {sites.length === 0 ? (
          <p className="ufa:text-xs ufa:text-muted-foreground">{t('settings.trustedSitesEmpty')}</p>
        ) : (
          <ul
            aria-label={t('settings.trustedSites')}
            className="ufa:flex ufa:flex-wrap ufa:gap-1.5"
          >
            {sites.map((site) => (
              <li
                key={site}
                className="ufa:flex ufa:items-center ufa:gap-0.5 ufa:rounded-full ufa:border ufa:border-border ufa:bg-muted/40 ufa:py-0.5 ufa:pr-0.5 ufa:pl-2.5 ufa:font-mono ufa:text-xs"
              >
                {site}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ufa:size-6 ufa:rounded-full ufa:text-muted-foreground ufa:hover:text-foreground"
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
              className="ufa:h-8"
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
          <Button type="submit" variant="outline" size="sm">
            <PlusIcon />
            {t('settings.addSite')}
          </Button>
        </form>
        {current && !sites.includes(current) ? (
          <Button
            variant="outline"
            size="sm"
            className="ufa:self-start ufa:border-dashed"
            onClick={() => addSite(current)}
          >
            <PlusIcon />
            {t('fill.trustSite', { site: current })}
          </Button>
        ) : null}
        <div className="ufa:-mx-3 ufa:-mb-3 ufa:flex ufa:items-center ufa:gap-3 ufa:border-t ufa:border-border ufa:px-3 ufa:py-2.5">
          <Label htmlFor={ids.confidence} className="ufa:flex-1 ufa:text-[13px]">
            {t('settings.minConfidence')}
          </Label>
          <SimpleSelect
            id={ids.confidence}
            className="ufa:h-8 ufa:w-24"
            value={String(settings.trusted.minConfidence)}
            onValueChange={(value) => update({ trusted: { minConfidence: Number(value) } })}
            options={[...new Set([...MIN_CONFIDENCE_CHOICES, settings.trusted.minConfidence])]
              .sort((a, b) => a - b)
              .map((value) => ({ value: String(value), label: `${Math.round(value * 100)}%` }))}
          />
        </div>
      </Section>

      {action.error ? (
        <p role="alert" className="ufa:text-xs ufa:text-destructive">
          {action.error}
        </p>
      ) : null}
    </div>
  )
}
