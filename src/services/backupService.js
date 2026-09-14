const BACKUP_VERSION = 4;

const CHAVES_CONHECIDAS = [
  "financas_profile",
  "financas_transacoes",
  "financas_cartoes",
  "financas_reserva",
  "financas_quem_me_deve",
  "financas_configuracoes",
  "financas_estudos",
  "financas_lista",
  "financas_lembretes",
  "financas_receitas",
];

export const AREAS_DE_BACKUP = [
  {
    chave: "perfil",
    nome: "👤 Perfil",
    chaves: ["financas_profile"],
  },
  {
    chave: "financas",
    nome: "💰 Finanças, 📥 Transações e 📜 Histórico",
    chaves: ["financas_transacoes"],
  },
  {
    chave: "cartoes",
    nome: "💳 Cartões",
    chaves: ["financas_cartoes"],
  },
  {
    chave: "reserva",
    nome: "💰 Reserva",
    chaves: ["financas_reserva"],
  },
  {
    chave: "acertos",
    nome: "👥 Acertos",
    chaves: ["financas_quem_me_deve"],
  },
  {
    chave: "estudos",
    nome: "📚 Estudos",
    chaves: ["financas_estudos"],
  },
  {
    chave: "lista",
    nome: "🛒 Lista",
    chaves: ["financas_lista"],
  },
  {
    chave: "lembretes",
    nome: "⏰ Lembretes",
    chaves: ["financas_lembretes"],
  },
  {
    chave: "receitas",
    nome: "🍳 Receitas",
    chaves: ["financas_receitas"],
  },
];

function ehChaveDoAplicativo(chave) {
  return (
    CHAVES_CONHECIDAS.includes(chave) ||
    chave.startsWith("financas_")
  );
}

function obterChavesDoAplicativo() {
  const chaves = new Set(CHAVES_CONHECIDAS);

  for (let indice = 0; indice < localStorage.length; indice += 1) {
    const chave = localStorage.key(indice);

    if (chave && ehChaveDoAplicativo(chave)) {
      chaves.add(chave);
    }
  }

  return [...chaves];
}

function obterChavesSelecionadas(areasSelecionadas) {
  if (!Array.isArray(areasSelecionadas)) {
    return null;
  }

  return new Set(
    AREAS_DE_BACKUP
      .filter((area) => areasSelecionadas.includes(area.chave))
      .flatMap((area) => area.chaves)
  );
}

function lerChave(chave) {
  const valor = localStorage.getItem(chave);

  if (valor === null) return null;

  try {
    return JSON.parse(valor);
  } catch {
    return valor;
  }
}

function removerTelefoneDoPerfil(valor) {
  if (
    !valor ||
    typeof valor !== "object" ||
    Array.isArray(valor)
  ) {
    return valor;
  }

  const perfil = { ...valor };

  delete perfil.telefone;

  return perfil;
}

function normalizarFiltro(filtro = {}) {
  return {
    modo: filtro.modo || "tudo",
    quantidade: Math.max(1, Number(filtro.quantidade) || 1),
    inicio: filtro.inicio || "",
    fim: filtro.fim || "",
  };
}

function dataDoItem(item) {
  const valor =
    item?.dataHora ||
    item?.data ||
    item?.criadoEm ||
    item?.atualizadoEm;

  if (!valor) return null;

  const data = new Date(valor);

  return Number.isNaN(data.getTime()) ? null : data;
}

function itemEstaNoPeriodo(item, filtroRecebido) {
  const filtro = normalizarFiltro(filtroRecebido);

  if (filtro.modo === "tudo") {
    return true;
  }

  const data = dataDoItem(item);

  if (!data) {
    return false;
  }

  const agora = new Date();
  const inicioHoje = new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate()
  );

  if (filtro.modo === "dias") {
    const inicio = new Date(inicioHoje);

    inicio.setDate(inicio.getDate() - filtro.quantidade + 1);

    return data >= inicio && data <= agora;
  }

  if (filtro.modo === "mes") {
    const inicio = new Date(inicioHoje);

    inicio.setDate(inicio.getDate() - 29);

    return data >= inicio && data <= agora;
  }

  if (filtro.modo === "ano") {
    const inicio = new Date(inicioHoje);

    inicio.setDate(inicio.getDate() - 364);

    return data >= inicio && data <= agora;
  }

  if (filtro.modo === "personalizado") {
    const inicio = filtro.inicio
      ? new Date(`${filtro.inicio}T00:00:00`)
      : null;

    const fim = filtro.fim
      ? new Date(`${filtro.fim}T23:59:59`)
      : null;

    if (inicio && data < inicio) return false;
    if (fim && data > fim) return false;

    return Boolean(inicio || fim);
  }

  return true;
}

function filtrarLista(lista, filtro, manter) {
  if (!Array.isArray(lista)) return [];

  return lista.filter((item) => {
    const estaNoPeriodo = itemEstaNoPeriodo(item, filtro);

    return manter ? estaNoPeriodo : !estaNoPeriodo;
  });
}

function chaveTemDadosComData(chave) {
  return [
    "financas_transacoes",
    "financas_reserva",
    "financas_quem_me_deve",
    "financas_estudos",
    "financas_lista",
    "financas_lembretes",
    "financas_receitas",
  ].includes(chave);
}

