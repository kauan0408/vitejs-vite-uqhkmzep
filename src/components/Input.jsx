import React from "react";
import "./components.css";

export default function Input({
  label,
  id,
  className = "",
  ...props
}) {
  const inputId = id || props.name;

  return (
    <label
      className={`ui-field ${className}`}
      htmlFor={inputId}
    >
      {label && (
        <span className="ui-field-label">
          {label}
        </span>
      )}

      <input
        id={inputId}
        className="ui-input"
        {...props}
      />
    </label>
  );
}