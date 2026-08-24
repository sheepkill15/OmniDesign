import type { ReactNode } from 'react'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { IconButton } from './common'

interface AppModalProps {
  readonly isOpen: boolean
  readonly onOpenChange: (isOpen: boolean) => void
  readonly title: string
  readonly children: (close: () => void) => ReactNode
  readonly className?: string
  // Dismissable by default (Escape and close button both cancel). Pass false only where a decision is
  // genuinely forced, such as an irreversible confirmation that must be answered explicitly.
  readonly isDismissable?: boolean
  readonly showCloseButton?: boolean
}

export function AppModal({ isOpen, onOpenChange, title, children, className, isDismissable = true, showCloseButton = true }: AppModalProps) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} className="modal-overlay" isDismissable={isDismissable}>
      <Modal className={['app-modal', className].filter(Boolean).join(' ')}>
        <Dialog>
          {({ close }) => <><Heading slot="title">{title}</Heading>{showCloseButton && <IconButton className="modal-close-button" label={`Close ${title}`} icon={XMarkIcon} onPress={close} />}{children(close)}</>}
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
