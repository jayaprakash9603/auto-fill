import { AUTOFILL_MODES, type AutofillMode, type FillResult } from '@ufa/core'
import { EraserIcon, ListChecksIcon, SparklesIcon, Undo2Icon, WandSparklesIcon } from 'lucide-react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { useId } from 'react'

import { useTranslate } from '../i18n/messages'
import { cn } from '../lib/cn'
import { Button } from './ui/button'
import { Spinner } from './ui/misc'

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

/** Mode switch, the fill action and undo, below the field list. */
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
  const canSelectMore = Boolean(onSelectAll) && selectableCount > selectedCount
  const canGenerate = syntheticEnabled && Boolean(onGenerate)

  return (
    <div
      data-slot="fill-bar"
      className={cn(
        'ufa:flex ufa:flex-col ufa:gap-2.5 ufa:rounded-xl ufa:border ufa:border-border ufa:bg-card ufa:p-3',
        className,
      )}
    >
      <div className="ufa:flex ufa:flex-col ufa:gap-1">
        <div className="ufa:flex ufa:items-center ufa:gap-2.5">
          <span
            id={`${modeId}-label`}
            className="ufa:shrink-0 ufa:text-xs ufa:font-medium ufa:text-muted-foreground"
          >
            {t('mode.label')}
          </span>
          <RadioGroupPrimitive.Root
            data-slot="mode-switch"
            aria-labelledby={`${modeId}-label`}
            aria-describedby={`${modeId}-hint`}
            orientation="horizontal"
            value={mode}
            disabled={!onModeChange || filling}
            onValueChange={(entry) => onModeChange?.(entry as AutofillMode)}
            className="ufa:grid ufa:min-w-0 ufa:flex-1 ufa:grid-cols-3 ufa:gap-0.5 ufa:rounded-lg ufa:bg-muted ufa:p-0.5"
          >
            {AUTOFILL_MODES.map((entry) => (
              <RadioGroupPrimitive.Item
                key={entry}
                value={entry}
                className="ufa:h-7 ufa:min-w-0 ufa:cursor-pointer ufa:truncate ufa:rounded-md ufa:px-2 ufa:text-xs ufa:font-medium ufa:text-muted-foreground ufa:transition-[color,background-color,box-shadow] ufa:duration-150 ufa:outline-none ufa:hover:text-foreground ufa:focus-visible:outline-2 ufa:focus-visible:outline-ring ufa:disabled:cursor-not-allowed ufa:disabled:opacity-60 ufa:data-[state=checked]:bg-background ufa:data-[state=checked]:text-foreground ufa:data-[state=checked]:shadow-xs"
              >
                {t(`mode.${entry}`)}
              </RadioGroupPrimitive.Item>
            ))}
          </RadioGroupPrimitive.Root>
        </div>
        <p id={`${modeId}-hint`} className="ufa:text-xs ufa:text-muted-foreground">
          {t(`mode.${mode}Hint`)}
        </p>
      </div>

      {mode === 'suggest' ? null : (
        <>
          <div className="ufa:flex ufa:items-center ufa:gap-2">
            <Button
              className="ufa:min-w-0 ufa:flex-1"
              onClick={onFill}
              disabled={filling || selectedCount === 0}
              aria-busy={filling || undefined}
            >
              {filling ? <Spinner label={t('fill.filling')} /> : <WandSparklesIcon />}
              {filling ? t('fill.filling') : t('fill.selected', { count: selectedCount })}
            </Button>
            {canUndo && onUndo ? (
              <Button variant="outline" onClick={onUndo} disabled={filling}>
                <Undo2Icon />
                {t('fill.undo')}
              </Button>
            ) : null}
          </div>
          {canSelectMore || canGenerate || onClear ? (
            <div className="ufa:-mx-1 ufa:flex ufa:flex-wrap ufa:items-center ufa:gap-1">
              {canSelectMore ? (
                <Button size="sm" variant="ghost" onClick={onSelectAll} disabled={filling}>
                  <ListChecksIcon />
                  {t('fill.selectAll')}
                </Button>
              ) : null}
              {canGenerate ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onGenerate}
                  disabled={filling || selectedCount === 0}
                >
                  <SparklesIcon />
                  {t('fill.generate', { count: selectedCount })}
                </Button>
              ) : null}
              {onClear ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ufa:ml-auto ufa:text-muted-foreground ufa:hover:bg-destructive/10 ufa:hover:text-destructive"
                  onClick={onClear}
                  disabled={filling || selectedCount === 0}
                >
                  <EraserIcon />
                  {t('fill.clear', { count: selectedCount })}
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <p
        data-slot="fill-status"
        role="status"
        className={cn(
          'ufa:rounded-md ufa:bg-muted/60 ufa:px-2.5 ufa:py-1.5 ufa:text-xs ufa:font-medium ufa:text-foreground',
          !status && 'ufa:sr-only',
        )}
      >
        {status}
      </p>
    </div>
  )
}
