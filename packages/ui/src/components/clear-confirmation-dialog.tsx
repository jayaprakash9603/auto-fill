import { useTranslate } from '../i18n/messages'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'

export interface ClearConfirmationDialogProps {
  open: boolean
  fieldCount: number
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  busy?: boolean
}

/** Confirms clearing selected fields; undo uses the same snapshot as fill. */
export function ClearConfirmationDialog({
  open,
  fieldCount,
  onOpenChange,
  onConfirm,
  busy = false,
}: ClearConfirmationDialogProps) {
  const t = useTranslate()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{t('clear.confirmTitle')}</DialogTitle>
        <p className="ufa:text-sm ufa:text-muted-foreground">
          {t('clear.confirmBody', { count: fieldCount })}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('clear.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy || fieldCount === 0}>
            {t('clear.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
