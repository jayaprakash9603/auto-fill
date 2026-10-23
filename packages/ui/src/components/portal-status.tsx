import type { ConnectionStatus } from '@ufa/autofill-sdk'
import type { PageInfo } from '@ufa/core'
import { GlobeIcon, LayersIcon } from 'lucide-react'

import { useTranslate } from '../i18n/messages'
import { cn } from '../lib/cn'
import { Badge, type BadgeProps } from './ui/badge'

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
    <Badge variant={STATUS_VARIANT[status]} data-status={status}>
      <span className="ufa:size-1.5 ufa:rounded-full ufa:bg-current" aria-hidden />
      {t(`status.${status}`)}
    </Badge>
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
        <Badge variant="secondary">{t('page.adapter', { name: page.adapterName })}</Badge>
        <Badge variant="outline">
          <LayersIcon aria-hidden />
          {page.frameCount === 1 ? t('page.frame') : t('page.frames', { count: page.frameCount })}
        </Badge>
        <Badge variant="muted">{t('page.runtime', { version: page.runtimeVersion })}</Badge>
      </div>
    </div>
  )
}
