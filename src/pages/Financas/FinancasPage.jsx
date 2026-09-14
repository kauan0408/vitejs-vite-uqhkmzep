// src/pages/FinancasPage.jsx

import React, { useMemo, useState, useEffect, useRef } from "react";
import { useFinance } from "../../App.jsx";
import "./FinancasPage.css";

function formatCurrency(value) {
  const num = Number(value || 0);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ==================== ✅ DIAS ÚTEIS (seg-sex, sem feriados) ==================== */
function isBusinessDay(d) {
  const day = d.getDay(); // 0 dom, 6 sáb
  return day !== 0 && day !== 6;
}

function nthBusinessDayOfMonth(year, month0, n) {
  const N = Number(n || 0);
  if (!N || N < 1) return null;

  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(year, month0, day);
    if (d.getMonth() !== month0) break; // passou do mês
    if (isBusinessDay(d)) {
      count++;
      if (count === N) return d;
    }
  }

  // fallback: último dia útil do mês
  for (let day = 31; day >= 1; day--) {
    const d = new Date(year, month0, day);
    if (d.getMonth() !== month0) continue;
    if (isBusinessDay(d)) return d;
  }

  return new Date(year, month0, 1);
}

function startOfDay0(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDaysSafe(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + Number(days || 0));
  return x;
}

/**
 * Ciclo por "N-ésimo dia útil":
 * - começo do ciclo: (N-ésimo dia útil do mês) + 1 dia (ex: 5º dia útil -> começa dia seguinte)
 * - fim do ciclo: N-ésimo dia útil do próximo mês (exclusivo)
 */
function cycleRangeByBusinessPayDay(year, month0, nthBiz) {
  const payThis = nthBusinessDayOfMonth(year, month0, nthBiz);
  if (!payThis) return null;

  const start = startOfDay0(addDaysSafe(payThis, 1)); // começa no dia seguinte ao pagamento

  const nextMonth0 = month0 === 11 ? 0 : month0 + 1;
  const nextYear = month0 === 11 ? year + 1 : year;
  const payNext = nthBusinessDayOfMonth(nextYear, nextMonth0, nthBiz) || new Date(nextYear, nextMonth0, 1);

  const end = startOfDay0(payNext); // exclusivo
  return { start, end, payThis: startOfDay0(payThis), payNext };
}

/* ✅ Próximo pagamento (N-ésimo dia útil) */
function calcularProximoPagamento(diaPagamento) {
  const nth = Number(diaPagamento);
  if (!nth || nth < 1 || nth > 31) return null;

  const hoje = new Date();
  const today0 = startOfDay0(hoje);

  const y = hoje.getFullYear();
  const m0 = hoje.getMonth();

  const payThis = nthBusinessDayOfMonth(y, m0, nth);
  if (!payThis) return null;

  const payThis0 = startOfDay0(payThis);

  let proximo = payThis0;

  // se já passou do pagamento deste mês, vai pro do próximo mês
  if (today0.getTime() > payThis0.getTime()) {
    const mNext = m0 === 11 ? 0 : m0 + 1;
    const yNext = m0 === 11 ? y + 1 : y;
    const payNext = nthBusinessDayOfMonth(yNext, mNext, nth);
    if (!payNext) return null;
    proximo = startOfDay0(payNext);
  }

  const diffMs = proximo.getTime() - today0.getTime();
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return { data: proximo, diasRestantes: diffDias };
}

function getValorFixo(valoresPorMes = {}, chaveMes) {
  if (valoresPorMes && valoresPorMes[chaveMes] != null) {
    return Number(valoresPorMes[chaveMes]);
  }
  const meses = Object.keys(valoresPorMes || {}).sort();
  let ultimo = null;
  for (const m of meses) {
    if (m <= chaveMes) ultimo = m;
  }
  return ultimo ? Number(valoresPorMes[ultimo]) : 0;
}

function normalizarNome(descricao) {
  return String(descricao || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeText(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function isFood(desc) {
  const d = normalizeText(desc);
  const keys = [
    "ifood",
    "i food",
    "lanche",
    "comida",
    "cafe",
    "café",
    "cafe da tarde",
    "café da tarde",
    "almoco",
    "almoço",
    "jantar",
    "refri",
    "refrigerante",
    "coca",
    "guarana",
    "guaraná",
    "miojo",
    "doce",
    "pudim",
    "risoto",
    "salgado",
    "pizza",
    "hamburguer",
    "hambúrguer",
    "sorvete",
    "acai",
    "açaí",
  ];
  return keys.some((k) => d.includes(normalizeText(k)));
}
function isTransport(desc) {
  const d = normalizeText(desc);
  const keys = ["uber", "99", "taxi", "táxi", "onibus", "ônibus", "passagem", "transporte", "corrida"];
  return keys.some((k) => d.includes(normalizeText(k)));
}

function monthKey(ano, mes0) {
  return `${ano}-${String(mes0 + 1).padStart(2, "0")}`;
}
function prevMonth(ano, mes0) {
  let y = ano;
  let m = mes0 - 1;
  if (m < 0) {
    m = 11;
    y = ano - 1;
  }
  return { ano: y, mes: m };
}

function ehOrcamentoVariavel(gasto) {
  return gasto?.modo === "orcamento" || gasto?.tipoGasto === "orcamento";
}

function transacaoEhDeAcerto(transacao) {
  const origem = String(
    transacao?.origemMovimento || transacao?.origem || ""
  ).toLowerCase();

  return (
    origem === "quem_me_deve" ||
    origem === "quem-me-deve" ||
    origem === "acertos" ||
    transacao?.ehAcerto === true
  );
}

// No modo automático, o valor entra na despesa do mês como já acontecia.
// No modo manual, ele só entra depois que a pessoa confirma "Já paguei".
// O campo "pagamentoManualDesde" impede que a troca de modo altere meses antigos.
function gastoFixoDeveEntrarNoMes(gasto, chaveMes) {
  if (!gasto?.pagamentoManual) return true;

  const inicioManual = gasto.pagamentoManualDesde || chaveMes;
  if (chaveMes < inicioManual) return true;

  return gasto?.pagamentosManuais?.[chaveMes] === true;
}

function gastoFixoFoiPagoManualNoMes(gasto, chaveMes) {
  return gasto?.pagamentosManuais?.[chaveMes] === true;
}

function transacaoPertenceAoOrcamento(transacao, gasto) {
  if (!transacao || !gasto) return false;

  const orcamentoId =
    transacao.orcamentoMensalId ||
    transacao.orcamentoId ||
    transacao.gastoVariavelId;

  if (orcamentoId) {
    return String(orcamentoId) === String(gasto.id);
  }

  const descricao = normalizeText(transacao.descricao);
  const nome = normalizeText(gasto.nome);

  if (!descricao || !nome) return false;

  return (
    descricao === nome ||
    descricao.startsWith(`${nome} `) ||
    descricao.endsWith(` ${nome}`) ||
    descricao.includes(` ${nome} `)
  );
}

function resumoOrcamentoNoMes(gasto, transacoes, chaveMesAlvo) {
  const valoresPorMes = gasto?.valoresPorMes || {};
  const mesesConfigurados = Object.keys(valoresPorMes)
    .filter((chave) => /^\d{4}-\d{2}$/.test(chave))
    .sort();

  const primeiroMes = mesesConfigurados[0] || chaveMesAlvo;

  if (!/^\d{4}-\d{2}$/.test(chaveMesAlvo) || chaveMesAlvo < primeiroMes) {
    return {
      orcamentoBase: 0,
      saldoAnterior: 0,
      disponivel: 0,
      gasto: 0,
      saldoFinal: 0,
      restante: 0,
      excedente: 0,
    };
  }

  const [anoInicial, mesInicial] = primeiroMes.split("-").map(Number);
  const [anoAlvo, mesAlvo] = chaveMesAlvo.split("-").map(Number);
  const cursor = new Date(anoInicial, mesInicial - 1, 1);
  const fim = new Date(anoAlvo, mesAlvo - 1, 1);
  let saldoCarregado = 0;
  let resultado = null;
  let protecao = 0;

  while (cursor <= fim && protecao < 240) {
    const chaveMes = monthKey(cursor.getFullYear(), cursor.getMonth());
    const orcamentoBase = getValorFixo(valoresPorMes, chaveMes);
    const saldoAnterior = saldoCarregado;
    const disponivel = orcamentoBase + saldoAnterior;

    const gastoReal = (Array.isArray(transacoes) ? transacoes : [])
      .filter((transacao) => {
        if (transacao?.tipo !== "despesa") return false;
        if (transacao?.origemMovimento === "reserva") return false;
        if (!transacaoPertenceAoOrcamento(transacao, gasto)) return false;

        const data = new Date(transacao.dataHora || transacao.data);
        if (Number.isNaN(data.getTime())) return false;

        return (
          data.getFullYear() === cursor.getFullYear() &&
          data.getMonth() === cursor.getMonth()
        );
      })
      .reduce((total, transacao) => total + Number(transacao.valor || 0), 0);

    const saldoFinal = disponivel - gastoReal;
    const carregaPositivo = gasto?.carregarSaldoPositivo !== false;
    const carregaNegativo = gasto?.carregarSaldoNegativo !== false;

    resultado = {
      orcamentoBase,
      saldoAnterior,
      disponivel,
      gasto: gastoReal,
      saldoFinal,
      restante: Math.max(0, saldoFinal),
      excedente: Math.max(0, -saldoFinal),
    };

    saldoCarregado =
      saldoFinal > 0
        ? carregaPositivo
          ? saldoFinal
          : 0
        : carregaNegativo
          ? saldoFinal
          : 0;

    cursor.setMonth(cursor.getMonth() + 1);
    protecao += 1;
  }

  return resultado || {
    orcamentoBase: 0,
    saldoAnterior: 0,
    disponivel: 0,
    gasto: 0,
    saldoFinal: 0,
    restante: 0,
    excedente: 0,
  };
}


function inicioDaSemana(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);

  // Segunda-feira como primeiro dia da semana.
  const diaSemana = d.getDay();
  const diferenca = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + diferenca);

  return d;
}

function fimDaSemana(data) {
  const d = inicioDaSemana(data);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function numeroSemanaISO(data) {
  const d = new Date(Date.UTC(
    data.getFullYear(),
    data.getMonth(),
    data.getDate()
  ));

  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);

  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));

  return Math.ceil(
    (((d - inicioAno) / 86400000) + 1) / 7
  );
}

function formatarDiaMes(data) {
  return new Date(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function montarSemanasDoMes(ano, mes0) {
  const primeiroDia = new Date(ano, mes0, 1);
  const ultimoDia = new Date(ano, mes0 + 1, 0);

  const primeiraSegunda = inicioDaSemana(primeiroDia);
  const ultimaSemana = inicioDaSemana(ultimoDia);

  const semanas = [];
  const cursor = new Date(primeiraSegunda);

  while (cursor.getTime() <= ultimaSemana.getTime()) {
    const inicio = new Date(cursor);
    const fim = fimDaSemana(inicio);

    semanas.push({
      chave: `${inicio.getFullYear()}-${String(
        inicio.getMonth() + 1
      ).padStart(2, "0")}-${String(inicio.getDate()).padStart(2, "0")}`,
      numero: numeroSemanaISO(inicio),
      inicio,
      fim,
      rotulo: `${formatarDiaMes(inicio)} a ${formatarDiaMes(fim)}`,
    });

    cursor.setDate(cursor.getDate() + 7);
  }

  return semanas;
}

/* -------------------- helpers para lembretes + estudos -------------------- */
function pad2(n) {
  return String(n).padStart(2, "0");
}
function toLocalDateKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}
function startOfDay(dateObj) {
  const d = new Date(dateObj);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(dateObj) {
  const d = new Date(dateObj);
  d.setHours(23, 59, 59, 999);
  return d;
}
function addDays(dateObj, days) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}
function parseLocalDateTime(v) {
  try {
    const [datePart, timePart] = String(v || "").split("T");
    if (!datePart || !timePart) return null;
    const [y, m, d] = datePart.split("-").map(Number);
    const [hh, mm] = timePart.split(":").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  } catch {
    return null;
  }
}
function fmtShortBR(d) {
  try {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "";
    return x.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}
function fmtTimeHHmm(d) {
  try {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "";
    return x.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/* ✅ Notificação topo */
async function showTopBarNotification(title, body, tag = "finance-agenda") {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, { body, tag, renotify: true });
        return;
      }
    }
  } catch {}

  try {
    new Notification(title, { body });
  } catch {}
}

/* -------------------- ✅ Recorrência (fallback) -------------------- */
function computeNextDueFallback(item, baseDate = new Date()) {
  const every =
    Number(
      item?.every ??
        item?.aCada ??
        item?.interval ??
        item?.intervalo ??
        item?.intervalDays ??
        item?.dias ??
        0
    ) || 1;

  const unitRaw = String(
    item?.unit ?? item?.unidade ?? item?.periodo ?? item?.freq ?? item?.frequencia ?? "dias"
  ).toLowerCase();

  const b = new Date(baseDate);
  if (Number.isNaN(b.getTime())) return new Date();

  if (unitRaw.includes("sem")) {
    b.setDate(b.getDate() + every * 7);
    return b;
  }
  if (unitRaw.includes("mes")) {
    b.setMonth(b.getMonth() + every);
    return b;
  }
  if (unitRaw.includes("ano")) {
    b.setFullYear(b.getFullYear() + every);
    return b;
  }
  b.setDate(b.getDate() + every);
  return b;
}

/* -------------------- ✅ CLASSIFICAÇÕES DETALHADAS (para o modal do mês) -------------------- */
function includesAny(text, arr) {
  const t = normalizeText(text);
  return (arr || []).some((k) => t.includes(normalizeText(k)));
}

