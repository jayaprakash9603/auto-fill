import type { ConnectionStatus } from '@ufa/autofill-sdk'
import type { PageInfo } from '@ufa/core'
import { GlobeIcon, LayersIcon, RotateCwIcon } from 'lucide-react'

import { useTranslate } from '../i18n/messages'
import { cn } from '../lib/cn'
import { Badge, type BadgeProps } from './ui/badge'
import { Button } from './ui/button'

const STATUS_VARIANT: Record<ConnectionStatus, BadgeProps['variant']> = {
  idle: 'muted',
  connecting: 'info',
  ready: 'success',
  error: 'destructive',
  destroyed: 'muted',
}

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const t = useTranslate()
  return (
    <Badge variant={STATUS_VARIANT[status]} data-status={status} className="ufa:shrink-0">
      <span className="ufa:size-1.5 ufa:rounded-full ufa:bg-current" aria-hidden />
      {t(`status.${status}`)}
    </Badge>
  )
}

const DOT_COLOR: Record<ConnectionStatus, string> = {
  idle: 'ufa:bg-muted-foreground',
  connecting: 'ufa:bg-info ufa:motion-safe:animate-pulse',
  ready: 'ufa:bg-success',
  error: 'ufa:bg-destructive',
  destroyed: 'ufa:bg-muted-foreground',
}

/**
 * The page the panel is attached to and whether the link is live. Every line keeps its height
 * through connecting, rescans and errors, so the panel below never moves.
 */
export function LiveConnection({
  status,
  page,
  busy = false,
  onRefresh,
  className,
}: {
  status: ConnectionStatus
  page: PageInfo | null
  busy?: boolean
  onRefresh?: () => void
  className?: string
}) {
  const t = useTranslate()
  const title = page ? page.title || page.hostname : t(`status.${status}`)
  const detail = page
    ? [
        page.frameCount === 1 ? t('page.frame') : t('page.frames', { count: page.frameCount }),
        t('page.adapter', { name: page.adapterName }),
      ].join(' · ')
    : status === 'connecting'
      ? t('panel.connecting')
      : t('page.none')
  return (
    <div
      data-slot="live-connection"
      data-status={status}
      className={cn(
        'ufa:flex ufa:min-w-0 ufa:items-center ufa:gap-2.5 ufa:rounded-lg ufa:border ufa:border-border ufa:bg-card ufa:p-2.5',
        className,
      )}
    >
      <span
        className="ufa:relative ufa:flex ufa:size-9 ufa:shrink-0 ufa:items-center ufa:justify-center ufa:rounded-md ufa:bg-primary/10 ufa:text-primary"
        aria-hidden
      >
        <GlobeIcon className="ufa:size-4" />
        <span
          className={cn(
            'ufa:absolute ufa:-right-0.5 ufa:-bottom-0.5 ufa:size-2.5 ufa:rounded-full ufa:ring-2 ufa:ring-card',
            DOT_COLOR[status],
          )}
        />
      </span>
      <div className="ufa:min-w-0 ufa:flex-1">
        <p className="ufa:truncate ufa:text-sm ufa:leading-5 ufa:font-semibold" title={page?.url}>
          {title}
        </p>
        <div className="ufa:flex ufa:min-w-0 ufa:items-center ufa:gap-1.5 ufa:text-xs ufa:leading-5 ufa:text-muted-foreground">
          <ConnectionBadge status={status} />
          <span
            className="ufa:min-w-0 ufa:truncate"
            title={page ? t('page.runtime', { version: page.runtimeVersion }) : undefined}
          >
            {page ? <span className="ufa:font-medium">{page.hostname}</span> : null}
            {page ? ' · ' : null}
            {detail}
          </span>
        </div>
      </div>
      {onRefresh ? (
        <Button
          variant="ghost"
          size="icon"
          className="ufa:shrink-0"
          onClick={onRefresh}
          disabled={busy}
          aria-label={t('panel.refresh')}
          title={t('panel.refresh')}
        >
          <RotateCwIcon className={cn(busy && 'ufa:motion-safe:animate-spin')} />
        </Button>
      ) : null}
    </div>
  )
}

export function PortalStatus({ page, className }: { page: PageInfo; className?: string }) {
  const t = useTranslate()
  return (
    <div
      data-slot="portal-status"
      className={cn(
        'ufa:flex ufa:min-w-0 ufa:flex-col ufa:gap-1.5 ufa:rounded-md ufa:border ufa:border-border ufa:bg-card ufa:p-3',
        className,
      )}
    >
      <div className="ufa:flex ufa:min-w-0 ufa:items-center ufa:gap-2">
        <GlobeIcon className="ufa:size-4 ufa:text-muted-foreground" aria-hidden />
        <div className="ufa:min-w-0 ufa:flex-1">
          <p className="ufa:truncate ufa:text-sm ufa:font-medium" title={page.title}>
            {page.title || page.hostname}
          </p>
          <p className="ufa:truncate ufa:text-xs ufa:text-muted-foreground" title={page.url}>
            {page.hostname}
          </p>
        </div>
      </div>
      <div className="ufa:flex ufa:flex-wrap ufa:items-center ufa:gap-1.5">
        <Badge variant="info">{t('page.adapter', { name: page.adapterName })}</Badge>
        <Badge variant="outline">
          <LayersIcon aria-hidden />
          {page.frameCount === 1 ? t('page.frame') : t('page.frames', { count: page.frameCount })}
        </Badge>
        <Badge variant="muted">{t('page.runtime', { version: page.runtimeVersion })}</Badge>
      </div>
    </div>
  )
}
