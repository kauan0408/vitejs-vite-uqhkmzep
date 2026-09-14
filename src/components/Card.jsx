import React from "react";
import "./components.css";

export default function Card({
  children,
  className = "",
  as: Elemento = "section",
}) {
  return (
    <Elemento className={`ui-card ${className}`}>
      {children}
    </Elemento>
  );
}