// src/pages/HistoricoPage.jsx

// Importa o React e hooks:
// - useMemo: memoriza cálculos pesados (evita recalcular sem necessidade)
// - useState: cria estados para filtros, edição, modais, etc.
import React, { useMemo, useState } from "react";

// Importa o hook do seu contexto (App.jsx) que fornece dados e funções do app de finanças
import { useFinance } from "../../App.jsx";

// Formata qualquer valor numérico em moeda brasileira (R$)
// Ex.: 10 -> "R$ 10,00"
function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// ✅ parse robusto: aceita ISO string, timestamp number, timestamp string ("1700000000000")
// Essa função transforma diferentes formatos de data em um objeto Date válido (ou inválido).
function parseDateValue(value) {
  // Se vier null/undefined, retorna um Date inválido (NaN) para tratar depois.
  if (value == null) return new Date(NaN);

  // Se já for número (timestamp), cria Date direto.
  if (typeof value === "number") return new Date(value);

  // Converte para string e remove espaços.
  const s = String(value).trim();

  // Se a string tiver só números, assume que é timestamp em ms.
  if (/^\d+$/.test(s)) return new Date(Number(s));

  // Caso contrário, tenta interpretar como ISO ou string compatível com Date.
  return new Date(s);
}

// Formata a data (sem hora) para pt-BR.
// Se a data for inválida, mostra "Data inválida".
function formatDate(dateValue) {
  const d = parseDateValue(dateValue);
  if (isNaN(d.getTime())) return "Data inválida";
  return d.toLocaleDateString("pt-BR");
}

