import { TriangleAlert as AlertTriangle, Info, CircleCheck as CheckCircle, Circle as XCircle } from 'lucide-react';
import { BaseModal } from './BaseModal';
import { Button } from './Button';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  isProcessing?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'info',
  isProcessing = false,
}: ConfirmModalProps) {
  async function handleConfirm() {
    await onConfirm();
  }

  const variantConfig = {
    danger: {
      icon: XCircle,
      iconColor: 'text-red-500',
      buttonVariant: 'danger' as const,
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-yellow-500',
      buttonVariant: 'primary' as const,
    },
    info: {
      icon: Info,
      iconColor: 'text-blue-500',
      buttonVariant: 'primary' as const,
    },
    success: {
      icon: CheckCircle,
      iconColor: 'text-green-500',
      buttonVariant: 'primary' as const,
    },
  };

  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      showCloseButton={false}
      closeOnBackdrop={!isProcessing}
      closeOnEscape={!isProcessing}
    >
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 ${config.iconColor}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              {title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isProcessing}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={config.buttonVariant}
            onClick={handleConfirm}
            loading={isProcessing}
            disabled={isProcessing}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </BaseModal>
  );
}
