import React, { useRef, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "../../firebase.js";
import { useFinance } from "../../App.jsx";

import "./BackupPage.css";

const CHAVE_ULTIMO_BACKUP = "financas_backup_ultimo_em";

const AREAS = [
  {
    chave: "perfil",
    nome: "👤 Perfil",
    chaveLocal: "financas_profile",
    campoNuvem: "profile",
    vazio: {},
    temData: false,
  },
  {
    chave: "financas",
    nome: "💰 Finanças, 📥 Transações e 📜 Histórico",
    chaveLocal: "financas_transacoes",
    campoNuvem: "transacoes",
    vazio: [],
    temData: true,
  },
  {
    chave: "cartoes",
    nome: "💳 Cartões",
    chaveLocal: "financas_cartoes",
    campoNuvem: "cartoes",
    vazio: [],
    temData: false,
  },
  {
    chave: "reserva",
    nome: "💰 Reserva",
    chaveLocal: "financas_reserva",
    campoNuvem: "reserva",
    vazio: {
      metaMensal: 0,
      locais: [],
      movimentos: [],
    },
    temData: true,
  },
  {
    chave: "acertos",
    nome: "👥 Acertos",
    chaveLocal: "financas_quem_me_deve",
    campoNuvem: "quemMeDeve",
    vazio: {
      pessoas: [],
      lancamentos: [],
      grupos: [],
    },
    temData: true,
  },
  {
    chave: "estudos",
    nome: "📚 Estudos",
    chaveLocal: "financas_estudos",
    campoNuvem: "estudos",
    vazio: [],
    temData: true,
  },
  {
    chave: "lista",
    nome: "🛒 Lista",
    chaveLocal: "financas_lista",
    campoNuvem: "lista",
    vazio: [],
    temData: true,
  },
  {
    chave: "lembretes",
    nome: "⏰ Lembretes",
    chaveLocal: "financas_lembretes",
    campoNuvem: "lembretes",
    vazio: [],
    temData: true,
  },
  {
    chave: "receitas",
    nome: "🍳 Receitas",
    chaveLocal: "financas_receitas",
    campoNuvem: "receitas",
    vazio: [],
    temData: true,
  },
];

function lerLocal(chave, padrao) {
  try {
    const texto = window.localStorage.getItem(chave);

    if (texto === null) return padrao;

    return JSON.parse(texto);
  } catch {
    return padrao;
  }
}

function salvarLocal(chave, valor) {
  window.localStorage.setItem(chave, JSON.stringify(valor));
}

function formatarDataHora(valor) {
  if (!valor) return "Ainda não foi feito";

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return "Data inválida";
  }

  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function normalizarFiltro(filtro = {}) {
  return {
    modo: filtro.modo || "tudo",
    quantidade: Math.max(1, Number(filtro.quantidade) || 1),
    inicio: filtro.inicio || "",
    fim: filtro.fim || "",
  };
}

function nomeDoPeriodo(filtroRecebido) {
  const filtro = normalizarFiltro(filtroRecebido);

  if (filtro.modo === "dias") {
    return `Últimos ${filtro.quantidade} dia(s)`;
  }

  if (filtro.modo === "mes") {
    return "Últimos 30 dias";
  }

  if (filtro.modo === "ano") {
    return "Últimos 365 dias";
  }

  if (filtro.modo === "personalizado") {
    if (filtro.inicio && filtro.fim) {
      return `De ${filtro.inicio.split("-").reverse().join("/")} até ${filtro.fim
        .split("-")
        .reverse()
        .join("/")}`;
    }

    return "Período escolhido";
  }

  return "Todos os dados";
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

  if (filtro.modo === "tudo") return true;

  const data = dataDoItem(item);

  if (!data) return false;

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

function filtrarLista(lista, filtro, manterItensDoPeriodo) {
  if (!Array.isArray(lista)) return [];

  return lista.filter((item) => {
    const estaNoPeriodo = itemEstaNoPeriodo(item, filtro);

    return manterItensDoPeriodo
      ? estaNoPeriodo
      : !estaNoPeriodo;
  });
}

function tirarTelefoneDoPerfil(valor) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return valor;
  }

  const perfil = { ...valor };

  delete perfil.telefone;

  return perfil;
}

