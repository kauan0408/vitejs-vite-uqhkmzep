import React, { useEffect } from "react";
import "./components.css";

export default function Modal({
  open,
  title,
  children,
  onClose,
}) {
  useEffect(() => {
    function fecharComEsc(evento) {
      if (evento.key === "Escape") {
        onClose?.();
      }
    }

    if (open) {
      window.addEventListener(
        "keydown",
        fecharComEsc
      );
    }

    return () => {
      window.removeEventListener(
        "keydown",
        fecharComEsc
      );
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="ui-modal-overlay"
      onMouseDown={onClose}
    >
      <div
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(evento) =>
          evento.stopPropagation()
        }
      >
        <div className="ui-modal-header">
          <h3>{title}</h3>

          <button
            type="button"
            className="ui-modal-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}