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

/** A titled block inside a tab. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('ufa:flex ufa:flex-col ufa:gap-2', className)}>
      <div className="ufa:flex ufa:items-start ufa:gap-2">
        <div className="ufa:flex ufa:min-w-0 ufa:flex-1 ufa:flex-col ufa:gap-0.5">
          <h3 id={id} className="ufa:text-sm ufa:font-semibold">
            {title}
          </h3>
          {description ? (
            <p className="ufa:text-xs ufa:text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
