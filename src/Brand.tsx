import React from "react";
import logo from "./assets/mandevilla-logo.png";

export function Brand({ subtitle = "Editor de conteúdo" }: { subtitle?: string }) {
  return <div className="brand">
    <img className="brandLogo" src={logo} width="44" height="44" alt="Mandevilla de Plantas do Rio" />
    <div><strong>Plantas do Rio</strong><span>{subtitle}</span></div>
  </div>;
}

export function BrandMark() {
  return <img className="brandLogo" src={logo} width="64" height="64" alt="Mandevilla de Plantas do Rio" />;
}
