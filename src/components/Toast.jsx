import React, { useEffect } from "react";
import "./components.css";

export default function Toast({
  message,
  type = "success",
  duration = 2500,
  onClose,
}) {
  useEffect(() => {
    if (!message) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      onClose?.();
    }, duration);

    return () => {
      window.clearTimeout(timer);
    };
  }, [message, duration, onClose]);

  if (!message) {
    return null;
  }

  return (
    <div
      className={`ui-toast ui-toast-${type}`}
      role="status"
    >
      {message}
    </div>
  );
}