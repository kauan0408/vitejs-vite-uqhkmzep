import React from "react";
import "./components.css";

export default function Header({
  title,
  subtitle,
  actions,
}) {
  return (
    <header className="ui-header">
      <div>
        <h1>{title}</h1>

        {subtitle && <p>{subtitle}</p>}
      </div>

      {actions && <div>{actions}</div>}
    </header>
  );
}