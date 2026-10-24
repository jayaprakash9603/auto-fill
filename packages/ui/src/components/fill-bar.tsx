import { AUTOFILL_MODES, type AutofillMode, type FillResult } from '@ufa/core'
import { ListChecksIcon, Undo2Icon, WandSparklesIcon } from 'lucide-react'
import { useId } from 'react'

import { useTranslate } from '../i18n/messages'
import { cn } from '../lib/cn'
import { Button } from './ui/button'
import { Label } from './ui/form-controls'
import { Spinner } from './ui/misc'
import { SimpleSelect } from './ui/select'

export interface FillBarProps {
  mode: AutofillMode
  onModeChange?: (mode: AutofillMode) => void
  selectedCount: number
  /** Fields that could be selected; enables "select all". */
  selectableCount?: number
  onFill: () => void
  onSelectAll?: () => void
  filling?: boolean
  canUndo?: boolean
  onUndo?: () => void
  syntheticEnabled?: boolean
  onGenerate?: () => void
  onClear?: () => void
  /** Results of the latest fill, summarized for the user and assistive technology. */
  lastResults?: readonly FillResult[] | null
  /** A status line, e.g. after an undo or an error. */
  message?: string | null
  className?: string
}

function summarize(results: readonly FillResult[]) {
  let filled = 0
  let failed = 0
  let skipped = 0
  for (const result of results) {
    if (result.status === 'filled') filled += 1
    else if (result.status === 'failed') failed += 1
    else if (result.status === 'skipped') skipped += 1
  }
  return { filled, failed, skipped }
}

/** Mode switch, the fill action and undo, above the field list. */
export function FillBar({
  mode,
  onModeChange,
  selectedCount,
  selectableCount = 0,
  onFill,
  onSelectAll,
  filling = false,
  canUndo = false,
  onUndo,
  syntheticEnabled = false,
  onGenerate,
  onClear,
  lastResults = null,
  message = null,
  className,
}: FillBarProps) {
  const t = useTranslate()
  const modeId = useId()
  const status = message ?? (lastResults ? t('fill.summary', summarize(lastResults)) : null)

  return (
    <div
      data-slot="fill-bar"
      className={cn(
        'ufa:flex ufa:flex-col ufa:gap-2 ufa:rounded-md ufa:border ufa:border-border ufa:bg-card ufa:p-2.5',
        className,
      )}
    >
      <div className="ufa:flex ufa:items-center ufa:gap-2">
        <Label htmlFor={modeId} className="ufa:shrink-0">
          {t('mode.label')}
        </Label>
        <SimpleSelect
          id={modeId}
          className="ufa:h-8 ufa:w-28 ufa:shrink-0 ufa:text-xs"
          value={mode}
          disabled={!onModeChange || filling}
          aria-describedby={`${modeId}-hint`}
          onValueChange={(entry) => onModeChange?.(entry as AutofillMode)}
          options={AUTOFILL_MODES.map((entry) => ({ value: entry, label: t(`mode.${entry}`) }))}
        />
        <p
          id={`${modeId}-hint`}
          className="ufa:min-w-0 ufa:flex-1 ufa:text-xs ufa:text-muted-foreground"
        >
          {t(`mode.${mode}Hint`)}
        </p>
      </div>

      {mode === 'suggest' ? null : (
        <div className="ufa:flex ufa:flex-wrap ufa:items-center ufa:gap-2">
          <Button
            size="sm"
            onClick={onFill}
            disabled={filling || selectedCount === 0}
            aria-busy={filling || undefined}
          >
            {filling ? <Spinner label={t('fill.filling')} /> : <WandSparklesIcon />}
            {filling ? t('fill.filling') : t('fill.selected', { count: selectedCount })}
          </Button>
          {onSelectAll && selectableCount > selectedCount ? (
            <Button size="sm" variant="ghost" onClick={onSelectAll} disabled={filling}>
              <ListChecksIcon />
              {t('fill.selectAll')}
            </Button>
          ) : null}
          {canUndo && onUndo ? (
            <Button size="sm" variant="outline" onClick={onUndo} disabled={filling}>
              <Undo2Icon />
              {t('fill.undo')}
            </Button>
          ) : null}
          {syntheticEnabled && onGenerate ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onGenerate}
              disabled={filling || selectedCount === 0}
            >
              {t('fill.generate', { count: selectedCount })}
            </Button>
          ) : null}
          {onClear ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onClear}
              disabled={filling || selectedCount === 0}
            >
              {t('fill.clear', { count: selectedCount })}
            </Button>
          ) : null}
        </div>
      )}

      <p
        data-slot="fill-status"
        role="status"
        className={cn('ufa:text-xs ufa:text-muted-foreground', !status && 'ufa:sr-only')}
      >
        {status}
      </p>
      {mode === 'suggest' ? null : (
        <p className="ufa:text-xs ufa:text-muted-foreground">
          {t('fill.never')} {t('fill.consentHint')}
        </p>
      )}
    </div>
  )
}
