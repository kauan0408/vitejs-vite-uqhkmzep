// ✅ Arquivo: src/pages/CartoesCreditoPage.jsx
// ✅ Esta página mostra seus cartões, calcula fatura do mês selecionado, calcula limite disponível,
// ✅ permite cadastrar/editar/excluir cartão e registrar pagamentos via modal.

import React, { useMemo, useState } from "react";
import { useFinance } from "../../App.jsx";

// ✅ Formata qualquer valor numérico para moeda BRL (R$ 0,00)
function formatCurrency(value) {
  const num = Number(value || 0);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ✅ Converte valor digitado (string/number) em número.
// ✅ Aceita vírgula como separador decimal e evita NaN retornando 0.
function parseMoney(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// ✅ Garante que um número fique entre min e max.
// ✅ Se vier algo inválido, retorna min.
function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

// ✅ Gera um id simples e único para cartões/transações
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ✅ Converte vários formatos possíveis de data para Date:
// - null/undefined => Date inválida
// - number => timestamp
// - string só com números => timestamp
// - string ISO ou data comum => new Date(string)
function parseDateValue(value) {
  if (value == null) return new Date(NaN);
  if (typeof value === "number") return new Date(value);
  const s = String(value).trim();
  if (/^\d+$/.test(s)) return new Date(Number(s));
  return new Date(s);
}

// ✅ Gera a chave do mês no formato "YYYY-MM" com base numa Date
function monthKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ✅ Soma "add" meses em uma Date (mantendo o objeto original intacto)
function addMonthsToDate(dateObj, add) {
  const d = new Date(dateObj.getTime());
  d.setMonth(d.getMonth() + add);
  return d;
}

// ✅ Soma "add" meses em uma chave "YYYY-MM" e devolve a nova chave "YYYY-MM"
function addMonthsToKey(yyyyMM, add) {
  const [y, m] = yyyyMM.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  d.setMonth(d.getMonth() + add);
  return monthKeyFromDate(d);
}

// ✅ Define em qual fatura (YYYY-MM) a compra entra, com base no "dia do cartão".
// ✅ Se a compra for depois do dia do cartão, ela cai no mês seguinte.
function calcFaturaRef(dataHora, diaDoCartao) {
  const d = parseDateValue(dataHora);
  if (isNaN(d.getTime())) return null;

  const corte = clamp(diaDoCartao || 1, 1, 31);
  const diaCompra = d.getDate();
  const baseKey = monthKeyFromDate(d);

  return diaCompra > corte ? addMonthsToKey(baseKey, 1) : baseKey;
}

// ✅ Caixinha de mensagem/erro com botão de fechar
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
        marginBottom: 10,
      }}
    >
      <span>{text}</span>
      <button
        type="button"
        className="toggle-btn"
        onClick={onClose}
        style={{ width: "auto", padding: "6px 10px" }}
        aria-label="Fechar"
        title="Fechar"
      >
        ✖
      </button>
    </div>
  );
}

