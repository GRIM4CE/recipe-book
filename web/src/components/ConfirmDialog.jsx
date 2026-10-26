import { useEffect, useRef } from 'react';
import { useLanguage } from '../useLanguage.jsx';

// Native <dialog> gives us focus trapping, Esc-to-cancel, and a backdrop for
// free. `open` is controlled by the parent; closing always routes through
// onCancel/onConfirm so the parent's state stays the source of truth.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}) {
  const { t } = useLanguage();
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      className="modal"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
    >
      <h3 className="modal-title">{title}</h3>
      {message && <p className="modal-message">{message}</p>}
      <div className="modal-actions">
        <button className="btn ghost" type="button" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button className="btn danger" type="button" onClick={onConfirm}>
          {confirmLabel ?? t('delete')}
        </button>
      </div>
    </dialog>
  );
}