function classifyGroup(descricao, categoriaRaw = "") {
  const d = String(descricao || "");
  const cat = String(categoriaRaw || "").toLowerCase();

  // prioridade por “categoria” do app
  if (cat === "investido") return "INVESTIMENTOS";
  if (cat === "burrice") return "GASTOS_EMOCIONAIS";

  // por palavras-chave
  if (
    includesAny(d, [
      "aluguel",
      "financiamento",
      "condominio",
      "condomínio",
      "iptu",
      "energia",
      "luz",
      "copasa",
      "agua",
      "água",
      "cemig",
      "gás",
      "gas",
      "internet",
      "wifi",
      "manutenção",
      "manutencao",
      "encanador",
      "eletricista",
      "seguro residencial",
      "móveis",
      "moveis",
      "utensílios",
      "utensilios",
    ])
  )
    return "MORADIA";

  if (
    includesAny(d, [
      "combustivel",
      "combustível",
      "gasolina",
      "etanol",
      "diesel",
      "uber",
      "99",
      "taxi",
      "táxi",
      "ônibus",
      "onibus",
      "passagem",
      "estacionamento",
      "pedágio",
      "pedagio",
      "ipva",
      "seguro do carro",
      "seguro carro",
      "multa",
      "multas",
      "mecânico",
      "mecanico",
      "oficina",
      "parcela do carro",
      "parcela carro",
    ])
  )
    return "TRANSPORTE";

  if (
    includesAny(d, [
      "supermercado",
      "mercado",
      "feira",
      "açougue",
      "acougue",
      "padaria",
      "ifood",
      "i food",
      "delivery",
      "restaurante",
      "lanches",
      "lanche",
      "café",
      "cafe",
      "água mineral",
      "agua mineral",
      "almoço",
      "almoco",
      "jantar",
    ]) ||
    isFood(d)
  )
    return "ALIMENTACAO";

  if (
    includesAny(d, [
      "plano de saúde",
      "plano de saude",
      "consulta",
      "consultas",
      "exame",
      "exames",
      "medicamento",
      "medicamentos",
      "farmacia",
      "farmácia",
      "dentista",
      "psicologo",
      "psicólogo",
      "academia",
      "suplemento",
      "suplementos",
      "terapia",
      "hospital",
      "clinica",
      "clínica",
    ])
  )
    return "SAUDE";

  if (
    includesAny(d, [
      "mensalidade",
      "curso",
      "cursos",
      "livro",
      "livros",
      "material escolar",
      "plataforma",
      "concurso",
      "certificado",
      "certificados",
      "evento",
      "eventos",
      "faculdade",
      "escola",
      "apostila",
    ]) ||
    cat === "educacao"
  )
    return "EDUCACAO";

  if (includesAny(d, ["roupa", "roupas", "sapato", "sapatos", "acessorio", "acessório", "uniforme", "costureira"]))
    return "VESTUARIO";

  if (
    includesAny(d, ["cinema", "streaming", "netflix", "spotify", "show", "shows", "viagem", "viagens", "passeio", "jogo", "jogos"]) ||
    cat === "lazer"
  )
    return "LAZER";

  if (
    includesAny(d, [
      "juros",
      "tarifa",
      "iof",
      "empréstimo",
      "emprestimo",
      "financiamento",
      "consórcio",
      "consorcio",
      "parcela",
      "parcelas",
      "fatura",
      "cartão",
      "cartao",
      "banco",
    ])
  )
    return "FINANCEIRO";

  if (includesAny(d, ["presente", "presentes", "aniversario", "aniversário", "data comemorativa", "doação", "doacao", "igreja", "dizimo", "dízimo", "contribuicao", "contribuição"]))
    return "PRESENTES_E_EVENTOS";

  if (
    includesAny(d, [
      "filho",
      "filhos",
      "família",
      "familia",
      "transporte escolar",
      "mesada",
      "lazer infantil",
      "saúde infantil",
      "saude infantil",
    ])
  )
    return "FAMILIA";

  if (includesAny(d, ["ração", "racao", "veterinario", "veterinário", "banho", "tosa", "pet", "vacina", "medicação pet", "medicacao pet"]))
    return "PETS";

  if (
    includesAny(d, [
      "trabalho",
      "material profissional",
      "internet trabalho",
      "transporte trabalho",
      "alimentação trabalho",
      "alimentacao trabalho",
      "uniforme trabalho",
    ])
  )
    return "TRABALHO";

  if (includesAny(d, ["quebrou", "quebrouu", "conserto", "conserto urgente", "emergência", "emergencia", "manutenção urgente", "manutencao urgente", "urgente"]))
    return "IMPREVISTOS";

  if (
    includesAny(d, [
      "impulso",
      "eu mereço",
      "eu mereco",
      "promoção",
      "promocao",
      "por preguiça",
      "por preguica",
      "estresse",
      "stress",
    ])
  )
    return "GASTOS_EMOCIONAIS";

  if (cat === "essencial") return "ESSENCIAIS_OUTROS";
  return "OUTROS";
}

function groupLabel(key) {
  const map = {
    MORADIA: "🏠 Moradia",
    TRANSPORTE: "🚗 Transporte",
    ALIMENTACAO: "🍽️ Alimentação",
    SAUDE: "💊 Saúde",
    EDUCACAO: "📚 Educação",
    VESTUARIO: "👕 Vestuário",
    LAZER: "🎉 Lazer",
    FINANCEIRO: "💳 Financeiro",
    PRESENTES_E_EVENTOS: "🎁 Presentes e eventos",
    FAMILIA: "🧒 Filhos / família",
    PETS: "🐶 Pets",
    TRABALHO: "💼 Trabalho",
    INVESTIMENTOS: "🏦 Investimentos",
    IMPREVISTOS: "⚡ Imprevistos",
    GASTOS_EMOCIONAIS: "🔥 Gastos emocionais",
    ESSENCIAIS_OUTROS: "🧱 Essenciais (outros)",
    OUTROS: "📦 Outros",
  };
  return map[key] || key;
}

function blocoEstrategicoFromGroup(groupKey, categoriaRaw = "") {
  const cat = String(categoriaRaw || "").toLowerCase();
  if (cat === "burrice" || groupKey === "GASTOS_EMOCIONAIS") return "DESCONTROLE";

  if (groupKey === "FINANCEIRO") return "FINANCEIRO";
  if (groupKey === "EDUCACAO" || groupKey === "INVESTIMENTOS") return "CRESCIMENTO";

  if (groupKey === "MORADIA" || groupKey === "ALIMENTACAO" || groupKey === "TRANSPORTE" || groupKey === "SAUDE" || groupKey === "ESSENCIAIS_OUTROS")
    return "ESSENCIAIS";

  if (groupKey === "LAZER" || groupKey === "VESTUARIO" || groupKey === "PETS" || groupKey === "PRESENTES_E_EVENTOS" || groupKey === "FAMILIA")
    return "QUALIDADE";

  if (cat === "investido") return "CRESCIMENTO";
  if (cat === "lazer") return "QUALIDADE";
  if (cat === "essencial") return "ESSENCIAIS";

  return "QUALIDADE";
}

function blocoLabel(key) {
  const map = {
    ESSENCIAIS: "🧱 Essenciais",
    CRESCIMENTO: "📈 Crescimento",
    QUALIDADE: "❤️ Qualidade de vida",
    FINANCEIRO: "⚠️ Financeiro",
    DESCONTROLE: "🔥 Descontrole",
  };
  return map[key] || key;
}

