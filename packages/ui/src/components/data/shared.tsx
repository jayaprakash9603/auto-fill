import { ANSWER_CATEGORIES, type AnswerCategory, type Profile } from '@ufa/core'
import { AlertCircleIcon } from 'lucide-react'
import { useId, type ReactElement, type ReactNode } from 'react'

import { useTranslate, type Translate } from '../../i18n/messages'
import { cn } from '../../lib/cn'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Label } from '../ui/form-controls'
import { Alert } from '../ui/misc'

/** Splits comma- or newline-separated input into trimmed, non-empty entries. */
export function splitList(input: string, separator: RegExp = /[,\n]/): string[] {
  return input
    .split(separator)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export const categoryOptions = (t: Translate) =>
  ANSWER_CATEGORIES.map((category) => ({ value: category, label: t(`category.${category}`) }))

export const categoryLabel = (t: Translate, category: AnswerCategory) => t(`category.${category}`)

export function scopeLabel(t: Translate, profiles: readonly Profile[], profileId: string | null) {
  if (profileId === null) return t('answers.allProfiles')
  return profiles.find((profile) => profile.id === profileId)?.name ?? '?'
}

/** Saves text as a file from the page the component lives in. */
export function downloadText(
  document: Document,
  filename: string,
  text: string,
  type = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** A label, control and optional hint wired together for assistive technology. */
export function FormField({
  label,
  hint,
  className,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  className?: string
  children: (props: { id: string; 'aria-describedby'?: string }) => ReactElement
}) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className={cn('ufa:flex ufa:flex-col ufa:gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children(hint ? { id, 'aria-describedby': hintId } : { id })}
      {hint ? (
        <p id={hintId} className="ufa:text-[11px] ufa:text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <Alert tone="destructive" icon={<AlertCircleIcon />}>
      {message}
    </Alert>
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
  error = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  confirmLabel: ReactNode
  onConfirm: () => void
  pending?: boolean
  error?: string | null
}) {
  const t = useTranslate()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent role="alertdialog" closeLabel={t('common.cancel')} className="ufa:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ErrorMessage message={error} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CountPill({ value }: { value: number }) {
  return (
    <span className="ufa:shrink-0 ufa:rounded-full ufa:bg-muted ufa:px-1.5 ufa:text-[11px] ufa:leading-4 ufa:font-semibold ufa:text-muted-foreground ufa:tabular-nums">
      {value}
    </span>
  )
}

/** A list whose rows run edge to edge inside a section card. */
export const SECTION_ROWS = 'ufa:flex ufa:flex-col ufa:divide-y ufa:divide-border'
export const SECTION_ROW =
  'ufa:flex ufa:items-center ufa:gap-2.5 ufa:px-3 ufa:py-2.5 ufa:transition-colors ufa:hover:bg-muted/40'

/** A titled card inside a tab: icon, title, optional count and one short line, actions on the right. */
export function Section({
  title,
  description,
  icon,
  count,
  actions,
  children,
  className,
  bodyClassName,
  descriptionId,
  tone = 'default',
}: {
  title: ReactNode
  description?: ReactNode
  /** Lets a control inside reference the description with `aria-describedby`. */
  descriptionId?: string
  icon?: ReactNode
  count?: number
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  tone?: 'default' | 'destructive'
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      data-slot="section"
      className={cn(
        'ufa:flex ufa:min-w-0 ufa:flex-col ufa:overflow-hidden ufa:rounded-xl ufa:border ufa:bg-card ufa:text-card-foreground ufa:shadow-xs',
        tone === 'destructive' ? 'ufa:border-destructive/30' : 'ufa:border-border',
        className,
      )}
    >
      <header className="ufa:flex ufa:min-h-12 ufa:items-center ufa:gap-2.5 ufa:border-b ufa:border-border ufa:px-3 ufa:py-2.5">
        {icon ? (
          <span
            aria-hidden
            className={cn(
              'ufa:flex ufa:size-7 ufa:shrink-0 ufa:items-center ufa:justify-center ufa:rounded-md ufa:[&_svg]:size-4',
              tone === 'destructive'
                ? 'ufa:bg-destructive/10 ufa:text-destructive'
                : 'ufa:bg-primary/10 ufa:text-primary',
            )}
          >
            {icon}
          </span>
        ) : null}
        <div className="ufa:min-w-0 ufa:flex-1">
          <div className="ufa:flex ufa:min-w-0 ufa:items-center ufa:gap-1.5">
            <h3 id={id} className="ufa:truncate ufa:text-[13px] ufa:leading-5 ufa:font-semibold">
              {title}
            </h3>
            {count !== undefined ? <CountPill value={count} /> : null}
          </div>
          {description ? (
            <p id={descriptionId} className="ufa:text-xs ufa:leading-4 ufa:text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="ufa:flex ufa:shrink-0 ufa:items-center ufa:gap-1">{actions}</div>
        ) : null}
      </header>
      <div className={cn('ufa:flex ufa:flex-col ufa:gap-2.5 ufa:p-3', bodyClassName)}>
        {children}
      </div>
    </section>
  )
}
