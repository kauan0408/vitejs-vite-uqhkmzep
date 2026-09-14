import React from "react";
import "./components.css";

export default function Loading({
  text = "Carregando...",
}) {
  return (
    <div className="ui-loading">
      <div>
        <div className="ui-spinner" />
        <p>{text}</p>
      </div>
    </div>
  );
}