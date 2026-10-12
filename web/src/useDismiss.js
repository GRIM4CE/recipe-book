import { useEffect, useRef } from 'react';

// Closes a popover on Escape or on a press anywhere outside the element the
// returned ref is attached to (the trigger and its panel together).
export function useDismiss(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    const onPointer = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, onClose]);
  return ref;
}
