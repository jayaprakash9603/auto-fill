import {
  AlertTriangleIcon,
  InboxIcon,
  LockKeyholeIcon,
  RotateCwIcon,
  ShieldAlertIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { cn } from '../lib/cn'
import { useTranslate } from '../i18n/messages'
import { Button } from './ui/button'

export interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'ufa:flex ufa:flex-col ufa:items-center ufa:gap-2 ufa:px-4 ufa:py-8 ufa:text-center',
        className,
      )}
    >
      <span className="ufa:flex ufa:size-10 ufa:items-center ufa:justify-center ufa:rounded-full ufa:bg-muted ufa:text-muted-foreground ufa:[&_svg]:size-5">
        {icon ?? <InboxIcon />}
      </span>
      <p className="ufa:text-sm ufa:font-medium">{title}</p>
      {description ? (
        <p className="ufa:max-w-72 ufa:text-xs ufa:text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="ufa:mt-1">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  const t = useTranslate()
  return (
    <EmptyState
      className={className}
      icon={<AlertTriangleIcon className="ufa:text-destructive" />}
      title={t('error.title')}
      description={message}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCwIcon />
            {t('error.retry')}
          </Button>
        ) : undefined
      }
    />
  )
}

export function RestrictedPageState({ className }: { className?: string }) {
  const t = useTranslate()
  return (
    <EmptyState
      className={className}
      icon={<ShieldAlertIcon />}
      title={t('restricted.title')}
      description={t('restricted.body')}
    />
  )
}

export interface PermissionNoticeProps {
  /** Site needing access. When unknown (the browser hides it), the notice explains one-time access instead. */
  site?: string | null
  /** Must run from the click handler: browsers only grant permissions during a user gesture. */
  onRequest?: () => Promise<boolean>
  onGranted?: () => void
  onRetry?: () => void
  className?: string
}

export function PermissionNotice({
  site,
  onRequest,
  onGranted,
  onRetry,
  className,
}: PermissionNoticeProps) {
  const t = useTranslate()
  const [pending, setPending] = useState(false)
  const [denied, setDenied] = useState(false)
  const canRequest = Boolean(site && onRequest)

  const request = () => {
    if (!onRequest) return
    setPending(true)
    setDenied(false)
    onRequest()
      .then((granted) => {
        if (granted) onGranted?.()
        else setDenied(true)
      })
      .catch(() => setDenied(true))
      .finally(() => setPending(false))
  }

  return (
    <EmptyState
      className={className}
      icon={<LockKeyholeIcon />}
      title={t('permission.title')}
      description={
        <>
          {canRequest
            ? t('permission.body', { site: site ?? t('permission.thisSite') })
            : t('permission.hint')}
          {denied ? (
            <span className="ufa:mt-2 ufa:block ufa:text-warning">{t('permission.denied')}</span>
          ) : null}
        </>
      }
      action={
        canRequest ? (
          <Button size="sm" onClick={request} disabled={pending}>
            {t('permission.allow')}
          </Button>
        ) : onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCwIcon />
            {t('error.retry')}
          </Button>
        ) : undefined
      }
    />
  )
}
