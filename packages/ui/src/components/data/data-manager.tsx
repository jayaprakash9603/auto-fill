import type { ExportBundle } from '@ufa/core'
import {
  serializeExport,
  type AutofillStore,
  type ImportReport,
  type ImportStrategy,
} from '@ufa/storage'
import { AlertTriangleIcon, DownloadIcon, Trash2Icon, UploadIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { useAction, useStoreSnapshot } from '../../hooks/use-store'
import { useTranslate } from '../../i18n/messages'
import { Button } from '../ui/button'
import { Checkbox, Input, Label } from '../ui/form-controls'
import { Alert } from '../ui/misc'
import { ConfirmDialog, downloadText, ErrorMessage, Section } from './shared'

export interface DataManagerProps {
  store: AutofillStore
  className?: string
}

const fileName = (at: number) => `form-autofill-${new Date(at).toISOString().slice(0, 10)}.json`

/** Export, import and deletion of everything the store holds. */
export function DataManager({ store, className }: DataManagerProps) {
  const t = useTranslate()
  const snapshot = useStoreSnapshot(store)
  return (
    <div className={className}>
      <div className="ufa:flex ufa:flex-col ufa:gap-5">
        {snapshot.issues.length ? (
          <Alert tone="warning" icon={<AlertTriangleIcon />} title={t('store.issues')}>
            <ul className="ufa:list-disc ufa:pl-4">
              {snapshot.issues.map((issue) => (
                <li key={issue.collection}>{issue.message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <ExportSection store={store} />
        <ImportSection store={store} />
        <DeleteSection store={store} />
      </div>
    </div>
  )
}

function ExportSection({ store }: { store: AutofillStore }) {
  const t = useTranslate()
  const action = useAction()
  const [includeSettings, setIncludeSettings] = useState(true)
  const checkboxId = useId()
  const root = useRef<HTMLDivElement>(null)

  return (
    <Section title={t('data.exportTitle')} description={t('data.exportBody')}>
      <div ref={root} className="ufa:flex ufa:flex-wrap ufa:items-center ufa:gap-3">
        <div className="ufa:flex ufa:items-center ufa:gap-2">
          <Checkbox
            id={checkboxId}
            checked={includeSettings}
            onCheckedChange={(checked) => setIncludeSettings(checked === true)}
          />
          <Label htmlFor={checkboxId}>{t('data.includeSettings')}</Label>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={action.pending}
          onClick={() =>
            void action.run(async () => {
              const bundle = await store.transfer.export({ includeSettings })
              downloadText(
                root.current?.ownerDocument ?? document,
                fileName(bundle.exportedAt),
                serializeExport(bundle),
              )
            })
          }
        >
          <DownloadIcon /> {t('data.export')}
        </Button>
      </div>
      <ErrorMessage message={action.error} />
    </Section>
  )
}

function ImportSection({ store }: { store: AutofillStore }) {
  const t = useTranslate()
  const action = useAction()
  const inputId = useId()
  const strategyName = useId()
  const settingsId = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const [bundle, setBundle] = useState<ExportBundle | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [strategy, setStrategy] = useState<ImportStrategy>('merge')
  const [includeSettings, setIncludeSettings] = useState(false)
  const [preview, setPreview] = useState<ImportReport | null>(null)
  const [result, setResult] = useState<ImportReport | null>(null)

  const refreshPreview = async (
    next: ExportBundle,
    nextStrategy: ImportStrategy,
    nextSettings: boolean,
  ) => {
    setPreview(
      await store.transfer.preview(next, { strategy: nextStrategy, includeSettings: nextSettings }),
    )
  }

  const choose = async (file: File | undefined) => {
    setResult(null)
    setPreview(null)
    setBundle(null)
    setErrors([])
    if (!file) return
    const parsed = store.transfer.parse(await file.text())
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setBundle(parsed.bundle)
    await action.run(() => refreshPreview(parsed.bundle, strategy, includeSettings))
  }

  const update = (nextStrategy: ImportStrategy, nextSettings: boolean) => {
    setStrategy(nextStrategy)
    setIncludeSettings(nextSettings)
    if (bundle) void action.run(() => refreshPreview(bundle, nextStrategy, nextSettings))
  }

  const updated = (report: ImportReport) =>
    report.profiles.updated + report.answers.updated + report.customFields.updated

  return (
    <Section title={t('data.importTitle')} description={t('data.importBody')}>
      <div className="ufa:flex ufa:flex-col ufa:gap-1.5">
        <Label htmlFor={inputId}>{t('data.file')}</Label>
        <Input
          id={inputId}
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="ufa:h-auto ufa:py-1.5 ufa:text-xs"
          onChange={(event) => void choose(event.target.files?.[0])}
        />
      </div>

      {errors.length ? (
        <Alert tone="destructive" title={t('data.invalid')}>
          <ul className="ufa:list-disc ufa:pl-4">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {bundle ? (
        <div className="ufa:flex ufa:flex-col ufa:gap-3 ufa:rounded-md ufa:border ufa:border-border ufa:p-3">
          <fieldset className="ufa:flex ufa:flex-col ufa:gap-2">
            <legend className="ufa:mb-1 ufa:text-xs ufa:font-medium">{t('data.strategy')}</legend>
            {(['merge', 'replace'] as const).map((option) => (
              <label key={option} className="ufa:flex ufa:items-start ufa:gap-2 ufa:text-sm">
                <input
                  type="radio"
                  name={strategyName}
                  value={option}
                  checked={strategy === option}
                  onChange={() => update(option, includeSettings)}
                  className="ufa:mt-1 ufa:accent-primary"
                />
                <span className="ufa:flex ufa:flex-col">
                  {t(`data.${option}`)}
                  <span className="ufa:text-xs ufa:text-muted-foreground">
                    {t(`data.${option}Hint`)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {bundle.settings ? (
            <div className="ufa:flex ufa:items-center ufa:gap-2">
              <Checkbox
                id={settingsId}
                checked={includeSettings}
                onCheckedChange={(checked) => update(strategy, checked === true)}
              />
              <Label htmlFor={settingsId}>{t('data.importSettings')}</Label>
            </div>
          ) : null}
          {preview ? (
            <p role="status" className="ufa:text-xs ufa:text-muted-foreground">
              {t('data.preview', {
                profiles: preview.profiles.added,
                answers: preview.answers.added,
                fields: preview.customFields.added,
                updated: updated(preview),
                skipped:
                  preview.answers.skipped + preview.customFields.skipped + preview.mappings.skipped,
              })}
            </p>
          ) : null}
          {preview?.warnings.length ? (
            <Alert tone="warning" icon={<AlertTriangleIcon />}>
              <ul className="ufa:list-disc ufa:pl-4">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          <Button
            size="sm"
            variant={strategy === 'replace' ? 'destructive' : 'default'}
            className="ufa:self-start"
            disabled={action.pending}
            onClick={() =>
              void action.run(async () => {
                const report = await store.transfer.import(bundle, { strategy, includeSettings })
                setResult(report)
                setBundle(null)
                setPreview(null)
                if (fileInput.current) fileInput.current.value = ''
              })
            }
          >
            <UploadIcon /> {t('data.import')}
          </Button>
        </div>
      ) : null}
      <ErrorMessage message={action.error} />
      {result ? (
        <Alert tone="success">
          {t('data.imported', { answers: result.answers.added, profiles: result.profiles.added })}
        </Alert>
      ) : null}
    </Section>
  )
}

function DeleteSection({ store }: { store: AutofillStore }) {
  const t = useTranslate()
  const action = useAction()
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)

  return (
    <Section title={t('data.deleteTitle')} description={t('data.deleteBody')}>
      <Button
        size="sm"
        variant="outline"
        className="ufa:self-start ufa:text-destructive"
        onClick={() => {
          setDone(false)
          setConfirming(true)
        }}
      >
        <Trash2Icon /> {t('data.delete')}
      </Button>
      {done ? (
        <p role="status" className="ufa:text-xs ufa:text-muted-foreground">
          {t('data.deleted')}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('data.deleteConfirmTitle')}
        description={t('data.deleteConfirmBody')}
        confirmLabel={t('data.delete')}
        pending={action.pending}
        error={action.error}
        onConfirm={() =>
          void action.run(async () => {
            await store.deleteAll()
            setConfirming(false)
            setDone(true)
          })
        }
      />
    </Section>
  )
}