function dadosParaSalvarNoBackup(area, valor, filtro) {
  if (area.chave === "perfil") {
    return tirarTelefoneDoPerfil(valor);
  }

  if (filtro.modo === "tudo" || !area.temData) {
    return valor;
  }

  if (area.chave === "financas") {
    return filtrarLista(valor, filtro, true);
  }

  if (area.chave === "reserva") {
    return {
      ...(valor || {}),
      movimentos: filtrarLista(valor?.movimentos, filtro, true),
    };
  }

  if (area.chave === "acertos") {
    const lancamentos = filtrarLista(valor?.lancamentos, filtro, true);

    const idsDasPessoas = new Set(
      lancamentos.map((lancamento) => lancamento.pessoaId)
    );

    return {
      ...(valor || {}),
      pessoas: Array.isArray(valor?.pessoas)
        ? valor.pessoas.filter((pessoa) => idsDasPessoas.has(pessoa.id))
        : [],
      lancamentos,
    };
  }

  return filtrarLista(valor, filtro, true);
}

function dadosAposApagar(area, valor, filtro) {
  if (filtro.modo === "tudo") {
    return area.vazio;
  }

  if (!area.temData) {
    return valor;
  }

  if (area.chave === "financas") {
    return filtrarLista(valor, filtro, false);
  }

  if (area.chave === "reserva") {
    return {
      ...(valor || {}),
      movimentos: filtrarLista(valor?.movimentos, filtro, false),
    };
  }

  if (area.chave === "acertos") {
    const lancamentos = filtrarLista(valor?.lancamentos, filtro, false);

    const idsDasPessoas = new Set(
      lancamentos.map((lancamento) => lancamento.pessoaId)
    );

    return {
      ...(valor || {}),
      pessoas: Array.isArray(valor?.pessoas)
        ? valor.pessoas.filter((pessoa) => idsDasPessoas.has(pessoa.id))
        : [],
      lancamentos,
    };
  }

  return filtrarLista(valor, filtro, false);
}