// Formata apenas a hora (HH:mm) para pt-BR.
// Se a data for inválida, retorna "--:--".
function formatTime(dateValue) {
  const d = parseDateValue(dateValue);
  if (isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ✅ ADICIONADO: chave do mês "YYYY-MM" para comparar meses
function monthKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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

function isBusinessDay(d) {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function nthBusinessDayOfMonth(year, month0, n) {
  const N = Number(n || 0);
  if (!N || N < 1) return null;

  let count = 0;
  for (let day = 1; day <= 31; day += 1) {
    const d = new Date(year, month0, day);
    if (d.getMonth() !== month0) break;
    if (isBusinessDay(d)) {
      count += 1;
      if (count === N) return d;
    }
  }

  for (let day = 31; day >= 1; day -= 1) {
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

function cycleRangeByBusinessPayDay(year, month0, nthBiz) {
  const payThis = nthBusinessDayOfMonth(year, month0, nthBiz);
  if (!payThis) return null;

  const start = startOfDay0(addDaysSafe(payThis, 1));

  const nextMonth0 = month0 === 11 ? 0 : month0 + 1;
  const nextYear = month0 === 11 ? year + 1 : year;
  const payNext =
    nthBusinessDayOfMonth(nextYear, nextMonth0, nthBiz) ||
    new Date(nextYear, nextMonth0, 1);

  const end = startOfDay0(payNext);

  return { start, end };
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

// ✅ normaliza nomes p/ juntar iguais
// Isso padroniza a descrição (trim + minúsculo + espaços únicos),
// para conseguir agrupar "Uber", " uber  ", "UBER" como a mesma coisa.
function normalizarDescricao(desc) {
  return String(desc || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// ✅ ADICIONADO: padroniza label da categoria (ex.: "investido" -> "Investido")
function categoriaLabel(cat) {
  const s = String(cat || "").trim();
  if (!s) return "";
  const low = s.toLowerCase();

  if (low === "investido") return "Investido";
  if (low === "burrice") return "Burrice";
  if (low === "besteira") return "Besteira";
  if (low === "essencial") return "Essencial";
  if (low === "lazer") return "Lazer";

  // fallback: só coloca primeira letra maiúscula
  return s.charAt(0).toUpperCase() + s.slice(1);
}


function tipoLabel(tipo) {
  if (tipo === "despesa") return "Despesa";
  if (tipo === "receita") return "Receita";
  if (tipo === "reembolso") return "Reembolso / Acerto";
  if (tipo === "nulo") return "Dívida · sem movimentar saldo";
  return String(tipo || "Movimento");
}

function valorComSinal(tipo, valor) {
  const numero = Number(valor || 0);
  if (tipo === "despesa") return -numero;
  if (tipo === "receita" || tipo === "reembolso") return numero;
  return 0;
}

// Componente principal da página de Histórico
export default function HistoricoPage() {
  // Puxa do contexto:
  // - transacoes: lista completa de transações
  // - cartoes: lista de cartões
  // - atualizarTransacao: função para editar uma transação existente
  // - removerTransacao: função para apagar transação
  // - mesReferencia: mês/ano selecionados na Visão Geral (Finanças)
  const {
    transacoes,
    cartoes,
    atualizarTransacao,
    removerTransacao,
    mesReferencia, // 👈 mês da Visão geral
    profile,
  } = useFinance();

  // Estados dos filtros (o usuário mexe na UI e isso muda a lista exibida)
  const [tipoFilter, setTipoFilter] = useState("todos"); // "todos" | "despesa" | "receita"
  const [categoriaFilter, setCategoriaFilter] = useState("todas"); // filtro por categoria
  const [formaFilter, setFormaFilter] = useState("todas"); // filtro por formaPagamento
  const [cartaoFilter, setCartaoFilter] = useState("todos"); // filtro por cartaoId
  const [textoFilter, setTextoFilter] = useState(""); // filtro por texto (descricao)
  const [dataInicio, setDataInicio] = useState(""); // filtro data inicial (input date)
  const [dataFim, setDataFim] = useState(""); // filtro data final (input date)

  // ✅ ADICIONADO: alterna se parcelas futuras aparecem no histórico
  // Padrão: false (oculta futuras)
  const [mostrarParcelasFuturas, setMostrarParcelasFuturas] = useState(false);

  // Filtros ficam escondidos por padrão.
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Ajuda resumida da página.
  const [mostrarAjuda, setMostrarAjuda] = useState(false);

  // 🔧 estados para edição
  // "editando" guarda a transação atualmente selecionada para editar (ou null se não estiver editando).
  const [editando, setEditando] = useState(null);
  // Campos do formulário do modal de edição:
  const [descricaoEdit, setDescricaoEdit] = useState("");
  const [valorEdit, setValorEdit] = useState("");
  const [tipoEdit, setTipoEdit] = useState("despesa");
  const [categoriaEdit, setCategoriaEdit] = useState("Essencial");
  const [formaEdit, setFormaEdit] = useState("dinheiro");
  const [cartaoEdit, setCartaoEdit] = useState("");

  // 🗑️ modal de exclusão
  // Guarda a transação que o usuário está prestes a apagar (ou null se não estiver confirmando).
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(null);

  // ✅ expandir itens quando agrupado na busca
  // Guarda quais grupos estão “abertos” na UI quando há busca por texto.
  // Ex.: { "despesa::uber": true }
  const [abertos, setAbertos] = useState({}); // { [groupKey]: true }

  // Cria um mapa (id -> nome do cartão) para não ficar procurando nome toda hora.
  // useMemo evita recalcular se "cartoes" não mudar.
  const cartaoNomePorId = useMemo(() => {
    const map = {};
    cartoes.forEach((c) => (map[c.id] = c.nome));
    return map;
  }, [cartoes]);

  // Resultado calculado (lista filtrada + agrupamentos + resumo)
  // useMemo evita recomputar isso toda renderização sem necessidade.
  const resultado = useMemo(() => {
    // 1) LISTA BASE = tudo que já foi lançado, com filtros
    // Começa com todas as transações.
    let listaBase = [...transacoes];

    // ✅ ADICIONADO: ocultar parcelas futuras até chegar no mês selecionado
    // - só afeta transações parceladas (groupId + parcelaTotal > 1)
    // - só funciona bem quando existe mesReferencia
    if (mesReferencia && !mostrarParcelasFuturas) {
      const chaveMesSelecionado = `${mesReferencia.ano}-${String(
        mesReferencia.mes + 1
      ).padStart(2, "0")}`;

      listaBase = listaBase.filter((t) => {
        // Só mexe em parceladas
        if (!(t.groupId && t.parcelaTotal && t.parcelaTotal > 1)) return true;

        const dt = parseDateValue(t.dataHora);
        if (isNaN(dt.getTime())) return true;

        const mk = monthKeyFromDate(dt);
        // Se for parcela de mês FUTURO, esconde
        return mk <= chaveMesSelecionado;
      });
    }

    // Filtro por tipo (despesa/receita)
    if (tipoFilter !== "todos") {
      listaBase = listaBase.filter((t) => t.tipo === tipoFilter);
    }

    // Filtro por categoria (comparando sem diferença de maiúscula/minúscula)
    if (categoriaFilter !== "todas") {
      listaBase = listaBase.filter(
        (t) => (t.categoria || "").toLowerCase() === categoriaFilter.toLowerCase()
      );
    }

    // Filtro por forma de pagamento (dinheiro, crédito, pix, etc.)
    if (formaFilter !== "todas") {
      listaBase = listaBase.filter((t) => t.formaPagamento === formaFilter);
    }

    // Filtro por cartão específico (cartaoId)
    if (cartaoFilter !== "todos") {
      listaBase = listaBase.filter((t) => t.cartaoId === cartaoFilter);
    }

    // ✅ filtros por data usando parseDateValue (ISO e timestamp)
    // Se o usuário escolheu uma data de início, mantém só transações >= início.
    if (dataInicio) {
      const di = new Date(dataInicio + "T00:00:00");
      listaBase = listaBase.filter((t) => parseDateValue(t.dataHora) >= di);
    }
    // Se o usuário escolheu uma data final, mantém só transações <= fim.
    if (dataFim) {
      const df = new Date(dataFim + "T23:59:59");
      listaBase = listaBase.filter((t) => parseDateValue(t.dataHora) <= df);
    }

    // ✅ busca por texto (procura dentro de descricao)
    const temBusca = !!textoFilter.trim();
    if (temBusca) {
      const txt = textoFilter.toLowerCase();
      listaBase = listaBase.filter((t) =>
        (t.descricao || "").toLowerCase().includes(txt)
      );
    }

    // 2) LISTA PARA O RESUMO
    // Se houver filtro manual de datas, mantém a lógica normal do Histórico.
    // Sem filtro manual, usa EXATAMENTE a mesma lógica financeira da FinançasPage:
    // ciclo pelo N-ésimo dia útil + gastos fixos + salário + pendência anterior.
    let listaResumo = [...listaBase];

    let totalDespesasResumo = 0;
    let totalReceitasResumo = 0;
    let totalReembolsosResumo = 0;
    let saldoResumoCalculado = null;

    if (!dataInicio && !dataFim && mesReferencia) {
      const { mes, ano } = mesReferencia;
      const nthBiz = Number(profile?.diaPagamento || 0) || 0;
      const cycle = nthBiz ? cycleRangeByBusinessPayDay(ano, mes, nthBiz) : null;

      const inRange = (dt) => {
        if (!dt || Number.isNaN(dt.getTime())) return false;

        if (!cycle) {
          return dt.getMonth() === mes && dt.getFullYear() === ano;
        }

        const t = dt.getTime();
        return t >= cycle.start.getTime() && t < cycle.end.getTime();
      };

      listaResumo = listaBase.filter((t) => {
        const dt = parseDateValue(t.dataHora);
        return inRange(dt);
      });

      listaResumo.forEach((t) => {
        const valor = Number(t.valor || 0);
        if (t.tipo === "despesa") totalDespesasResumo += valor;
        if (t.tipo === "receita") totalReceitasResumo += valor;
        if (t.tipo === "reembolso") totalReembolsosResumo += valor;
      });

      // Gastos fixos do mês selecionado
      const chaveMes = monthKey(ano, mes);
      const gastosFixosPerfil = (
        Array.isArray(profile?.gastosFixos) ? profile.gastosFixos : []
      )
        .filter((g) => g.ativo !== false)
        .filter(
          (g) =>
            (g.nome || "").toLowerCase() !== "educacao" &&
            (g.categoria || "").toLowerCase() !== "educacao"
        );

      const totalGastosFixos = gastosFixosPerfil.reduce(
        (acc, g) =>
          acc + getValorFixo(g.valoresPorMes || {}, chaveMes),
        0
      );

      totalDespesasResumo += totalGastosFixos;

      // Salário do mês atual
      const salariosPorMes = profile?.salariosPorMes || {};
      const salarioAtual = Number(
        salariosPorMes[chaveMes] ?? profile?.rendaMensal ?? 0
      );

      // Calcula o saldo do mês anterior para carregar somente se ficou negativo
      const anterior = prevMonth(ano, mes);
      const chaveMesAnterior = monthKey(anterior.ano, anterior.mes);
      const cycleAnterior = nthBiz
        ? cycleRangeByBusinessPayDay(anterior.ano, anterior.mes, nthBiz)
        : null;

      const inRangeAnterior = (dt) => {
        if (!dt || Number.isNaN(dt.getTime())) return false;

        if (!cycleAnterior) {
          return (
            dt.getMonth() === anterior.mes &&
            dt.getFullYear() === anterior.ano
          );
        }

        const t = dt.getTime();
        return (
          t >= cycleAnterior.start.getTime() &&
          t < cycleAnterior.end.getTime()
        );
      };

      let receitasAnterior = 0;
      let reembolsosAnterior = 0;
      let despesasAnterior = 0;

      (Array.isArray(transacoes) ? transacoes : []).forEach((t) => {
        const dt = parseDateValue(t.dataHora);
        if (!inRangeAnterior(dt)) return;

        const valor = Number(t.valor || 0);
        if (t.tipo === "receita") receitasAnterior += valor;
        if (t.tipo === "reembolso") reembolsosAnterior += valor;
        if (t.tipo === "despesa") despesasAnterior += valor;
      });

      const gastosFixosAnterior = (
        Array.isArray(profile?.gastosFixos) ? profile.gastosFixos : []
      )
        .filter((g) => g.ativo !== false)
        .filter(
          (g) =>
            (g.nome || "").toLowerCase() !== "educacao" &&
            (g.categoria || "").toLowerCase() !== "educacao"
        )
        .reduce(
          (acc, g) =>
            acc + getValorFixo(g.valoresPorMes || {}, chaveMesAnterior),
          0
        );

      despesasAnterior += gastosFixosAnterior;

      const salarioAnterior = Number(
        salariosPorMes[chaveMesAnterior] ?? profile?.rendaMensal ?? 0
      );

      const saldoAnterior =
        salarioAnterior +
        receitasAnterior +
        reembolsosAnterior -
        despesasAnterior;

      const pendenteAnterior =
        saldoAnterior < 0 ? Math.abs(saldoAnterior) : 0;

      saldoResumoCalculado =
        salarioAtual +
        totalReceitasResumo +
        totalReembolsosResumo -
        totalDespesasResumo -
        pendenteAnterior;
    } else {
      // Com filtros manuais de data, o Histórico continua mostrando só
      // o que está dentro do período escolhido, sem salário/gastos fixos automáticos.
      listaResumo.forEach((t) => {
        const valor = Number(t.valor || 0);
        if (t.tipo === "despesa") totalDespesasResumo += valor;
        if (t.tipo === "receita") totalReceitasResumo += valor;
        if (t.tipo === "reembolso") totalReembolsosResumo += valor;
      });
    }

    // ✅ MODO BUSCA: AGRUPAR (mas com lista detalhada ao clicar)
    // Se tem busca, agrupa transações por (tipo + descricao normalizada),
    // somando total e contando quantas vezes aparece.
    let gruposBusca = [];
    if (temBusca) {
      const map = new Map();

      listaBase.forEach((t) => {
        // groupKey único pelo tipo e pela descrição normalizada
        const key = `${t.tipo}::${normalizarDescricao(
          t.descricao || "Sem descrição"
        )}`;

        // Pega o grupo já existente ou cria um novo grupo
        const atual = map.get(key) || {
          key,
          tipo: t.tipo,
          descricao: t.descricao || "Sem descrição",
          total: 0,
          count: 0,
          ids: [],
        };

        // Atualiza soma, contagem e lista de ids
        const v = Number(t.valor || 0);
        atual.total += v;
        atual.count += 1;
        atual.ids.push(t.id);

        // tenta manter a descrição mais "bonita"
        // Se o grupo ficou com "Sem descrição" mas essa transação tem descrição,
        // troca para uma descrição melhor.
        if ((!atual.descricao || atual.descricao === "Sem descrição") && t.descricao) {
          atual.descricao = t.descricao;
        }

        // Salva o grupo de volta
        map.set(key, atual);
      });

      // Converte os grupos do Map para array e ordena pelo total (maior primeiro)
      gruposBusca = Array.from(map.values()).sort((a, b) => b.total - a.total);
    }

    // ✅ MODO NORMAL (SEM BUSCA): AGRUPAMENTO POR DIA, MAS SEM JUNTAR
    // Aqui não agrupa por descrição, só separa por dia e mantém itens individuais.
    const porDia = {};
    listaBase.forEach((t) => {
      // "diaStr" vira algo tipo "22/01/2026"
      const diaStr = formatDate(t.dataHora);

      // Cria o bloco do dia se não existir
      if (!porDia[diaStr]) porDia[diaStr] = { itens: [], totalDia: 0 };

      // Adiciona transação no dia
      porDia[diaStr].itens.push(t);

      // Calcula saldo do dia:
      // - despesa entra como negativo
      // - receita entra como positivo
      const valor = Number(t.valor || 0);
      porDia[diaStr].totalDia += valorComSinal(t.tipo, valor);
    });

    // Ordena itens de cada dia pela hora (mais recente primeiro)
    Object.keys(porDia).forEach((diaStr) => {
      porDia[diaStr].itens.sort(
        (a, b) => parseDateValue(b.dataHora) - parseDateValue(a.dataHora)
      );
    });

    // Ordena os dias para exibir em ordem cronológica (do mais antigo ao mais recente)
    // (pelo código: retorna new Date(ab...) - new Date(aa...), então "a" vem antes de "b" se for mais antigo)
    const diasOrdenados = Object.keys(porDia).sort((a, b) => {
      const [da, ma, aa] = a.split("/").map(Number);
      const [db, mb, ab] = b.split("/").map(Number);
      return new Date(ab, mb - 1, db) - new Date(aa, ma - 1, da);
    });

    // Retorna tudo que a UI precisa para renderizar
    return {
      temBusca,
      gruposBusca,
      porDia,
      diasOrdenados,
      totalDespesasResumo,
      totalReceitasResumo,
      totalReembolsosResumo,
      saldoResumoCalculado,
      totalTransacoesResumo: listaResumo.length,
      totalTransacoesLista: listaBase.length,
    };
  }, [
    // Dependências: quando qualquer uma mudar, o "resultado" é recalculado
    transacoes,
    tipoFilter,
    categoriaFilter,
    formaFilter,
    cartaoFilter,
    textoFilter,
    dataInicio,
    dataFim,
    mesReferencia,
    mostrarParcelasFuturas, // ✅ ADICIONADO
    profile,
  ]);

  // Desestrutura o resultado para usar direto no JSX
  const {
    temBusca,
    gruposBusca,
    porDia,
    diasOrdenados,
    totalDespesasResumo,
    totalReceitasResumo,
    totalReembolsosResumo,
    saldoResumoCalculado,
    totalTransacoesResumo,
    totalTransacoesLista,
  } = resultado;

  // Saldo do período = receitas - despesas (do resumo)
  const saldoPeriodo =
    saldoResumoCalculado != null
      ? saldoResumoCalculado
      : totalReceitasResumo +
        totalReembolsosResumo -
        totalDespesasResumo;

  // Nome do mês para título do resumo:
  // usa mesReferencia.mes se existir; senão usa o mês atual do sistema.
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

  // 🔧 abrir modal de edição
  // Preenche o formulário do modal com os dados da transação clicada.
  const abrirEdicao = (t) => {
    // Guarda a transação em edição
    setEditando(t);

    // Preenche descrição
    setDescricaoEdit(t.descricao || "");

    // Se for compra parcelada (tem groupId e parcelaTotal > 1),
    // o valor editável vira o TOTAL da compra (não o valor de uma parcela).
    const valorTotal =
      t.groupId && t.parcelaTotal && t.parcelaTotal > 1
        ? t.totalCompra ||
          Number(t.valor || 0) * Number(t.parcelaTotal || 1)
        : t.valor || "";

    // Coloca o valor no input como string
    setValorEdit(String(valorTotal));

    // Preenche tipo/categoria/forma/cartão conforme a transação
    setTipoEdit(t.tipo || "despesa");
    setCategoriaEdit(t.categoria || "Essencial");
    setFormaEdit(t.formaPagamento || "dinheiro");
    setCartaoEdit(t.cartaoId || "");
  };

  // Fecha modal e reseta campos do formulário
  const fecharEdicao = () => {
    setEditando(null);
    setDescricaoEdit("");
    setValorEdit("");
    setTipoEdit("despesa");
    setCategoriaEdit("Essencial");
    setFormaEdit("dinheiro");
    setCartaoEdit("");
  };

  // Salva a edição:
  // - valida valor
  // - se for parcela, atualiza TODAS as parcelas do grupo
  // - se não, atualiza só a transação
  const salvarEdicao = () => {
    // Se não tem nada em edição, não faz nada
    if (!editando) return;

    const t = editando;

    // Converte valorEdit para número (aceitando vírgula)
    const v = parseFloat(String(valorEdit).replace(",", "."));

    // Validação simples
    if (isNaN(v) || v <= 0) {
      alert("Informe um valor válido.");
      return;
    }

    // 🔥 SE FOR PARCELA → EDITA TODAS DO GRUPO
    // Se a transação tem groupId e é parcelada, atualiza o grupo inteiro.
    if (t.groupId && t.parcelaTotal && t.parcelaTotal > 1) {
      // Pega todas as parcelas do mesmo groupId e ordena por data (mais antiga -> mais nova)
      const parcelas = transacoes
        .filter((p) => p.groupId === t.groupId)
        .sort((a, b) => parseDateValue(a.dataHora) - parseDateValue(a.dataHora));

      // Define quantas parcelas existem (usa o tamanho real; se der 0, usa parcelaTotal)
      const totalParcelas = parcelas.length || t.parcelaTotal;

      // Divide o total pelo número de parcelas para calcular novo valor de cada parcela
      const valorParcela = v / totalParcelas;

      // Atualiza cada parcela com os novos dados
      parcelas.forEach((p) => {
        atualizarTransacao(p.id, {
          descricao: descricaoEdit,
          tipo: tipoEdit,
          // categoria só faz sentido se for despesa
          categoria:
            tipoEdit === "despesa" || tipoEdit === "reembolso"
              ? categoriaEdit
              : null,
          formaPagamento: formaEdit,
          // cartaoId só faz sentido se for crédito
          cartaoId: formaEdit === "credito" ? cartaoEdit || null : null,
          // salva valor da parcela arredondado
          valor: Number(valorParcela.toFixed(2)),
          // salva o total da compra para referência
          totalCompra: v,
        });
      });

      // Fecha modal depois de atualizar o grupo
      fecharEdicao();
      return;
    }

    // 🧾 TRANSAÇÃO NORMAL
    // Monta um objeto com os campos atualizados
    const dadosAtualizados = {
      tipo: tipoEdit,
      valor: v,
      descricao: descricaoEdit,
      // categoria só se for despesa
      categoria:
        tipoEdit === "despesa" || tipoEdit === "reembolso"
          ? categoriaEdit
          : null,
      formaPagamento: formaEdit,
      // cartão só se for crédito
      cartaoId: formaEdit === "credito" ? cartaoEdit || null : null,
      // mantém totalCompra (aqui fica igual ao valor)
      totalCompra: v,
    };

    // Atualiza a transação no contexto/store
    atualizarTransacao(editando.id, dadosAtualizados);

    // Fecha modal
    fecharEdicao();
  };

  // 🗑️ confirmar exclusão
  // Apaga uma transação (ou o grupo inteiro se for parcelada)
  const confirmarApagar = () => {
    // Se não tem item no modal de confirmação, não faz nada
    if (!confirmandoExclusao) return;

    const t = confirmandoExclusao;

    // Se for parcela com groupId → apaga TODAS as parcelas do mesmo grupo
    if (t.groupId && t.parcelaTotal && t.parcelaTotal > 1) {
      const grupoId = t.groupId;
      const doGrupo = transacoes.filter((p) => p.groupId === grupoId);
      doGrupo.forEach((p) => removerTransacao(p.id));
    } else {
      // Caso normal: apaga apenas a transação selecionada
      removerTransacao(t.id);
    }

    // Se você estava editando algo que foi apagado (ou do mesmo grupo),
    // fecha o modal de edição para evitar editar item inexistente.
    if (
      editando &&
      (editando.id === t.id || (t.groupId && editando.groupId === t.groupId))
    ) {
      fecharEdicao();
    }

    // Fecha o modal de confirmação
    setConfirmandoExclusao(null);
  };

  // Fecha modal de exclusão sem apagar
  const cancelarApagar = () => setConfirmandoExclusao(null);

  // Abre/fecha um grupo no modo busca (resultados agrupados)
  const toggleAbrir = (key) => {
    // Inverte o booleano do grupo selecionado no objeto "abertos"
    setAbertos((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Renderização da página
  return (
    <div className="page">
      {/* Título da página */}
      <h2 className="page-title">Histórico</h2>

      {/* Resumo */}
      <div className="card history-summary">
        {/* Mostra o mês/ano do resumo */}
        <h3>
          Resumo de {nomeMes} / {mesReferencia?.ano ?? new Date().getFullYear()}
        </h3>

        {/* ✅ ALTERADO: toggle top com CSS (bolinha vai pro lado) + texto */}
        <div className="toggle-row">
          <button
            type="button"
            role="switch"
            aria-checked={mostrarParcelasFuturas}
            className={"toggle-switch " + (mostrarParcelasFuturas ? "is-on" : "")}
            onClick={() => setMostrarParcelasFuturas((v) => !v)}
            title="Alternar parcelas futuras"
          >
            <span className="toggle-knob" />
          </button>

          <span
            className={
              "toggle-pill " + (mostrarParcelasFuturas ? "is-on" : "is-off")
            }
          >
            {mostrarParcelasFuturas
              ? "mostrando parcelas futuras"
              : "ocultando parcelas futuras"}
          </span>
        </div>

        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="toggle-btn"
            onClick={() => setMostrarAjuda(true)}
            title="Como funciona o Histórico"
            aria-label="Como funciona o Histórico"
            style={{
              width: 40,
              minWidth: 40,
              height: 40,
              borderRadius: 999,
              padding: 0,
            }}
          >
            ?
          </button>
        </div>
      </div>

      {/* PESQUISA / FILTROS */}
      <div className="card filters-card mt">
        <button
          type="button"
          className={"toggle-btn " + (mostrarFiltros ? "toggle-active" : "")}
          onClick={() => setMostrarFiltros((aberto) => !aberto)}
          aria-expanded={mostrarFiltros}
          style={{
            width: "100%",
            minHeight: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            fontWeight: 800,
          }}
        >
          <span>🔎 Pesquisa e filtros</span>
          <span>{mostrarFiltros ? "▲" : "▼"}</span>
        </button>

        {mostrarFiltros ? (
          <div style={{ marginTop: 14 }}>
        <h3>Filtros</h3>

        {/* Chips para filtro rápido por tipo */}
        <div className="chips-row">
          <button
            type="button"
            className={"chip " + (tipoFilter === "todos" ? "chip-active" : "")}
            onClick={() => setTipoFilter("todos")}
          >
            Todos
          </button>
          <button
            type="button"
            className={"chip " + (tipoFilter === "despesa" ? "chip-active" : "")}
            onClick={() => setTipoFilter("despesa")}
          >
            Despesas
          </button>
          <button
            type="button"
            className={"chip " + (tipoFilter === "receita" ? "chip-active" : "")}
            onClick={() => setTipoFilter("receita")}
          >
            Receitas
          </button>
          <button
            type="button"
            className={"chip " + (tipoFilter === "reembolso" ? "chip-active" : "")}
            onClick={() => setTipoFilter("reembolso")}
          >
            Reembolsos / Acertos
          </button>
          <button
            type="button"
            className={"chip " + (tipoFilter === "nulo" ? "chip-active" : "")}
            onClick={() => setTipoFilter("nulo")}
          >
            Dívidas sem saída
          </button>
        </div>

        {/* Grid de inputs dos filtros */}
        <div className="filters-grid">
          <div className="field">
            <label>Categoria</label>
            <select
              value={categoriaFilter}
              onChange={(e) => setCategoriaFilter(e.target.value)}
            >
              <option value="todas">Todas</option>
              <option value="Essencial">Essencial</option>
              <option value="Besteira">Besteira</option>
              <option value="Lazer">Lazer</option>

              {/* ✅ ADICIONADO */}
              <option value="Burrice">Burrice</option>
              <option value="Investido">Investido</option>
            </select>
          </div>

          <div className="field">
            <label>Forma de pagamento</label>
            <select
              value={formaFilter}
              onChange={(e) => setFormaFilter(e.target.value)}
            >
              <option value="todas">Todas</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="pix">PIX</option>
              <option value="outros">Outros</option>
            </select>
          </div>

          <div className="field">
            <label>Cartão</label>
            <select
              value={cartaoFilter}
              onChange={(e) => setCartaoFilter(e.target.value)}
            >
              <option value="todos">Todos</option>
              {/* Lista os cartões disponíveis para filtrar */}
              {cartoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Data início</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Data fim</label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Buscar texto</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {/* Input de busca por texto na descrição */}
              <input
                type="text"
                value={textoFilter}
                onChange={(e) => setTextoFilter(e.target.value)}
                placeholder="Ex.: uber, aluguel..."
              />
              {/* Botão de busca (aqui não faz nada porque a busca já é reativa ao digitar) */}
              <button
                type="button"
                className="primary-btn"
                style={{ width: "auto", padding: "8px 12px" }}
                onClick={() => {}}
              >
                🔎
              </button>
            </div>

            {/* Mensagem explicando o comportamento da lista dependendo da busca */}
            <p className="muted small" style={{ marginTop: 6 }}>
              {textoFilter.trim()
                ? "Busca ativa: resultados ficam AGRUPADOS (clique para ver itens)."
                : "Sem busca: histórico mostra tudo INDIVIDUAL por dia."}
            </p>
          </div>
        </div>

          </div>
        ) : null}
      </div>

      {mostrarAjuda ? (
        <div className="modal-overlay" onClick={() => setMostrarAjuda(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <h3 style={{ margin: 0 }}>❓ Como funciona</h3>
              <button
                type="button"
                className="toggle-btn"
                onClick={() => setMostrarAjuda(false)}
                style={{ width: "auto" }}
              >
                ✖
              </button>
            </div>

            <div className="muted small" style={{ marginTop: 14, lineHeight: 1.8 }}>
              <div>• Parcelas futuras: mostra ou esconde parcelas que ainda não chegaram no mês selecionado.</div>
              <div>• Todos / Despesas / Receitas / Reembolsos: filtra pelo tipo da movimentação.</div>
              <div>• Reembolso de Acertos aumenta o saldo porque o dinheiro entrou, mas não é contado como receita normal.</div>
              <div>• Dívida sem saída mostra obrigações de Acertos que ainda não movimentaram seu dinheiro.</div>
              <div>• Categoria: mostra somente a categoria escolhida.</div>
              <div>• Forma de pagamento: filtra por dinheiro, débito, crédito, PIX ou outros.</div>
              <div>• Cartão: mostra somente compras do cartão escolhido.</div>
              <div>• Data início e fim: limita o histórico ao período informado.</div>
              <div>• Buscar texto: procura palavras na descrição, como “Uber” ou “aluguel”.</div>
              <div>• Sem busca por texto: o histórico continua mostrando cada lançamento individualmente por dia.</div>
            </div>
          </div>
        </div>
      ) : null}

      {/* LISTA */}
      {/* Se nada foi encontrado, mostra mensagem */}
      {totalTransacoesLista === 0 ? (
        <p className="muted mt">Nenhuma transação encontrada.</p>
      ) : temBusca ? (
        // ✅ MODO BUSCA (AGRUPADO)
        <div className="card mt">
          <h3>Resultados agrupados</h3>

          <ul className="list">
            {gruposBusca.map((g) => {
              // Verifica se este grupo está aberto (para mostrar itens detalhados)
              const aberto = !!abertos[g.key];

              // Constrói a lista de transações reais do grupo (por ids)
              // Ordena por data/hora desc (mais recente primeiro)
              const itens = g.ids
                .map((id) => transacoes.find((t) => t.id === id))
                .filter(Boolean)
                .sort(
                  (a, b) => parseDateValue(b.dataHora) - parseDateValue(a.dataHora)
                );

              return (
                <li
                  key={g.key}
                  className="list-item"
                  style={{ flexDirection: "column", alignItems: "stretch" }}
                >
                  {/* Cabeçalho do grupo: tipo, descrição, count e total */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <span className="badge">
                        {tipoLabel(g.tipo)}
                      </span>{" "}
                      <strong>{g.descricao}</strong>
                      <span className="muted small"> · {g.count}x</span>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {/* Total do grupo */}
                      <span
                        className={
                          "number small " +
                          (g.tipo === "despesa" ? "negative" : "positive")
                        }
                      >
                        {formatCurrency(g.total)}
                      </span>

                      {/* Botão abre/fecha itens */}
                      <button
                        type="button"
                        className="chip"
                        onClick={() => toggleAbrir(g.key)}
                      >
                        {aberto ? "▲ Fechar" : "▼ Ver itens"}
                      </button>
                    </div>
                  </div>

                  {/* Itens do grupo (detalhados), só aparecem se estiver aberto */}
                  {aberto && (
                    <div
                      style={{
                        marginTop: 10,
                        borderTop: "1px solid rgba(31, 41, 55, 0.6)",
                        paddingTop: 10,
                      }}
                    >
                      <ul className="list">
                        {itens.map((t) => (
                          <li key={t.id} className="list-item list-item-history">
                            {/* Data/hora + meta infos */}
                            <div>
                              <div>
                                <span className="muted small">
                                  {formatDate(t.dataHora)} • {formatTime(t.dataHora)}
                                </span>
                              </div>
                              <div className="muted small">
                                {(t.formaPagamento || "").toUpperCase()}
                                {t.cartaoId &&
                                  ` · ${cartaoNomePorId[t.cartaoId] || "Cartão"}`}
                                {t.categoria && ` · ${categoriaLabel(t.categoria)}`}
                                {t.origemMovimento === "quem_me_deve" ? " · 👥 Acertos" : ""}
                              </div>
                            </div>

                            {/* Valor e ações */}
                            <div className="align-right">
                              <span
                                className={
                                  "number small " +
                                  (t.tipo === "despesa" ? "negative" : "positive")
                                }
                              >
                                {formatCurrency(t.valor)}
                              </span>

                              {/* Botões de editar/apagar a transação específica */}
                              <div
                                style={{
                                  marginTop: 4,
                                  display: "flex",
                                  gap: 6,
                                  justifyContent: "flex-end",
                                }}
                              >
                                <button
                                  type="button"
                                  className="chip"
                                  onClick={() => abrirEdicao(t)}
                                >
                                  ✏️ Editar
                                </button>
                                <button
                                  type="button"
                                  className="chip"
                                  onClick={() => setConfirmandoExclusao(t)}
                                >
                                  🗑️ Apagar
                                </button>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        // ✅ MODO NORMAL (INDIVIDUAL POR DIA)
        // Para cada dia ordenado, mostra um “card” com saldo do dia e lista de transações
        diasOrdenados.map((dia) => {
          const bloco = porDia[dia];
          const totalDia = bloco.totalDia;

          return (
            <div key={dia} className="card mt history-day-card">
              {/* Cabeçalho do dia: data + qtd transações + saldo do dia */}
              <div className="history-day-header">
                <div>
                  <h3>{dia}</h3>
                  <p className="muted small">
                    {bloco.itens.length} transação(ões)
                  </p>
                </div>
                <div className="align-right">
                  <p className="history-summary-label">Saldo do dia</p>
                  <p
                    className={
                      "history-summary-value " +
                      (totalDia >= 0 ? "positive" : "negative")
                    }
                  >
                    {formatCurrency(totalDia)}
                  </p>
                </div>
              </div>

              {/* Lista de transações do dia */}
              <ul className="list">
                {bloco.itens.map((t) => (
                  <li key={t.id} className="list-item list-item-history">
                    {/* Lado esquerdo: tipo, descrição e detalhes */}
                    <div>
                      <span className="badge">
                        {t.tipo === "despesa" ? "Despesa" : "Receita"}
                      </span>{" "}
                      <span>{t.descricao || "Sem descrição"}</span>

                      {/* Linha com forma de pagamento + cartão + categoria */}
                      <div className="muted small">
                        {(t.formaPagamento || "").toUpperCase()}
                        {t.cartaoId &&
                          ` · ${cartaoNomePorId[t.cartaoId] || "Cartão"}`}
                        {t.categoria && ` · ${categoriaLabel(t.categoria)}`}
                        {t.origemMovimento === "quem_me_deve" ? " · 👥 Acertos" : ""}
                      </div>

                      {/* Se for compra parcelada, mostra info do parcelamento e total */}
                      {t.parcelaTotal && t.parcelaTotal > 1 && (
                        <div className="muted small">
                          Compra parcelada em {t.parcelaTotal}x · total{" "}
                          <strong>
                            {formatCurrency(
                              t.totalCompra ||
                                Number(t.valor || 0) *
                                  Number(t.parcelaTotal || 1)
                            )}
                          </strong>
                        </div>
                      )}
                    </div>

                    {/* Lado direito: valor, hora e botões */}
                    <div className="align-right">
                      <span
                        className={
                          "number small " +
                          (t.tipo === "despesa" ? "negative" : "positive")
                        }
                      >
                        {formatCurrency(t.valor)}
                      </span>

                      {/* Hora da transação */}
                      <div className="muted small">{formatTime(t.dataHora)}</div>

                      {/* Ações */}
                      <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          className="chip"
                          onClick={() => abrirEdicao(t)}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          type="button"
                          className="chip"
                          onClick={() => setConfirmandoExclusao(t)}
                        >
                          🗑️ Apagar
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}

      {/* MODAL DE EDIÇÃO */}
      {/* Só aparece se "editando" tiver uma transação */}
      {editando && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Editar transação</h3>

            {/* Mostra data e hora da transação em edição */}
            <p className="muted small" style={{ marginTop: 0 }}>
              {formatDate(editando.dataHora)} • {formatTime(editando.dataHora)}
            </p>

            {/* Se for compra parcelada, explica que editará o total e atualizará parcelas */}
            {editando.groupId && editando.parcelaTotal > 1 && (
              <p className="muted small" style={{ marginTop: 4 }}>
                Compra parcelada em {editando.parcelaTotal}x. <br />
                Você está editando o <strong>valor TOTAL</strong> da compra;
                todas as parcelas serão atualizadas.
              </p>
            )}

            {/* Campos do formulário */}
            <div className="field">
              <label>Descrição</label>
              <input
                type="text"
                value={descricaoEdit}
                onChange={(e) => setDescricaoEdit(e.target.value)}
              />
            </div>

            <div className="field">
              <label>
                {editando.groupId && editando.parcelaTotal > 1
                  ? "Valor total da compra (R$)"
                  : "Valor (R$)"}
              </label>
              <input
                type="number"
                step="0.01"
                value={valorEdit}
                onChange={(e) => setValorEdit(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Tipo</label>
              <select value={tipoEdit} onChange={(e) => setTipoEdit(e.target.value)}>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
                <option value="reembolso">Reembolso / Acerto</option>
                <option value="nulo">Dívida sem movimentar saldo</option>
              </select>
            </div>

            {/* Categoria aparece para despesa e reembolso de Acertos */}
            {(tipoEdit === "despesa" || tipoEdit === "reembolso") && (
              <div className="field">
                <label>Categoria</label>
                <select
                  value={categoriaEdit}
                  onChange={(e) => setCategoriaEdit(e.target.value)}
                >
                  <option value="Essencial">Essencial</option>
                  <option value="Besteira">Besteira</option>
                  <option value="Lazer">Lazer</option>

                  {/* ✅ ADICIONADO */}
                  <option value="Burrice">Burrice</option>
                  <option value="Investido">Investido</option>
                </select>
              </div>
            )}

            <div className="field">
              <label>Forma de pagamento</label>
              <select value={formaEdit} onChange={(e) => setFormaEdit(e.target.value)}>
                <option value="dinheiro">Dinheiro</option>
                <option value="debito">Débito</option>
                <option value="credito">Crédito</option>
                <option value="pix">PIX</option>
                <option value="outros">Outros</option>
              </select>
            </div>

            {/* Se for crédito, aparece seletor de cartão */}
            {formaEdit === "credito" && (
              <div className="field">
                <label>Cartão</label>
                <select value={cartaoEdit} onChange={(e) => setCartaoEdit(e.target.value)}>
                  <option value="">Selecione...</option>
                  {cartoes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Botões do modal */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                marginTop: 8,
              }}
            >
              <button type="button" className="primary-btn" onClick={salvarEdicao}>
                💾 Salvar alterações
              </button>
              <button
                type="button"
                className="primary-btn"
                style={{ background: "#374151", color: "#e5e7eb" }}
                onClick={fecharEdicao}
              >
                ✖ Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {/* Só aparece se "confirmandoExclusao" tiver uma transação */}
      {confirmandoExclusao && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Apagar transação?</h3>

            {/* Mostra descrição e valor antes de confirmar */}
            <p className="muted small">
              {confirmandoExclusao.descricao || "Sem descrição"}
              <br />
              <strong>{formatCurrency(confirmandoExclusao.valor)}</strong>
            </p>

            {/* Botões de confirmar ou cancelar */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                marginTop: 8,
              }}
            >
              <button
                type="button"
                className="primary-btn"
                style={{ background: "#f97373", color: "#111827" }}
                onClick={confirmarApagar}
              >
                🗑️ Sim, apagar
              </button>
              <button
                type="button"
                className="primary-btn"
                style={{ background: "#374151", color: "#e5e7eb" }}
                onClick={cancelarApagar}
              >
                ✖ Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
