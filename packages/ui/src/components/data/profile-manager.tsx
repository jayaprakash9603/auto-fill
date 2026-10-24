import { PROFILE_TEMPLATES, getProfileTemplate, type Profile } from '@ufa/core'
import type { AutofillStore } from '@ufa/storage'
import {
  CheckIcon,
  MoreHorizontalIcon,
  PlusIcon,
  UserRoundPenIcon,
  UsersRoundIcon,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { useAction, useStoreSnapshot } from '../../hooks/use-store'
import { useTranslate } from '../../i18n/messages'
import { cn } from '../../lib/cn'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Input } from '../ui/form-controls'
import { SimpleSelect } from '../ui/select'
import { ProfileDetailsDialog } from './profile-details'
import {
  ConfirmDialog,
  ErrorMessage,
  FormField,
  Section,
  SECTION_ROW,
  SECTION_ROWS,
} from './shared'

export interface ProfileManagerProps {
  store: AutofillStore
  className?: string
}

type Editing = { mode: 'new' } | { mode: 'rename'; profile: Profile } | null

/** Profiles: choose the active one, create from a blank template, rename, duplicate, delete. */
export function ProfileManager({ store, className }: ProfileManagerProps) {
  const t = useTranslate()
  const snapshot = useStoreSnapshot(store)
  const action = useAction()
  const [editing, setEditing] = useState<Editing>(null)
  const [details, setDetails] = useState<Profile | null>(null)
  const [deleting, setDeleting] = useState<Profile | null>(null)
  const activeId = snapshot.activeProfile?.id
  const ownAnswers = (profileId: string) =>
    snapshot.answers.filter((answer) => answer.profileId === profileId).length

  const error = deleting ? null : action.error

  return (
    <Section
      className={className}
      icon={<UsersRoundIcon />}
      title={t('profile.list')}
      count={snapshot.profiles.length}
      description={t('profile.listHint')}
      bodyClassName="ufa:gap-0 ufa:p-0"
      actions={
        <Button size="sm" onClick={() => setEditing({ mode: 'new' })}>
          <PlusIcon /> {t('profile.new')}
        </Button>
      }
    >
      {error ? (
        <div className="ufa:border-b ufa:border-border ufa:p-3">
          <ErrorMessage message={error} />
        </div>
      ) : null}
      <ul aria-label={t('profile.list')} className={SECTION_ROWS}>
        {snapshot.profiles.map((profile) => {
          const template = getProfileTemplate(profile.templateId)
          const active = profile.id === activeId
          return (
            <li
              key={profile.id}
              data-profile-id={profile.id}
              className={cn(SECTION_ROW, active && 'ufa:bg-primary/5 ufa:hover:bg-primary/5')}
            >
              <span
                aria-hidden
                className={cn(
                  'ufa:flex ufa:size-8 ufa:shrink-0 ufa:items-center ufa:justify-center ufa:rounded-full ufa:text-xs ufa:font-semibold ufa:uppercase',
                  active
                    ? 'ufa:bg-primary ufa:text-primary-foreground'
                    : 'ufa:bg-muted ufa:text-muted-foreground',
                )}
              >
                {profile.name.trim().charAt(0) || '?'}
              </span>
              <div className="ufa:flex ufa:min-w-0 ufa:flex-1 ufa:flex-col ufa:gap-0.5">
                <span className="ufa:truncate ufa:text-sm ufa:font-medium">{profile.name}</span>
                <div className="ufa:flex ufa:flex-wrap ufa:gap-1">
                  {active ? (
                    <Badge variant="success">
                      <CheckIcon /> {t('profile.active')}
                    </Badge>
                  ) : null}
                  {profile.isDefault ? (
                    <Badge variant="outline">{t('profile.default')}</Badge>
                  ) : null}
                  {template && template.name !== profile.name ? (
                    <Badge variant="muted">{template.name}</Badge>
                  ) : null}
                </div>
              </div>
              <div className="ufa:-my-1 ufa:flex ufa:shrink-0 ufa:items-center ufa:gap-0.5">
                {active ? null : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ufa:mr-1"
                    aria-label={t('profile.useLabel', { name: profile.name })}
                    disabled={action.pending}
                    onClick={() => void action.run(() => store.profiles.setActive(profile.id))}
                  >
                    {t('profile.use')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ufa:text-muted-foreground"
                  aria-label={t('profile.detailsLabel', { name: profile.name })}
                  title={t('profile.details')}
                  onClick={() => setDetails(profile)}
                >
                  <UserRoundPenIcon />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ufa:text-muted-foreground"
                      aria-label={t('profile.actions', { name: profile.name })}
                    >
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing({ mode: 'rename', profile })}>
                      {t('profile.rename')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => void action.run(() => store.profiles.duplicate(profile.id))}
                    >
                      {t('profile.duplicate')}
                    </DropdownMenuItem>
                    {profile.isDefault ? null : (
                      <DropdownMenuItem
                        onSelect={() =>
                          void action.run(() => store.profiles.setDefault(profile.id))
                        }
                      >
                        {t('profile.makeDefault')}
                      </DropdownMenuItem>
                    )}
                    {snapshot.profiles.length > 1 ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="ufa:text-destructive"
                          onSelect={() => setDeleting(profile)}
                        >
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          )
        })}
      </ul>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        {editing ? (
          <ProfileDialog
            store={store}
            profile={editing.mode === 'rename' ? editing.profile : null}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
      <Dialog
        open={details !== null}
        onOpenChange={(open) => {
          if (!open) setDetails(null)
        }}
      >
        {details ? (
          <ProfileDetailsDialog store={store} profile={details} onDone={() => setDetails(null)} />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null)
            action.reset()
          }
        }}
        title={t('profile.deleteTitle', { name: deleting?.name ?? '' })}
        description={
          deleting && ownAnswers(deleting.id)
            ? t('profile.deleteBody', { count: ownAnswers(deleting.id) })
            : t('profile.deleteBodyNone')
        }
        confirmLabel={t('common.delete')}
        pending={action.pending}
        error={action.error}
        onConfirm={() =>
          void action.run(async () => {
            if (deleting) await store.profiles.remove(deleting.id)
            setDeleting(null)
          })
        }
      />
    </Section>
  )
}

function ProfileDialog({
  store,
  profile,
  onDone,
}: {
  store: AutofillStore
  profile: Profile | null
  onDone: () => void
}) {
  const t = useTranslate()
  const action = useAction()
  const [name, setName] = useState(profile?.name ?? '')
  const [templateId, setTemplateId] = useState(profile?.templateId ?? 'software-developer')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const saved = await action.run(() =>
      profile
        ? store.profiles.update(profile.id, { name })
        : store.profiles.create({ name, templateId }),
    )
    if (saved) onDone()
  }

  return (
    <DialogContent
      closeLabel={t('common.cancel')}
      aria-describedby={undefined}
      className="ufa:max-w-sm"
    >
      <DialogHeader>
        <DialogTitle>{profile ? t('profile.renameTitle') : t('profile.newTitle')}</DialogTitle>
      </DialogHeader>
      <form className="ufa:flex ufa:flex-col ufa:gap-3" onSubmit={(event) => void submit(event)}>
        <FormField label={t('profile.name')}>
          {(props) => (
            <Input
              {...props}
              value={name}
              required
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FormField>
        {profile ? null : (
          <FormField
            label={t('profile.template')}
            hint={PROFILE_TEMPLATES.find((template) => template.id === templateId)?.description}
          >
            {(props) => (
              <SimpleSelect
                {...props}
                value={templateId}
                onValueChange={setTemplateId}
                options={PROFILE_TEMPLATES.map((template) => ({
                  value: template.id,
                  label: template.name,
                }))}
              />
            )}
          </FormField>
        )}
        <ErrorMessage message={action.error} />
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={action.pending}>
            {profile ? t('common.save') : t('profile.create')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