export default function FinancasPage() {
  const finance = useFinance() || {};

  const {
    transacoes,
    profile,
    atualizarProfile,
    mesReferencia,
    mudarMesReferencia,
    irParaMesAtual,
    lembretes,
    estudos,
    user,

    setLembretes,
    salvarLembretes,
    updateLembrete,
    marcarLembreteComoFeito,
    setEstudos,
    salvarEstudos,
    updateTarefaEstudo,
    marcarTarefaEstudoComoFeita,
  } = finance;

  const [modalCategorias, setModalCategorias] = useState(false);
  // Explicações curtas abertas pelos botões de interrogação dos cartões.
  const [ajudaAberta, setAjudaAberta] = useState(null);
  // A pessoa escolhe quantos meses completos anteriores quer comparar (1 a 6).
  const [quantidadeMesesAnalise, setQuantidadeMesesAnalise] = useState(6);
  const [mostrarEscolhaMeses, setMostrarEscolhaMeses] = useState(false);

  // Limite mensal + aviso visual
  const [limiteMensalInput, setLimiteMensalInput] = useState("");

  // Gastos fixos dentro do cartão de limite
  const [mostrarGastosFixos, setMostrarGastosFixos] = useState(false);
  // Por padrão, a tela Finanças ignora os Acertos. Eles continuam guardados
  // em Quem me deve e no filtro Acertos do Histórico.
  const [mostrarAcertosNoResumo, setMostrarAcertosNoResumo] = useState(false);
  const [nomeGastoFixo, setNomeGastoFixo] = useState("");
  const [valorGastoFixo, setValorGastoFixo] = useState("");
  const [categoriaGastoFixo, setCategoriaGastoFixo] = useState("essencial");
  const [diaVencimentoGastoFixo, setDiaVencimentoGastoFixo] = useState("");
  const [modoGastoMensal, setModoGastoMensal] = useState("fixo");
  const [carregarSaldoPositivo, setCarregarSaldoPositivo] = useState(true);
  const [carregarSaldoNegativo, setCarregarSaldoNegativo] = useState(true);
  const [gastoFixoEditando, setGastoFixoEditando] = useState(null);
  const [valorGastoEditando, setValorGastoEditando] = useState("");
  const [diaGastoEditando, setDiaGastoEditando] = useState("");
  const [modoGastoEditando, setModoGastoEditando] = useState("fixo");
  const [carregarPositivoEditando, setCarregarPositivoEditando] = useState(true);
  const [carregarNegativoEditando, setCarregarNegativoEditando] = useState(true);

  const [mostrarOutrasSemanas, setMostrarOutrasSemanas] =
    useState(false);
  const [semanaDetalhada, setSemanaDetalhada] =
    useState(null);
  const [semanaComprasModal, setSemanaComprasModal] = useState(null);
  const refsSemanas = useRef({});
  const semanaParaFocarRef = useRef(null);

  // ✅ NOVO: modal por item (não por lista)
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemModal, setItemModal] = useState(null);

  const openItemModal = (payload) => {
    setItemModal(payload);
    setItemModalOpen(true);
  };
  const closeItemModal = () => {
    setItemModalOpen(false);
    setItemModal(null);
  };

  const [notifStatus, setNotifStatus] = useState(
    "Notification" in window ? Notification.permission : "unsupported"
  );

  async function ativarNotificacoes() {
    if (!("Notification" in window)) {
      alert("Seu navegador não suporta notificações.");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotifStatus(perm);
      if (perm === "granted") {
        await showTopBarNotification("🔔 Notificações ativadas!", "Agora você pode receber avisos do seu dia.");
      }
    } catch {
      alert("Não consegui ativar notificações. Verifique as permissões do navegador.");
    }
  }

  const salariosPorMes = profile?.salariosPorMes || {};
  function getSalarioMes(ano, mes0) {
    const k = monthKey(ano, mes0);
    return Number(salariosPorMes[k] ?? profile?.rendaMensal ?? 0);
  }

  const resumo = useMemo(() => {
    const montarResumoMes = (mes0, ano) => {
      let receitas = 0;
      let entradasAcertos = 0;
      let despesasTransacoes = 0;
      let gastosCartao = 0;
      let categorias = { essencial: 0, lazer: 0, burrice: 0, investido: 0 };

      const chaveMes = monthKey(ano, mes0);

      const gastosFixosPerfil = (Array.isArray(profile?.gastosFixos) ? profile.gastosFixos : [])
        .filter((g) => g.ativo !== false)
        .filter((g) => !ehOrcamentoVariavel(g))
        .filter((g) => gastoFixoDeveEntrarNoMes(g, chaveMes))
        .filter(
          (g) =>
            (g.nome || "").toLowerCase() !== "educacao" &&
            (g.categoria || "").toLowerCase() !== "educacao"
        )
        .map((g) => ({
          id: g.id,
          descricao: g.nome,
          categoria: (g.categoria || "").toLowerCase(),
          valor: getValorFixo(g.valoresPorMes || {}, chaveMes),
        }))
        .filter((g) => Number(g.valor) > 0);

      const inRange = (dt) => {
        if (!dt || Number.isNaN(dt.getTime())) return false;
        // A visão do mês usa mês normal do calendário. Dia de pagamento não
        // pode puxar compras de julho para agosto.
        return dt.getMonth() === mes0 && dt.getFullYear() === ano;
      };

      (Array.isArray(transacoes) ? transacoes : []).forEach((t) => {
        // Depósitos/retiradas da Reserva são transferências internas e já
        // aparecem na página Reserva; não são uma despesa do mês.
        if (t.origemMovimento === "reserva") return;
        if (!mostrarAcertosNoResumo && transacaoEhDeAcerto(t)) return;
        const dt = new Date(t.dataHora);
        if (inRange(dt)) {
          const valor = Number(t.valor || 0);
          if (t.tipo === "receita") {
            receitas += valor;
          } else if (t.tipo === "reembolso") {
            entradasAcertos += valor;
          } else if (t.tipo === "despesa") {
            despesasTransacoes += valor;
            if (t.formaPagamento === "credito") {
              gastosCartao += valor;
            }
            const cat = (t.categoria || "").toLowerCase();
            if (cat === "essencial") categorias.essencial += valor;
            if (cat === "lazer") categorias.lazer += valor;
            if (cat === "burrice") categorias.burrice += valor;
            if (cat === "investido") categorias.investido += valor;

          }
        }
      });

      const totalGastosFixos = gastosFixosPerfil.reduce((acc, g) => acc + Number(g.valor || 0), 0);
      const despesas = despesasTransacoes + totalGastosFixos;

      gastosFixosPerfil.forEach((g) => {
        const v = Number(g.valor || 0);
        if (!v) return;
        const cat = (g.categoria || "").toLowerCase();
        if (cat === "essencial") categorias.essencial += v;
        if (cat === "lazer") categorias.lazer += v;
        if (cat === "burrice") categorias.burrice += v;
        if (cat === "investido") categorias.investido += v;
      });

      // Reembolso é dinheiro que realmente voltou para você, então entra no
      // saldo. Ele fica separado de "Receitas do mês" para não parecer renda nova.
      const saldo = receitas + entradasAcertos - despesas;

      const mapa = new Map();
      (Array.isArray(transacoes) ? transacoes : []).forEach((t) => {
        if (t.origemMovimento === "reserva") return;
        if (!mostrarAcertosNoResumo && transacaoEhDeAcerto(t)) return;
        const dt = new Date(t.dataHora);
        if (t.tipo === "despesa" && inRange(dt)) {
          const v = Number(t.valor || 0);
          if (!v) return;
          const key = normalizarNome(t.descricao || "Sem descrição");
          const atual = mapa.get(key) || { descricao: t.descricao || "Sem descrição", valor: 0, count: 0 };
          atual.valor += v;
          atual.count += 1;
          if ((!atual.descricao || atual.descricao === "Sem descrição") && t.descricao) {
            atual.descricao = t.descricao;
          }
          mapa.set(key, atual);
        }
      });

      const topDespesas = Array.from(mapa.values())
        .sort((a, b) => Number(b.valor) - Number(a.valor))
        .slice(0, 5)
        .map((x, idx) => ({
          id: `top-${ano}-${mes0}-${idx}`,
          descricao: x.descricao,
          valor: x.valor,
          count: x.count,
        }));

      const totalCat = categorias.essencial + categorias.lazer + categorias.burrice + categorias.investido || 1;

      return {
        receitas,
        entradasAcertos,
        despesas,
        saldo,
        gastosCartao,
        categorias,
        pEssencial: (categorias.essencial / totalCat) * 100,
        pLazer: (categorias.lazer / totalCat) * 100,
        pBurrice: (categorias.burrice / totalCat) * 100,
        pInvestido: (categorias.investido / totalCat) * 100,
        topDespesas,
        gastosFixos: gastosFixosPerfil,
        totalGastosFixos,
        despesasTransacoes,
        _cycle: null,
      };
    };

    const { mes, ano } = mesReferencia || { mes: new Date().getMonth(), ano: new Date().getFullYear() };
    const resumoAtual = montarResumoMes(mes, ano);

    const { ano: anoPrev, mes: mesPrev } = prevMonth(ano, mes);
    const resumoPrev = montarResumoMes(mesPrev, anoPrev);

    return { resumoAtual, pendenteAnterior: 0 };
  }, [transacoes, mesReferencia, profile?.gastosFixos, profile?.rendaMensal, profile?.salariosPorMes, profile?.diaPagamento, mostrarAcertosNoResumo]);

  const { resumoAtual, pendenteAnterior } = resumo;

  const chaveMesAtual = monthKey(
    mesReferencia?.ano ?? new Date().getFullYear(),
    mesReferencia?.mes ?? new Date().getMonth()
  );

  const gastosFixos = Array.isArray(profile?.gastosFixos)
    ? profile.gastosFixos
    : [];

  const orcamentosVariaveis = useMemo(
    () =>
      gastosFixos
        .filter((gasto) => gasto?.ativo !== false)
        .filter(ehOrcamentoVariavel)
        .map((gasto) => ({
          gasto,
          resumo: resumoOrcamentoNoMes(
            gasto,
            transacoes,
            chaveMesAtual
          ),
        })),
    [profile?.gastosFixos, transacoes, chaveMesAtual]
  );

  const totalOrcamentosVariaveis = useMemo(
    () =>
      orcamentosVariaveis.reduce(
        (total, item) => total + Number(item.resumo?.orcamentoBase || 0),
        0
      ),
    [orcamentosVariaveis]
  );

  /* Mostra quatro semanas por vez; a quarta é a semana de referência. */
  const gastosPorSemana = useMemo(() => {
    const anoSelecionado =
      mesReferencia?.ano ?? new Date().getFullYear();

    const mesSelecionado =
      mesReferencia?.mes ?? new Date().getMonth();

    function criarSemanasMes(ano, mes0) {
      const ultimoDia = new Date(ano, mes0 + 1, 0).getDate();
      const quantidade = Math.ceil(ultimoDia / 7);

      return Array.from({ length: quantidade }, (_, indice) => {
        const diaInicio = indice * 7 + 1;
        const diaFim = Math.min(diaInicio + 6, ultimoDia);

        const inicio = new Date(ano, mes0, diaInicio, 0, 0, 0, 0);
        const fim = new Date(ano, mes0, diaFim, 23, 59, 59, 999);

        return {
          ano,
          mes: mes0,
          indiceNoMes: indice,
          chave: `${ano}-${String(mes0 + 1).padStart(2, "0")}-${String(diaInicio).padStart(2, "0")}`,
          inicio,
          fim,
          rotulo: `${String(diaInicio).padStart(2, "0")}/${String(mes0 + 1).padStart(2, "0")} até ${String(diaFim).padStart(2, "0")}/${String(mes0 + 1).padStart(2, "0")}`,
        };
      });
    }

    // A linha do tempo inclui dezembro do ano anterior. Assim, mesmo em
    // janeiro ainda existem quatro quadrinhos, e o último continua sendo a
    // semana de referência.
    const linhaDoTempo = [];
    linhaDoTempo.push(...criarSemanasMes(anoSelecionado - 1, 11));
    for (let mes = 0; mes < 12; mes += 1) {
      linhaDoTempo.push(...criarSemanasMes(anoSelecionado, mes));
    }

    const agora = new Date();
    const ehMesAtual =
      anoSelecionado === agora.getFullYear() &&
      mesSelecionado === agora.getMonth();
    const semanasDoMesSelecionado = linhaDoTempo.filter(
      (semana) => semana.ano === anoSelecionado && semana.mes === mesSelecionado
    );
    const semanaReferencia = ehMesAtual
      ? semanasDoMesSelecionado.find(
          (semana) => agora >= semana.inicio && agora <= semana.fim
        )
      : semanasDoMesSelecionado[Math.min(3, semanasDoMesSelecionado.length - 1)];
    let indiceReferencia = linhaDoTempo.findIndex(
      (semana) => semana.chave === semanaReferencia?.chave
    );
    if (indiceReferencia < 0) indiceReferencia = 3;

    function criarCategoriasVazias() {
      return { essencial: 0, lazer: 0, burrice: 0, investido: 0 };
    }

    function somarCategoria(categorias, categoria, valor) {
      const cat = normalizeText(categoria);
      if (["essencial", "lazer", "burrice", "investido"].includes(cat)) {
        categorias[cat] += Number(valor || 0);
      }
    }

    function calcularSemana(semana) {
      const categorias = criarCategoriasVazias();
      let totalTransacoes = 0;
      let totalFixos = 0;
      const itens = [];

      (Array.isArray(transacoes) ? transacoes : []).forEach((transacao) => {
        if (transacao?.tipo !== "despesa") return;
        if (!mostrarAcertosNoResumo && transacaoEhDeAcerto(transacao)) return;
        const data = new Date(transacao.dataHora);
        if (Number.isNaN(data.getTime())) return;
        const momento = data.getTime();

        if (momento >= semana.inicio.getTime() && momento <= semana.fim.getTime()) {
          const valor = Number(transacao.valor || 0);
          totalTransacoes += valor;
          somarCategoria(categorias, transacao.categoria, valor);
          itens.push({
            id: transacao.id || `transacao-${momento}`,
            descricao: transacao.descricao || "Sem descrição",
            categoria: transacao.categoria || "Sem categoria",
            valor,
            data,
            fixo: false,
          });
        }
      });

      gastosFixos.forEach((gasto) => {
        if (gasto?.ativo === false) return;
        if (ehOrcamentoVariavel(gasto)) return;
        const chaveDoMes = monthKey(semana.ano, semana.mes);
        if (!gastoFixoDeveEntrarNoMes(gasto, chaveDoMes)) return;
        const dataVencimento = obterDataVencimentoGastoFixo(gasto, semana.ano, semana.mes);
        const momento = dataVencimento.getTime();

        if (momento >= semana.inicio.getTime() && momento <= semana.fim.getTime()) {
          const valor = getValorFixo(gasto?.valoresPorMes || {}, chaveDoMes);
          totalFixos += valor;
          somarCategoria(categorias, gasto.categoria, valor);
          itens.push({
            id: `fixo-${gasto.id || gasto.nome}-${semana.chave}`,
            descricao: gasto.nome || "Gasto fixo",
            categoria: gasto.categoria || "Essencial",
            valor,
            data: dataVencimento,
            fixo: true,
          });
        }
      });

      const total = totalTransacoes + totalFixos;

      return {
        ...semana,
        total,
        totalTransacoes,
        totalFixos,
        itens: itens.sort((a, b) => new Date(a.data) - new Date(b.data)),
        categorias,
        percentuais: {
          essencial: total > 0 ? (categorias.essencial / total) * 100 : 0,
          lazer: total > 0 ? (categorias.lazer / total) * 100 : 0,
          burrice: total > 0 ? (categorias.burrice / total) * 100 : 0,
          investido: total > 0 ? (categorias.investido / total) * 100 : 0,
        },
      };
    }

    const quatroSemanas = linhaDoTempo
      .slice(Math.max(0, indiceReferencia - 3), indiceReferencia + 1)
      .map(calcularSemana);
    // Nesta lista não entra dezembro do ano anterior: ela é somente para
    // explorar todas as semanas do ano escolhido.
    const semanasExplorar = linhaDoTempo
      .filter((semana) => semana.ano === anoSelecionado)
      .map(calcularSemana);

    return {
      quatroSemanas,
      semanasExplorar,
      chavePrincipal: quatroSemanas[quatroSemanas.length - 1]?.chave,
    };
  }, [
    transacoes,
    profile?.gastosFixos,
    mesReferencia?.ano,
    mesReferencia?.mes,
    mostrarAcertosNoResumo,
  ]);

  useEffect(() => {
    setSemanaDetalhada(null);
    setSemanaComprasModal(null);
    setMostrarOutrasSemanas(false);
  }, [mesReferencia?.ano, mesReferencia?.mes]);

  useEffect(() => {
    const chave = semanaParaFocarRef.current;
    if (!chave) return;

    // Ao abrir "Outras Semanas", a lista precisa ir direto para a semana
    // atual. Ao escolher outra semana, ela também continua sendo focalizada.
    if (!mostrarOutrasSemanas && !semanaDetalhada) return;

    const alvo = refsSemanas.current[chave];
    if (!alvo) return;

    requestAnimationFrame(() => {
      alvo.scrollIntoView({ behavior: "smooth", block: "center" });
      semanaParaFocarRef.current = null;
    });
  }, [semanaDetalhada, mostrarOutrasSemanas, gastosPorSemana.chavePrincipal]);

  function selecionarSemana(chave) {
    const proximaSemana = semanaDetalhada === chave ? null : chave;
    semanaParaFocarRef.current = proximaSemana;
    setSemanaDetalhada(proximaSemana);
  }

  function abrirOutrasSemanas() {
    // Guarda a semana de referência antes de renderizar a lista anual. O
    // useEffect acima fará a rolagem assim que o elemento existir na tela.
    semanaParaFocarRef.current = gastosPorSemana.chavePrincipal;
    setMostrarOutrasSemanas(true);
    setSemanaDetalhada(null);
  }

  function fecharOutrasSemanas() {
    setMostrarOutrasSemanas(false);
    setSemanaDetalhada(null);
  }

  function renderizarDetalhesSemana(semana) {
    if (!semana) return null;

    const categorias = [
      { chave: "essencial", nome: "Essencial" },
      { chave: "lazer", nome: "Lazer" },
      { chave: "burrice", nome: "Burrice" },
      { chave: "investido", nome: "Investido" },
    ];

    return (
      <div className="financas-semana-detalhes-aberto">
        <div className="financas-semana-detalhes-topo">
          <strong>{semana.rotulo}</strong>
          <strong>{formatCurrency(semana.total)}</strong>
        </div>

        {categorias.map((categoria) => {
          const percentual = semana.percentuais[categoria.chave] || 0;
          const valor = semana.categorias[categoria.chave] || 0;

          return (
            <div className="financas-categoria-semana" key={categoria.chave}>
              <div className="financas-categoria-semana-linha">
                <span>{categoria.nome}</span>
                <strong>{percentual.toFixed(0)}%</strong>
              </div>

              <div className="financas-categoria-barra">
                <div
                  className={`financas-categoria-preenchimento financas-categoria-${categoria.chave}`}
                  style={{ width: `${Math.min(percentual, 100)}%` }}
                />
              </div>

              <span className="muted small">
                {formatCurrency(valor)}
              </span>
            </div>
          );
        })}

        <button
          type="button"
          className="financas-compras-semana-botao"
          onClick={(evento) => {
            // Mantém a janela de compras aberta sem trocar para a lista anual.
            evento.stopPropagation();
            setSemanaComprasModal(semana);
          }}
        >
          Compras da semana ({semana.itens?.length || 0})
        </button>
      </div>
    );
  }

  function normalizarNumero(valor) {
    if (valor === null || valor === undefined || valor === "") {
      return 0;
    }

    const numero = Number(String(valor).replace(",", "."));
    return Number.isFinite(numero) ? numero : 0;
  }

  function gerarIdGastoFixo() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return `gf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function obterValorGastoFixo(gasto) {
    return getValorFixo(gasto?.valoresPorMes || {}, chaveMesAtual);
  }

  function obterDataVencimentoGastoFixo(gasto, ano, mes0) {
    const diaInformado = Number(gasto?.diaVencimento || 1);

    const ultimoDiaDoMes = new Date(
      ano,
      mes0 + 1,
      0
    ).getDate();

    const diaValido = Math.min(
      Math.max(diaInformado, 1),
      ultimoDiaDoMes
    );

    return new Date(
      ano,
      mes0,
      diaValido,
      12,
      0,
      0,
      0
    );
  }

  function adicionarGastoFixo() {
    const nome = nomeGastoFixo.trim();
    const valor = normalizarNumero(valorGastoFixo);
    const diaVencimento = Number(
      diaVencimentoGastoFixo
    );
    const ehVariavel = modoGastoMensal === "orcamento";

    if (!nome) {
      window.alert("Digite o nome do gasto.");
      return;
    }

    if (valor <= 0) {
      window.alert("Digite um valor válido.");
      return;
    }

    if (
      !ehVariavel &&
      (
        !Number.isInteger(diaVencimento) ||
        diaVencimento < 1 ||
        diaVencimento > 31
      )
    ) {
      window.alert(
        "Digite um dia de vencimento entre 1 e 31."
      );
      return;
    }

    const nomeNormalizado = normalizeText(nome);
    const categoriaNormalizada = normalizeText(categoriaGastoFixo);

    if (
      !ehVariavel &&
      (
      nomeNormalizado === "educacao" ||
      categoriaNormalizada === "educacao"
      )
    ) {
      window.alert("Educação não entra como gasto fixo automático.");
      return;
    }

    const novoGasto = {
      id: gerarIdGastoFixo(),
      nome,
      categoria: categoriaGastoFixo,
      modo: ehVariavel ? "orcamento" : "fixo",
      diaVencimento: ehVariavel ? 1 : diaVencimento,
      ativo: true,
      pagamentoManual: false,
      pagamentosManuais: {},
      carregarSaldoPositivo: ehVariavel ? carregarSaldoPositivo : false,
      carregarSaldoNegativo: ehVariavel ? carregarSaldoNegativo : false,
      valoresPorMes: {
        [chaveMesAtual]: valor,
      },
    };

    atualizarProfile({
      gastosFixos: [...gastosFixos, novoGasto],
    });

    setNomeGastoFixo("");
    setValorGastoFixo("");
    setCategoriaGastoFixo("essencial");
    setDiaVencimentoGastoFixo("");
    setModoGastoMensal("fixo");
    setCarregarSaldoPositivo(true);
    setCarregarSaldoNegativo(true);
  }

  function iniciarEdicaoGastoFixo(gasto) {
    setGastoFixoEditando(gasto.id);
    setValorGastoEditando(
      String(obterValorGastoFixo(gasto) || "")
    );
    setDiaGastoEditando(
      String(gasto?.diaVencimento || 1)
    );
    setModoGastoEditando(ehOrcamentoVariavel(gasto) ? "orcamento" : "fixo");
    setCarregarPositivoEditando(gasto?.carregarSaldoPositivo !== false);
    setCarregarNegativoEditando(gasto?.carregarSaldoNegativo !== false);
  }

  function cancelarEdicaoGastoFixo() {
    setGastoFixoEditando(null);
    setValorGastoEditando("");
    setDiaGastoEditando("");
    setModoGastoEditando("fixo");
    setCarregarPositivoEditando(true);
    setCarregarNegativoEditando(true);
  }

  function salvarEdicaoGastoFixo(id) {
    const valor = normalizarNumero(
      valorGastoEditando
    );

    const diaVencimento = Number(
      diaGastoEditando
    );
    const ehVariavel = modoGastoEditando === "orcamento";

    if (valor <= 0) {
      window.alert("Digite um valor válido.");
      return;
    }

    if (
      !ehVariavel &&
      (
        !Number.isInteger(diaVencimento) ||
        diaVencimento < 1 ||
        diaVencimento > 31
      )
    ) {
      window.alert(
        "Digite um dia de vencimento entre 1 e 31."
      );
      return;
    }

    const novaLista = gastosFixos.map((gasto) => {
      if (gasto.id !== id) {
        return gasto;
      }

      return {
        ...gasto,
        modo: ehVariavel ? "orcamento" : "fixo",
        diaVencimento: ehVariavel ? 1 : diaVencimento,
        carregarSaldoPositivo: ehVariavel
          ? carregarPositivoEditando
          : false,
        carregarSaldoNegativo: ehVariavel
          ? carregarNegativoEditando
          : false,
        valoresPorMes: {
          ...(gasto.valoresPorMes || {}),
          [chaveMesAtual]: valor,
        },
      };
    });

    atualizarProfile({
      gastosFixos: novaLista,
    });

    cancelarEdicaoGastoFixo();
  }

  function alternarGastoFixo(id) {
    const novaLista = gastosFixos.map((gasto) =>
      gasto.id === id
        ? {
            ...gasto,
            ativo: gasto.ativo === false,
          }
        : gasto
    );

    atualizarProfile({ gastosFixos: novaLista });
  }

  function alternarPagamentoManualGastoFixo(id) {
    const novaLista = gastosFixos.map((gasto) => {
      if (gasto.id !== id || ehOrcamentoVariavel(gasto)) {
        return gasto;
      }

      const proximoModoManual = !gasto.pagamentoManual;

      return {
        ...gasto,
        pagamentoManual: proximoModoManual,
        // Ao ligar o modo manual, o mês atual passa a aguardar a confirmação.
        // Ao desligar, o comportamento volta a ser automático imediatamente.
        pagamentoManualDesde: proximoModoManual ? chaveMesAtual : null,
        pagamentosManuais: proximoModoManual
          ? {
              ...(gasto.pagamentosManuais || {}),
              [chaveMesAtual]: false,
            }
          : gasto.pagamentosManuais || {},
      };
    });

    atualizarProfile({ gastosFixos: novaLista });
  }

  function marcarGastoFixoComoPago(id, pago) {
    const novaLista = gastosFixos.map((gasto) => {
      if (gasto.id !== id || ehOrcamentoVariavel(gasto)) {
        return gasto;
      }

      return {
        ...gasto,
        pagamentosManuais: {
          ...(gasto.pagamentosManuais || {}),
          [chaveMesAtual]: pago,
        },
      };
    });

    atualizarProfile({ gastosFixos: novaLista });
  }

  function removerGastoFixo(id) {
    const confirmar = window.confirm("Deseja remover este gasto mensal?");

    if (!confirmar) {
      return;
    }

    atualizarProfile({
      gastosFixos: gastosFixos.filter((gasto) => gasto.id !== id),
    });
  }
  const limiteGastoMensal = Number(profile?.limiteGastoMensal || 0);

  useEffect(() => {
    setLimiteMensalInput(
      limiteGastoMensal > 0 ? String(limiteGastoMensal) : ""
    );
  }, [limiteGastoMensal]);


  function salvarLimiteGastoMensal() {
    const valor = normalizarNumero(limiteMensalInput);

    if (valor < 0) {
      window.alert("Digite um limite válido.");
      return;
    }

    atualizarProfile?.({ limiteGastoMensal: valor });
    setAlertaLimiteFechado(false);
  }

  const diaPagamento = profile?.diaPagamento || "";
  const proximoPag = diaPagamento ? calcularProximoPagamento(diaPagamento) : null;

  // Saldo do mês = receitas + reembolsos/acertos recebidos - despesas.
  // Reembolso entra no caixa, mas não é tratado como renda nova.
  const saldoComSalario = resumoAtual.saldo;

  const pE = resumoAtual.pEssencial || 0;
  const pL = resumoAtual.pLazer || 0;
  const pB = resumoAtual.pBurrice || 0;

  const cut1 = pE;
  const cut2 = pE + pL;
  const cut3 = pE + pL + pB;

  const pizzaStyle = {
    backgroundImage: `conic-gradient(
      #8FA3FF 0 ${cut1}%,
      #4C5ACF ${cut1}% ${cut2}%,
      #F59E0B ${cut2}% ${cut3}%,
      #10B981 ${cut3}% 100%
    )`,
  };

  const percLimite =
    limiteGastoMensal > 0 ? Math.min(100, (resumoAtual.despesas / limiteGastoMensal) * 100) : 0;

  const percentualLimiteReal =
    limiteGastoMensal > 0
      ? (resumoAtual.despesas / limiteGastoMensal) * 100
      : 0;

  const valorUltrapassadoLimite =
    limiteGastoMensal > 0
      ? Math.max(0, resumoAtual.despesas - limiteGastoMensal)
      : 0;

  const limiteFoiAtingido =
    limiteGastoMensal > 0 && resumoAtual.despesas >= limiteGastoMensal;

  const limiteUltrapassado = valorUltrapassadoLimite > 0;

  const chaveAlertaLimite = `financas_alerta_limite_${chaveMesAtual}`;
  const [mostrarAlertaLimite, setMostrarAlertaLimite] = useState(false);

  useEffect(() => {
    if (!limiteFoiAtingido) {
      setMostrarAlertaLimite(false);
      return;
    }

    try {
      const ultimoAviso = Number(localStorage.getItem(chaveAlertaLimite) || 0);
      const agora = Date.now();
      const VINTE_QUATRO_HORAS = 24 * 60 * 60 * 1000;

      if (!ultimoAviso || agora - ultimoAviso >= VINTE_QUATRO_HORAS) {
        setMostrarAlertaLimite(true);
      } else {
        setMostrarAlertaLimite(false);
      }
    } catch {
      setMostrarAlertaLimite(true);
    }
  }, [limiteFoiAtingido, chaveAlertaLimite]);

  function fecharAlertaLimite() {
    try {
      localStorage.setItem(chaveAlertaLimite, String(Date.now()));
    } catch {}

    setMostrarAlertaLimite(false);
  }
  const nomeMes = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ][mesReferencia?.mes ?? new Date().getMonth()];



  /* ==================== HISTÓRICO FINANCEIRO DOS ÚLTIMOS 6 MESES ==================== */
  const historicoFinanceiro = useMemo(() => {
    const agora = new Date();
    const anoSelecionado = mesReferencia?.ano ?? agora.getFullYear();
    const mesSelecionado = mesReferencia?.mes ?? agora.getMonth();

    function calcularMesHistorico(ano, mes0) {
      const chaveMes = monthKey(ano, mes0);
      const inRange = (dt) => {
        if (!dt || Number.isNaN(dt.getTime())) return false;
        return dt.getMonth() === mes0 && dt.getFullYear() === ano;
      };

      let receitas = 0;
      let entradasAcertos = 0;
      let despesasTransacoes = 0;
      let gastosCartao = 0;

      (Array.isArray(transacoes) ? transacoes : []).forEach((t) => {
        if (t.origemMovimento === "reserva") return;
        if (!mostrarAcertosNoResumo && transacaoEhDeAcerto(t)) return;
        const dt = new Date(t.dataHora);
        if (!inRange(dt)) return;

        const valor = Number(t.valor || 0);
        if (t.tipo === "receita") {
          receitas += valor;
          return;
        }

        if (t.tipo === "reembolso") {
          entradasAcertos += valor;
          return;
        }

        if (t.tipo === "despesa") {
          despesasTransacoes += valor;
          if (t.formaPagamento === "credito") {
            gastosCartao += valor;
          }
        }
      });

      const gastosFixosMes = (Array.isArray(profile?.gastosFixos)
        ? profile.gastosFixos
        : [])
        .filter((g) => g.ativo !== false)
        .filter((g) => !ehOrcamentoVariavel(g))
        .filter((g) => gastoFixoDeveEntrarNoMes(g, chaveMes))
        .filter(
          (g) =>
            normalizeText(g.nome) !== "educacao" &&
            normalizeText(g.categoria) !== "educacao"
        )
        .reduce(
          (total, g) =>
            total + getValorFixo(g.valoresPorMes || {}, chaveMes),
          0
        );

      const despesas = despesasTransacoes + gastosFixosMes;
      // A receita já traz o salário lançado no backup. Somar a renda do
      // perfil aqui cria meses que não existem e duplica o salário.
      const saldo = receitas + entradasAcertos - despesas;

      return {
        ano,
        mes: mes0,
        chaveMes,
        receitas,
        entradasAcertos,
        despesas,
        gastosFixos: gastosFixosMes,
        gastosCartao,
        saldo,
      };
    }

    // Procura, no máximo, seis meses completos anteriores. Só entram na análise
    // os meses que realmente possuem lançamentos — nunca meses vazios.
    const mesesAnteriores = [];
    for (let i = 6; i >= 1; i -= 1) {
      const data = new Date(anoSelecionado, mesSelecionado - i, 1);
      mesesAnteriores.push(
        calcularMesHistorico(data.getFullYear(), data.getMonth())
      );
    }

    const mesesComDadosDisponiveis = mesesAnteriores.filter(
      (m) =>
        m.despesas > 0 ||
        m.gastosCartao > 0 ||
        m.receitas > 0 ||
        m.entradasAcertos > 0
    );

    // Se há junho e julho salvos antes de agosto, as únicas opções são
    // analisar 1 mês (julho) ou 2 meses (junho e julho).
    const quantidadeValida = Math.min(
      Math.max(1, quantidadeMesesAnalise),
      mesesComDadosDisponiveis.length
    );
    const mesesComDados = mesesComDadosDisponiveis.slice(-quantidadeValida);
    const meses = mesesComDados;

    const divisor = mesesComDados.length || 1;

    const mediaContas =
      mesesComDados.reduce((soma, m) => soma + m.gastosFixos, 0) / divisor;

    const mediaCartao =
      mesesComDados.reduce((soma, m) => soma + m.gastosCartao, 0) / divisor;

    const mediaDespesas =
      mesesComDados.reduce((soma, m) => soma + m.despesas, 0) / divisor;

    const mediaSaldo =
      mesesComDados.reduce((soma, m) => soma + m.saldo, 0) / divisor;

    const atual = {
      despesas: Number(resumoAtual?.despesas || 0),
      gastosCartao: Number(resumoAtual?.gastosCartao || 0),
      gastosFixos: Number(resumoAtual?.totalGastosFixos || 0),
      saldo: Number(resumoAtual?.saldo || 0),
    };

    const diferencaDespesas = atual.despesas - mediaDespesas;
    const diferencaCartao = atual.gastosCartao - mediaCartao;
    const diferencaSaldo = atual.saldo - mediaSaldo;

    let status = "neutro";
    let titulo = "Sem histórico suficiente";
    let mensagem =
      "Cadastre mais meses de movimentações para eu comparar sua evolução.";

    if (mesesComDados.length > 0) {
      if (diferencaSaldo > 0 && diferencaDespesas <= 0) {
        status = "positivo";
        titulo = "Você está indo melhor que sua média";
        mensagem =
          "Seu saldo está melhor e seus gastos estão controlados em relação aos últimos meses.";
      } else if (diferencaSaldo < 0 && diferencaDespesas > 0) {
        status = "negativo";
        titulo = "Este mês está mais apertado";
        mensagem =
          "Seu saldo está abaixo da média e suas despesas estão maiores que nos últimos meses.";
      } else if (diferencaCartao > 0 && atual.gastosCartao > mediaCartao) {
        status = "atencao";
        titulo = "Atenção ao cartão";
        mensagem =
          "O uso do cartão está acima da sua média recente. Vale acompanhar a fatura de perto.";
      } else {
        status = "neutro";
        titulo = "Seu mês está próximo da média";
        mensagem =
          "Seus números estão parecidos com o padrão dos últimos meses, sem uma mudança forte até agora.";
      }
    }

    return {
      meses,
      mesesComDados,
      quantidadeMaximaDisponivel: mesesComDadosDisponiveis.length,
      mediaContas,
      mediaCartao,
      mediaDespesas,
      mediaSaldo,
      diferencaDespesas,
      diferencaCartao,
      diferencaSaldo,
      status,
      titulo,
      mensagem,
    };
  }, [
    transacoes,
    mesReferencia?.ano,
    mesReferencia?.mes,
    profile?.gastosFixos,
    profile?.diaPagamento,
    profile?.rendaMensal,
    profile?.salariosPorMes,
    resumoAtual?.despesas,
    resumoAtual?.gastosCartao,
    resumoAtual?.totalGastosFixos,
    saldoComSalario,
    quantidadeMesesAnalise,
    mostrarAcertosNoResumo,
  ]);

  // Impede que o seletor fique em 4, 5 ou 6 quando esses meses não existem
  // no backup. Assim a tela não dá a impressão de dividir por meses vazios.
  useEffect(() => {
    const maximo = historicoFinanceiro.quantidadeMaximaDisponivel;
    if (maximo > 0 && quantidadeMesesAnalise > maximo) {
      setQuantidadeMesesAnalise(maximo);
    }
  }, [historicoFinanceiro.quantidadeMaximaDisponivel, quantidadeMesesAnalise]);

  const detalhesCategorias = useMemo(() => {
    const mes0 = mesReferencia?.mes ?? new Date().getMonth();
    const ano = mesReferencia?.ano ?? new Date().getFullYear();

    const inRange = (dt) => {
      if (!dt || Number.isNaN(dt.getTime())) return false;
      return dt.getMonth() === mes0 && dt.getFullYear() === ano;
    };

    const despesasMes = (Array.isArray(transacoes) ? transacoes : [])
      .filter((t) => {
        if (t.origemMovimento === "reserva") return false;
        const dt = new Date(t.dataHora);
        return t.tipo === "despesa" && inRange(dt);
      })
      .map((t) => ({
        id: t.id,
        descricao: t.descricao || "Sem descrição",
        valor: Number(t.valor || 0),
        categoria: String(t.categoria || "").trim() || "Sem categoria",
        _fixo: false,
      }));

    const fixos = (resumoAtual.gastosFixos || []).map((g) => ({
      id: `fixo_${g.id}`,
      descricao: g.descricao || "Gasto fixo",
      valor: Number(g.valor || 0),
      categoria: (g.categoria || "Sem categoria").trim(),
      _fixo: true,
    }));

    const tudo = [...despesasMes, ...fixos].filter((x) => Number(x.valor) > 0);

    const food = [];
    const transport = [];
    const other = [];

    tudo.forEach((t) => {
      if (isFood(t.descricao)) food.push(t);
      else if (isTransport(t.descricao)) transport.push(t);
      else other.push(t);
    });

    const sum = (arr) => arr.reduce((s, x) => s + Number(x.valor || 0), 0);

    const groupByDesc = (arr) => {
      const m = new Map();
      arr.forEach((t) => {
        const k = normalizarNome(t.descricao);
        const cur = m.get(k) || { descricao: t.descricao, total: 0, count: 0 };
        cur.total += Number(t.valor || 0);
        cur.count += 1;
        if ((!cur.descricao || cur.descricao === "Sem descrição") && t.descricao) cur.descricao = t.descricao;
        m.set(k, cur);
      });
      return Array.from(m.values()).sort((a, b) => b.total - a.total);
    };

    const foodByDesc = groupByDesc(food);
    const transportByDesc = groupByDesc(transport);

    const foodPorCategoria = { essencial: 0, lazer: 0, burrice: 0, investido: 0, outras: 0 };
    food.forEach((t) => {
      const c = String(t.categoria || "").toLowerCase();
      if (c === "essencial") foodPorCategoria.essencial += t.valor;
      else if (c === "lazer") foodPorCategoria.lazer += t.valor;
      else if (c === "burrice") foodPorCategoria.burrice += t.valor;
      else if (c === "investido") foodPorCategoria.investido += t.valor;
      else foodPorCategoria.outras += t.valor;
    });

    const totalPorCategoria = { essencial: 0, lazer: 0, burrice: 0, investido: 0, outras: 0 };
    tudo.forEach((t) => {
      const c = String(t.categoria || "").toLowerCase();
      if (c === "essencial") totalPorCategoria.essencial += t.valor;
      else if (c === "lazer") totalPorCategoria.lazer += t.valor;
      else if (c === "burrice") totalPorCategoria.burrice += t.valor;
      else if (c === "investido") totalPorCategoria.investido += t.valor;
      else totalPorCategoria.outras += t.valor;
    });

    const groupsOrder = [
      "MORADIA",
      "TRANSPORTE",
      "ALIMENTACAO",
      "SAUDE",
      "EDUCACAO",
      "VESTUARIO",
      "LAZER",
      "FINANCEIRO",
      "PRESENTES_E_EVENTOS",
      "FAMILIA",
      "PETS",
      "TRABALHO",
      "INVESTIMENTOS",
      "IMPREVISTOS",
      "GASTOS_EMOCIONAIS",
      "ESSENCIAIS_OUTROS",
      "OUTROS",
    ];

    const byGroup = {};
    const byGroupDesc = {};
    const blocos = { ESSENCIAIS: 0, CRESCIMENTO: 0, QUALIDADE: 0, FINANCEIRO: 0, DESCONTROLE: 0 };

    for (const it of tudo) {
      const group = classifyGroup(it.descricao, it.categoria);
      if (!byGroup[group]) byGroup[group] = 0;
      byGroup[group] += Number(it.valor || 0);

      const k = group + "::" + normalizarNome(it.descricao);
      const cur = byGroupDesc[k] || { group, descricao: it.descricao, total: 0, count: 0 };
      cur.total += Number(it.valor || 0);
      cur.count += 1;
      byGroupDesc[k] = cur;

      const bloco = blocoEstrategicoFromGroup(group, it.categoria);
      if (!blocos[bloco]) blocos[bloco] = 0;
      blocos[bloco] += Number(it.valor || 0);
    }

    const groupsList = groupsOrder
      .map((g) => ({
        key: g,
        label: groupLabel(g),
        total: Number(byGroup[g] || 0),
        topItens: Object.values(byGroupDesc)
          .filter((x) => x.group === g)
          .sort((a, b) => b.total - a.total)
          .slice(0, 6),
      }))
      .filter((g) => g.total > 0);

    const totalMes = sum(tudo) || 1;
    const blocosList = [
      { key: "ESSENCIAIS", label: blocoLabel("ESSENCIAIS"), total: Number(blocos.ESSENCIAIS || 0) },
      { key: "CRESCIMENTO", label: blocoLabel("CRESCIMENTO"), total: Number(blocos.CRESCIMENTO || 0) },
      { key: "QUALIDADE", label: blocoLabel("QUALIDADE"), total: Number(blocos.QUALIDADE || 0) },
      { key: "FINANCEIRO", label: blocoLabel("FINANCEIRO"), total: Number(blocos.FINANCEIRO || 0) },
      { key: "DESCONTROLE", label: blocoLabel("DESCONTROLE"), total: Number(blocos.DESCONTROLE || 0) },
    ].map((b) => ({
      ...b,
      pct: (b.total / totalMes) * 100,
    }));

    return {
      totalMes: sum(tudo),
      totalFood: sum(food),
      totalTransport: sum(transport),
      totalOther: sum(other),
      foodByDesc,
      transportByDesc,
      foodPorCategoria,
      totalPorCategoria,
      tudoCount: tudo.length,
      groupsList,
      blocosList,
    };
  }, [transacoes, mesReferencia, resumoAtual.gastosFixos, profile?.diaPagamento]);

  
  /* -------------------- lembretes (compacto) + fallback + sync local -------------------- */
  const [lembretesFallback, setLembretesFallback] = useState([]);
  const [lembretesOverride, setLembretesOverride] = useState(null);

  useEffect(() => {
    try {
      if (Array.isArray(lembretes) && lembretes.length) {
        setLembretesOverride(null);
        return;
      }
      const raw = localStorage.getItem("pwa_lembretes_v1") || "[]";
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setLembretesFallback(parsed);
    } catch {}
  }, [lembretes]);

  const lembretesList = useMemo(() => {
    if (Array.isArray(lembretesOverride)) return lembretesOverride;
    if (Array.isArray(lembretes) && lembretes.length) return lembretes;
    return lembretesFallback;
  }, [lembretesOverride, lembretes, lembretesFallback]);

  /* -------------------- estudos (local override opcional) -------------------- */
  const [estudosOverride, setEstudosOverride] = useState(null);
  const estudosBase = estudosOverride || estudos || null;

  /* -------------------- ✅ AÇÕES: marcar como feito (com refletir nas abas) -------------------- */
  async function marcarFeitoAtual() {
    if (!itemModal) return;

    if (itemModal.tipo === "lembrete") {
      const id = itemModal.id;
      const raw = itemModal.raw || {};

      try {
        if (typeof marcarLembreteComoFeito === "function") {
          await marcarLembreteComoFeito(id);
          closeItemModal();
          return;
        }
        if (typeof updateLembrete === "function") {
          if (raw.tipo === "avulso") {
            await updateLembrete(id, { done: true });
          } else {
            const now = new Date();
            const next = computeNextDueFallback(raw, now);
            await updateLembrete(id, {
              lastDoneISO: now.toISOString(),
              nextDueISO: next.toISOString(),
            });
          }
          closeItemModal();
          return;
        }
      } catch {}

      try {
        const list = Array.isArray(lembretesList) ? [...lembretesList] : [];
        const idx = list.findIndex((x) => x && String(x.id) === String(id));
        if (idx >= 0) {
          const it = { ...(list[idx] || {}) };
          if (it.tipo === "avulso") {
            it.done = true;
            it.doneAtISO = new Date().toISOString();
          } else {
            const now = new Date();
            const next = computeNextDueFallback(it, now);
            it.lastDoneISO = now.toISOString();
            it.nextDueISO = next.toISOString();
          }
          list[idx] = it;

          localStorage.setItem("pwa_lembretes_v1", JSON.stringify(list));
          setLembretesOverride(list);

          try {
            if (typeof setLembretes === "function") setLembretes(list);
            if (typeof salvarLembretes === "function") salvarLembretes(list);
          } catch {}
        }
      } catch {}

      closeItemModal();
      return;
    }

    if (itemModal.tipo === "estudo") {
      const id = itemModal.id;

      try {
        if (typeof marcarTarefaEstudoComoFeita === "function") {
          await marcarTarefaEstudoComoFeita(id);
          closeItemModal();
          return;
        }
        if (typeof updateTarefaEstudo === "function") {
          await updateTarefaEstudo(id, { status: "feito", feitoEmISO: new Date().toISOString() });
          closeItemModal();
          return;
        }
      } catch {}

      try {
        const base = estudosBase && typeof estudosBase === "object" ? { ...estudosBase } : { tarefas: [] };
        const tarefas = Array.isArray(base.tarefas) ? [...base.tarefas] : [];
        const idx = tarefas.findIndex((t) => t && String(t.id) === String(id));
        if (idx >= 0) {
          tarefas[idx] = { ...(tarefas[idx] || {}), status: "feito", feitoEmISO: new Date().toISOString() };
          base.tarefas = tarefas;

          localStorage.setItem("pwa_estudos_v1", JSON.stringify(base));
          setEstudosOverride(base);

          try {
            if (typeof setEstudos === "function") setEstudos(base);
            if (typeof salvarEstudos === "function") salvarEstudos(base);
          } catch {}
        }
      } catch {}

      closeItemModal();
      return;
    }
  }

  /* -------------------- lembretesCompact -------------------- */
  const lembretesCompact = useMemo(() => {
    const list = Array.isArray(lembretesList) ? lembretesList : [];
    const now = new Date();
    const from = startOfDay(now);
    const to = endOfDay(now);

    const events = list
      .map((it) => {
        if (!it) return null;

        if (it.tipo === "avulso") {
          if (it.done) return null;
          const dt = parseLocalDateTime(it.quando);
          if (!dt || Number.isNaN(dt.getTime())) return null;
          return {
            id: it.id,
            tipo: "avulso",
            titulo: it.titulo || "Sem título",
            when: dt,
            raw: it,
          };
        }

        if (it.tipo === "recorrente") {
          if (it.enabled === false) return null;
          const dt = new Date(it.nextDueISO || "");
          if (!dt || Number.isNaN(dt.getTime())) return null;
          return {
            id: it.id,
            tipo: "recorrente",
            titulo: it.titulo || "Sem título",
            when: dt,
            raw: it,
          };
        }

        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.when.getTime() - b.when.getTime());

    const todayAll = events.filter((e) => e.when.getTime() >= from.getTime() && e.when.getTime() <= to.getTime());
    const today = todayAll.slice(0, 6);
    const upcoming = events.filter((e) => e.when.getTime() > to.getTime()).slice(0, 6);

    const days = Array.from({ length: 7 }).map((_, idx) => {
      const d = addDays(from, idx);
      const key = toLocalDateKey(d);
      let count = 0;
      for (const ev of events) {
        if (toLocalDateKey(ev.when) === key) count++;
      }
      return { key, date: d, count };
    });

    return { today, todayCount: todayAll.length, upcoming, days, todayAll };
  }, [lembretesList]);

  /* -------------------- estudosCompact -------------------- */
  const estudosCompact = useMemo(() => {
    const tarefas = Array.isArray(estudosBase?.tarefas) ? estudosBase.tarefas : [];
    const now = new Date();
    const from = startOfDay(now);
    const to = endOfDay(now);
    const todayKey = toLocalDateKey(now);

    const all = tarefas
      .filter((t) => t && t.ymd)
      .map((t) => ({
        id: t.id,
        ymd: String(t.ymd),
        hora: String(t.hora || ""),
        materia: String(t.materia || "Estudos"),
        conteudo: String(t.conteudo || ""),
        status: String(t.status || "pendente"),
        minutos: Number(t.minutos || 0),
        tipo: String(t.tipo || "conteudo"),
        nota: String(t.nota || ""),
        raw: t,
      }));

    const todayAll = all
      .filter((t) => t.ymd === todayKey)
      .sort((a, b) => (a.hora || "99:99").localeCompare(b.hora || "99:99"));

    const todayPendingAll = todayAll.filter((t) => t.status !== "feito");
    const todayPending = todayPendingAll.slice(0, 6);

    const next7 = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(from, i);
      const key = toLocalDateKey(d);
      const itens = all
        .filter((t) => t.ymd === key && t.status !== "feito")
        .sort((a, b) => (a.hora || "99:99").localeCompare(b.hora || "99:99"));
      next7.push({ key, date: d, count: itens.length, itens: itens.slice(0, 6) });
    }

    const afterToday = all
      .filter((t) => t.status !== "feito")
      .filter((t) => {
        const dt = new Date(t.ymd + "T00:00:00");
        if (Number.isNaN(dt.getTime())) return false;
        return dt.getTime() > to.getTime();
      })
      .sort((a, b) => {
        const ad = String(a.ymd || "");
        const bd = String(b.ymd || "");
        if (ad !== bd) return ad.localeCompare(bd);
        return (a.hora || "99:99").localeCompare(b.hora || "99:99");
      })
      .slice(0, 6);

    return {
      todayAll,
      todayPendingAll,
      todayPending,
      todayPendingCount: todayPendingAll.length,
      days: next7.map((x) => ({ key: x.key, date: x.date, count: x.count })),
      upcoming: afterToday,
      todayKey,
    };
  }, [estudosBase]);

  /* -------------------- ✅ Notificação ao abrir (1x por dia) -------------------- */
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const todayKey = toLocalDateKey(new Date());
    const keyLS = user?.uid ? `pwa_fin_today_notif_${user.uid}` : "pwa_fin_today_notif_local";
    const last = localStorage.getItem(keyLS) || "";
    if (last === todayKey) return;

    const lembHoje = (lembretesCompact.todayAll || []).length;
    const estHoje = Number(estudosCompact.todayPendingCount || 0);

    if (lembHoje <= 0 && estHoje <= 0) return;

    const lines = [];

    if (lembHoje > 0) {
      const top = (lembretesCompact.todayAll || [])
        .slice(0, 6)
        .map((t) => `• ${t.titulo}${t.when ? ` (${fmtTimeHHmm(t.when)})` : ""}`);
      lines.push(`📌 Lembretes hoje: ${lembHoje}`);
      lines.push(...top);
    }

    if (estHoje > 0) {
      const top = (estudosCompact.todayPendingAll || [])
        .slice(0, 6)
        .map((t) => `• ${t.hora ? t.hora + " " : ""}${t.materia}: ${t.conteudo}`.trim());
      if (lines.length) lines.push("");
      lines.push(`📚 Estudos hoje: ${estHoje}`);
      lines.push(...top);
    }

    const body = lines.join("\n").slice(0, 900);
    showTopBarNotification("✅ Seu dia (Finanças)", body, "financas-dia");

    try {
      localStorage.setItem(keyLS, todayKey);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lembretesCompact.todayCount, estudosCompact.todayPendingCount, notifStatus]);

  return (
    <div
      className="page financas-ordem-pagina"
      style={{
        width: "100%",
        maxWidth: 900,
        minWidth: 0,
        margin: "0 auto",
        padding: "16px clamp(10px, 3vw, 18px) 96px",
        boxSizing: "border-box",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <h2 className="page-title">Visão geral do mês</h2>

      {/* NAVEGAÇÃO DO MÊS */}
      <div className="card financas-bloco-mes financas-card-com-ajuda" style={{ textAlign: "center", marginBottom: 0, width: "100%", minWidth: 0, boxSizing: "border-box" }}>
        <button type="button" className="financas-ajuda-btn" onClick={() => setAjudaAberta({ titulo: "Visão geral do mês", texto: "Escolha o mês que deseja consultar. Os valores, categorias e semanas abaixo mudam junto com ele." })} aria-label="Explicação sobre a visão geral do mês">?</button>
        <h3>
          {nomeMes} / {mesReferencia?.ano ?? new Date().getFullYear()}
        </h3>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 10, width: "100%" }}>
          <button className="toggle-btn" style={{ flex: "1 1 105px", minWidth: 0 }} onClick={() => mudarMesReferencia?.(-1)}>
            ◀ Mês anterior
          </button>
          <button className="toggle-btn toggle-active" style={{ flex: "1 1 82px", minWidth: 0 }} onClick={irParaMesAtual}>
            ● Atual
          </button>
          <button className="toggle-btn" style={{ flex: "1 1 105px", minWidth: 0 }} onClick={() => mudarMesReferencia?.(1)}>
            Próximo mês ▶
          </button>
        </div>
      </div>



      {/* MÉDIAS + EVOLUÇÃO FINANCEIRA */}
      <div
        className="card mt financas-bloco-medias financas-card-com-ajuda"
        style={{
          border: "1px solid rgba(148, 163, 184, 0.22)",
          overflow: "hidden",
          width: "100%",
          minWidth: 0,
          boxSizing: "border-box",
        }}
      >
        <button type="button" className="financas-ajuda-btn" onClick={() => setAjudaAberta({ titulo: "Média dos últimos meses", texto: "Compara o mês aberto com os meses completos anteriores. Clique na quantidade de meses para escolher de 1 a 6 meses." })} aria-label="Explicação sobre as médias">?</button>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <div>
            <h3 style={{ marginBottom: 4 }}>📊 Média dos últimos meses</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {historicoFinanceiro.quantidadeMaximaDisponivel > 0
                ? `Baseada em até ${historicoFinanceiro.quantidadeMaximaDisponivel} ${historicoFinanceiro.quantidadeMaximaDisponivel === 1 ? "mês completo anterior com dados" : "meses completos anteriores com dados"}.`
                : "Ainda não há meses completos anteriores com dados."}
            </p>
          </div>

          <div className="financas-escolha-meses">
            <button
              type="button"
              className="financas-meses-analisados"
              onClick={() => setMostrarEscolhaMeses((aberto) => !aberto)}
              aria-expanded={mostrarEscolhaMeses}
            >
              {historicoFinanceiro.mesesComDados.length} mês(es) analisado(s) ▾
            </button>

            {mostrarEscolhaMeses && (
              <div className="financas-opcoes-meses" role="group" aria-label="Quantidade de meses para analisar">
                {[1, 2, 3, 4, 5, 6].map((quantidade) => {
                  const indisponivel =
                    quantidade > historicoFinanceiro.quantidadeMaximaDisponivel;
                  return (
                  <button
                    type="button"
                    key={quantidade}
                    className={quantidadeMesesAnalise === quantidade ? "ativo" : ""}
                    disabled={indisponivel}
                    title={indisponivel ? `Não há dados suficientes para analisar ${quantidade} meses.` : undefined}
                    onClick={() => {
                      if (indisponivel) return;
                      setQuantidadeMesesAnalise(quantidade);
                      setMostrarEscolhaMeses(false);
                    }}
                  >
                    {quantidade} {quantidade === 1 ? "mês" : "meses"}
                    {indisponivel ? " — sem dados" : ""}
                  </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.16)",
            }}
          >
            <p className="resumo-label" style={{ marginTop: 0 }}>
              Média mínima para pagar as contas
            </p>
            <p className="resumo-number" style={{ marginBottom: 4 }}>
              {formatCurrency(historicoFinanceiro.mediaContas)}
            </p>
            <span className="muted small">
              Média dos gastos fixos mensais
            </span>
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 14,
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.16)",
            }}
          >
            <p className="resumo-label" style={{ marginTop: 0 }}>
              Média para pagar o cartão
            </p>
            <p className="resumo-number" style={{ marginBottom: 4 }}>
              {formatCurrency(historicoFinanceiro.mediaCartao)}
            </p>
            <span className="muted small">
              Média usada no crédito por mês
            </span>
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 14,
              background:
                historicoFinanceiro.status === "positivo"
                  ? "rgba(16, 185, 129, 0.08)"
                  : historicoFinanceiro.status === "negativo"
                  ? "rgba(239, 68, 68, 0.08)"
                  : "rgba(148, 163, 184, 0.08)",
              border: "1px solid rgba(148, 163, 184, 0.16)",
            }}
          >
            <p className="resumo-label" style={{ marginTop: 0 }}>
              Como estou indo?
            </p>
            <p style={{ fontWeight: 800, margin: "4px 0 6px" }}>
              {historicoFinanceiro.titulo}
            </p>
            <span className="muted small">
              {historicoFinanceiro.mensagem}
            </span>
          </div>
        </div>

        {historicoFinanceiro.mesesComDados.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 10,
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px solid rgba(148, 163, 184, 0.18)",
            }}
          >
            <div>
              <span className="muted small">Despesas x média</span>
              <strong
                style={{ display: "block", marginTop: 4 }}
                className={
                  historicoFinanceiro.diferencaDespesas <= 0
                    ? "positive"
                    : "negative"
                }
              >
                {historicoFinanceiro.diferencaDespesas <= 0 ? "↓ " : "↑ "}
                {formatCurrency(Math.abs(historicoFinanceiro.diferencaDespesas))}
              </strong>
            </div>

            <div>
              <span className="muted small">Cartão x média</span>
              <strong
                style={{ display: "block", marginTop: 4 }}
                className={
                  historicoFinanceiro.diferencaCartao <= 0
                    ? "positive"
                    : "negative"
                }
              >
                {historicoFinanceiro.diferencaCartao <= 0 ? "↓ " : "↑ "}
                {formatCurrency(Math.abs(historicoFinanceiro.diferencaCartao))}
              </strong>
            </div>

            <div>
              <span className="muted small">Saldo x média</span>
              <strong
                style={{ display: "block", marginTop: 4 }}
                className={
                  historicoFinanceiro.diferencaSaldo >= 0
                    ? "positive"
                    : "negative"
                }
              >
                {historicoFinanceiro.diferencaSaldo >= 0 ? "↑ " : "↓ "}
                {formatCurrency(Math.abs(historicoFinanceiro.diferencaSaldo))}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* RECEITAS / DESPESAS / SALDO / CRÉDITO */}
      <div className="card mt financas-bloco-resumo financas-card-com-ajuda" style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
        <button type="button" className="financas-ajuda-btn" onClick={() => setAjudaAberta({ titulo: "Resumo do mês", texto: "Receitas são entradas normais. Despesas são as saídas do mês. Crédito usado mostra apenas o que foi comprado no cartão. Por padrão, os movimentos de Acertos não entram nesta tela. Toque em Mostrar Acertos somente se quiser incluí-los temporariamente nos números." })} aria-label="Explicação sobre o resumo do mês">?</button>
        <div className="resumo-grid">
          <div>
            <p className="resumo-label">Receitas do mês</p>
            <p className="resumo-number positive">{formatCurrency(resumoAtual.receitas)}</p>
            {mostrarAcertosNoResumo && Number(resumoAtual.entradasAcertos || 0) > 0 ? (
              <span className="muted small">
                + {formatCurrency(resumoAtual.entradasAcertos)} de reembolsos/acertos entrando no saldo
              </span>
            ) : null}
          </div>
          <div>
            <p className="resumo-label">Despesas do mês</p>
            <p className="resumo-number negative">{formatCurrency(resumoAtual.despesas)}</p>
          </div>
          <div>
            <p className="resumo-label">Saldo</p>
            <p
              className={
                "resumo-number financas-saldo " +
                (saldoComSalario >= 0
                  ? "financas-saldo-positivo"
                  : "financas-saldo-negativo")
              }
              style={{
                color: saldoComSalario >= 0 ? "#16a34a" : "#dc2626",
              }}
            >
              {formatCurrency(saldoComSalario)}
            </p>
          </div>
          <div>
            <p className="resumo-label">Crédito usado</p>
            <p className="resumo-number negative">{formatCurrency(resumoAtual.gastosCartao)}</p>
          </div>
        </div>
        <button
          type="button"
          className="chip"
          style={{ width: "auto", marginTop: 12 }}
          onClick={() => setMostrarAcertosNoResumo((mostrar) => !mostrar)}
        >
          {mostrarAcertosNoResumo ? "Ocultar Acertos" : "Mostrar Acertos"}
        </button>
      </div>

      {/* LIMITE + GASTOS FIXOS */}
      <div
        className={
          "card mt financas-bloco-limite financas-limite-card financas-card-com-ajuda " +
          (limiteUltrapassado ? "financas-limite-ultrapassado" : "")
        }
        style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}
      >
        <button type="button" className="financas-ajuda-btn" onClick={(evento) => { evento.stopPropagation(); setAjudaAberta({ titulo: "Limite de gasto mensal", texto: "O limite é o máximo que você quer gastar no mês.\n\n• Gastos fixos: contas repetidas, como água, moto ou Spotify. Elas entram no cálculo conforme o modo de pagamento escolhido.\n• Orçamentos variáveis: valores separados para algo, como Feira. Eles não viram despesa sozinhos; somente uma compra lançada consome esse valor.\n• Percentual utilizado: compara todas as despesas do mês com o seu limite.\n• Valor ultrapassado: mostra exatamente quanto passou do limite.\n\nToque no bloco para abrir os gastos mensais e cadastrar ou editar." }); }} aria-label="Explicação sobre o limite de gastos">?</button>
        <button
          type="button"
          className="financas-limite-cabecalho"
          onClick={() => setMostrarGastosFixos((valorAtual) => !valorAtual)}
        >
          <div>
            <h3>Limite de gasto mensal</h3>

            {limiteGastoMensal > 0 && (
              <p className="muted small">
                Limite: {formatCurrency(limiteGastoMensal)}
              </p>
            )}

            <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
              <p className="financas-total-fixos" style={{ margin: 0 }}>
                Gastos fixos: {" "}
                <strong>{formatCurrency(resumoAtual.totalGastosFixos)}</strong>
                <span className="muted small">
                  {" "}· {resumoAtual.gastosFixos?.length || 0} conta(s)
                </span>
              </p>

              <p className="financas-total-fixos" style={{ margin: 0 }}>
                Orçamentos variáveis: {" "}
                <strong>{formatCurrency(totalOrcamentosVariaveis)}</strong>
                <span className="muted small">
                  {" "}· {orcamentosVariaveis.length} orçamento(s)
                </span>
              </p>
            </div>

            <p className="muted small financas-clique-editar">
              Clique para cadastrar fixos ou orçamentos.
            </p>
          </div>

          <span className="financas-expandir-icone">
            {mostrarGastosFixos ? "▲" : "▼"}
          </span>
        </button>

        {limiteGastoMensal > 0 && (
          <>
            <div
              className={
                "progress-bar " +
                (limiteUltrapassado ? "financas-limite-linha-vermelha" : "")
              }
            >
              <div
                className={
                  "progress-fill " +
                  (limiteUltrapassado
                    ? "financas-limite-preenchimento-vermelho"
                    : "")
                }
                style={{ width: `${percLimite}%` }}
              />
            </div>

            <span className="progress-label">
              {percentualLimiteReal.toFixed(0)}% utilizado
            </span>

            {limiteUltrapassado && (
              <strong className="financas-limite-valor-ultrapassado">
                Você ultrapassou {formatCurrency(valorUltrapassadoLimite)} do limite.
              </strong>
            )}
          </>
        )}

        {mostrarGastosFixos && (
          <div className="financas-gastos-fixos-area">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(160px, 1fr) auto",
                gap: 8,
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <input
                type="number"
                min="0"
                step="0.01"
                value={limiteMensalInput}
                onChange={(e) => setLimiteMensalInput(e.target.value)}
                placeholder="Defina seu limite mensal"
                aria-label="Limite de gasto mensal"
              />

              <button
                type="button"
                className="toggle-btn toggle-active"
                onClick={salvarLimiteGastoMensal}
              >
                Salvar limite
              </button>
            </div>

            <div className="financas-gastos-titulo">
              <div>
                <h3 style={{ display: "inline-block", marginRight: 8 }}>Gastos mensais</h3>
                <button
                  type="button"
                  className="financas-ajuda-btn"
                  style={{ position: "static", verticalAlign: "middle" }}
                  onClick={() => setAjudaAberta({ titulo: "Pagamento dos gastos fixos", texto: "Pagamento automático é o modo normal: o gasto entra sozinho na despesa mensal. Ative Pagamento manual somente nos gastos que você quer confirmar. Depois, toque em Já paguei para o valor ser debitado. Se tocar em Desfazer pagamento, ele deixa de entrar novamente." })}
                  aria-label="Explicação sobre o pagamento dos gastos fixos"
                >
                  ?
                </button>
                <p className="muted small">
                  Valores de <strong>{chaveMesAtual}</strong>
                </p>
              </div>

              <div style={{ textAlign: "right" }}>
                <strong>{formatCurrency(resumoAtual.totalGastosFixos)}</strong>
                <div className="muted small">
                  Fixos · {orcamentosVariaveis.length} orçamento(s)
                </div>
              </div>
            </div>

            <div className="financas-gasto-form">
              <select
                value={modoGastoMensal}
                onChange={(evento) => setModoGastoMensal(evento.target.value)}
                aria-label="Tipo de gasto mensal"
              >
                <option value="fixo">Fixo · lançamento automático</option>
                <option value="orcamento">Variável · orçamento mensal</option>
              </select>

              <input
                type="text"
                value={nomeGastoFixo}
                onChange={(evento) => setNomeGastoFixo(evento.target.value)}
                placeholder={
                  modoGastoMensal === "orcamento"
                    ? "Nome do orçamento, ex.: Feira"
                    : "Nome do gasto fixo"
                }
              />

              <input
                type="number"
                min="0"
                step="0.01"
                value={valorGastoFixo}
                onChange={(evento) => setValorGastoFixo(evento.target.value)}
                placeholder={
                  modoGastoMensal === "orcamento"
                    ? "Orçamento mensal"
                    : "Valor mensal"
                }
              />

              {modoGastoMensal === "fixo" ? (
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={diaVencimentoGastoFixo}
                  onChange={(evento) =>
                    setDiaVencimentoGastoFixo(evento.target.value)
                  }
                  placeholder="Dia do vencimento"
                />
              ) : null}

              <select
                value={categoriaGastoFixo}
                onChange={(evento) =>
                  setCategoriaGastoFixo(evento.target.value)
                }
              >
                <option value="essencial">Essencial</option>
                <option value="lazer">Lazer</option>
                <option value="burrice">Burrice</option>
                <option value="investido">Investido</option>
              </select>

              {modoGastoMensal === "orcamento" ? (
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    gridColumn: "1 / -1",
                  }}
                >
                  <label className="muted small">
                    <input
                      type="checkbox"
                      checked={carregarSaldoPositivo}
                      onChange={(evento) =>
                        setCarregarSaldoPositivo(evento.target.checked)
                      }
                    />{" "}
                    Carregar saldo positivo para o próximo mês
                  </label>
                  <label className="muted small">
                    <input
                      type="checkbox"
                      checked={carregarSaldoNegativo}
                      onChange={(evento) =>
                        setCarregarSaldoNegativo(evento.target.checked)
                      }
                    />{" "}
                    Carregar excedente negativo para o próximo mês
                  </label>
                </div>
              ) : null}

              <button
                type="button"
                className="primary-btn"
                onClick={adicionarGastoFixo}
              >
                {modoGastoMensal === "orcamento"
                  ? "Criar orçamento"
                  : "Adicionar gasto fixo"}
              </button>
            </div>

            <p className="muted small">
              Gasto fixo novo entra automaticamente na despesa. Depois você
              pode ativar o pagamento manual em cada gasto. Orçamento variável
              não vira despesa: somente os lançamentos reais consomem o valor.
            </p>

            {gastosFixos.length === 0 ? (
              <p className="muted small financas-gastos-vazio">
                Nenhum gasto mensal cadastrado.
              </p>
            ) : (
              <div className="financas-gastos-lista">
                {gastosFixos.map((gasto) => {
                  const ativo = gasto.ativo !== false;
                  const valor = obterValorGastoFixo(gasto);
                  const variavel = ehOrcamentoVariavel(gasto);
                  const pagamentoManual = gasto.pagamentoManual === true;
                  const pagoManualNoMes = gastoFixoFoiPagoManualNoMes(
                    gasto,
                    chaveMesAtual
                  );
                  const resumoVariavel = variavel
                    ? resumoOrcamentoNoMes(gasto, transacoes, chaveMesAtual)
                    : null;

                  return (
                    <div
                      key={gasto.id}
                      className={`financas-gasto-item ${
                        ativo ? "" : "financas-gasto-inativo"
                      }`}
                    >
                      <div className="financas-gasto-info">
                        <div>
                          <strong>{gasto.nome}</strong>
                          <span className="muted small">
                            {gasto.categoria || "sem categoria"}
                            {" • "}
                            {variavel
                              ? "orçamento mensal variável"
                              : `fixo · vence dia ${gasto.diaVencimento || 1}`}
                            {!variavel && pagamentoManual && (
                              pagoManualNoMes
                                ? " • pago manualmente"
                                : " • aguardando você confirmar"
                            )}
                            {!variavel && !pagamentoManual && " • automático"}
                            {!ativo && " • desativado"}
                          </span>
                        </div>

                        <strong>
                          {variavel
                            ? formatCurrency(resumoVariavel.disponivel)
                            : formatCurrency(valor)}
                        </strong>
                      </div>

                      {variavel ? (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(120px, 1fr))",
                            gap: 8,
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 12,
                            background: "rgba(59,130,246,.08)",
                          }}
                        >
                          <div>
                            <span className="muted small">Orçamento</span>
                            <br />
                            <strong>{formatCurrency(resumoVariavel.orcamentoBase)}</strong>
                          </div>
                          <div>
                            <span className="muted small">Saldo anterior</span>
                            <br />
                            <strong
                              style={{
                                color:
                                  resumoVariavel.saldoAnterior < 0
                                    ? "#dc2626"
                                    : "#16a34a",
                              }}
                            >
                              {resumoVariavel.saldoAnterior > 0 ? "+ " : ""}
                              {formatCurrency(resumoVariavel.saldoAnterior)}
                            </strong>
                          </div>
                          <div>
                            <span className="muted small">Disponível</span>
                            <br />
                            <strong>{formatCurrency(resumoVariavel.disponivel)}</strong>
                          </div>
                          <div>
                            <span className="muted small">Gastos reais</span>
                            <br />
                            <strong>{formatCurrency(resumoVariavel.gasto)}</strong>
                          </div>
                          <div>
                            <span className="muted small">
                              {resumoVariavel.excedente > 0
                                ? "Excedente"
                                : "Restante"}
                            </span>
                            <br />
                            <strong
                              style={{
                                color:
                                  resumoVariavel.excedente > 0
                                    ? "#dc2626"
                                    : "#16a34a",
                              }}
                            >
                              {resumoVariavel.excedente > 0 ? "- " : "+ "}
                              {formatCurrency(
                                resumoVariavel.excedente > 0
                                  ? resumoVariavel.excedente
                                  : resumoVariavel.restante
                              )}
                            </strong>
                          </div>
                        </div>
                      ) : null}

                      {variavel ? (
                        <p className="muted small" style={{ marginTop: 8 }}>
                          Para consumir este orçamento, lance uma despesa com
                          o nome <strong>{gasto.nome}</strong>, por exemplo:
                          {" "}<strong>{gasto.nome} — compra 1</strong>.
                        </p>
                      ) : null}

                      {!variavel && ativo ? (
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            marginTop: 10,
                          }}
                        >
                          <button
                            type="button"
                            className={
                              "toggle-btn " +
                              (pagamentoManual ? "toggle-active" : "")
                            }
                            onClick={() =>
                              alternarPagamentoManualGastoFixo(gasto.id)
                            }
                          >
                            {pagamentoManual
                              ? "Pagamento manual: ativado"
                              : "Pagamento manual: desativado"}
                          </button>

                          {pagamentoManual ? (
                            <button
                              type="button"
                              className={
                                pagoManualNoMes ? "toggle-btn" : "primary-btn"
                              }
                              style={{ width: "auto" }}
                              onClick={() =>
                                marcarGastoFixoComoPago(
                                  gasto.id,
                                  !pagoManualNoMes
                                )
                              }
                            >
                              {pagoManualNoMes
                                ? "↩ Desfazer pagamento"
                                : "✓ Já paguei"}
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {gastoFixoEditando === gasto.id ? (
                        <div className="financas-gasto-edicao">
                          <select
                            value={modoGastoEditando}
                            onChange={(evento) =>
                              setModoGastoEditando(evento.target.value)
                            }
                          >
                            <option value="fixo">Fixo</option>
                            <option value="orcamento">Variável / Orçamento</option>
                          </select>

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={valorGastoEditando}
                            onChange={(evento) =>
                              setValorGastoEditando(
                                evento.target.value
                              )
                            }
                            placeholder="Novo valor"
                          />

                          {modoGastoEditando === "fixo" ? (
                            <input
                              type="number"
                              min="1"
                              max="31"
                              value={diaGastoEditando}
                              onChange={(evento) =>
                                setDiaGastoEditando(evento.target.value)
                              }
                              placeholder="Dia"
                            />
                          ) : null}

                          {modoGastoEditando === "orcamento" ? (
                            <div
                              style={{
                                display: "grid",
                                gap: 8,
                                gridColumn: "1 / -1",
                              }}
                            >
                              <label className="muted small">
                                <input
                                  type="checkbox"
                                  checked={carregarPositivoEditando}
                                  onChange={(evento) =>
                                    setCarregarPositivoEditando(
                                      evento.target.checked
                                    )
                                  }
                                />{" "}
                                Carregar saldo positivo
                              </label>
                              <label className="muted small">
                                <input
                                  type="checkbox"
                                  checked={carregarNegativoEditando}
                                  onChange={(evento) =>
                                    setCarregarNegativoEditando(
                                      evento.target.checked
                                    )
                                  }
                                />{" "}
                                Carregar excedente negativo
                              </label>
                            </div>
                          ) : null}

                          <button
                            type="button"
                            className="primary-btn"
                            onClick={() => salvarEdicaoGastoFixo(gasto.id)}
                          >
                            Salvar
                          </button>

                          <button
                            type="button"
                            className="toggle-btn"
                            onClick={cancelarEdicaoGastoFixo}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="financas-gasto-acoes">
                          <button
                            type="button"
                            className="toggle-btn"
                            onClick={() => iniciarEdicaoGastoFixo(gasto)}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            className="toggle-btn"
                            onClick={() => alternarGastoFixo(gasto.id)}
                          >
                            {ativo ? "Desativar" : "Ativar"}
                          </button>

                          <button
                            type="button"
                            className="financas-gasto-remover"
                            onClick={() => removerGastoFixo(gasto.id)}
                          >
                            Remover
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* TOP GASTOS */}
      <div className="card mt financas-bloco-top-gastos financas-card-com-ajuda" style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
        <button type="button" className="financas-ajuda-btn" onClick={() => setAjudaAberta({ titulo: "Top 5 gastos", texto: "Mostra as cinco maiores despesas lançadas no mês selecionado." })} aria-label="Explicação sobre os maiores gastos">?</button>
        <h3>Top 5 gastos</h3>
        {(resumoAtual.topDespesas || []).length === 0 ? (
          <p className="muted">Nenhuma despesa ainda.</p>
        ) : (
          <ul className="list">
            {resumoAtual.topDespesas.map((t) => (
              <li key={t.id} className="list-item">
                <span>
                  {t.descricao} {t.count > 1 ? <span className="muted small"> · {t.count}x</span> : null}
                </span>
                <span>{formatCurrency(t.valor)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* CATEGORIAS / SEMANAS */}
      <div
        className="grid-2 mt financas-bloco-categorias-semanas"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
          width: "100%",
          minWidth: 0,
        }}
      >
        <div className="card financas-card-com-ajuda" onClick={() => setModalCategorias(true)} style={{ cursor: "pointer", width: "100%", minWidth: 0, boxSizing: "border-box" }} title="Clique para abrir detalhes">
          <button type="button" className="financas-ajuda-btn" onClick={(evento) => { evento.stopPropagation(); setAjudaAberta({ titulo: "Gasto por categoria", texto: "Cada despesa é classificada como Essencial, Lazer, Burrice ou Investido. Clique no cartão, fora do ?, para abrir os detalhes." }); }} aria-label="Explicação sobre categorias">?</button>
          <h3>Gasto por categoria</h3>
          <div className="pizza-chart-wrapper">
            <div className="pizza-chart" style={pizzaStyle} />
          </div>
          <div className="legend">
            <div className="legend-item">
              <span className="legend-color legend-essential" /> Essencial ({resumoAtual.pEssencial.toFixed(0)}%)
            </div>
            <div className="legend-item">
              <span className="legend-color legend-leisure" /> Lazer ({resumoAtual.pLazer.toFixed(0)}%)
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ background: "#F59E0B" }} /> Burrice ({(resumoAtual.pBurrice || 0).toFixed(0)}%)
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ background: "#10B981" }} /> Investido ({(resumoAtual.pInvestido || 0).toFixed(0)}%)
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>
              (Clique para abrir detalhes)
            </p>
          </div>
        </div>

        <div
          className="card financas-semanas-card financas-card-com-ajuda"
          style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}
          onClick={() => {
            if (!mostrarOutrasSemanas) abrirOutrasSemanas();
          }}
          title="Clique em uma área vazia deste quadro para ver todas as semanas do ano"
        >
          <div className="financas-semanas-topo" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <h3 style={{ marginRight: "auto" }}>Gastos Semanais</h3>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flexWrap: "nowrap", maxWidth: "100%" }}>
              <button
                type="button"
                className="financas-ajuda-btn"
                style={{ position: "static", inset: "auto", flex: "0 0 auto", margin: 0 }}
                onClick={(evento) => {
                  evento.stopPropagation();
                  setAjudaAberta({ titulo: "Gastos semanais", texto: "A tela mostra quatro semanas, com a última como semana atual. Clique numa semana para ver o resumo; use Compras da semana para abrir as compras. Outras Semanas permite consultar qualquer semana do ano." });
                }}
                aria-label="Explicação sobre gastos semanais"
              >
                ?
              </button>
              <button
                type="button"
                className="financas-ver-semanas-btn"
                style={{ flex: "0 1 auto", minWidth: 0, whiteSpace: "nowrap", fontSize: "clamp(0.58rem, 2.2vw, 0.78rem)", padding: "6px 7px" }}
                onClick={(evento) => {
                  evento.stopPropagation();
                  mostrarOutrasSemanas ? fecharOutrasSemanas() : abrirOutrasSemanas();
                }}
              >
                {mostrarOutrasSemanas ? "Voltar" : "Outras Semanas"}
              </button>
            </div>
          </div>
          {!mostrarOutrasSemanas ? (
            <>
              <div className="weeks-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                {gastosPorSemana.quatroSemanas.map((semana, indice) => (
                  <button
                    type="button"
                    key={semana.chave}
                    ref={(elemento) => {
                      refsSemanas.current[semana.chave] = elemento;
                    }}
                    className={`week-cell ${indice === 3 ? "week-cell-atual" : ""} ${semanaDetalhada === semana.chave ? "week-cell-selecionada" : ""}`}
                    style={{
                      minWidth: 0,
                      padding: "7px 3px",
                      overflow: "hidden",
                      boxSizing: "border-box",
                    }}
                    onClick={(evento) => {
                      // O clique no quadrinho mostra o resumo daquela semana;
                      // não deve abrir a lista anual junto.
                      evento.stopPropagation();
                      selecionarSemana(semana.chave);
                    }}
                  >
                    <span
                      className="financas-semana-data"
                      style={{
                        display: "block",
                        width: "100%",
                        fontSize: "clamp(0.48rem, 2vw, 0.64rem)",
                        lineHeight: 1.15,
                        textAlign: "center",
                        whiteSpace: "normal",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {semana.rotulo}
                    </span>
                    <strong
                      className="week-value"
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: 4,
                        fontSize: "clamp(0.56rem, 2.35vw, 0.76rem)",
                        lineHeight: 1.15,
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatCurrency(semana.total)}
                    </strong>
                  </button>
                ))}
              </div>
              {semanaDetalhada && renderizarDetalhesSemana(
                gastosPorSemana.quatroSemanas.find((semana) => semana.chave === semanaDetalhada)
              )}
            </>
          ) : (
            <div className="financas-semanas-scroll">
              <p className="muted small">Todas as semanas de {mesReferencia?.ano ?? new Date().getFullYear()}. Clique em uma semana para ver o resumo.</p>
              {gastosPorSemana.semanasExplorar.map((semana) => {
                const aberta = semanaDetalhada === semana.chave;
                const atual = semana.chave === gastosPorSemana.chavePrincipal;
                return (
                  <div
                    key={semana.chave}
                    ref={(elemento) => {
                      refsSemanas.current[semana.chave] = elemento;
                    }}
                    className={`financas-semana-scroll-item ${atual ? "financas-semana-scroll-principal" : ""} ${aberta ? "financas-semana-scroll-selecionada" : ""}`}
                  >
                    <button
                      type="button"
                      className="financas-semana-scroll-botao"
                      onClick={() => selecionarSemana(semana.chave)}
                    >
                      <span>{semana.rotulo}</span>
                      <strong>{formatCurrency(semana.total)}</strong>
                    </button>
                    {aberta && renderizarDetalhesSemana(semana)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {semanaComprasModal && (
        <div className="modal-overlay" onClick={() => setSemanaComprasModal(null)}>
          <div className="modal-card financas-modal-compras" onClick={(evento) => evento.stopPropagation()}>
            <div className="financas-modal-compras-topo">
              <div>
                <h3>Compras da semana</h3>
                <p className="muted small">{semanaComprasModal.rotulo} · {formatCurrency(semanaComprasModal.total)}</p>
              </div>
              <button type="button" className="financas-fechar-modal" onClick={() => setSemanaComprasModal(null)} aria-label="Fechar">×</button>
            </div>

            {semanaComprasModal.itens?.length ? (
              <ul className="financas-compras-semana-lista">
                {semanaComprasModal.itens.map((item) => (
                  <li key={item.id} className="financas-compra-semana-item">
                    <div>
                      <strong>{item.descricao}</strong>
                      <span>{formatarDiaMes(item.data)} · {item.categoria}{item.fixo ? " · Gasto fixo" : ""}</span>
                    </div>
                    <strong>{formatCurrency(item.valor)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Nenhuma compra registrada nesta semana.</p>
            )}
          </div>
        </div>
      )}

      {ajudaAberta && (
        <div className="modal-overlay" onClick={() => setAjudaAberta(null)}>
          <div className="modal-card financas-modal-ajuda" onClick={(evento) => evento.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="titulo-ajuda-financas">
            <div className="financas-modal-compras-topo">
              <div>
                <p className="muted small" style={{ margin: 0 }}>Ajuda</p>
                <h3 id="titulo-ajuda-financas">{ajudaAberta.titulo}</h3>
              </div>
              <button type="button" className="financas-fechar-modal" onClick={() => setAjudaAberta(null)} aria-label="Fechar explicação">×</button>
            </div>
            <p className="financas-texto-ajuda">{ajudaAberta.texto}</p>
            <button type="button" className="toggle-btn toggle-active" onClick={() => setAjudaAberta(null)}>Entendi</button>
          </div>
        </div>
      )}

      {/* MODAL DETALHADO */}
      {modalCategorias && (
        <div className="modal-overlay" onClick={() => setModalCategorias(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Detalhes do mês</h3>
            <p className="muted small" style={{ marginTop: 4 }}>
              {nomeMes} / {mesReferencia?.ano ?? new Date().getFullYear()}
            </p>

            {/* ✅ NOVO: VISÃO ESTRATÉGICA (5 blocos) */}
            <div className="card" style={{ marginTop: 10 }}>
              <h4 style={{ marginBottom: 8 }}>💡 Visão estratégica</h4>
              <p className="muted small" style={{ marginTop: 0 }}>
                (Divide seus gastos em 5 blocos: essenciais, crescimento, qualidade, financeiro e descontrole.)
              </p>

              <ul className="list" style={{ marginTop: 8 }}>
                {(detalhesCategorias.blocosList || []).map((b) => (
                  <li key={b.key} className="list-item">
                    <span>
                      {b.label}{" "}
                      <span className="muted small">· {b.pct ? b.pct.toFixed(0) : "0"}%</span>
                    </span>
                    <span>{formatCurrency(b.total)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* ✅ NOVO: CATEGORIAS DETALHADAS (MORADIA, TRANSPORTE, etc.) */}
            <div className="card" style={{ marginTop: 10 }}>
              <h4 style={{ marginBottom: 8 }}>🧭 Categorias detalhadas</h4>
              <p className="muted small" style={{ marginTop: 0 }}>
                (Classificação automática por palavras-chave + sua categoria do app.)
              </p>

              {(detalhesCategorias.groupsList || []).length === 0 ? (
                <p className="muted small">Sem dados suficientes para classificar.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {(detalhesCategorias.groupsList || []).map((g) => (
                    <div key={g.key} className="card" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.08)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span>
                          <b>{g.label}</b>
                        </span>
                        <span>
                          <b>{formatCurrency(g.total)}</b>
                        </span>
                      </div>

                      {Array.isArray(g.topItens) && g.topItens.length > 0 ? (
                        <>
                          <p className="muted small" style={{ marginTop: 8 }}>
                            Top itens:
                          </p>
                          <ul className="list" style={{ marginTop: 6 }}>
                            {g.topItens.map((x, idx) => (
                              <li key={idx} className="list-item">
                                <span>
                                  {x.descricao}{" "}
                                  {x.count > 1 ? <span className="muted small"> · {x.count}x</span> : null}
                                </span>
                                <span>{formatCurrency(x.total)}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p className="muted small" style={{ marginTop: 8 }}>
                          (Sem itens detalhados.)
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ✅ O QUE JÁ EXISTIA (mantido) */}
            <div className="card" style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span>
                  <b>Total de despesas</b>
                </span>
                <span>
                  <b>{formatCurrency(detalhesCategorias.totalMes)}</b>
                </span>
              </div>
              <p className="muted small" style={{ marginTop: 6 }}>
                (Inclui despesas do histórico + gastos fixos ativos)
              </p>
            </div>

            <div className="card" style={{ marginTop: 10 }}>
              <h4 style={{ marginBottom: 8 }}>📌 Total por categoria</h4>
              <ul className="list">
                <li className="list-item">
                  <span>Essencial</span>
                  <span>{formatCurrency(detalhesCategorias.totalPorCategoria.essencial)}</span>
                </li>
                <li className="list-item">
                  <span>Lazer</span>
                  <span>{formatCurrency(detalhesCategorias.totalPorCategoria.lazer)}</span>
                </li>
                <li className="list-item">
                  <span>Burrice</span>
                  <span>{formatCurrency(detalhesCategorias.totalPorCategoria.burrice)}</span>
                </li>
                <li className="list-item">
                  <span>Investido</span>
                  <span>{formatCurrency(detalhesCategorias.totalPorCategoria.investido)}</span>
                </li>
                {detalhesCategorias.totalPorCategoria.outras > 0 && (
                  <li className="list-item">
                    <span>Outras</span>
                    <span>{formatCurrency(detalhesCategorias.totalPorCategoria.outras)}</span>
                  </li>
                )}
              </ul>
            </div>

            <div className="card" style={{ marginTop: 10 }}>
              <h4 style={{ marginBottom: 8 }}>🍔 Comida</h4>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span>Total</span>
                <span>
                  <b>{formatCurrency(detalhesCategorias.totalFood)}</b>
                </span>
              </div>

              <p className="muted small" style={{ marginTop: 8 }}>
                Itens de comida (somados):
              </p>

              {detalhesCategorias.foodByDesc.length === 0 ? (
                <p className="muted small">Nenhum gasto de comida encontrado.</p>
              ) : (
                <ul className="list" style={{ marginTop: 6 }}>
                  {detalhesCategorias.foodByDesc.map((x, idx) => (
                    <li key={idx} className="list-item">
                      <span>
                        {x.descricao}{" "}
                        {x.count > 1 ? <span className="muted small"> · {x.count}x</span> : null}
                      </span>
                      <span>{formatCurrency(x.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card" style={{ marginTop: 10 }}>
              <h4 style={{ marginBottom: 8 }}>🚗 Transporte</h4>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span>Total</span>
                <span>
                  <b>{formatCurrency(detalhesCategorias.totalTransport)}</b>
                </span>
              </div>

              <p className="muted small" style={{ marginTop: 10 }}>
                Itens de transporte (somados):
              </p>

              {detalhesCategorias.transportByDesc.length === 0 ? (
                <p className="muted small">Nenhum gasto de transporte encontrado.</p>
              ) : (
                <ul className="list" style={{ marginTop: 6 }}>
                  {detalhesCategorias.transportByDesc.map((x, idx) => (
                    <li key={idx} className="list-item">
                      <span>
                        {x.descricao}{" "}
                        {x.count > 1 ? <span className="muted small"> · {x.count}x</span> : null}
                      </span>
                      <span>{formatCurrency(x.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="toggle-btn" type="button" onClick={() => setModalCategorias(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarAlertaLimite && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Limite de gastos atingido"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(0, 0, 0, 0.55)",
            backdropFilter: "blur(4px)",
          }}
          onClick={fecharAlertaLimite}
        >
          <div
            className="card"
            style={{
              width: "min(420px, 100%)",
              textAlign: "center",
              padding: "28px 22px",
              boxShadow: "0 24px 70px rgba(0,0,0,.30)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              aria-hidden="true"
              style={{
                fontSize: 82,
                lineHeight: 1,
                marginBottom: 14,
              }}
            >
              😢
            </div>

            <h2 style={{ margin: 0 }}>Limite de gastos atingido</h2>

            <p className="muted" style={{ marginTop: 10 }}>
              Você chegou ao limite de gastos que definiu para este mês.
            </p>

            {limiteGastoMensal > 0 && (
              <div style={{ marginTop: 14 }}>
                <strong>{formatCurrency(resumoAtual.despesas)}</strong> gastos de{" "}
                <strong>{formatCurrency(limiteGastoMensal)}</strong> de limite.
              </div>
            )}

            <button
              type="button"
              className="toggle-btn toggle-active"
              style={{ marginTop: 20, minWidth: 130 }}
              onClick={fecharAlertaLimite}
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
