import type { ReactNode } from 'react'
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface AppModalProps {
  readonly isOpen: boolean
  readonly onOpenChange: (isOpen: boolean) => void
  readonly title: string
  readonly children: (close: () => void) => ReactNode
  readonly className?: string
  readonly isDismissable?: boolean
  readonly showCloseButton?: boolean
}

export function AppModal({ isOpen, onOpenChange, title, children, className, isDismissable = false, showCloseButton = false }: AppModalProps) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} className="modal-overlay" isDismissable={isDismissable}>
      <Modal className={['app-modal', className].filter(Boolean).join(' ')}>
        <Dialog>
          {({ close }) => <><Heading slot="title">{title}</Heading>{showCloseButton && <Button className="modal-close-button" aria-label={`Close ${title}`} onPress={close}><XMarkIcon aria-hidden="true" /></Button>}{children(close)}</>}
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
