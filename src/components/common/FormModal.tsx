import { BaseModal } from './BaseModal';
import { Button } from './Button';

interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  showFooter?: boolean;
}

export function FormModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  children,
  size = 'md',
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  isSubmitting = false,
  submitDisabled = false,
  showFooter = true,
}: FormModalProps) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(e);
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size={size}
      closeOnBackdrop={!isSubmitting}
      closeOnEscape={!isSubmitting}
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="p-6 flex-1">
          {children}
        </div>

        {showFooter && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              disabled={submitDisabled || isSubmitting}
            >
              {submitLabel}
            </Button>
          </div>
        )}
      </form>
    </BaseModal>
  );
}
