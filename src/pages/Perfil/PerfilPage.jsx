import React, { useEffect, useRef, useState } from "react";
import {
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "../../firebase.js";
import { useFinance } from "../../App.jsx";

import {
  AREAS_DE_BACKUP,
  apagarDadosDoAplicativo,
  apagarDadosSelecionados,
  baixarBackup,
  criarBackup,
  lerArquivoBackup,
  restaurarBackup,
} from "../../services/backupService.js";

import "./PerfilPage.css";

const CHAVE_ULTIMO_BACKUP = "financas_backup_ultimo_em";

const estiloGradeBotoes = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const estiloBotao = {
  width: "100%",
  minHeight: 48,
  margin: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const estiloBloco = {
  marginTop: 14,
  padding: 14,
  borderRadius: 14,
  border: "1px solid rgba(173,216,255,.16)",
};

const estiloModalExcluir = {
  width: "min(430px, calc(100vw - 28px))",
  display: "grid",
  gap: 14,
};

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

function nomeDoPeriodo(filtro) {
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

    return "Período personalizado";
  }

  return "Todos os dados";
}

function valorDoBackup(item, padrao) {
  if (
    item &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    Object.prototype.hasOwnProperty.call(item, "formato") &&
    Object.prototype.hasOwnProperty.call(item, "valor")
  ) {
    return item.valor;
  }

  return item ?? padrao;
}

function resumirBackup(backup) {
  const dados = backup?.dados || {};
  const acertos = valorDoBackup(dados.financas_quem_me_deve, {});
  const transacoes = valorDoBackup(dados.financas_transacoes, []);

  return {
    totalChaves: Object.keys(dados).length,
    transacoes: Array.isArray(transacoes) ? transacoes.length : 0,
    pessoas: Array.isArray(acertos?.pessoas) ? acertos.pessoas.length : 0,
    lancamentos: Array.isArray(acertos?.lancamentos)
      ? acertos.lancamentos.length
      : 0,
  };
}

function SeletorPeriodo({ titulo, filtro, aoAlterar }) {
  function atualizar(campo, valor) {
    aoAlterar({
      ...filtro,
      [campo]: valor,
    });
  }

  function trocarPeriodo(valor) {
    if (valor === "3-dias") {
      aoAlterar({ ...filtro, modo: "dias", quantidade: 3 });
      return;
    }

    if (valor === "7-dias") {
      aoAlterar({ ...filtro, modo: "dias", quantidade: 7 });
      return;
    }

    if (
      valor === "dias" &&
      [3, 7].includes(Number(filtro.quantidade))
    ) {
      aoAlterar({ ...filtro, modo: "dias", quantidade: 10 });
      return;
    }

    atualizar("modo", valor);
  }

  const valorSelecionado =
    filtro.modo === "dias" && Number(filtro.quantidade) === 3
      ? "3-dias"
      : filtro.modo === "dias" && Number(filtro.quantidade) === 7
        ? "7-dias"
        : filtro.modo;

  return (
    <div
      style={{
        ...estiloBloco,
        display: "grid",
        gap: 10,
        background: "rgba(9,18,38,.22)",
      }}
    >
      <strong>🗓️ {titulo}</strong>

      <div className="field" style={{ margin: 0 }}>
        <label>Período</label>

        <select
          value={valorSelecionado}
          onChange={(evento) => trocarPeriodo(evento.target.value)}
        >
          <option value="tudo">Todos os dados</option>
          <option value="3-dias">Últimos 3 dias</option>
          <option value="7-dias">Última semana (7 dias)</option>
          <option value="dias">Escolher quantidade de dias</option>
          <option value="mes">Último mês (30 dias)</option>
          <option value="ano">Último ano (365 dias)</option>
          <option value="personalizado">Escolher datas</option>
        </select>
      </div>

      {filtro.modo === "dias" ? (
        <div className="field" style={{ margin: 0 }}>
          <label>Quantidade de dias</label>

          <input
            type="number"
            min="1"
            value={filtro.quantidade}
            onChange={(evento) => atualizar("quantidade", evento.target.value)}
          />
        </div>
      ) : null}

      {filtro.modo === "personalizado" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          <div className="field" style={{ margin: 0 }}>
            <label>De</label>

            <input
              type="date"
              value={filtro.inicio}
              onChange={(evento) => atualizar("inicio", evento.target.value)}
            />
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Até</label>

            <input
              type="date"
              value={filtro.fim}
              onChange={(evento) => atualizar("fim", evento.target.value)}
            />
          </div>
        </div>
      ) : null}

      <small className="muted">
        Selecionado: {nomeDoPeriodo(filtro)}.
      </small>
    </div>
  );
}

