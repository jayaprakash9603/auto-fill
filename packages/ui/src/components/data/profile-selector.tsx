import type { AutofillStore } from '@ufa/storage'
import { useId } from 'react'

import { useAction, useStoreSnapshot } from '../../hooks/use-store'
import { useTranslate } from '../../i18n/messages'
import { cn } from '../../lib/cn'
import { Label, NativeSelect } from '../ui/form-controls'

export interface ProfileSelectorProps {
  store: AutofillStore | null
  className?: string
}

/** Chooses the profile used for filling. The choice is saved and shared by every page. */
export function ProfileSelector({ store, className }: ProfileSelectorProps) {
  const t = useTranslate()
  const snapshot = useStoreSnapshot(store)
  const action = useAction()
  const id = useId()
  const ready = Boolean(store) && snapshot.status === 'ready'

  return (
    <div className={cn('ufa:flex ufa:flex-col ufa:gap-1', className)}>
      <div className="ufa:flex ufa:items-center ufa:gap-2">
        <Label htmlFor={id} className="ufa:shrink-0 ufa:text-muted-foreground">
          {t('profile.label')}
        </Label>
        <NativeSelect
          id={id}
          className="ufa:h-8"
          value={snapshot.activeProfile?.id ?? ''}
          disabled={!ready || action.pending}
          onChange={(event) => {
            const profileId = event.target.value
            if (store) void action.run(() => store.profiles.setActive(profileId))
          }}
        >
          {ready ? null : <option value="">{t('store.loading')}</option>}
          {snapshot.profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.isDefault ? `${profile.name} (${t('profile.default')})` : profile.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      {action.error ? (
        <p role="alert" className="ufa:text-xs ufa:text-destructive">
          {action.error}
        </p>
      ) : null}
    </div>
  )
}
