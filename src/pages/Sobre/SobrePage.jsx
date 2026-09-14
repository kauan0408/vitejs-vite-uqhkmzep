import React from "react";
import "./SobrePage.css";

export default function SobrePage() {
  return (
    <div className="page sobre-page">
      <h2 className="page-title">
        Sobre o aplicativo
      </h2>

      <section className="sobre-card">
        <h3>Finanças Offline</h3>

        <p>
          Aplicativo para organização financeira
          pessoal que funciona sem banco de dados
          online.
        </p>

        <p>
          Os dados ficam armazenados localmente
          no dispositivo do usuário.
        </p>
      </section>

      <section className="sobre-card">
        <h3>Versão</h3>

        <p>Versão 1.0.0</p>
      </section>

      <section className="sobre-card">
        <h3>Atualizações</h3>

        <p>
          Antes de instalar uma nova versão,
          exporte seus dados pela página Backup.
          Depois, importe o arquivo na versão
          atualizada.
        </p>
      </section>

      <section className="sobre-card">
        <h3>Privacidade</h3>

        <p>
          Nenhuma informação financeira é
          enviada para servidores externos.
        </p>
      </section>
    </div>
  );
}