function SeletorPeriodo({ filtro, aoAlterar, id }) {
  function alterar(campo, valor) {
    aoAlterar({
      ...filtro,
      [campo]: valor,
    });
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 9,
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        border: "1px solid rgba(160, 220, 255, 0.18)",
      }}
    >
      <label>
        Período
        <select
          value={filtro.modo}
          onChange={(evento) => alterar("modo", evento.target.value)}
        >
          <option value="tudo">Todos os dados</option>
          <option value="dias">Últimos dias</option>
          <option value="mes">Últimos 30 dias</option>
          <option value="ano">Últimos 365 dias</option>
          <option value="personalizado">Escolher datas</option>
        </select>
      </label>

      {filtro.modo === "dias" ? (
        <label>
          Quantos dias?
          <input
            id={`${id}-dias`}
            type="number"
            min="1"
            value={filtro.quantidade}
            onChange={(evento) =>
              alterar("quantidade", evento.target.value)
            }
          />
        </label>
      ) : null}

      {filtro.modo === "personalizado" ? (
        <>
          <label>
            Data inicial
            <input
              type="date"
              value={filtro.inicio}
              onChange={(evento) => alterar("inicio", evento.target.value)}
            />
          </label>

          <label>
            Data final
            <input
              type="date"
              value={filtro.fim}
              onChange={(evento) => alterar("fim", evento.target.value)}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}

export default function BackupPage() {
  const inputArquivoRef = useRef(null);

  const { user } = useFinance();

  const [areasBackup, setAreasBackup] = useState(
    AREAS.map((area) => area.chave)
  );

  const [areasApagar, setAreasApagar] = useState([]);

  const [filtroBackup, setFiltroBackup] = useState({
    modo: "tudo",
    quantidade: 3,
    inicio: "",
    fim: "",
  });

  const [filtroApagar, setFiltroApagar] = useState({
    modo: "tudo",
    quantidade: 3,
    inicio: "",
    fim: "",
  });

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [ultimoBackupEm, setUltimoBackupEm] = useState(
    localStorage.getItem(CHAVE_ULTIMO_BACKUP) || ""
  );

  function mostrarMensagem(texto) {
    setMensagem(texto);
    setErro("");
  }

  function mostrarErro(texto) {
    setErro(texto);
    setMensagem("");
  }

  function alternarArea(chave, tipo) {
    const alterar =
      tipo === "backup"
        ? setAreasBackup
        : setAreasApagar;

    alterar((areasAtuais) =>
      areasAtuais.includes(chave)
        ? areasAtuais.filter((area) => area !== chave)
        : [...areasAtuais, chave]
    );
  }

  function criarObjetoBackup(areasSelecionadas, filtroRecebido) {
    const filtro = normalizarFiltro(filtroRecebido);
    const dados = {};

    AREAS.filter((area) =>
      areasSelecionadas.includes(area.chave)
    ).forEach((area) => {
      const valor = lerLocal(area.chaveLocal, null);

      if (valor === null) return;

      dados[area.chaveLocal] = dadosParaSalvarNoBackup(
        area,
        valor,
        filtro
      );
    });

    return {
      aplicativo: "Finanças Online",
      versaoBackup: 5,
      criadoEm: new Date().toISOString(),
      areasSelecionadas,
      filtroPeriodo: filtro,
      dados,
    };
  }

  function baixarBackup() {
    if (!areasBackup.length) {
      mostrarErro("Marque pelo menos uma área para salvar.");
      return;
    }

    const backup = criarObjetoBackup(areasBackup, filtroBackup);

    const arquivo = new Blob(
      [JSON.stringify(backup, null, 2)],
      {
        type: "application/json;charset=utf-8",
      }
    );

    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");

    link.href = url;
    link.download = `financas-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1500);

    const agora = new Date().toISOString();

    localStorage.setItem(CHAVE_ULTIMO_BACKUP, agora);
    setUltimoBackupEm(agora);

    mostrarMensagem(
      `Backup salvo: ${nomeDoPeriodo(filtroBackup)}.`
    );
  }

  async function importarBackup(evento) {
    const arquivo = evento.target.files?.[0];

    if (!arquivo) return;

    try {
      const backup = JSON.parse(await arquivo.text());

      if (
        backup?.aplicativo !== "Finanças Offline" &&
        backup?.aplicativo !== "Finanças Online"
      ) {
        throw new Error(
          "Este arquivo não pertence ao aplicativo Finanças."
        );
      }

      if (!backup?.dados || typeof backup.dados !== "object") {
        throw new Error("O arquivo de backup não possui dados válidos.");
      }

      const confirmar = window.confirm(
        "Os dados deste backup substituirão as partes salvas nele. Deseja continuar?"
      );

      if (!confirmar) return;

      const dadosParaNuvem = {};
      let quantidade = 0;

      AREAS.forEach((area) => {
        if (
          !Object.prototype.hasOwnProperty.call(
            backup.dados,
            area.chaveLocal
          )
        ) {
          return;
        }

        const valor = backup.dados[area.chaveLocal];

        salvarLocal(area.chaveLocal, valor);
        dadosParaNuvem[area.campoNuvem] = valor;
        quantidade += 1;
      });

      if (user && Object.keys(dadosParaNuvem).length) {
        await setDoc(
          doc(db, "users", user.uid),
          {
            ...dadosParaNuvem,
            atualizadoEm: serverTimestamp(),
          },
          { merge: true }
        );
      }

      mostrarMensagem(
        `Backup restaurado: ${quantidade} área(s). O aplicativo será recarregado.`
      );

      window.setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      mostrarErro(
        error.message || "Não foi possível restaurar o backup."
      );
    } finally {
      evento.target.value = "";
    }
  }

  async function apagarAreasMarcadas() {
    if (!ultimoBackupEm) {
      mostrarErro("Faça e baixe um backup antes de apagar.");
      return;
    }

    if (!areasApagar.length) {
      mostrarErro("Marque pelo menos uma área para apagar.");
      return;
    }

    if (
      filtroApagar.modo === "personalizado" &&
      !filtroApagar.inicio &&
      !filtroApagar.fim
    ) {
      mostrarErro("Escolha pelo menos uma data.");
      return;
    }

    const nomes = AREAS.filter((area) =>
      areasApagar.includes(area.chave)
    )
      .map((area) => area.nome)
      .join(", ");

    const confirmar = window.confirm(
      `Apagar:\n${nomes}\n\nPeríodo: ${nomeDoPeriodo(
        filtroApagar
      )}\n\nDeseja continuar?`
    );

    if (!confirmar) return;

    try {
      const dadosParaNuvem = {};
      let quantidade = 0;

      AREAS.filter((area) =>
        areasApagar.includes(area.chave)
      ).forEach((area) => {
        const valorAtual = lerLocal(area.chaveLocal, area.vazio);

        const novoValor = dadosAposApagar(
          area,
          valorAtual,
          filtroApagar
        );

        salvarLocal(area.chaveLocal, novoValor);
        dadosParaNuvem[area.campoNuvem] = novoValor;
        quantidade += 1;
      });

      if (user && Object.keys(dadosParaNuvem).length) {
        await setDoc(
          doc(db, "users", user.uid),
          {
            ...dadosParaNuvem,
            atualizadoEm: serverTimestamp(),
          },
          { merge: true }
        );
      }

      setAreasApagar([]);

      mostrarMensagem(
        `${quantidade} área(s) apagada(s). O aplicativo será recarregado.`
      );

      window.setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (error) {
      console.error(error);
      mostrarErro("Não foi possível apagar os dados.");
    }
  }

  async function apagarTudo() {
    if (!ultimoBackupEm) {
      mostrarErro("Faça e baixe um backup antes de apagar tudo.");
      return;
    }

    const confirmar = window.confirm(
      "ÚLTIMA CONFIRMAÇÃO: todos os dados do aplicativo serão apagados. Deseja continuar?"
    );

    if (!confirmar) return;

    try {
      const dadosParaNuvem = {};

      AREAS.forEach((area) => {
        salvarLocal(area.chaveLocal, area.vazio);
        dadosParaNuvem[area.campoNuvem] = area.vazio;
      });

      if (user) {
        await setDoc(
          doc(db, "users", user.uid),
          {
            ...dadosParaNuvem,
            atualizadoEm: serverTimestamp(),
          },
          { merge: true }
        );
      }

      mostrarMensagem(
        "Todos os dados foram apagados. O aplicativo será recarregado."
      );

      window.setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (error) {
      console.error(error);
      mostrarErro("Não foi possível apagar todos os dados.");
    }
  }

  return (
    <div className="page backup-page">
      <div>
        <h2 className="page-title">Backup e restauração</h2>

        <p className="backup-subtitulo">
          Salve somente o que quiser, escolha um período e apague áreas
          separadamente.
        </p>
      </div>

      {mensagem ? (
        <div className="backup-mensagem backup-sucesso">
          {mensagem}
        </div>
      ) : null}

      {erro ? (
        <div className="backup-mensagem backup-erro">
          {erro}
        </div>
      ) : null}

      <section className="backup-card">
        <h3>⬇️ Salvar backup</h3>

        <p>Marque as partes que devem entrar no arquivo.</p>

        <div className="backup-opcoes">
          {AREAS.map((area) => (
            <label
              key={area.chave}
              className="backup-botao-secundario"
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={areasBackup.includes(area.chave)}
                onChange={() => alternarArea(area.chave, "backup")}
              />

              {area.nome}
            </label>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 8,
            marginTop: 12,
          }}
        >
          <button
            type="button"
            className="backup-botao-secundario"
            onClick={() => setAreasBackup(AREAS.map((area) => area.chave))}
          >
            Marcar tudo
          </button>

          <button
            type="button"
            className="backup-botao-secundario"
            onClick={() => setAreasBackup([])}
          >
            Desmarcar tudo
          </button>
        </div>

        <SeletorPeriodo
          id="backup"
          filtro={filtroBackup}
          aoAlterar={setFiltroBackup}
        />

        <button
          type="button"
          className="backup-botao"
          style={{ marginTop: 14 }}
          onClick={baixarBackup}
        >
          ⬇️ Baixar backup
        </button>

        <small style={{ display: "block", marginTop: 10 }}>
          Último backup: {formatarDataHora(ultimoBackupEm)}
        </small>
      </section>

      <section className="backup-card">
        <h3>⬆️ Restaurar backup</h3>

        <p>Escolha um arquivo de backup do aplicativo.</p>

        <input
          ref={inputArquivoRef}
          className="backup-arquivo"
          type="file"
          accept=".json,application/json"
          onChange={importarBackup}
        />

        <button
          type="button"
          className="backup-botao-secundario"
          onClick={() => inputArquivoRef.current?.click()}
        >
          Escolher arquivo de backup
        </button>
      </section>

      <section className="backup-card backup-aviso">
        <h3>🗑️ Apagar dados</h3>

        <p>
          Marque somente o que quer apagar. O restante continuará salvo.
        </p>

        <div className="backup-opcoes">
          {AREAS.map((area) => (
            <label
              key={`apagar-${area.chave}`}
              className="backup-botao-secundario"
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={areasApagar.includes(area.chave)}
                onChange={() => alternarArea(area.chave, "apagar")}
              />

              {area.nome}
            </label>
          ))}
        </div>

        <SeletorPeriodo
          id="apagar"
          filtro={filtroApagar}
          aoAlterar={setFiltroApagar}
        />

        <button
          type="button"
          className="backup-botao-secundario"
          style={{ width: "100%", marginTop: 14 }}
          onClick={apagarAreasMarcadas}
        >
          🗑️ Apagar áreas marcadas
        </button>

        <button
          type="button"
          className="backup-botao"
          style={{ width: "100%", marginTop: 10 }}
          onClick={apagarTudo}
        >
          🗑️ Apagar todos os dados
        </button>

        <small style={{ display: "block", marginTop: 10 }}>
          Antes de apagar, faça um backup. O apagamento também é salvo na sua
          conta online.
        </small>
      </section>
    </div>
  );
} 