function prepararParaBackup(chave, valor, filtro) {
  if (chave === "financas_profile") {
    return removerTelefoneDoPerfil(valor);
  }

  if (
    filtro.modo === "tudo" ||
    !chaveTemDadosComData(chave)
  ) {
    return valor;
  }

  if (chave === "financas_transacoes") {
    return filtrarLista(valor, filtro, true);
  }

  if (chave === "financas_reserva") {
    return {
      ...(valor || {}),
      movimentos: filtrarLista(valor?.movimentos, filtro, true),
    };
  }

  if (chave === "financas_quem_me_deve") {
    const lancamentos = filtrarLista(
      valor?.lancamentos,
      filtro,
      true
    );

    const pessoaIds = new Set(
      lancamentos.map((lancamento) => lancamento.pessoaId)
    );

    return {
      ...(valor || {}),
      pessoas: Array.isArray(valor?.pessoas)
        ? valor.pessoas.filter((pessoa) => pessoaIds.has(pessoa.id))
        : [],
      lancamentos,
    };
  }

  if (
    [
      "financas_estudos",
      "financas_lista",
      "financas_lembretes",
      "financas_receitas",
    ].includes(chave)
  ) {
    return filtrarLista(valor, filtro, true);
  }

  return valor;
}

export function criarBackup(
  areasSelecionadas = null,
  filtroRecebido = { modo: "tudo" }
) {
  const dados = {};
  const filtro = normalizarFiltro(filtroRecebido);

  const chavesSelecionadas =
    obterChavesSelecionadas(areasSelecionadas);

  for (const chave of obterChavesDoAplicativo()) {
    if (
      chavesSelecionadas &&
      !chavesSelecionadas.has(chave)
    ) {
      continue;
    }

    const valor = lerChave(chave);

    if (valor === null) continue;

    dados[chave] = prepararParaBackup(chave, valor, filtro);
  }

  return {
    aplicativo: "Finanças Offline",
    versaoBackup: BACKUP_VERSION,
    criadoEm: new Date().toISOString(),
    areasSelecionadas: Array.isArray(areasSelecionadas)
      ? areasSelecionadas
      : AREAS_DE_BACKUP.map((area) => area.chave),
    filtroPeriodo: filtro,
    dados,
  };
}

export function baixarBackup(
  areasSelecionadas = null,
  filtro = { modo: "tudo" }
) {
  const backup = criarBackup(areasSelecionadas, filtro);

  const arquivo = new Blob(
    [JSON.stringify(backup, null, 2)],
    {
      type: "application/json;charset=utf-8",
    }
  );

  const url = URL.createObjectURL(arquivo);
  const link = document.createElement("a");

  const dataAtual = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `financas-backup-${dataAtual}.json`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);

  return backup;
}

export async function lerArquivoBackup(arquivo) {
  if (!arquivo) {
    throw new Error("Nenhum arquivo foi selecionado.");
  }

  let backup;

  try {
    backup = JSON.parse(await arquivo.text());
  } catch {
    throw new Error(
      "O arquivo selecionado não é um JSON válido."
    );
  }

  if (backup?.aplicativo !== "Finanças Offline") {
    throw new Error(
      "Este arquivo não pertence ao Finanças Offline."
    );
  }

  if (
    !backup.dados ||
    typeof backup.dados !== "object" ||
    Array.isArray(backup.dados)
  ) {
    throw new Error(
      "O arquivo de backup não possui dados válidos."
    );
  }

  return backup;
}

export function restaurarBackup(backup) {
  if (
    !backup?.dados ||
    typeof backup.dados !== "object"
  ) {
    throw new Error("Backup inválido.");
  }

  let quantidade = 0;

  for (const [chave, valor] of Object.entries(backup.dados)) {
    if (!ehChaveDoAplicativo(chave)) {
      continue;
    }

    localStorage.setItem(chave, JSON.stringify(valor));

    quantidade += 1;
  }

  return quantidade;
}

export function apagarDadosSelecionados(
  areasSelecionadas,
  filtroRecebido = { modo: "tudo" }
) {
  const filtro = normalizarFiltro(filtroRecebido);

  const areas = AREAS_DE_BACKUP.filter((area) =>
    Array.isArray(areasSelecionadas) &&
    areasSelecionadas.includes(area.chave)
  );

  let quantidade = 0;

  for (const area of areas) {
    for (const chave of area.chaves) {
      const valor = lerChave(chave);

      if (valor === null) continue;

      if (
        filtro.modo === "tudo" ||
        !chaveTemDadosComData(chave)
      ) {
        localStorage.removeItem(chave);
        quantidade += 1;
        continue;
      }

      if (chave === "financas_transacoes") {
        localStorage.setItem(
          chave,
          JSON.stringify(filtrarLista(valor, filtro, false))
        );
        quantidade += 1;
        continue;
      }

      if (chave === "financas_reserva") {
        localStorage.setItem(
          chave,
          JSON.stringify({
            ...valor,
            movimentos: filtrarLista(
              valor?.movimentos,
              filtro,
              false
            ),
          })
        );
        quantidade += 1;
        continue;
      }

      if (chave === "financas_quem_me_deve") {
        localStorage.setItem(
          chave,
          JSON.stringify({
            ...valor,
            lancamentos: filtrarLista(
              valor?.lancamentos,
              filtro,
              false
            ),
          })
        );
        quantidade += 1;
        continue;
      }

      if (
        [
          "financas_estudos",
          "financas_lista",
          "financas_lembretes",
          "financas_receitas",
        ].includes(chave)
      ) {
        localStorage.setItem(
          chave,
          JSON.stringify(filtrarLista(valor, filtro, false))
        );
        quantidade += 1;
      }
    }
  }

  return quantidade;
}

export function apagarDadosDoAplicativo() {
  for (const chave of obterChavesDoAplicativo()) {
    localStorage.removeItem(chave);
  }

  sessionStorage.clear();
}

export const baixarBackupCompleto = baixarBackup;
export const lerArquivoDeBackup = lerArquivoBackup;
export const restaurarBackupCompleto = restaurarBackup;