export default function PerfilPage() {
  const { profile = {}, atualizarProfile, user } = useFinance();

  const inputFotoRef = useRef(null);
  const inputBackupRef = useRef(null);
  const timerFlashRef = useRef(null);

  const [fotoAberta, setFotoAberta] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [flash, setFlash] = useState(null);
  const [testeBackup, setTesteBackup] = useState(null);
  const [dadosPessoaisAbertos, setDadosPessoaisAbertos] = useState(false);
  const [opcoesBackupAbertas, setOpcoesBackupAbertas] = useState(false);

  const [ultimoBackupEm, setUltimoBackupEm] = useState(
    localStorage.getItem(CHAVE_ULTIMO_BACKUP) || ""
  );

  const [areasBackup, setAreasBackup] = useState(() =>
    AREAS_DE_BACKUP.map((area) => area.chave)
  );

  const [areasApagar, setAreasApagar] = useState([]);

  const [filtroBackup, setFiltroBackup] = useState({
    modo: "tudo",
    quantidade: 7,
    inicio: "",
    fim: "",
  });

  const [filtroApagar, setFiltroApagar] = useState({
    modo: "tudo",
    quantidade: 7,
    inicio: "",
    fim: "",
  });

  const [modalApagar, setModalApagar] = useState(null);

  useEffect(() => {
    return () => {
      if (timerFlashRef.current) {
        window.clearTimeout(timerFlashRef.current);
      }
    };
  }, []);

  function mostrarFlash(texto, tipo = "sucesso") {
    setFlash({
      texto,
      tipo,
      dataHora: new Date().toISOString(),
    });

    if (timerFlashRef.current) {
      window.clearTimeout(timerFlashRef.current);
    }

    timerFlashRef.current = window.setTimeout(() => {
      setFlash(null);
    }, 3000);
  }

  function handleChange(campo) {
    return (evento) => {
      atualizarProfile({
        [campo]: evento.target.value,
      });
    };
  }

  function abrirSeletorDeFoto() {
    inputFotoRef.current?.click();
  }

  function selecionarFoto(evento) {
    const arquivo = evento.target.files?.[0];

    if (!arquivo) return;

    if (!arquivo.type.startsWith("image/")) {
      mostrarFlash("Escolha uma imagem válida.", "erro");
      evento.target.value = "";
      return;
    }

    if (arquivo.size > 5 * 1024 * 1024) {
      mostrarFlash("A imagem deve ter no máximo 5 MB.", "erro");
      evento.target.value = "";
      return;
    }

    const leitor = new FileReader();

    leitor.onload = () => {
      atualizarProfile({ avatarBase64: leitor.result });
      setFotoAberta(true);
      mostrarFlash("Foto atualizada com sucesso.");
      evento.target.value = "";
    };

    leitor.onerror = () => {
      mostrarFlash("Não foi possível carregar essa imagem.", "erro");
      evento.target.value = "";
    };

    leitor.readAsDataURL(arquivo);
  }

  function removerFoto() {
    atualizarProfile({ avatarBase64: "" });
    setFotoAberta(false);
    mostrarFlash("Foto removida.");
  }

  function clicarNaFoto() {
    if (profile.avatarBase64) {
      setFotoAberta(true);
      return;
    }

    abrirSeletorDeFoto();
  }

  function alternarArea(chave, tipo) {
    const alterar = tipo === "backup" ? setAreasBackup : setAreasApagar;

    alterar((areasAtuais) =>
      areasAtuais.includes(chave)
        ? areasAtuais.filter((item) => item !== chave)
        : [...areasAtuais, chave]
    );
  }

  function testarBackup() {
    try {
      if (!areasBackup.length) {
        mostrarFlash("Marque pelo menos uma área para testar.", "erro");
        return;
      }

      const backup = criarBackup(areasBackup, filtroBackup);

      setTesteBackup({
        ok: true,
        ...resumirBackup(backup),
      });

      mostrarFlash(
        `Teste concluído: ${nomeDoPeriodo(filtroBackup)}.`
      );
    } catch (erro) {
      mostrarFlash(
        erro.message || "Não foi possível testar o backup.",
        "erro"
      );
    }
  }

  function salvarBackup() {
    try {
      if (!areasBackup.length) {
        mostrarFlash("Marque pelo menos uma área antes de salvar.", "erro");
        return false;
      }

      const backup = baixarBackup(areasBackup, filtroBackup);
      const agora = new Date().toISOString();

      localStorage.setItem(CHAVE_ULTIMO_BACKUP, agora);
      setUltimoBackupEm(agora);

      setTesteBackup({
        ok: true,
        ...resumirBackup(backup),
      });

      mostrarFlash(
        `Backup baixado: ${nomeDoPeriodo(filtroBackup)}.`
      );

      return true;
    } catch (erro) {
      mostrarFlash(
        erro.message || "Não foi possível salvar o backup.",
        "erro"
      );

      return false;
    }
  }

  async function selecionarBackup(evento) {
    const arquivo = evento.target.files?.[0];

    if (!arquivo) return;

    setRestaurando(true);

    try {
      const backup = await lerArquivoBackup(arquivo);

      setModalApagar({
        tipo: "restaurar",
        etapa: "confirmar-restaurar",
        backup,
      });
    } catch (erro) {
      mostrarFlash(
        erro.message || "Não foi possível ler o backup.",
        "erro"
      );
    } finally {
      setRestaurando(false);
      evento.target.value = "";
    }
  }

  function abrirModalApagar(tipo) {
    if (tipo === "marcadas" && !areasApagar.length) {
      mostrarFlash("Marque pelo menos uma área para apagar.", "erro");
      return;
    }

    setModalApagar({
      tipo,
      etapa: "backup",
    });
  }

  function fazerBackupEContinuar() {
    const salvou = salvarBackup();

    if (!salvou) return;

    setModalApagar((modalAtual) => ({
      ...modalAtual,
      etapa: "confirmar-um",
    }));
  }

  function continuarSemBackup() {
    setModalApagar((modalAtual) => ({
      ...modalAtual,
      etapa: "confirmar-um",
    }));
  }

  async function sincronizarAreasApagadas(areasSelecionadas) {
    if (!user) return;

    const configuracoes = {
      perfil: {
        chaveLocal: "financas_profile",
        campoNuvem: "profile",
        vazio: {},
      },
      financas: {
        chaveLocal: "financas_transacoes",
        campoNuvem: "transacoes",
        vazio: [],
      },
      cartoes: {
        chaveLocal: "financas_cartoes",
        campoNuvem: "cartoes",
        vazio: [],
      },
      reserva: {
        chaveLocal: "financas_reserva",
        campoNuvem: "reserva",
        vazio: {
          metaMensal: 0,
          locais: [],
          movimentos: [],
        },
      },
      acertos: {
        chaveLocal: "financas_quem_me_deve",
        campoNuvem: "quemMeDeve",
        vazio: {
          pessoas: [],
          lancamentos: [],
          grupos: [],
        },
      },
      estudos: {
        chaveLocal: "financas_estudos",
        campoNuvem: "estudos",
        vazio: [],
      },
      lista: {
        chaveLocal: "financas_lista",
        campoNuvem: "lista",
        vazio: [],
      },
      lembretes: {
        chaveLocal: "financas_lembretes",
        campoNuvem: "lembretes",
        vazio: [],
      },
      receitas: {
        chaveLocal: "financas_receitas",
        campoNuvem: "receitas",
        vazio: [],
      },
    };

    const dadosParaNuvem = {};

    areasSelecionadas.forEach((areaSelecionada) => {
      const configuracao = configuracoes[areaSelecionada];

      if (!configuracao) return;

      try {
        const texto = localStorage.getItem(configuracao.chaveLocal);

        dadosParaNuvem[configuracao.campoNuvem] =
          texto === null
            ? configuracao.vazio
            : JSON.parse(texto);
      } catch {
        dadosParaNuvem[configuracao.campoNuvem] = configuracao.vazio;
      }
    });

    if (!Object.keys(dadosParaNuvem).length) return;

    await setDoc(
      doc(db, "users", user.uid),
      {
        ...dadosParaNuvem,
        atualizadoEm: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function executarApagarMarcadas() {
    try {
      const quantidade = apagarDadosSelecionados(
        areasApagar,
        filtroApagar
      );

      await sincronizarAreasApagadas(areasApagar);

      setModalApagar(null);

      mostrarFlash(
        `${quantidade} área(s) atualizada(s): ${nomeDoPeriodo(
          filtroApagar
        )}.`
      );

      window.setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (erro) {
      console.error(erro);
      mostrarFlash(
        "Não foi possível apagar e sincronizar os dados.",
        "erro"
      );
    }
  }

  async function executarApagarTudo() {
    try {
      if (filtroApagar.modo === "tudo") {
        apagarDadosDoAplicativo();

        await sincronizarAreasApagadas(
          AREAS_DE_BACKUP.map((area) => area.chave)
        );

        setModalApagar(null);
        mostrarFlash("Todos os dados foram apagados.");

        window.setTimeout(() => {
          window.location.reload();
        }, 900);

        return;
      }

      const areasComData = ["financas", "reserva", "acertos"];

      apagarDadosSelecionados(areasComData, filtroApagar);

      await sincronizarAreasApagadas(areasComData);

      setModalApagar(null);

      mostrarFlash(
        `Registros apagados: ${nomeDoPeriodo(filtroApagar)}.`
      );

      window.setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (erro) {
      console.error(erro);
      mostrarFlash(
        "Não foi possível apagar e sincronizar os dados.",
        "erro"
      );
    }
  }

  function concluirExclusao() {
    if (modalApagar?.tipo === "marcadas") {
      executarApagarMarcadas();
      return;
    }

    executarApagarTudo();
  }

  function confirmarRestauracao() {
    try {
      const quantidade = restaurarBackup(modalApagar.backup);

      setModalApagar(null);
      mostrarFlash(`Backup restaurado: ${quantidade} grupo(s).`);

      window.setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (erro) {
      setModalApagar(null);

      mostrarFlash(
        erro.message || "Não foi possível restaurar o backup.",
        "erro"
      );
    }
  }

  const nomesAreasMarcadas = AREAS_DE_BACKUP.filter((area) =>
    areasApagar.includes(area.chave)
  )
    .map((area) => area.nome)
    .join(", ");

  return (
    <div className="page perfil-page">
      {flash ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            zIndex: 99999,
            width: "min(340px, calc(100vw - 24px))",
            padding: 12,
            borderRadius: 14,
            background:
              flash.tipo === "erro"
                ? "rgba(120,25,30,.97)"
                : "rgba(12,35,65,.97)",
            border:
              flash.tipo === "erro"
                ? "1px solid rgba(255,100,100,.6)"
                : "1px solid rgba(130,210,255,.45)",
            boxShadow: "0 12px 36px rgba(0,0,0,.35)",
          }}
        >
          <strong>{flash.texto}</strong>

          <small style={{ display: "block", marginTop: 5, opacity: 0.78 }}>
            {formatarDataHora(flash.dataHora)}
          </small>
        </div>
      ) : null}

      <div className="perfil-cabecalho">
        <div>
          <h2 className="page-title">Configurações</h2>
          <p className="perfil-subtitulo">
            Personalize seu perfil e proteja os dados do aplicativo.
          </p>
        </div>

        <button
          type="button"
          className="perfil-avatar-botao"
          onClick={clicarNaFoto}
          aria-label="Foto do perfil"
        >
          {profile.avatarBase64 ? (
            <img
              src={profile.avatarBase64}
              alt="Foto do perfil"
              className="perfil-avatar"
            />
          ) : (
            <span
              className="perfil-avatar perfil-avatar-vazio"
              aria-hidden="true"
            />
          )}

          <span className="perfil-avatar-editar" aria-hidden="true">
            📷
          </span>
        </button>
      </div>

      <input
        ref={inputFotoRef}
        className="perfil-input-oculto"
        type="file"
        accept="image/*"
        onChange={selecionarFoto}
      />

      <input
        ref={inputBackupRef}
        className="perfil-input-oculto"
        type="file"
        accept=".json,application/json"
        onChange={selecionarBackup}
      />

      <section className="card perfil-card">
        <div className="perfil-backup-titulo">
          <div>
            <h3>Dados pessoais</h3>
            <p>
              {profile.nome || "Perfil sem nome"}
              {profile.email ? ` · ${profile.email}` : ""}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="toggle-btn"
          onClick={() => setDadosPessoaisAbertos((aberto) => !aberto)}
        >
          {dadosPessoaisAbertos
            ? "Ocultar dados pessoais ▲"
            : "Editar dados pessoais ▼"}
        </button>

        {dadosPessoaisAbertos ? (
          <div className="perfil-grid" style={{ marginTop: 14 }}>
            <div className="field">
              <label htmlFor="perfil-nome">Nome</label>
              <input
                id="perfil-nome"
                value={profile.nome || ""}
                onChange={handleChange("nome")}
                placeholder="Seu nome"
              />
            </div>

            <div className="field">
              <label htmlFor="perfil-email">E-mail</label>
              <input
                id="perfil-email"
                type="email"
                value={profile.email || ""}
                onChange={handleChange("email")}
                placeholder="seuemail@exemplo.com"
              />
            </div>

            <div className="field">
              <label htmlFor="perfil-telefone">Telefone</label>
              <input
                id="perfil-telefone"
                type="tel"
                value={profile.telefone || ""}
                onChange={handleChange("telefone")}
                placeholder="(00) 00000-0000"
              />
              <small className="perfil-ajuda">
                O telefone não entra no backup.
              </small>
            </div>

            <div className="field">
              <label htmlFor="perfil-idade">Idade</label>
              <input
                id="perfil-idade"
                type="number"
                min="0"
                max="120"
                value={profile.idade || ""}
                onChange={handleChange("idade")}
              />
            </div>

            <div className="field">
              <label htmlFor="perfil-sexo">Sexo</label>
              <select
                id="perfil-sexo"
                value={profile.sexo || ""}
                onChange={handleChange("sexo")}
              >
                <option value="">Selecione...</option>
                <option value="Feminino">Feminino</option>
                <option value="Masculino">Masculino</option>
                <option value="Outro">Outro</option>
                <option value="Prefiro não dizer">Prefiro não dizer</option>
              </select>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card perfil-card perfil-backup-card">
        <div className="perfil-backup-titulo">
          <div className="perfil-backup-icone" aria-hidden="true">
            🛡️
          </div>

          <div>
            <h3>Backup</h3>
            <p>Escolha o que deseja salvar, restaurar ou apagar.</p>
          </div>
        </div>

        <div
          style={{
            ...estiloBloco,
            display: "grid",
            gap: 4,
            background: "rgba(9,18,38,.34)",
          }}
        >
          <strong>🟢 Pronto para salvar</strong>

          <span className="muted small">
            {ultimoBackupEm
              ? `Último backup: ${formatarDataHora(ultimoBackupEm)}`
              : "Nenhum backup foi feito ainda."}
          </span>
        </div>

        <div style={estiloGradeBotoes}>
          <button
            type="button"
            className="primary-btn"
            onClick={salvarBackup}
            style={estiloBotao}
          >
            ⬇️ Salvar backup marcado
          </button>

          <button
            type="button"
            className="toggle-btn"
            onClick={() => inputBackupRef.current?.click()}
            disabled={restaurando}
            style={estiloBotao}
          >
            ⬆️ {restaurando ? "Restaurando..." : "Restaurar backup"}
          </button>
        </div>

        <button
          type="button"
          className="toggle-btn"
          style={{ ...estiloBotao, marginTop: 12 }}
          onClick={() => setOpcoesBackupAbertas((aberto) => !aberto)}
        >
          {opcoesBackupAbertas
            ? "Ocultar opções ▲"
            : "Mais opções do backup ▼"}
        </button>

        {opcoesBackupAbertas ? (
          <>
            <div style={{ ...estiloBloco, display: "grid", gap: 10 }}>
              <strong>📦 Marque o que salvar</strong>

              <SeletorPeriodo
                titulo="Período do próximo backup"
                filtro={filtroBackup}
                aoAlterar={setFiltroBackup}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                {AREAS_DE_BACKUP.map((area) => (
                  <label
                    key={`backup-${area.chave}`}
                    className="toggle-btn"
                    style={{
                      minHeight: 48,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: 8,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={areasBackup.includes(area.chave)}
                      onChange={() => alternarArea(area.chave, "backup")}
                    />

                    <span>{area.nome}</span>
                  </label>
                ))}
              </div>

              <button
                type="button"
                className="toggle-btn"
                onClick={testarBackup}
                style={estiloBotao}
              >
                🧪 Testar backup marcado
              </button>

              {testeBackup?.ok ? (
                <div
                  className="small"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 8,
                  }}
                >
                  <div>
                    Transações: <strong>{testeBackup.transacoes}</strong>
                  </div>

                  <div>
                    Pessoas: <strong>{testeBackup.pessoas}</strong>
                  </div>

                  <div>
                    Acertos: <strong>{testeBackup.lancamentos}</strong>
                  </div>

                  <div>
                    Grupos: <strong>{testeBackup.totalChaves}</strong>
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ ...estiloBloco, display: "grid", gap: 10 }}>
              <strong>🗑️ Marque o que apagar</strong>

              <SeletorPeriodo
                titulo="Período do apagamento"
                filtro={filtroApagar}
                aoAlterar={setFiltroApagar}
              />

              <p className="muted small" style={{ margin: 0 }}>
                Para apagar somente por data, use Finanças, Reserva ou Acertos.
                Perfil e Cartões não possuem data e são apagados por inteiro.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                {AREAS_DE_BACKUP.map((area) => (
                  <label
                    key={`apagar-${area.chave}`}
                    className="toggle-btn"
                    style={{
                      minHeight: 48,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: 8,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={areasApagar.includes(area.chave)}
                      onChange={() => alternarArea(area.chave, "apagar")}
                    />

                    <span>{area.nome}</span>
                  </label>
                ))}
              </div>

              <button
                type="button"
                className="toggle-btn"
                onClick={() => abrirModalApagar("marcadas")}
                style={estiloBotao}
              >
                🗑️ Apagar áreas marcadas
              </button>

              <button
                type="button"
                className="toggle-btn"
                onClick={() => abrirModalApagar("tudo")}
                style={{
                  ...estiloBotao,
                  borderColor: "rgba(255,90,90,.55)",
                  color: "#ff9a9a",
                }}
              >
                🗑️ Apagar todos os dados
              </button>

              <small className="muted">
                Antes de apagar, você decide se deseja ou não fazer um backup.
              </small>
            </div>
          </>
        ) : null}
      </section>

      {modalApagar?.tipo === "restaurar" ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setModalApagar(null);
            }
          }}
        >
          <div className="modal-card" style={estiloModalExcluir}>
            <h3 style={{ margin: 0 }}>⬆️ Restaurar backup</h3>

            <p className="muted small" style={{ margin: 0 }}>
              Backup criado em{" "}
              <strong>{formatarDataHora(modalApagar.backup?.criadoEm)}</strong>.
              Os dados das áreas presentes no arquivo substituirão os atuais.
            </p>

            <div style={estiloGradeBotoes}>
              <button
                type="button"
                className="toggle-btn"
                style={estiloBotao}
                onClick={() => setModalApagar(null)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="primary-btn"
                style={estiloBotao}
                onClick={confirmarRestauracao}
              >
                Sim, restaurar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalApagar?.tipo === "tudo" ||
      modalApagar?.tipo === "marcadas" ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmação para apagar dados"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setModalApagar(null);
            }
          }}
        >
          <div className="modal-card" style={estiloModalExcluir}>
            {modalApagar.etapa === "backup" ? (
              <>
                <h3 style={{ margin: 0 }}>🛡️ Fazer backup antes?</h3>

                <p className="muted small" style={{ margin: 0 }}>
                  {ultimoBackupEm
                    ? `Você já possui um backup feito em ${formatarDataHora(
                        ultimoBackupEm
                      )}. Pode continuar com ele ou fazer um novo.`
                    : "Você ainda não fez backup. Deseja baixar um arquivo antes de apagar?"}
                </p>

                <p className="muted small" style={{ margin: 0 }}>
                  Backup oferecido: {nomeDoPeriodo(filtroBackup)}.
                </p>

                <button
                  type="button"
                  className="primary-btn"
                  style={estiloBotao}
                  onClick={fazerBackupEContinuar}
                >
                  ⬇️ Fazer backup agora
                </button>

                <button
                  type="button"
                  className="toggle-btn"
                  style={estiloBotao}
                  onClick={continuarSemBackup}
                >
                  {ultimoBackupEm
                    ? "Continuar com backup existente"
                    : "Continuar sem fazer backup"}
                </button>

                <button
                  type="button"
                  className="toggle-btn"
                  style={estiloBotao}
                  onClick={() => setModalApagar(null)}
                >
                  Cancelar
                </button>
              </>
            ) : null}

            {modalApagar.etapa === "confirmar-um" ? (
              <>
                <h3 style={{ margin: 0 }}>⚠️ Confirmar exclusão</h3>

                <p className="muted small" style={{ margin: 0 }}>
                  {modalApagar.tipo === "tudo"
                    ? `Você apagará: ${nomeDoPeriodo(filtroApagar)}.`
                    : `Você apagará ${nomesAreasMarcadas}: ${nomeDoPeriodo(
                        filtroApagar
                      )}.`}
                </p>

                <div style={estiloGradeBotoes}>
                  <button
                    type="button"
                    className="toggle-btn"
                    style={estiloBotao}
                    onClick={() => setModalApagar(null)}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    className="primary-btn"
                    style={estiloBotao}
                    onClick={() =>
                      setModalApagar((modalAtual) => ({
                        ...modalAtual,
                        etapa: "confirmar-dois",
                      }))
                    }
                  >
                    Sim, continuar
                  </button>
                </div>
              </>
            ) : null}

            {modalApagar.etapa === "confirmar-dois" ? (
              <>
                <h3 style={{ margin: 0, color: "#ff9a9a" }}>
                  🗑️ Última confirmação
                </h3>

                <p className="muted small" style={{ margin: 0 }}>
                  Esta ação apagará os dados escolhidos. Sem um arquivo de
                  backup, não será possível recuperar depois.
                </p>

                <div style={estiloGradeBotoes}>
                  <button
                    type="button"
                    className="toggle-btn"
                    style={estiloBotao}
                    onClick={() => setModalApagar(null)}
                  >
                    Voltar
                  </button>

                  <button
                    type="button"
                    className="toggle-btn"
                    style={{
                      ...estiloBotao,
                      borderColor: "rgba(255,90,90,.55)",
                      color: "#ff9a9a",
                    }}
                    onClick={concluirExclusao}
                  >
                    🗑️ Sim, apagar agora
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {fotoAberta && profile.avatarBase64 ? (
        <div
          className="modal-overlay perfil-foto-modal-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setFotoAberta(false);
            }
          }}
        >
          <div className="modal-card perfil-foto-modal">
            <button
              type="button"
              className="perfil-foto-fechar"
              onClick={() => setFotoAberta(false)}
            >
              ×
            </button>

            <img
              src={profile.avatarBase64}
              alt="Foto do perfil ampliada"
              className="perfil-foto-ampliada"
            />

            <div className="perfil-modal-acoes">
              <button
                type="button"
                className="primary-btn"
                onClick={abrirSeletorDeFoto}
              >
                Trocar imagem
              </button>

              <button
                type="button"
                className="toggle-btn"
                onClick={removerFoto}
              >
                Remover foto
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
 