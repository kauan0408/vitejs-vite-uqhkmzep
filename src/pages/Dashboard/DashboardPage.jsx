import React from "react";
import { useFinance } from "../../App.jsx";
import "./DashboardPage.css";

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    }
  );
}

export default function DashboardPage() {
  const {
    profile = {},
    transacoes = [],
    cartoes = [],
    reserva = {},
  } = useFinance();

  const receitas = transacoes
    .filter(
      (transacao) =>
        transacao.tipo === "receita"
    )
    .reduce(
      (total, transacao) =>
        total + Number(transacao.valor || 0),
      0
    );

  const despesas = transacoes
    .filter(
      (transacao) =>
        transacao.tipo === "despesa"
    )
    .reduce(
      (total, transacao) =>
        total + Number(transacao.valor || 0),
      0
    );

  const saldo = receitas - despesas;

  const totalReserva = Array.isArray(
    reserva?.locais
  )
    ? reserva.locais.reduce(
        (total, local) =>
          total + Number(local.valor || 0),
        0
      )
    : 0;

  return (
    <div className="page dashboard-page">
      <div>
        <h2 className="page-title">
          Olá, {profile.nome || "usuário"}
        </h2>

        <p className="dashboard-subtitulo">
          Veja um resumo dos seus dados.
        </p>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <span>Receitas</span>
          <strong>
            {formatarMoeda(receitas)}
          </strong>
        </section>

        <section className="dashboard-card">
          <span>Despesas</span>
          <strong>
            {formatarMoeda(despesas)}
          </strong>
        </section>

        <section className="dashboard-card">
          <span>Saldo</span>
          <strong>
            {formatarMoeda(saldo)}
          </strong>
        </section>

        <section className="dashboard-card">
          <span>Reserva</span>
          <strong>
            {formatarMoeda(totalReserva)}
          </strong>
        </section>

        <section className="dashboard-card">
          <span>Cartões cadastrados</span>
          <strong>{cartoes.length}</strong>
        </section>

        <section className="dashboard-card">
          <span>Transações</span>
          <strong>{transacoes.length}</strong>
        </section>
      </div>
    </div>
  );
}