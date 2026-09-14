import React from "react";
import "./components.css";

export default function Sidebar({
  items = [],
  activePage,
  onNavigate,
}) {
  return (
    <aside className="ui-sidebar">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`ui-sidebar-button ${
            activePage === item.id
              ? "active"
              : ""
          }`}
          onClick={() =>
            onNavigate?.(item.id)
          }
        >
          {item.icon && (
            <span>{item.icon} </span>
          )}

          {item.label}
        </button>
      ))}
    </aside>
  );
}