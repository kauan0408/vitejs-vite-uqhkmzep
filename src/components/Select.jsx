import React from "react";
import "./components.css";

export default function Select({
  label,
  id,
  children,
  className = "",
  ...props
}) {
  const selectId = id || props.name;

  return (
    <label
      className={`ui-field ${className}`}
      htmlFor={selectId}
    >
      {label && (
        <span className="ui-field-label">
          {label}
        </span>
      )}

      <select
        id={selectId}
        className="ui-select"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}