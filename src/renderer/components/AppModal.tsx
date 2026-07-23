import type { ReactNode } from 'react'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'

interface AppModalProps {
  readonly isOpen: boolean
  readonly onOpenChange: (isOpen: boolean) => void
  readonly title: string
  readonly children: (close: () => void) => ReactNode
  readonly className?: string
}

export function AppModal({ isOpen, onOpenChange, title, children, className }: AppModalProps) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} className="modal-overlay">
      <Modal className={['app-modal', className].filter(Boolean).join(' ')}>
        <Dialog>
          {({ close }) => <><Heading slot="title">{title}</Heading>{children(close)}</>}
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
