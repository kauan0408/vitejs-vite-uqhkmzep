// src/pages/ReservaPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { useFinance } from "../../App.jsx";

function formatCurrency(value) {
  const num = Number(value || 0);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function FeedbackBox({ text, onClose }) {
  if (!text) return null;

  return (
    <div
      className="feedback"
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span style={{ wordBreak: "break-word" }}>{text}</span>

      <button
        type="button"
        className="toggle-btn"
        onClick={onClose}
        style={{ width: "auto", padding: "6px 10px" }}
        aria-label="Fechar mensagem"
        title="Fechar"
      >
        ✖
      </button>
    </div>
  );
}

function criarDataCerta(ano, mes, diaDesejado) {
  const ultimoDiaDoMes = new Date(ano, mes + 1, 0).getDate();
  const d = Math.min(Math.max(1, diaDesejado), ultimoDiaDoMes);
  return new Date(ano, mes, d, 0, 0, 0, 0);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function toNum(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function daysBetween(aMs, bMs) {
  const one = 24 * 60 * 60 * 1000;
  return Math.floor((bMs - aMs) / one);
}

export default function ReservaPage() {
  const finance = useFinance() || {};
  const {
    reserva: reservaRaw,
    setReserva,
    profile,
    mesReferencia,
    adicionarTransacao,
  } = finance;

  const reserva = reservaRaw || { locais: [], movimentos: [], metaMensal: 0 };

  // Meta mensal (geral)
  const [metaMensalLocal, setMetaMensalLocal] = useState(reserva.metaMensal || "");

  useEffect(() => {
    setMetaMensalLocal(reserva.metaMensal || "");
  }, [reserva.metaMensal]);


  // Criar local (com meta)
  const [novoLocalNome, setNovoLocalNome] = useState("");
  const [novoLocalMeta, setNovoLocalMeta] = useState("");

  // Adicionar dinheiro
  const [valorAdicionar, setValorAdicionar] = useState("");
  const [origem, setOrigem] = useState("salario");
  const [localDestinoId, setLocalDestinoId] = useState("");

  // Retirar dinheiro
  const [valorRetirar, setValorRetirar] = useState("");
  const [motivoRetirar, setMotivoRetirar] = useState("contas");
  const [localRetirarId, setLocalRetirarId] = useState("");

  // Mensagem
  const [mensagem, setMensagem] = useState("");

  // Reiniciar tudo
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTyping, setResetTyping] = useState("");

  // Apagar local
  const [delOpen, setDelOpen] = useState(false);
  const [delLocalId, setDelLocalId] = useState("");
  const [delTyping, setDelTyping] = useState("");

  // Modais principais
  const [metaOpen, setMetaOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [retOpen, setRetOpen] = useState(false);
  const [novoLocalOpen, setNovoLocalOpen] = useState(false);

  const [secaoAtiva, setSecaoAtiva] = useState("resumo");
  const [ajudaOpen, setAjudaOpen] = useState(false);
  const [localAbertoId, setLocalAbertoId] = useState("");
  const [historicoLocalId, setHistoricoLocalId] = useState("");

  const locaisRaw = Array.isArray(reserva.locais) ? reserva.locais : [];
  const movimentosRaw = Array.isArray(reserva.movimentos) ? reserva.movimentos : [];

  const locais = useMemo(() => {
    return locaisRaw.map((l) => ({
      id: l.id,
      nome: String(l.nome || "Local"),
      valor: toNum(l.valor),
      meta: toNum(l.meta),
      status: l.status || "ativo",
      doneAt: l.doneAt || "",
    }));
  }, [locaisRaw]);

  const movimentos = useMemo(() => {
    return movimentosRaw.map((m, index) => {
      const dataHora = m.dataHora || "";
      const localId = m.localId || "";

      return {
        id: m.id || `mov-${localId}-${dataHora}-${index}`,
        valor: toNum(m.valor),
        origem: m.origem || "outros",
        localId,
        objetivo: String(m.objetivo || ""),
        dataHora: dataHora || new Date(0).toISOString(),
        tipo: m.tipo || "",
      };
    });
  }, [movimentosRaw]);

  function atualizarReserva(dados) {
    if (typeof setReserva !== "function") return;
    setReserva({ ...reserva, ...dados });
  }

  // Auto-remover concluídos após 7 dias (com histórico)
  useEffect(() => {
    const now = Date.now();
    const toRemoveIds = [];

    for (const l of locais) {
      if (l.status === "done" && l.doneAt) {
        const t = new Date(l.doneAt).getTime();
        if (!isNaN(t) && daysBetween(t, now) >= 7) toRemoveIds.push(l.id);
      }
    }

    if (toRemoveIds.length === 0) return;

    const novosLocais = locais.filter((l) => !toRemoveIds.includes(l.id));
    const novosMov = movimentos.filter((m) => !toRemoveIds.includes(m.localId));

    atualizarReserva({ locais: novosLocais, movimentos: novosMov });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locaisRaw, movimentosRaw]);

  // Meta por ciclo (diaPagamento)
  const diaPagamento = Number(profile?.diaPagamento || 0);

  const periodoCiclo = useMemo(() => {
    if (!diaPagamento || diaPagamento < 1 || diaPagamento > 31) return null;

    const ano = mesReferencia?.ano ?? new Date().getFullYear();
    const mes = mesReferencia?.mes ?? new Date().getMonth();

    const inicio = criarDataCerta(ano, mes, diaPagamento);
    const inicioProx = criarDataCerta(ano, mes + 1, diaPagamento);

    const fim = new Date(inicioProx.getTime());
    fim.setDate(fim.getDate() - 1);
    fim.setHours(23, 59, 59, 999);

    return { inicio, fim };
  }, [diaPagamento, mesReferencia?.ano, mesReferencia?.mes]);

  const totalNoCiclo = useMemo(() => {
    if (!periodoCiclo) return 0;

    const ini = periodoCiclo.inicio.getTime();
    const fim = periodoCiclo.fim.getTime();

    return movimentos.reduce((acc, m) => {
      const dt = new Date(m.dataHora).getTime();
      if (Number.isNaN(dt)) return acc;
      if (dt >= ini && dt <= fim) acc += Number(m.valor || 0);
      return acc;
    }, 0);
  }, [movimentos, periodoCiclo]);

  const metaAtual = toNum(metaMensalLocal || reserva.metaMensal || 0);
  const percMeta = metaAtual > 0 ? Math.min(100, (totalNoCiclo / metaAtual) * 100) : 0;

  const totalGuardado = useMemo(
    () => locais.reduce((soma, l) => soma + Number(l.valor || 0), 0),
    [locais]
  );

  // Salvar meta mensal
  function salvarMetaMensal(e) {
    e.preventDefault();
    const meta = toNum(metaMensalLocal || 0);
    atualizarReserva({ metaMensal: meta });
    setMensagem("Meta mensal salva.");
    setMetaOpen(false);
  }

  // Criar local
  function adicionarLocal(e) {
    e.preventDefault();

    if (!novoLocalNome.trim()) {
      setMensagem("Digite o nome do local.");
      return;
    }

    const nomeNormalizado = novoLocalNome.trim().toLocaleLowerCase("pt-BR");
    const jaExiste = locais.some(
      (local) => local.nome.trim().toLocaleLowerCase("pt-BR") === nomeNormalizado
    );

    if (jaExiste) {
      setMensagem("Já existe um local com esse nome.");
      return;
    }

    const novo = {
      id: generateId(),
      nome: novoLocalNome.trim(),
      valor: 0,
      meta: toNum(novoLocalMeta || 0),
      status: "ativo",
      doneAt: "",
    };

    const novos = [...locais, novo];
    atualizarReserva({ locais: novos });

    setNovoLocalNome("");
    setNovoLocalMeta("");

    if (!localDestinoId) setLocalDestinoId(novo.id);
    if (!localRetirarId) setLocalRetirarId(novo.id);

    setMensagem("Local adicionado.");
    setNovoLocalOpen(false);
  }

  function alterarLocalCampo(id, patch) {
    const novos = locais.map((l) => (l.id === id ? { ...l, ...patch } : l));
    atualizarReserva({ locais: novos });
  }

  function marcarConcluido(id) {
    const alvo = locais.find((l) => l.id === id);
    if (!alvo) return;

    if (alvo.status === "done") {
      alterarLocalCampo(id, { status: "ativo", doneAt: "" });
      setMensagem("Local reaberto.");
    } else {
      alterarLocalCampo(id, { status: "done", doneAt: new Date().toISOString() });
      setMensagem("Local marcado como concluído (será removido em 7 dias).");
    }
  }

  function abrirApagarLocal(id) {
    setDelLocalId(id);
    setDelTyping("");
    setDelOpen(true);
  }

  function confirmarApagarLocal() {
    if (String(delTyping || "").trim().toUpperCase() !== "APAGAR") {
      setMensagem('Para confirmar, digite "APAGAR".');
      return;
    }

    const id = delLocalId;
    if (!id) return;

    const novosLocais = locais.filter((l) => l.id !== id);
    const novosMov = movimentos.filter((m) => m.localId !== id);

    atualizarReserva({ locais: novosLocais, movimentos: novosMov });

    setDelOpen(false);
    setDelLocalId("");
    setDelTyping("");

    setMensagem("Local apagado (e histórico removido).");
  }

  function nomeLocal(id) {
    const l = locais.find((x) => x.id === id);
    return l ? l.nome : "Local";
  }

  function origemLabel(o) {
    if (o === "salario") return "Salário";
    if (o === "pix") return "PIX";
    if (o === "venda") return "Venda";
    if (o === "economia") return "Economia";
    if (o === "resgate") return "Resgate";
    return "Outros";
  }

  function motivoLabel(m) {
    if (m === "contas") return "Pagar contas";
    if (m === "emergencia") return "Emergência";
    if (m === "compra") return "Compra";
    if (m === "outro") return "Outro";
    return "Outro";
  }

  function movimentosDoLocal(localId) {
    return movimentos.filter((m) => m.localId === localId);
  }

  function detalheMovimento(m) {
    const local = nomeLocal(m.localId);
    const objetivo = String(m.objetivo || "").trim();
    const origemTexto = origemLabel(m.origem);

    const partes = [origemTexto];

    if (
      objetivo &&
      objetivo.toLocaleLowerCase("pt-BR") !==
        String(local).toLocaleLowerCase("pt-BR")
    ) {
      partes.push(objetivo);
    }

    return partes.join(" · ");
  }

  // Adicionar dinheiro (depósito)
  // Guardar dinheiro transfere valor do saldo disponível para a Reserva.
  function handleAdicionarReserva(e) {
    e.preventDefault();

    const v = toNum(valorAdicionar);

    if (!v || v <= 0) {
      setMensagem("Digite um valor válido.");
      return;
    }

    if (!localDestinoId) {
      setMensagem("Selecione o local.");
      return;
    }

    const destino = locais.find((l) => l.id === localDestinoId);

    if (!destino) {
      setMensagem("Local inválido.");
      return;
    }

    if (destino.status === "done") {
      setMensagem(
        "Este local está concluído. Reabra o local para adicionar valores."
      );
      return;
    }

    if (typeof adicionarTransacao !== "function") {
      setMensagem(
        "Não foi possível guardar o dinheiro porque a integração com o saldo não está disponível."
      );
      return;
    }

    const agora = new Date().toISOString();
    const nomeDestino = nomeLocal(localDestinoId);

    try {
      adicionarTransacao({
        tipo: "despesa",
        valor: v,
        categoria: "investido",
        descricao: `Reserva: ${nomeDestino}`,
        formaPagamento: "debito",
        dataHora: agora,
        origem,
        origemMovimento: "reserva",
        localReservaId: localDestinoId,
        localReservaNome: nomeDestino,
        afetaSaldo: true,
      });

      const novosLocais = locais.map((l) =>
        l.id === localDestinoId
          ? { ...l, valor: Number(l.valor || 0) + v }
          : l
      );

      const movimento = {
        id: generateId(),
        valor: v,
        origem,
        localId: localDestinoId,
        objetivo: "",
        dataHora: agora,
        tipo: "entrada",
      };

      atualizarReserva({
        locais: novosLocais,
        movimentos: [movimento, ...movimentos],
      });

      setValorAdicionar("");
      setMensagem(
        `${formatCurrency(v)} guardado em ${nomeDestino}. O mesmo valor foi descontado do saldo.`
      );
      setAddOpen(false);
    } catch (err) {
      console.error(
        "Falha ao guardar dinheiro e registrar saída no saldo:",
        err
      );

      setMensagem(
        "Não foi possível guardar o dinheiro porque a saída no saldo falhou."
      );
    }
  }

  // Retirar dinheiro (resgate)
  function handleRetirarReserva(e) {
    e.preventDefault();

    const v = toNum(valorRetirar);

    if (!v || v <= 0) {
      setMensagem("Digite um valor válido para retirar.");
      return;
    }

    if (!localRetirarId) {
      setMensagem("Selecione o local para retirar.");
      return;
    }

    const origemLocal = locais.find((l) => l.id === localRetirarId);
    if (!origemLocal) {
      setMensagem("Local inválido.");
      return;
    }

    if (origemLocal.status === "done") {
      setMensagem("Este local está concluído. Reabra o local para retirar valores.");
      return;
    }

    const saldoLocal = toNum(origemLocal.valor);
    if (v > saldoLocal) {
      setMensagem(`Saldo insuficiente neste local. Disponível: ${formatCurrency(saldoLocal)}.`);
      return;
    }

    const novosLocais = locais.map((l) =>
      l.id === localRetirarId ? { ...l, valor: Math.max(0, Number(l.valor || 0) - v) } : l
    );

    const movimento = {
      id: generateId(),
      valor: -v,
      origem: "resgate",
      localId: localRetirarId,
      objetivo: motivoLabel(motivoRetirar),
      dataHora: new Date().toISOString(),
      tipo: "saida",
    };

    atualizarReserva({
      locais: novosLocais,
      movimentos: [movimento, ...movimentos],
    });

    if (typeof adicionarTransacao === "function") {
      try {
        adicionarTransacao({
          id: generateId(),
          tipo: "receita",
          valor: v,
          categoria: "resgate_reserva",
          descricao: `Resgate Reserva: ${nomeLocal(localRetirarId)} (${motivoLabel(motivoRetirar)})`,
          formaPagamento: "dinheiro",
          dataHora: new Date().toISOString(),
          origem: "resgate",
        });
      } catch (err) {
        console.error("Falha ao registrar transação de resgate:", err);
      }
    }

    setValorRetirar("");
    setMensagem(`Retirado: ${formatCurrency(v)}.`);
    setRetOpen(false);
  }

  // Reset total
  function abrirReset() {
    setResetTyping("");
    setResetOpen(true);
  }

  function confirmarReset() {
    if (String(resetTyping || "").trim().toUpperCase() !== "ZERAR") {
      setMensagem('Para confirmar, digite "ZERAR".');
      return;
    }

    atualizarReserva({ locais: [], movimentos: [], metaMensal: 0 });

    setMetaMensalLocal("");
    setResetOpen(false);
    setResetTyping("");
    setMensagem("Reserva reiniciada: locais, histórico e meta foram zerados.");
  }

  const locaisAtivos = locais.filter((l) => l.status !== "done");
  const locaisConcluidos = locais.filter((l) => l.status === "done");

  useEffect(() => {
    if (!localDestinoId && locaisAtivos.length > 0) setLocalDestinoId(locaisAtivos[0].id);
    if (!localRetirarId && locaisAtivos.length > 0) setLocalRetirarId(locaisAtivos[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locaisAtivos.length]);

  const softBlue = {
    background: "rgba(59,130,246,.18)",
    border: "1px solid rgba(59,130,246,.35)",
    color: "rgba(255,255,255,.96)",
  };

  const softBlueStrong = {
    background: "rgba(59,130,246,.22)",
    border: "1px solid rgba(59,130,246,.45)",
    color: "rgba(255,255,255,.98)",
  };

  const actionPanelStyle = {
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,.08)",
    background: "rgba(255,255,255,.03)",
  };

  const actionGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  };

  const actionBtnBase = {
    width: "100%",
    height: 44,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    fontWeight: 800,
    letterSpacing: ".2px",
    whiteSpace: "nowrap",
  };

  const navGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginBottom: 12,
  };

  const navButtonStyle = (ativo) => ({
    minHeight: 58,
    borderRadius: 16,
    fontWeight: 900,
    border: ativo
      ? "1px solid rgba(59,130,246,.55)"
      : "1px solid rgba(255,255,255,.08)",
    background: ativo
      ? "rgba(59,130,246,.20)"
      : "rgba(255,255,255,.03)",
  });

  const statusMeta =
    metaAtual <= 0
      ? "Defina uma meta para acompanhar seu progresso."
      : totalNoCiclo >= metaAtual
      ? "Meta do ciclo atingida."
      : totalNoCiclo >= metaAtual * 0.75
      ? "Você está perto de atingir a meta."
      : totalNoCiclo >= metaAtual * 0.5
      ? "Você já passou da metade da meta."
      : totalNoCiclo > 0
      ? "Você começou a guardar neste ciclo."
      : "Ainda não houve valor guardado neste ciclo.";

  const progressoVisual =
    metaAtual > 0
      ? Math.min(100, Math.max(0, (totalNoCiclo / metaAtual) * 100))
      : 0;

  // ✅ estilos novos para “Locais” (arrumadinho + não estoura)
  const localCard = {
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,.08)",
    background: "rgba(255,255,255,.03)",
    display: "grid",
    gap: 12,
    width: "100%",
    boxSizing: "border-box",
  };

  const localTop = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    alignItems: "start",
    width: "100%",
  };

  const localTitle = {
    display: "grid",
    gap: 4,
    minWidth: 0,
  };

  const localName = {
    fontSize: 16,
    fontWeight: 900,
    lineHeight: 1.15,
    overflowWrap: "anywhere",
  };

  const localInfoLine = {
    fontSize: 12.5,
    opacity: 0.85,
    overflowWrap: "anywhere",
  };

  const localActions = {
    display: "grid",
    gridAutoFlow: "column",
    gap: 8,
    justifyContent: "end",
    alignItems: "center",
    width: "max-content",
  };


  const inputWrap = {
    display: "grid",
    gap: 6,
    minWidth: 0,
  };

  const labelSmall = { fontSize: 12, opacity: 0.85 };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
  };

  const progressRow = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 10,
    width: "100%",
  };

  const progressBarOuter = {
    height: 10,
    borderRadius: 999,
    background: "rgba(255,255,255,.08)",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,.06)",
  };

  const progressLabel = {
    fontSize: 12.5,
    fontWeight: 900,
    opacity: 0.9,
    minWidth: 42,
    textAlign: "right",
  };

  function CabecalhoSecao({ titulo, subtitulo }) {
    return (
      <div style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{titulo}</h3>
        {subtitulo ? (
          <p className="muted small" style={{ marginTop: 4, marginBottom: 0 }}>
            {subtitulo}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="page">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div>
          <h2 className="page-title" style={{ marginBottom: 4 }}>
            Reserva
          </h2>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 0 }}>
            Organize seu dinheiro por objetivos, acompanhe metas e mantenha o histórico
            de entradas e retiradas.
          </p>
        </div>

        <button
          type="button"
          className="toggle-btn"
          onClick={() => setAjudaOpen(true)}
          style={{
            width: 40,
            minWidth: 40,
            height: 40,
            borderRadius: 999,
            position: "sticky",
            top: 8,
          }}
          title="Como funciona"
          aria-label="Como funciona"
        >
          ?
        </button>
      </div>

      {/* NAVEGAÇÃO INTERNA */}
      <div className="card" style={{ padding: 12 }}>
        <div style={navGridStyle}>
          <button
            type="button"
            className="toggle-btn"
            style={navButtonStyle(secaoAtiva === "resumo")}
            onClick={() => setSecaoAtiva("resumo")}
          >
            📊 Resumo
          </button>

          <button type="button" className="toggle-btn"
            style={navButtonStyle(secaoAtiva === "guardar")}
            onClick={() => setSecaoAtiva("guardar")}>
            💰 Guardar dinheiro
          </button>

          <button type="button" className="toggle-btn"
            style={navButtonStyle(secaoAtiva === "locais")}
            onClick={() => setSecaoAtiva("locais")}>
            📍 Locais
          </button>

          <button type="button" className="toggle-btn"
            style={navButtonStyle(secaoAtiva === "historico")}
            onClick={() => setSecaoAtiva("historico")}>
            🕘 Histórico
          </button>
        </div>
      </div>

      <FeedbackBox text={mensagem} onClose={() => setMensagem("")} />

      {/* META */}
      {metaOpen ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Ajustar limite da reserva</h3>

            {periodoCiclo ? (
              <p className="muted small" style={{ marginTop: 6 }}>
                Ciclo:{" "}
                <strong>
                  {periodoCiclo.inicio.toLocaleDateString("pt-BR")} até{" "}
                  {periodoCiclo.fim.toLocaleDateString("pt-BR")}
                </strong>
              </p>
            ) : (
              <p className="muted small" style={{ marginTop: 6 }}>
                Defina o “Dia que você recebe” no Perfil para usar ciclo automático.
              </p>
            )}

            <form className="form" onSubmit={salvarMetaMensal} style={{ marginTop: 10 }}>
              <div className="field">
                <label>Limite / meta do ciclo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={metaMensalLocal}
                  onChange={(e) => setMetaMensalLocal(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
                <button type="button" className="toggle-btn" onClick={() => setMetaOpen(false)}>
                  Cancelar
                </button>
                <button className="primary-btn" type="submit" style={softBlueStrong}>
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ADICIONAR */}
      {addOpen ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Adicionar</h3>

            <form className="form" onSubmit={handleAdicionarReserva} style={{ marginTop: 10 }}>
              <div className="field">
                <label>Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={valorAdicionar}
                  onChange={(e) => setValorAdicionar(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Origem</label>
                <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
                  <option value="salario">Salário</option>
                  <option value="pix">PIX</option>
                  <option value="venda">Venda</option>
                  <option value="economia">Economia</option>
                  <option value="outros">Outros</option>
                </select>
              </div>

              <div className="field">
                <label>Local</label>
                <select value={localDestinoId} onChange={(e) => setLocalDestinoId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {locaisAtivos.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
                <button type="button" className="toggle-btn" onClick={() => setAddOpen(false)}>
                  Cancelar
                </button>
                <button className="primary-btn" type="submit" style={softBlueStrong}>
                  Confirmar
                </button>
              </div>

              <p className="muted small" style={{ marginTop: 10 }}>
                Ao guardar, o valor entra na <strong>Reserva</strong> e o mesmo valor é registrado como <strong>despesa “investido”</strong>, diminuindo o saldo disponível.
              </p>
            </form>
          </div>
        </div>
      ) : null}

      {/* RETIRAR */}
      {retOpen ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Retirar</h3>

            <form className="form" onSubmit={handleRetirarReserva} style={{ marginTop: 10 }}>
              <div className="field">
                <label>Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={valorRetirar}
                  onChange={(e) => setValorRetirar(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Motivo</label>
                <select value={motivoRetirar} onChange={(e) => setMotivoRetirar(e.target.value)}>
                  <option value="contas">Pagar contas</option>
                  <option value="emergencia">Emergência</option>
                  <option value="compra">Compra</option>
                  <option value="outro">Outro</option>
                </select>
              </div>

              <div className="field">
                <label>Local</label>
                <select value={localRetirarId} onChange={(e) => setLocalRetirarId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {locaisAtivos.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
                <button type="button" className="toggle-btn" onClick={() => setRetOpen(false)}>
                  Cancelar
                </button>
                <button className="primary-btn" type="submit" style={softBlue}>
                  Confirmar
                </button>
              </div>

              <p className="muted small" style={{ marginTop: 10 }}>
                Ao retirar, o app cria um movimento <strong>negativo</strong> no histórico e registra uma{" "}
                <strong>receita</strong> “resgate_reserva” para devolver ao saldo.
              </p>
            </form>
          </div>
        </div>
      ) : null}

      {/* NOVO LOCAL */}
      {novoLocalOpen ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Novo local</h3>

            <form className="form" onSubmit={adicionarLocal} style={{ marginTop: 10 }}>
              <div className="field">
                <label>Nome</label>
                <input
                  type="text"
                  value={novoLocalNome}
                  onChange={(e) => setNovoLocalNome(e.target.value)}
                  placeholder="Ex.: Emergência, Carro, Viagem..."
                />
              </div>

              <div className="field">
                <label>Meta deste local (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={novoLocalMeta}
                  onChange={(e) => setNovoLocalMeta(e.target.value)}
                  placeholder="Ex.: 5000"
                />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
                <button type="button" className="toggle-btn" onClick={() => setNovoLocalOpen(false)}>
                  Cancelar
                </button>
                <button className="primary-btn" type="submit" style={softBlueStrong}>
                  Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* HISTÓRICO DE UM LOCAL */}
      {historicoLocalId ? (
        <div className="modal-overlay" onClick={() => setHistoricoLocalId("")}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  🕘 Histórico — {nomeLocal(historicoLocalId)}
                </h3>
                <p className="muted small" style={{ marginTop: 4 }}>
                  Total guardado atualmente:{" "}
                  <strong>
                    {formatCurrency(
                      locais.find((l) => l.id === historicoLocalId)?.valor || 0
                    )}
                  </strong>
                </p>
              </div>

              <button
                type="button"
                className="toggle-btn"
                style={{ width: "auto" }}
                onClick={() => setHistoricoLocalId("")}
              >
                ✖
              </button>
            </div>

            {movimentosDoLocal(historicoLocalId).length === 0 ? (
              <p className="muted small">Nenhuma movimentação neste local.</p>
            ) : (
              <ul className="list" style={{ marginTop: 12 }}>
                {movimentosDoLocal(historicoLocalId).map((m) => (
                  <li key={m.id} className="list-item list-item-history">
                    <div>
                      <strong>{formatCurrency(m.valor)}</strong>
                      <p className="muted small" style={{ marginBottom: 0 }}>
                        {m.tipo === "entrada" ? "Entrada" : "Retirada"} ·{" "}
                        {detalheMovimento(m)}
                      </p>
                    </div>

                    <div className="muted small" style={{ textAlign: "right" }}>
                      {new Date(m.dataHora).toLocaleDateString("pt-BR")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {/* COMO FUNCIONA */}
      {ajudaOpen ? (
        <div className="modal-overlay" onClick={() => setAjudaOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>❓ Como funciona</h3>
              <button type="button" className="toggle-btn" style={{ width: "auto" }} onClick={() => setAjudaOpen(false)}>
                ✖
              </button>
            </div>

            <div className="muted small" style={{ marginTop: 14, lineHeight: 1.8 }}>
              <div>• O valor guardado de cada local só muda por Adicionar ou Retirar.</div>
              <div>• Apagar um local remove também o histórico ligado a ele.</div>
              <div>• Um local concluído permanece por 7 dias antes de ser removido.</div>
              <div>• Guardar dinheiro aumenta a Reserva e diminui o saldo pelo mesmo valor.</div>\n              <div>• O desconto aparece nas Finanças como despesa “investido”.</div>
              <div>• Retirar registra uma receita “resgate_reserva” nas Finanças.</div>
            </div>
          </div>
        </div>
      ) : null}

      {/* RESET */}
      {resetOpen ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Reiniciar reserva?</h3>

            <p className="muted small" style={{ marginTop: 6 }}>
              Isso vai <strong>apagar TODOS os locais</strong> e <strong>todo o histórico</strong> da Reserva.
            </p>

            <div className="field" style={{ marginTop: 10 }}>
              <label>Digite ZERAR para confirmar</label>
              <input
                type="text"
                value={resetTyping}
                onChange={(e) => setResetTyping(e.target.value)}
                placeholder="Digite: ZERAR"
                autoComplete="off"
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" className="toggle-btn" onClick={() => setResetOpen(false)}>
                Cancelar
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={confirmarReset}
                style={{ background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.35)" }}
              >
                ✅ Sim, zerar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* APAGAR LOCAL */}
      {delOpen ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Apagar local?</h3>

            <p className="muted small" style={{ marginTop: 6 }}>
              Isso vai apagar o local <strong>{nomeLocal(delLocalId)}</strong> e{" "}
              <strong>TUDO relacionado no histórico</strong>.
            </p>

            <div className="field" style={{ marginTop: 10 }}>
              <label>Digite APAGAR para confirmar</label>
              <input
                type="text"
                value={delTyping}
                onChange={(e) => setDelTyping(e.target.value)}
                placeholder="Digite: APAGAR"
                autoComplete="off"
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" className="toggle-btn" onClick={() => setDelOpen(false)}>
                Cancelar
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={confirmarApagarLocal}
                style={{ background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.35)" }}
              >
                🗑️ Apagar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {secaoAtiva === "resumo" ? (
        <>
      {/* RESUMO */}
      <div className="card" style={{ marginTop: 10 }}>
        <CabecalhoSecao
          titulo="Resumo"
          subtitulo="Total, ciclo e progresso da meta."
        />

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button
            type="button"
            className="toggle-btn"
            onClick={() => setMetaOpen(true)}
            title="Editar limite"
          >
            🎯 Ajustar limite
          </button>
        </div>

        {periodoCiclo ? (
          <p className="muted small" style={{ marginTop: 6 }}>
            Ciclo:{" "}
            <strong>
              {periodoCiclo.inicio.toLocaleDateString("pt-BR")} até {periodoCiclo.fim.toLocaleDateString("pt-BR")}
            </strong>
          </p>
        ) : (
          <p className="muted small" style={{ marginTop: 6 }}>
            Defina o “Dia que você recebe” no Perfil para usar ciclo automático.
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 10,
            marginTop: 10,
          }}
        >
          <div style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 12 }}>
            <div className="muted small">Total guardado</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{formatCurrency(totalGuardado)}</div>
          </div>

          <div style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 12 }}>
            <div className="muted small">Neste ciclo (líquido)</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{formatCurrency(totalNoCiclo)}</div>
          </div>

          <div style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 12 }}>
            <div className="muted small">Meta do ciclo</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{formatCurrency(metaAtual)}</div>

            {metaAtual > 0 ? (
              <div className="progress-container" style={{ marginTop: 10 }}>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${percMeta.toFixed(0)}%` }} />
                </div>
                <span className="progress-label">{percMeta.toFixed(0)}%</span>
              </div>
            ) : (
              <div className="muted small" style={{ marginTop: 10 }}>
                Ajuste a meta para ver o progresso.
              </div>
            )}
          </div>

          <div
            style={{
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 14,
              padding: 12,
              minHeight: 118,
              display: "grid",
              alignContent: "space-between",
              gap: 8,
            }}
          >
            <div className="muted small">📈 Como estou indo</div>

            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {metaAtual <= 0
                  ? "Sem meta"
                  : totalNoCiclo >= metaAtual
                  ? "✅ Meta alcançada"
                  : `${progressoVisual.toFixed(0)}% da meta`}
              </div>

              {metaAtual > 0 ? (
                <>
                  <div style={{ ...progressBarOuter, marginTop: 10 }}>
                    <div
                      style={{
                        width: `${progressoVisual}%`,
                        height: "100%",
                        background: "rgba(59,130,246,.55)",
                      }}
                    />
                  </div>

                  <div className="muted small" style={{ marginTop: 8 }}>
                    {totalNoCiclo >= metaAtual
                      ? `Você passou a meta em ${formatCurrency(
                          totalNoCiclo - metaAtual
                        )}.`
                      : `Faltam ${formatCurrency(
                          Math.max(0, metaAtual - totalNoCiclo)
                        )} para alcançar a meta.`}
                  </div>
                </>
              ) : (
                <div className="muted small" style={{ marginTop: 8 }}>
                  Ajuste o limite para começar a acompanhar.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

        </>
      ) : null}

      {secaoAtiva === "guardar" ? (
        <div className="card mt">
          <CabecalhoSecao
            titulo="Guardar dinheiro"
            subtitulo="Aqui ficam as ações para movimentar sua reserva."
          />

          <div style={{ marginTop: 12 }}>
            <div className="muted small" style={{ marginBottom: 10 }}>
              Ações rápidas
            </div>

            <div style={actionGridStyle}>
              <button
                type="button"
                className="primary-btn"
                onClick={() => setAddOpen(true)}
                style={{ ...actionBtnBase, ...softBlueStrong }}
              >
                ➕ Adicionar
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={() => setRetOpen(true)}
                style={{ ...actionBtnBase, ...softBlue }}
              >
                ➖ Retirar
              </button>

              <button
                type="button"
                className="toggle-btn"
                onClick={abrirReset}
                style={{
                  ...actionBtnBase,
                  background: "rgba(239,68,68,.10)",
                  border: "1px solid rgba(239,68,68,.25)",
                }}
              >
                ♻️ Reiniciar
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            <div style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 12 }}>
              <div className="muted small">Total guardado</div>
              <strong>{formatCurrency(totalGuardado)}</strong>
            </div>

            <div style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 12 }}>
              <div className="muted small">Neste ciclo</div>
              <strong>{formatCurrency(totalNoCiclo)}</strong>
            </div>
          </div>
        </div>
      ) : null}

      {/* LOCAIS */}
      {secaoAtiva === "locais" ? (
        <div className="card mt" style={{ overflow: "hidden" }}>
          <CabecalhoSecao
            titulo="Locais"
            subtitulo="Clique em um local para ver opções, editar ou abrir o histórico dele."
          />

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button
              type="button"
              className="toggle-btn"
              onClick={() => setNovoLocalOpen(true)}
              title="Novo local"
            >
              📌 Adicionar local
            </button>
          </div>

          {locaisAtivos.length === 0 ? (
            <p className="muted small">Adicione um local para começar.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {locaisAtivos.map((l) => {
                const investido = toNum(l.valor);
                const meta = toNum(l.meta);
                const falta = Math.max(0, meta - investido);
                const perc = meta > 0 ? clamp((investido / meta) * 100, 0, 100) : 0;
                const aberto = localAbertoId === l.id;

                return (
                  <div key={l.id} style={localCard}>
                    <button
                      type="button"
                      className="toggle-btn"
                      onClick={() => setLocalAbertoId(aberto ? "" : l.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: 0,
                        background: "transparent",
                        border: "none",
                      }}
                    >
                      <div style={localTop}>
                        <div style={localTitle}>
                          <div style={localName}>{l.nome}</div>
                          <div style={localInfoLine} className="muted">
                            Guardado: <strong>{formatCurrency(investido)}</strong>{" "}
                            <span style={{ opacity: 0.7 }}>·</span>{" "}
                            Falta: <strong>{formatCurrency(falta)}</strong>
                          </div>
                        </div>

                        <span style={{ fontSize: 18 }}>{aberto ? "▲" : "▼"}</span>
                      </div>

                      {meta > 0 ? (
                        <div style={{ ...progressRow, marginTop: 10 }}>
                          <div style={progressBarOuter}>
                            <div
                              style={{
                                width: `${perc.toFixed(0)}%`,
                                height: "100%",
                                background: "rgba(59,130,246,.55)",
                              }}
                            />
                          </div>
                          <div style={progressLabel}>{perc.toFixed(0)}%</div>
                        </div>
                      ) : null}
                    </button>

                    {aberto ? (
                      <div
                        style={{
                          display: "grid",
                          gap: 12,
                          paddingTop: 12,
                          borderTop: "1px solid rgba(255,255,255,.08)",
                        }}
                      >
                        <div style={inputWrap}>
                          <span style={labelSmall} className="muted">
                            Editar meta deste local (R$)
                          </span>
                          <input
                            style={inputStyle}
                            className="input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.meta}
                            onChange={(e) =>
                              alterarLocalCampo(l.id, {
                                meta: Math.max(0, toNum(e.target.value)),
                              })
                            }
                          />
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                            gap: 8,
                          }}
                        >
                          <button
                            type="button"
                            className="toggle-btn"
                            onClick={() => setHistoricoLocalId(l.id)}
                          >
                            🕘 Ver histórico
                          </button>

                          <button
                            type="button"
                            className="toggle-btn"
                            onClick={() => marcarConcluido(l.id)}
                          >
                            ✅ Concluir
                          </button>

                          <button
                            type="button"
                            className="toggle-btn"
                            onClick={() => abrirApagarLocal(l.id)}
                            style={{
                              background: "rgba(239,68,68,.10)",
                              border: "1px solid rgba(239,68,68,.25)",
                            }}
                          >
                            🗑️ Apagar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {locaisConcluidos.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <h4 style={{ marginBottom: 6 }}>Concluídos</h4>
              <p className="muted small">Serão removidos automaticamente após 7 dias.</p>

              <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                {locaisConcluidos.map((l) => {
                  const doneAt = l.doneAt ? new Date(l.doneAt) : null;
                  const dias = doneAt ? daysBetween(doneAt.getTime(), Date.now()) : 0;
                  const faltam = Math.max(0, 7 - dias);

                  return (
                    <div key={l.id} style={localCard}>
                      <button
                        type="button"
                        className="toggle-btn"
                        onClick={() => setLocalAbertoId(localAbertoId === l.id ? "" : l.id)}
                        style={{ width: "100%", textAlign: "left" }}
                      >
                        <strong>{l.nome}</strong>
                        <div className="muted small">
                          Remove em ~{faltam} dia(s)
                        </div>
                      </button>

                      {localAbertoId === l.id ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          <button
                            type="button"
                            className="toggle-btn"
                            onClick={() => setHistoricoLocalId(l.id)}
                          >
                            🕘 Ver histórico
                          </button>
                          <button
                            type="button"
                            className="toggle-btn"
                            onClick={() => marcarConcluido(l.id)}
                          >
                            ↩️ Reabrir
                          </button>
                          <button
                            type="button"
                            className="toggle-btn"
                            onClick={() => abrirApagarLocal(l.id)}
                          >
                            🗑️ Apagar agora
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* HISTÓRICO */}
      {secaoAtiva === "historico" ? (
        <div className="card mt">
          <CabecalhoSecao
            titulo="Histórico"
            subtitulo="Movimentações e onde seu dinheiro está guardado."
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
              marginBottom: 14,
            }}
          >
            {locais.map((l) => (
              <button
                type="button"
                className="toggle-btn"
                key={l.id}
                onClick={() => setHistoricoLocalId(l.id)}
                style={{
                  textAlign: "left",
                  minHeight: 70,
                  padding: 12,
                }}
              >
                <div className="muted small">Guardado em</div>
                <strong>{l.nome}</strong>
                <div style={{ marginTop: 4 }}>{formatCurrency(l.valor)}</div>
              </button>
            ))}
          </div>

          {movimentos.length === 0 ? (
            <p className="muted small">Nenhuma entrada ou retirada registrada ainda.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {movimentos.map((m) => {
                const entrada = Number(m.valor || 0) >= 0;

                return (
                  <div
                    key={m.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 12,
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,.08)",
                      background: "rgba(255,255,255,.025)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        className="muted small"
                        style={{ marginBottom: 3, overflowWrap: "anywhere" }}
                      >
                        {entrada ? "Entrada em" : "Retirada de"}{" "}
                        <strong>{nomeLocal(m.localId)}</strong>
                      </div>

                      <strong style={{ fontSize: 17 }}>
                        {formatCurrency(m.valor)}
                      </strong>

                      <div
                        className="muted small"
                        style={{ marginTop: 4, overflowWrap: "anywhere" }}
                      >
                        {detalheMovimento(m)}
                      </div>
                    </div>

                    <div className="muted small" style={{ textAlign: "right" }}>
                      <div>{new Date(m.dataHora).toLocaleDateString("pt-BR")}</div>
                      <div>
                        {new Date(m.dataHora).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

    </div>
  );
}