// ✅ Componente principal da página de cartões
export default function CartoesCreditoPage() {
  // ✅ Pega do contexto: cartões, transações, e funções para alterar o estado global
  const {
    cartoes,
    transacoes,
    adicionarCartao,
    atualizarCartoes,
    adicionarTransacao,
    mesReferencia,
  } = useFinance();

  // ✅ Garante que "cartoes" e "transacoes" sejam arrays para evitar quebra do app
  const cartoesSafe = Array.isArray(cartoes) ? cartoes : [];
  const transacoesSafe = Array.isArray(transacoes) ? transacoes : [];

  // ✅ Data atual (usada em cálculos como "diaChegou")
  const hoje = new Date();

  // ✅ Calcula a chave do mês selecionado na tela (YYYY-MM)
  // ✅ Usa mesReferencia do app; se não existir, cai no mês atual
  const chaveMesSelecionado = useMemo(() => {
    const ano = mesReferencia?.ano ?? hoje.getFullYear();
    const mes = mesReferencia?.mes ?? hoje.getMonth();
    return `${ano}-${String(mes + 1).padStart(2, "0")}`;
  }, [mesReferencia, hoje]);

  // ✅ Mensagens de feedback (ex: "Cartão salvo", "Erro", etc.)
  const [mensagem, setMensagem] = useState("");

  // ✅ Controle do formulário de cadastro
  const [mostrarCadastro, setMostrarCadastro] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoLimite, setNovoLimite] = useState("");
  const [novoDiaCartao, setNovoDiaCartao] = useState("");

  // ✅ Estado de edição (quando clicou em "Editar" em um cartão)
  const [editando, setEditando] = useState(null);

  // ✅ Guarda qual cartão está sendo confirmado para excluir
  const [confirmarExcluirId, setConfirmarExcluirId] = useState(null);

  // ✅ Estado do modal de pagamento (abre ao clicar em "Pagar" ou "Adiantar")
  const [modalPagar, setModalPagar] = useState(null);

  // ✅ "resumo" é a lista de cartões com cálculos prontos:
  // - compras do mês
  // - pagamentos do mês
  // - ✅ saldo em aberto ATÉ o mês selecionado (não zera ao virar o mês)
  // - comprometido total (impacta limite até pagar)
  // - limite disponível
  // - percentual usado
  // - se o dia do cartão já chegou
  const resumo = useMemo(() => {
    function expandComprasCreditoDoCartao(cartaoId, diaDoCartao) {
      const comprasBase = transacoesSafe.filter(
        (t) =>
          t?.tipo === "despesa" &&
          t?.formaPagamento === "credito" &&
          t?.cartaoId === cartaoId
      );

      const out = [];

      for (const t of comprasBase) {
        const dt = parseDateValue(t.dataHora);
        if (isNaN(dt.getTime())) continue;

        const parcelasTotal = clamp(t?.parcelasTotal ?? t?.parcelas ?? 0, 0, 60);
        const parcelaNumero = clamp(t?.parcelaNumero ?? 0, 0, 60);

        const valorOriginal = Number(t.valor || 0);
        const valorParcela =
          Number.isFinite(Number(t?.valorParcela)) && Number(t.valorParcela) > 0
            ? Number(t.valorParcela)
            : parcelasTotal > 1
            ? valorOriginal / parcelasTotal
            : valorOriginal;

        if (parcelasTotal > 1 && parcelaNumero >= 1) {
          const faturaRef = calcFaturaRef(t.dataHora, diaDoCartao);
          if (!faturaRef) continue;

          out.push({
            ...t,
            valor: valorParcela,
            _faturaRef: faturaRef,
            _parcelaLabel: `(${parcelaNumero}/${parcelasTotal})`,
          });
          continue;
        }

        if (parcelasTotal > 1 && parcelaNumero === 0) {
          for (let i = 0; i < parcelasTotal; i++) {
            const dtParcela = addMonthsToDate(dt, i);
            const dataHoraParcela = dtParcela.toISOString();
            const faturaRef = calcFaturaRef(dataHoraParcela, diaDoCartao);
            if (!faturaRef) continue;

            out.push({
              ...t,
              id: `${t.id || "tx"}_parc_${i + 1}_${parcelasTotal}`,
              valor: valorParcela,
              dataHora: dataHoraParcela,
              _faturaRef: faturaRef,
              _parcelaLabel: `(${i + 1}/${parcelasTotal})`,
              _virtual: true,
            });
          }
          continue;
        }

        const faturaRef = calcFaturaRef(t.dataHora, diaDoCartao);
        if (!faturaRef) continue;

        out.push({
          ...t,
          _faturaRef: faturaRef,
          _parcelaLabel: "",
        });
      }

      return out;
    }

    return cartoesSafe.map((c) => {
      const cartaoId = c.id;
      const limite = Number(c?.limite || 0);

      const diaDoCartao = clamp(
        c?.diaVencimento ?? c?.diaFechamento ?? 1,
        1,
        31
      );

      const comprasCredito = expandComprasCreditoDoCartao(cartaoId, diaDoCartao);

      const pagamentos = transacoesSafe
        .filter((t) => t?.tipo === "pagamentoCartao" && t?.cartaoId === cartaoId)
        .map((t) => {
          const d = parseDateValue(t.dataHora);
          const fallback = isNaN(d.getTime()) ? null : monthKeyFromDate(d);
          const faturaRef = t?.faturaRef || fallback;
          return { ...t, _faturaRef: faturaRef };
        })
        .filter((t) => t._faturaRef);

      // ==========================
      // ✅ MÊS SELECIONADO (apenas)
      // ==========================
      const comprasMes = comprasCredito.filter(
        (t) => t._faturaRef === chaveMesSelecionado
      );
      const totalComprasMes = comprasMes.reduce(
        (s, t) => s + Number(t.valor || 0),
        0
      );

      const pagamentosMes = pagamentos.filter(
        (t) => t._faturaRef === chaveMesSelecionado
      );
      const totalPagamentosMes = pagamentosMes.reduce(
        (s, t) => s + Number(t.valor || 0),
        0
      );

      // ==========================================
      // ✅ EM ABERTO ATÉ O MÊS SELECIONADO (carry)
      // (isso evita zerar quando muda o mês)
      // ==========================================
      const comprasAteMes = comprasCredito.filter(
        (t) => t._faturaRef <= chaveMesSelecionado
      );
      const totalComprasAteMes = comprasAteMes.reduce(
        (s, t) => s + Number(t.valor || 0),
        0
      );

      const pagamentosAteMes = pagamentos.filter(
        (t) => t._faturaRef <= chaveMesSelecionado
      );
      const totalPagamentosAteMes = pagamentosAteMes.reduce(
        (s, t) => s + Number(t.valor || 0),
        0
      );

      const saldoAteMes = Math.max(0, totalComprasAteMes - totalPagamentosAteMes);

      // ==========================================
      // ✅ COMPROMETIDO TOTAL (impacta limite sempre)
      // ==========================================
      const totalComprasAll = comprasCredito.reduce(
        (s, t) => s + Number(t.valor || 0),
        0
      );
      const totalPagamentosAll = pagamentos.reduce(
        (s, t) => s + Number(t.valor || 0),
        0
      );

      const comprometido = Math.max(0, totalComprasAll - totalPagamentosAll);

      const limiteDisponivel = limite - comprometido;

      const perc = limite > 0 ? Math.min(100, (comprometido / limite) * 100) : 0;

      const diaChegou = hoje.getDate() >= diaDoCartao;

      return {
        ...c,
        limite,
        diaDoCartao,
        totalComprasMes,
        totalPagamentosMes,
        // ✅ antes: faturaAberta do mês; agora: mantém saldo em aberto até o mês selecionado
        faturaAberta: saldoAteMes,
        saldoAteMes,
        comprometido,
        limiteDisponivel,
        perc,
        diaChegou,
      };
    });
  }, [cartoesSafe, transacoesSafe, chaveMesSelecionado, hoje]);

  function cadastrarCartao(e) {
    e.preventDefault();
    setMensagem("");

    const nome = (novoNome || "").trim();
    if (!nome) {
      setMensagem("Digite o nome do cartão.");
      return;
    }

    if (typeof adicionarCartao !== "function") {
      setMensagem("Erro: adicionarCartao() não está disponível.");
      return;
    }

    const limite = parseMoney(novoLimite);
    const diaDoCartao = clamp(novoDiaCartao || 1, 1, 31);

    adicionarCartao({
      id: generateId(),
      nome,
      limite,
      diaVencimento: diaDoCartao,
      diaFechamento: diaDoCartao,
    });

    setNovoNome("");
    setNovoLimite("");
    setNovoDiaCartao("");
    setMostrarCadastro(false);

    setMensagem("Cartão salvo.");
  }

  function iniciarEdicao(cartao) {
    setMensagem("");
    setEditando({
      id: cartao.id,
      nome: cartao.nome || "",
      limite: String(cartao.limite || ""),
      diaDoCartao: String(cartao.diaDoCartao || cartao.diaVencimento || 1),
    });
  }

  function salvarEdicao() {
    setMensagem("");
    if (!editando) return;

    if (typeof atualizarCartoes !== "function") {
      setMensagem("Erro: atualizarCartoes() não está disponível.");
      return;
    }

    const id = editando.id;
    const diaDoCartao = clamp(editando.diaDoCartao || 1, 1, 31);

    const novos = cartoesSafe.map((c) =>
      c.id === id
        ? {
            ...c,
            nome: (editando.nome || "").trim(),
            limite: parseMoney(editando.limite),
            diaVencimento: diaDoCartao,
            diaFechamento: diaDoCartao,
          }
        : c
    );

    atualizarCartoes(novos);
    setEditando(null);

    setMensagem("Alterações salvas.");
  }

  function excluirCartaoConfirmado() {
    setMensagem("");
    if (!confirmarExcluirId) return;

    if (typeof atualizarCartoes !== "function") {
      setMensagem("Erro: atualizarCartoes() não está disponível.");
      return;
    }

    atualizarCartoes(cartoesSafe.filter((c) => c.id !== confirmarExcluirId));
    setConfirmarExcluirId(null);

    setMensagem("Cartão removido.");
  }

  function abrirModalPagamento(cartao, titulo) {
    setMensagem("");
    if (typeof adicionarTransacao !== "function") {
      setMensagem("Erro: adicionarTransacao() não está disponível.");
      return;
    }

    // ✅ sugestão: pagar "em aberto até o mês selecionado"
    const sugerido = Number(cartao?.saldoAteMes ?? cartao?.faturaAberta ?? 0);

    setModalPagar({
      cartaoId: cartao.id,
      titulo,
      valorSugerido: sugerido,
      valorDigitado: 0,
      faturaRef: chaveMesSelecionado,
      erro: "",
    });
  }

  function confirmarPagamento() {
    if (!modalPagar) return;

    const valor = parseMoney(modalPagar.valorDigitado);
    if (!valor || valor <= 0) {
      setModalPagar((p) => ({ ...p, erro: "Digite um valor válido." }));
      return;
    }

    const cartao = cartoesSafe.find((c) => c.id === modalPagar.cartaoId);
    const nome = cartao?.nome || "Cartão";

    adicionarTransacao({
      id: generateId(),
      tipo: "pagamentoCartao",
      valor,
      descricao: `Pagamento cartão - ${nome}`,
      categoria: null,
      formaPagamento: "outros",
      cartaoId: modalPagar.cartaoId,
      fixo: false,
      dataHora: new Date().toISOString(),
      faturaRef: modalPagar.faturaRef,
    });

    setModalPagar(null);
    setMensagem("Pagamento registrado.");
  }

  function pagarTudoNoModal() {
    if (!modalPagar) return;

    const linha = resumo.find((r) => r.id === modalPagar.cartaoId);
    const totalAtual = Number(linha?.saldoAteMes ?? linha?.faturaAberta ?? 0);

    setModalPagar((p) => ({
      ...p,
      valorDigitado: String(totalAtual),
      erro: "",
    }));
  }

  return (
    <div className="page">
      <h2 className="page-title">Cartões</h2>

      <FeedbackBox text={mensagem} onClose={() => setMensagem("")} />

      <div className="card" style={{ textAlign: "center", marginBottom: 12 }}>
        <h3>Fatura: {chaveMesSelecionado}</h3>
        <p className="muted small" style={{ marginTop: 6 }}>
          Compras depois do <strong>Dia do cartão</strong> caem no mês seguinte.
          Parcelas entram nos próximos meses.
        </p>
      </div>

      <div className="card">
        <div className="card-header-row">
          <h3>Meus cartões</h3>
          <button
            type="button"
            className={"icon-btn " + (mostrarCadastro ? "icon-btn-active" : "")}
            onClick={() => setMostrarCadastro((v) => !v)}
          >
            {mostrarCadastro ? "−" : "+"}
          </button>
        </div>

        {mostrarCadastro && (
          <form className="form" onSubmit={cadastrarCartao}>
            <div className="field">
              <label>Nome</label>
              <input
                type="text"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex.: Nubank"
              />
            </div>

            <div className="field">
              <label>Limite</label>
              <input
                type="number"
                step="0.01"
                value={novoLimite}
                onChange={(e) => setNovoLimite(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Dia do cartão (1 a 31)</label>
              <input
                type="number"
                min="1"
                max="31"
                value={novoDiaCartao}
                onChange={(e) => setNovoDiaCartao(e.target.value)}
              />
            </div>

            <button className="primary-btn" type="submit">
              Salvar
            </button>
          </form>
        )}
      </div>

      {resumo.length === 0 ? (
        <p className="muted mt">Nenhum cartão ainda.</p>
      ) : (
        resumo.map((c) => {
          const emEdicao = editando?.id === c.id;

          // ✅ alerta: dia do cartão chegou e ainda tem saldo em aberto até o mês
          const alertaAtraso = !!c.diaChegou && Number(c.saldoAteMes || 0) > 0;

          return (
            <div key={c.id} className="card mt">
              {!emEdicao ? (
                <>
                  {alertaAtraso ? (
                    <div
                      className="card"
                      style={{
                        padding: 10,
                        marginBottom: 10,
                        border: "1px solid rgba(249,115,115,.55)",
                        background: "rgba(249,115,115,.10)",
                      }}
                    >
                      <b style={{ color: "var(--negative)" }}>⚠ Fatura em aberto</b>
                      <div className="muted small" style={{ marginTop: 4 }}>
                        Em aberto até <b>{chaveMesSelecionado}</b>:{" "}
                        <b style={{ color: "var(--negative)" }}>
                          {formatCurrency(c.saldoAteMes)}
                        </b>
                      </div>
                    </div>
                  ) : null}

                  <div className="history-day-header">
                    <div>
                      <h3>{c.nome}</h3>

                      <p className="muted small">
                        Limite: {formatCurrency(c.limite)} · Dia do cartão:{" "}
                        {c.diaDoCartao}
                      </p>

                      <p className="muted small">
                        <strong>Compras do mês:</strong>{" "}
                        {formatCurrency(c.totalComprasMes)}
                      </p>

                      <p className="muted small">
                        <strong>Pagamentos do mês:</strong>{" "}
                        {formatCurrency(c.totalPagamentosMes)}
                      </p>

                      <p className="muted small">
                        <strong>Em aberto até {chaveMesSelecionado}:</strong>{" "}
                        {formatCurrency(c.saldoAteMes)}
                      </p>
                    </div>

                    <div className="align-right">
                      <p className="history-summary-label">Disponível</p>
                      <p
                        className={
                          "history-summary-value " +
                          (c.limiteDisponivel >= 0 ? "positive" : "negative")
                        }
                      >
                        {formatCurrency(c.limiteDisponivel)}
                      </p>
                      <p className="muted small" style={{ marginTop: 2 }}>
                        Comprometido: {formatCurrency(c.comprometido)}
                      </p>
                    </div>
                  </div>

                  <div className="progress-container">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${c.perc.toFixed(0)}%` }}
                      />
                    </div>
                    <span className="progress-label">{c.perc.toFixed(0)}%</span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 10,
                      justifyContent: "flex-end",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      className="toggle-btn"
                      onClick={() => abrirModalPagamento(c, "Adiantar")}
                    >
                      💸 Adiantar
                    </button>

                    {c.diaChegou && c.saldoAteMes > 0 && (
                      <button
                        type="button"
                        className="primary-btn"
                        style={{ width: "auto", padding: "8px 14px" }}
                        onClick={() => abrirModalPagamento(c, "Pagar agora")}
                      >
                        ✅ Pagar
                      </button>
                    )}

                    <button
                      type="button"
                      className="toggle-btn"
                      onClick={() => iniciarEdicao(c)}
                    >
                      ✏️ Editar
                    </button>

                    <button
                      type="button"
                      className="toggle-btn"
                      onClick={() => setConfirmarExcluirId(c.id)}
                    >
                      🗑️ Excluir
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3>Editar</h3>

                  <div className="field">
                    <label>Nome</label>
                    <input
                      value={editando.nome}
                      onChange={(e) =>
                        setEditando((p) => ({ ...p, nome: e.target.value }))
                      }
                    />
                  </div>

                  <div className="field">
                    <label>Limite</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editando.limite}
                      onChange={(e) =>
                        setEditando((p) => ({ ...p, limite: e.target.value }))
                      }
                    />
                  </div>

                  <div className="field">
                    <label>Dia do cartão (1 a 31)</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={editando.diaDoCartao}
                      onChange={(e) =>
                        setEditando((p) => ({
                          ...p,
                          diaDoCartao: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                      marginTop: 10,
                    }}
                  >
                    <button
                      type="button"
                      className="toggle-btn"
                      onClick={() => setEditando(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={salvarEdicao}
                    >
                      Salvar
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })
      )}

      {modalPagar && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>{modalPagar.titulo}</h3>

            <p className="muted small" style={{ marginTop: 6 }}>
              Vai abater: <strong>{modalPagar.faturaRef}</strong>
            </p>

            {modalPagar.erro ? (
              <FeedbackBox
                text={modalPagar.erro}
                onClose={() => setModalPagar((p) => ({ ...p, erro: "" }))}
              />
            ) : null}

            <div className="field" style={{ marginTop: 10 }}>
              <label>Valor</label>
              <input
                type="number"
                step="0.01"
                value={modalPagar.valorDigitado}
                onChange={(e) =>
                  setModalPagar((p) => ({ ...p, valorDigitado: e.target.value }))
                }
              />
              <p className="muted small" style={{ marginTop: 6 }}>
                Sugerido: {formatCurrency(modalPagar.valorSugerido)}
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="toggle-btn"
                onClick={() => setModalPagar(null)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="toggle-btn"
                onClick={pagarTudoNoModal}
                title="Preencher com o total sugerido"
              >
                Pagar tudo
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={confirmarPagamento}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmarExcluirId && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Excluir?</h3>
            <p className="muted small">Remove o cartão, mas não apaga transações.</p>

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 12,
              }}
            >
              <button
                type="button"
                className="toggle-btn"
                onClick={() => setConfirmarExcluirId(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={excluirCartaoConfirmado}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
