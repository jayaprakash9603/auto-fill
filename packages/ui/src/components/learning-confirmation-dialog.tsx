import type { LearningCandidate } from '@ufa/core'
import type { AnswerDraft } from '@ufa/storage'
import { useState } from 'react'

import { useTranslate } from '../i18n/messages'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Input, Label, NativeSelect } from './ui/form-controls'

export interface LearningConfirmationDialogProps {
  candidate: LearningCandidate | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (draft: AnswerDraft) => void
  onReject: () => void
  busy?: boolean
}

function LearningForm({
  candidate,
  onConfirm,
  onReject,
  busy,
}: {
  candidate: LearningCandidate
  onConfirm: (draft: AnswerDraft) => void
  onReject: () => void
  busy: boolean
}) {
  const t = useTranslate()
  const [label, setLabel] = useState(candidate.field.label)
  const [aliases, setAliases] = useState('')
  const [semanticKey, setSemanticKey] = useState(candidate.field.semanticKey ?? '')

  const valueText =
    candidate.value.kind === 'text'
      ? candidate.value.text
      : candidate.value.kind === 'boolean'
        ? candidate.value.value
          ? t('match.checked')
          : t('match.unchecked')
        : candidate.value.items.join(', ')

  return (
    <>
      <div className="ufa:flex ufa:flex-col ufa:gap-3">
        <p className="ufa:text-sm ufa:text-muted-foreground">{t('learning.confirmBody')}</p>
        <div className="ufa:flex ufa:flex-col ufa:gap-1">
          <Label htmlFor="learn-label">{t('learning.label')}</Label>
          <Input
            id="learn-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className="ufa:flex ufa:flex-col ufa:gap-1">
          <Label htmlFor="learn-aliases">{t('learning.aliases')}</Label>
          <Input
            id="learn-aliases"
            value={aliases}
            placeholder={t('learning.aliasesHint')}
            onChange={(event) => setAliases(event.target.value)}
          />
        </div>
        <div className="ufa:flex ufa:flex-col ufa:gap-1">
          <Label htmlFor="learn-key">{t('learning.category')}</Label>
          <NativeSelect
            id="learn-key"
            value={semanticKey}
            onChange={(event) => setSemanticKey(event.target.value)}
          >
            <option value="">{t('learning.categoryNone')}</option>
            {candidate.field.semanticKey ? (
              <option value={candidate.field.semanticKey}>{candidate.field.semanticKey}</option>
            ) : null}
          </NativeSelect>
        </div>
        <p className="ufa:rounded-md ufa:bg-muted ufa:px-3 ufa:py-2 ufa:font-mono ufa:text-sm">
          {valueText}
        </p>
        {candidate.duplicateOfAnswerId ? (
          <p className="ufa:text-xs ufa:text-muted-foreground">{t('learning.duplicate')}</p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onReject} disabled={busy}>
          {t('learning.reject')}
        </Button>
        <Button
          disabled={busy || !label.trim()}
          onClick={() =>
            onConfirm({
              label: label.trim(),
              value: candidate.value,
              semanticKey: semanticKey || null,
              aliases: aliases
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean),
              controlTypes: [candidate.field.type],
              context: {
                sites: candidate.site ? [candidate.site] : [],
                sectionKeywords: candidate.field.section ? [candidate.field.section] : [],
                formKeywords: candidate.field.formTitle ? [candidate.field.formTitle] : [],
              },
            })
          }
        >
          {t('learning.save')}
        </Button>
      </DialogFooter>
    </>
  )
}

/** Confirms a value the user typed on the page before it becomes a saved answer. */
export function LearningConfirmationDialog({
  candidate,
  open,
  onOpenChange,
  onConfirm,
  onReject,
  busy = false,
}: LearningConfirmationDialogProps) {
  const t = useTranslate()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{t('learning.confirmTitle')}</DialogTitle>
        {candidate ? (
          <LearningForm
            key={candidate.id}
            candidate={candidate}
            onConfirm={onConfirm}
            onReject={onReject}
            busy={busy}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
