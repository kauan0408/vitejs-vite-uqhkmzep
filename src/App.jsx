// src/App.jsx

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import "./styles/global.css";
import "./styles/bottom-nav.css";

import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { auth, db, loginComGoogle, logout } from "./firebase.js";

import FinancasPage from "./pages/Financas/FinancasPage.jsx";
import TransacoesPage from "./pages/Transacoes/TransacoesPage.jsx";
import CartoesPage from "./pages/Cartoes/CartoesPage.jsx";
import HistoricoPage from "./pages/Historico/HistoricoPage.jsx";
import PerfilPage from "./pages/Perfil/PerfilPage.jsx";
import ReservaPage from "./pages/Reservas/ReservaPage.jsx";
import BackupPage from "./pages/Backup/BackupPage.jsx";
import DashboardPage from "./pages/Dashboard/DashboardPage.jsx";
import ConfiguracoesPage from "./pages/Configuracoes/ConfiguracoesPage.jsx";
import SobrePage from "./pages/Sobre/SobrePage.jsx";
import QuemMeDevePage from "./pages/QuemMeDeve/QuemMeDevePage.jsx";
import EstudosPage from "./pages/EstudosPage/EstudosPage.jsx";
import ListaPage from "./pages/ListaPage/ListaPage.jsx";
import LembretesPage from "./pages/LembretesPage/LembretesPage.jsx";
import ReceitasPage from "./pages/ReceitasPage/ReceitasPage.jsx";

/* =====================================================
   CONTEXTO DE FINANÇAS
===================================================== */

const FinanceContext = createContext(null);

export function useFinance() {
  const contexto = useContext(FinanceContext);

  if (!contexto) {
    throw new Error(
      "useFinance deve ser usado dentro do FinanceContext.Provider"
    );
  }

  return contexto;
}

/* =====================================================
   VALORES INICIAIS
===================================================== */

const perfilInicial = {
  nome: "",
  rendaMensal: "",
  limiteGastoMensal: "",
  metaReservaMensal: "",
  reservaAcumulada: "",
  diaPagamento: "",
  avatarBase64: "",
};

const reservaInicial = {
  metaMensal: 0,
  locais: [],
  movimentos: [],
};

const quemMeDeveInicial = {
  pessoas: [],
  lancamentos: [],
  grupos: [],
};

const CHAVES_LOCAIS = {
  profile: "financas_profile",
  transacoes: "financas_transacoes",
  cartoes: "financas_cartoes",
  reserva: "financas_reserva",
  quemMeDeve: "financas_quem_me_deve",
  estudos: "financas_estudos",
  lista: "financas_lista",
  lembretes: "financas_lembretes",
  receitas: "financas_receitas",
};

/* =====================================================
   LOCALSTORAGE
===================================================== */

function carregarDados(chave, valorPadrao) {
  if (typeof window === "undefined") return valorPadrao;

  try {
    const dadosSalvos = window.localStorage.getItem(chave);

    if (!dadosSalvos) {
      return valorPadrao;
    }

    return JSON.parse(dadosSalvos);
  } catch (erro) {
    console.error(`Erro ao carregar ${chave}:`, erro);
    return valorPadrao;
  }
}

function salvarDados(chave, valor) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch (erro) {
    console.error(`Erro ao salvar ${chave}:`, erro);
  }
}

function gerarId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizarDados(dados = {}) {
  return {
    profile: {
      ...perfilInicial,
      ...(dados.profile && typeof dados.profile === "object"
        ? dados.profile
        : {}),
    },
    transacoes: Array.isArray(dados.transacoes) ? dados.transacoes : [],
    cartoes: Array.isArray(dados.cartoes) ? dados.cartoes : [],
    reserva: {
      ...reservaInicial,
      ...(dados.reserva && typeof dados.reserva === "object"
        ? dados.reserva
        : {}),
      locais: Array.isArray(dados.reserva?.locais) ? dados.reserva.locais : [],
      movimentos: Array.isArray(dados.reserva?.movimentos)
        ? dados.reserva.movimentos
        : [],
    },
    quemMeDeve: {
      ...quemMeDeveInicial,
      ...(dados.quemMeDeve && typeof dados.quemMeDeve === "object"
        ? dados.quemMeDeve
        : {}),
      pessoas: Array.isArray(dados.quemMeDeve?.pessoas)
        ? dados.quemMeDeve.pessoas
        : [],
      lancamentos: Array.isArray(dados.quemMeDeve?.lancamentos)
        ? dados.quemMeDeve.lancamentos
        : [],
      grupos: Array.isArray(dados.quemMeDeve?.grupos)
        ? dados.quemMeDeve.grupos
        : [],
    },
    estudos: Array.isArray(dados.estudos) ? dados.estudos : [],
    lista: Array.isArray(dados.lista) ? dados.lista : [],
    lembretes: Array.isArray(dados.lembretes) ? dados.lembretes : [],
    receitas: Array.isArray(dados.receitas) ? dados.receitas : [],
  };
}

function juntarPorId(listaNuvem = [], listaLocal = []) {
  const mapa = new Map();

  [...listaNuvem, ...listaLocal].forEach((item) => {
    if (!item || typeof item !== "object") return;
    const id = item.id || gerarId();
    mapa.set(id, { ...item, id });
  });

  return [...mapa.values()];
}

// Executado somente na primeira entrada desta conta neste aparelho. Assim os
// dados que já estavam no localStorage não somem ao ativar a versão online.
function juntarPrimeiraSincronizacao(nuvem, local) {
  const dadosNuvem = normalizarDados(nuvem);
  const dadosLocais = normalizarDados(local);

  return {
    profile: {
      ...dadosNuvem.profile,
      ...Object.fromEntries(
        Object.entries(dadosLocais.profile).filter(
          ([, valor]) => valor !== "" && valor !== null && valor !== undefined
        )
      ),
    },
    transacoes: juntarPorId(dadosNuvem.transacoes, dadosLocais.transacoes),
    cartoes: juntarPorId(dadosNuvem.cartoes, dadosLocais.cartoes),
    reserva:
      Number(dadosLocais.reserva.metaMensal || 0) !== 0 ||
      dadosLocais.reserva.locais.length ||
      dadosLocais.reserva.movimentos.length
        ? dadosLocais.reserva
        : dadosNuvem.reserva,
    quemMeDeve: {
      pessoas: juntarPorId(
        dadosNuvem.quemMeDeve.pessoas,
        dadosLocais.quemMeDeve.pessoas
      ),
      lancamentos: juntarPorId(
        dadosNuvem.quemMeDeve.lancamentos,
        dadosLocais.quemMeDeve.lancamentos
      ),
      grupos: juntarPorId(
        dadosNuvem.quemMeDeve.grupos,
        dadosLocais.quemMeDeve.grupos
      ),
    },
    estudos: juntarPorId(dadosNuvem.estudos, dadosLocais.estudos),
    lista: juntarPorId(dadosNuvem.lista, dadosLocais.lista),
    lembretes: juntarPorId(dadosNuvem.lembretes, dadosLocais.lembretes),
    receitas: juntarPorId(dadosNuvem.receitas, dadosLocais.receitas),
  };
}

function assinaturaDados(dados) {
  return JSON.stringify(normalizarDados(dados));
}

/* =====================================================
   COMPONENTE PRINCIPAL
===================================================== */

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [statusNuvem, setStatusNuvem] = useState("conectando");
  const [erroLogin, setErroLogin] = useState("");
  const [estaOnline, setEstaOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  const [profile, setProfile] = useState(() =>
    carregarDados(CHAVES_LOCAIS.profile, perfilInicial)
  );

  const [transacoes, setTransacoes] = useState(() =>
    carregarDados(CHAVES_LOCAIS.transacoes, [])
  );

  const [cartoes, setCartoes] = useState(() =>
    carregarDados(CHAVES_LOCAIS.cartoes, [])
  );

  const [reserva, setReserva] = useState(() =>
    carregarDados(CHAVES_LOCAIS.reserva, reservaInicial)
  );

  const [quemMeDeve, setQuemMeDeve] = useState(() =>
    carregarDados(CHAVES_LOCAIS.quemMeDeve, quemMeDeveInicial)
  );

  const [estudos, setEstudos] = useState(() =>
    carregarDados(CHAVES_LOCAIS.estudos, [])
  );

  const [lista, setLista] = useState(() =>
    carregarDados(CHAVES_LOCAIS.lista, [])
  );

  const [lembretes, setLembretes] = useState(() =>
    carregarDados(CHAVES_LOCAIS.lembretes, [])
  );

  const [receitas, setReceitas] = useState(() =>
    carregarDados(CHAVES_LOCAIS.receitas, [])
  );

  const estadoAtualRef = useRef(null);
  const ultimaAssinaturaNuvemRef = useRef("");
  const timerNuvemRef = useRef(null);

  const [abaAtiva, setAbaAtiva] = useState("financas");
  const [menuMaisAberto, setMenuMaisAberto] = useState(false);

  const itensMenuMais = useMemo(
    () => [
      { key: "financas", label: "💰 Finanças" },
      { key: "estudos", label: "📚 Estudos" },
      { key: "lista", label: "🛒 Lista" },
      { key: "lembretes", label: "⏰ Lembretes" },
      { key: "receitas", label: "🍳 Receitas" },
    ],
    []
  );

  const mostrarMenuInferior = [
    "financas",
    "reserva",
    "transacoes",
    "cartoes",
    "historico",
    "quem-me-deve",
    "perfil",
  ].includes(abaAtiva);

  function abrirAbaPeloMenuMais(key) {
    setAbaAtiva(key);
    setMenuMaisAberto(false);
  }

  function irParaAba(key) {
    setAbaAtiva(String(key || "financas"));
    setMenuMaisAberto(false);
  }

  // Aviso rápido no canto superior com data e hora.
  const [notificacaoFlash, setNotificacaoFlash] = useState(null);
  const notificacaoTimerRef = useRef(null);

  function notificar(texto, tipo = "info") {
    if (!texto) return;

    if (notificacaoTimerRef.current) {
      clearTimeout(notificacaoTimerRef.current);
    }

    setNotificacaoFlash({
      id: gerarId(),
      texto: String(texto),
      tipo,
      dataHora: new Date().toISOString(),
    });

    notificacaoTimerRef.current = setTimeout(() => {
      setNotificacaoFlash(null);
      notificacaoTimerRef.current = null;
    }, 3000);
  }

  useEffect(() => {
    return () => {
      if (notificacaoTimerRef.current) clearTimeout(notificacaoTimerRef.current);
      if (timerNuvemRef.current) clearTimeout(timerNuvemRef.current);
    };
  }, []);

  const hoje = new Date();

  const [mesReferencia, setMesReferencia] = useState({
    mes: hoje.getMonth(),
    ano: hoje.getFullYear(),
  });

  /* =====================================================
     SALVAMENTO AUTOMÁTICO OFFLINE
  ===================================================== */

  useEffect(() => {
    salvarDados(CHAVES_LOCAIS.profile, profile);
  }, [profile]);

  useEffect(() => {
    salvarDados(CHAVES_LOCAIS.transacoes, transacoes);
  }, [transacoes]);

  useEffect(() => {
    salvarDados(CHAVES_LOCAIS.cartoes, cartoes);
  }, [cartoes]);

  useEffect(() => {
    salvarDados(CHAVES_LOCAIS.reserva, reserva);
  }, [reserva]);

  useEffect(() => {
    salvarDados(CHAVES_LOCAIS.quemMeDeve, quemMeDeve);
  }, [quemMeDeve]);

  useEffect(() => {
    salvarDados(CHAVES_LOCAIS.estudos, estudos);
  }, [estudos]);

  useEffect(() => {
    salvarDados(CHAVES_LOCAIS.lista, lista);
  }, [lista]);

  useEffect(() => {
    salvarDados(CHAVES_LOCAIS.lembretes, lembretes);
  }, [lembretes]);

  useEffect(() => {
    salvarDados(CHAVES_LOCAIS.receitas, receitas);
  }, [receitas]);

  useEffect(() => {
    estadoAtualRef.current = normalizarDados({
      profile,
      transacoes,
      cartoes,
      reserva,
      quemMeDeve,
      estudos,
      lista,
      lembretes,
      receitas,
    });
  }, [
    profile,
    transacoes,
    cartoes,
    reserva,
    quemMeDeve,
    estudos,
    lista,
    lembretes,
    receitas,
  ]);

  /* =====================================================
     LOGIN + SINCRONIZAÇÃO FIREBASE
  ===================================================== */

  useEffect(() => {
    const atualizarConexao = () => {
      const online = navigator.onLine;
      setEstaOnline(online);
      setStatusNuvem(online ? "sincronizando" : "offline");
    };

    window.addEventListener("online", atualizarConexao);
    window.addEventListener("offline", atualizarConexao);
    return () => {
      window.removeEventListener("online", atualizarConexao);
      window.removeEventListener("offline", atualizarConexao);
    };
  }, []);

  useEffect(() => {
    const cancelar = onAuthStateChanged(auth, (usuarioFirebase) => {
      setUser(usuarioFirebase || null);
      setDadosCarregados(false);
      setAuthLoading(false);
      setStatusNuvem(usuarioFirebase ? "carregando" : "desconectado");
    });

    return cancelar;
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    let ativo = true;
    let cancelarSnapshot = null;
    const referencia = doc(db, "users", user.uid);
    const chaveMigracao = `financas_migrado_v2_${user.uid}`;

    function aplicarDados(dados) {
      const normalizados = normalizarDados(dados);
      ultimaAssinaturaNuvemRef.current = assinaturaDados(normalizados);

      setProfile(normalizados.profile);
      setTransacoes(normalizados.transacoes);
      setCartoes(normalizados.cartoes);
      setReserva(normalizados.reserva);
      setQuemMeDeve(normalizados.quemMeDeve);
      setEstudos(normalizados.estudos);
      setLista(normalizados.lista);
      setLembretes(normalizados.lembretes);
      setReceitas(normalizados.receitas);
    }

    function observarNuvem() {
      if (cancelarSnapshot) return;

      cancelarSnapshot = onSnapshot(
        referencia,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!snapshot.exists()) return;

          const recebidos = normalizarDados(snapshot.data());
          const assinaturaRecebida = assinaturaDados(recebidos);
          const assinaturaAtual = assinaturaDados(
            estadoAtualRef.current || recebidos
          );

          ultimaAssinaturaNuvemRef.current = assinaturaRecebida;
          if (assinaturaRecebida !== assinaturaAtual) {
            aplicarDados(recebidos);
          }

          if (snapshot.metadata.hasPendingWrites) {
            setStatusNuvem("salvando");
          } else if (snapshot.metadata.fromCache || !navigator.onLine) {
            setStatusNuvem("offline");
          } else {
            setStatusNuvem("sincronizado");
          }
        },
        (erro) => {
          console.error("Erro ao acompanhar dados online:", erro);
          setStatusNuvem(navigator.onLine ? "erro" : "offline");
        }
      );
    }

    async function iniciarSincronizacao() {
      const estadoLocal = normalizarDados(
        estadoAtualRef.current || {
          profile,
          transacoes,
          cartoes,
          reserva,
          quemMeDeve,
          estudos,
          lista,
          lembretes,
          receitas,
        }
      );

      // Aproveita também as chaves usadas pelo seu App.jsx online anterior.
      const dadosLocais = normalizarDados({
        ...estadoLocal,
        estudos: estadoLocal.estudos.length
          ? estadoLocal.estudos
          : carregarDados(`estudos_${user.uid}`, []),
        lista: estadoLocal.lista.length
          ? estadoLocal.lista
          : carregarDados(`lista_${user.uid}`, []),
        lembretes: estadoLocal.lembretes.length
          ? estadoLocal.lembretes
          : carregarDados(`lembretes_${user.uid}`, []),
        receitas: estadoLocal.receitas.length
          ? estadoLocal.receitas
          : carregarDados(`receitas_${user.uid}`, []),
      });

      try {
        setStatusNuvem("carregando");
        const documento = await getDoc(referencia);
        if (!ativo) return;

        const jaMigrou = carregarDados(chaveMigracao, false) === true;
        let dadosEscolhidos;

        if (documento.exists()) {
          const dadosNuvem = normalizarDados(documento.data());
          dadosEscolhidos = jaMigrou
            ? dadosNuvem
            : juntarPrimeiraSincronizacao(dadosNuvem, dadosLocais);
        } else {
          dadosEscolhidos = dadosLocais;
        }

        aplicarDados(dadosEscolhidos);

        if (!documento.exists() || !jaMigrou) {
          await setDoc(
            referencia,
            {
              ...dadosEscolhidos,
              atualizadoEm: serverTimestamp(),
            },
            { merge: true }
          );
        }

        salvarDados(chaveMigracao, true);
        if (!ativo) return;

        observarNuvem();

        setDadosCarregados(true);
        setStatusNuvem(navigator.onLine ? "sincronizado" : "offline");
      } catch (erro) {
        console.error("Não foi possível carregar o Firestore:", erro);

        // O app continua usando os dados do aparelho. A persistência do
        // Firestore e o efeito de salvamento tentam novamente quando voltar.
        aplicarDados(dadosLocais);
        ultimaAssinaturaNuvemRef.current = "";
        if (ativo) {
          setDadosCarregados(true);
          setStatusNuvem(navigator.onLine ? "erro" : "offline");
          observarNuvem();
        }
      }
    }

    iniciarSincronizacao();

    return () => {
      ativo = false;
      if (cancelarSnapshot) cancelarSnapshot();
    };
    // Os dados entram por estadoAtualRef. Este efeito reinicia apenas ao trocar
    // de conta, evitando sobrescrever edições locais durante o carregamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user || !dadosCarregados) return undefined;

    const payload = normalizarDados({
      profile,
      transacoes,
      cartoes,
      reserva,
      quemMeDeve,
      estudos,
      lista,
      lembretes,
      receitas,
    });
    const assinatura = assinaturaDados(payload);

    if (assinatura === ultimaAssinaturaNuvemRef.current) return undefined;

    setStatusNuvem(estaOnline ? "salvando" : "offline");
    if (timerNuvemRef.current) clearTimeout(timerNuvemRef.current);

    timerNuvemRef.current = setTimeout(async () => {
      try {
        await setDoc(
          doc(db, "users", user.uid),
          { ...payload, atualizadoEm: serverTimestamp() },
          { merge: true }
        );
        ultimaAssinaturaNuvemRef.current = assinatura;
        setStatusNuvem(navigator.onLine ? "sincronizado" : "offline");
      } catch (erro) {
        console.error("Erro ao salvar dados no Firestore:", erro);
        setStatusNuvem(navigator.onLine ? "erro" : "offline");
      }
    }, 650);

    return () => {
      if (timerNuvemRef.current) clearTimeout(timerNuvemRef.current);
    };
  }, [
    user,
    dadosCarregados,
    estaOnline,
    profile,
    transacoes,
    cartoes,
    reserva,
    quemMeDeve,
    estudos,
    lista,
    lembretes,
    receitas,
  ]);

  /* =====================================================
     PERFIL
  ===================================================== */

  function atualizarProfile(novosDados) {
    setProfile((perfilAtual) => ({
      ...perfilAtual,
      ...novosDados,
    }));
  }

  /* =====================================================
     TRANSAÇÕES
  ===================================================== */

  function adicionarTransacao(dados) {
    const novaTransacao = {
      ...dados,
      id: gerarId(),
      dataHora: dados.dataHora || new Date().toISOString(),
    };

    setTransacoes((listaAtual) => [novaTransacao, ...listaAtual]);
    notificar(`${novaTransacao.descricao || "Transação"} salva.`, "sucesso");
    return novaTransacao;
  }

  function atualizarTransacao(id, dadosAtualizados) {
    const original = transacoes.find((transacao) => transacao.id === id);

    setTransacoes((listaAtual) =>
      listaAtual.map((transacao) =>
        transacao.id === id
          ? { ...transacao, ...dadosAtualizados }
          : transacao
      )
    );

    // Grupo de dívida com várias pessoas: atualiza todos os espelhos detalhados.
    if (original?.quemMeDeveGrupoId) {
      setQuemMeDeve((atual) => ({
        ...atual,
        lancamentos: (atual.lancamentos || []).map((lancamento) => {
          if (lancamento.grupoId !== original.quemMeDeveGrupoId) return lancamento;

          const atualizado = {
            ...lancamento,
            descricao: dadosAtualizados.descricao ?? lancamento.descricao,
            formaPagamento:
              dadosAtualizados.formaPagamento ?? lancamento.formaPagamento,
            cartaoId:
              dadosAtualizados.cartaoId !== undefined
                ? dadosAtualizados.cartaoId
                : lancamento.cartaoId,
            categoria:
              dadosAtualizados.categoria ?? lancamento.categoria,
            dataHora: dadosAtualizados.dataHora ?? lancamento.dataHora,
          };

          if (lancamento.tipo === "divida" && dadosAtualizados.valor != null) {
            const novoTotal = Number(dadosAtualizados.valor || 0);
            const pct = Number(lancamento.porcentagem || 0);
            atualizado.valorTotal = novoTotal;
            atualizado.valor = Number(((novoTotal * pct) / 100).toFixed(2));
          }

          return atualizado;
        }),
      }));

      notificar("Despesa compartilhada atualizada.", "sucesso");
      return;
    }

    // Movimento individual de acerto/ressarcimento.
    const lancamentoId = original?.quemMeDeveLancamentoId;
    if (lancamentoId) {
      setQuemMeDeve((atual) => ({
        ...atual,
        lancamentos: (atual.lancamentos || []).map((lancamento) => {
          if (lancamento.id !== lancamentoId) return lancamento;
          return {
            ...lancamento,
            descricao: dadosAtualizados.descricao ?? lancamento.descricao,
            formaPagamento:
              dadosAtualizados.formaPagamento ?? lancamento.formaPagamento,
            cartaoId:
              dadosAtualizados.cartaoId !== undefined
                ? dadosAtualizados.cartaoId
                : lancamento.cartaoId,
            categoria:
              dadosAtualizados.categoria ?? lancamento.categoria,
            dataHora: dadosAtualizados.dataHora ?? lancamento.dataHora,
            valor: dadosAtualizados.valor != null
              ? Number(dadosAtualizados.valor || 0)
              : lancamento.valor,
          };
        }),
      }));
    }

    notificar("Transação atualizada.", "sucesso");
  }

  function removerTransacao(id) {
    const original = transacoes.find((transacao) => transacao.id === id);

    setTransacoes((listaAtual) =>
      listaAtual.filter((transacao) => transacao.id !== id)
    );

    if (original?.quemMeDeveGrupoId) {
      setQuemMeDeve((atual) => ({
        ...atual,
        lancamentos: (atual.lancamentos || []).filter(
          (lancamento) => lancamento.grupoId !== original.quemMeDeveGrupoId
        ),
      }));
    } else if (original?.quemMeDeveLancamentoId) {
      setQuemMeDeve((atual) => ({
        ...atual,
        lancamentos: (atual.lancamentos || []).filter(
          (lancamento) => lancamento.id !== original.quemMeDeveLancamentoId
        ),
      }));
    }

    notificar("Registro apagado.", "aviso");
  }

  /* =====================================================
     CARTÕES
  ===================================================== */

  function adicionarCartao(dados) {
    const novoCartao = {
      id: gerarId(),
      nome: dados.nome,
      limite: Number(dados.limite || 0),
      diaFechamento: Number(dados.diaFechamento || 1),
    };

    setCartoes((listaAtual) => [
      ...listaAtual,
      novoCartao,
    ]);
  }

  function atualizarCartoes(novaLista) {
    setCartoes(novaLista);
  }

  /* =====================================================
     RESERVA
  ===================================================== */

  function atualizarReserva(novosDados) {
    setReserva((reservaAtual) => ({
      ...reservaAtual,
      ...novosDados,
    }));
  }

  /* =====================================================
     QUEM ME DEVE
  ===================================================== */

  function adicionarPessoa(dados) {
    const nomeLimpo = String(
      typeof dados === "string" ? dados : dados?.nome || ""
    ).trim();

    if (!nomeLimpo) return null;

    const existente = (quemMeDeve.pessoas || []).find(
      (pessoa) =>
        String(pessoa.nome || "").trim().toLowerCase() ===
        nomeLimpo.toLowerCase()
    );

    if (existente) return existente;

    const pessoa = {
      id: gerarId(),
      nome: nomeLimpo,
      fotoBase64: dados?.fotoBase64 || "",
      corCarta: dados?.corCarta || "#3b82f6",
      criadoEm: new Date().toISOString(),
    };

    setQuemMeDeve((atual) => ({
      ...atual,
      pessoas: [...(atual.pessoas || []), pessoa],
    }));

    notificar(`${nomeLimpo} adicionado(a).`, "sucesso");
    return pessoa;
  }

  function atualizarPessoa(id, patch) {
    setQuemMeDeve((atual) => ({
      ...atual,
      pessoas: (atual.pessoas || []).map((pessoa) =>
        pessoa.id === id ? { ...pessoa, ...patch } : pessoa
      ),
    }));
    notificar("Pessoa atualizada.", "sucesso");
  }

  function removerPessoaQuemMeDeve(id) {
    const lancamentosPessoa = (quemMeDeve.lancamentos || []).filter(
      (lancamento) => lancamento.pessoaId === id
    );
    const gruposAfetados = new Set(
      lancamentosPessoa.map((l) => l.grupoId).filter(Boolean)
    );
    const idsLancamentosIndividuais = new Set(
      lancamentosPessoa.filter((l) => !l.grupoId).map((l) => l.id)
    );

    const restantes = (quemMeDeve.lancamentos || []).filter(
      (lancamento) => lancamento.pessoaId !== id
    );

    const gruposQueFicaramVazios = new Set(
      [...gruposAfetados].filter(
        (grupoId) => !restantes.some((l) => l.grupoId === grupoId)
      )
    );

    setQuemMeDeve((atual) => ({
      ...atual,
      pessoas: (atual.pessoas || []).filter((pessoa) => pessoa.id !== id),
      lancamentos: (atual.lancamentos || []).filter(
        (lancamento) => lancamento.pessoaId !== id
      ),
      grupos: (atual.grupos || [])
        .map((grupo) => ({
          ...grupo,
          pessoaIds: (grupo.pessoaIds || []).filter(
            (pessoaId) => pessoaId !== id
          ),
        }))
        .filter((grupo) => grupo.pessoaIds.length > 0),
    }));

    setTransacoes((lista) =>
      lista.filter((transacao) => {
        if (
          transacao.quemMeDeveGrupoId &&
          gruposQueFicaramVazios.has(transacao.quemMeDeveGrupoId)
        ) {
          return false;
        }
        if (
          transacao.quemMeDeveLancamentoId &&
          idsLancamentosIndividuais.has(transacao.quemMeDeveLancamentoId)
        ) {
          return false;
        }
        return true;
      })
    );

    notificar("Pessoa removida.", "aviso");
  }

  function adicionarGrupoQuemMeDeve(dados) {
    const nome = String(dados?.nome || "").trim();
    const pessoaIds = [...new Set(dados?.pessoaIds || [])].filter(
      (id) =>
        id === "__eu__" ||
        (quemMeDeve.pessoas || []).some((pessoa) => pessoa.id === id)
    );

    if (!nome || !pessoaIds.length) return null;

    const grupo = {
      id: gerarId(),
      nome,
      pessoaIds,
      criadoEm: new Date().toISOString(),
    };

    setQuemMeDeve((atual) => ({
      ...atual,
      grupos: [...(atual.grupos || []), grupo],
    }));
    notificar(`Grupo ${nome} criado.`, "sucesso");
    return grupo;
  }

  function removerGrupoQuemMeDeve(id) {
    setQuemMeDeve((atual) => ({
      ...atual,
      grupos: (atual.grupos || []).filter((grupo) => grupo.id !== id),
    }));
    notificar("Grupo removido.", "aviso");
  }

  function adicionarDivida(dados) {
    const partesRecebidas = Array.isArray(dados?.pessoas)
      ? dados.pessoas
      : dados?.pessoaId
        ? [{
            pessoaId: dados.pessoaId,
            porcentagem: Number(dados.porcentagem || 100),
            valor: Number(dados.valor || dados.valorTotal || 0),
          }]
        : [];

    const partes = partesRecebidas.filter((p) => p?.pessoaId);
    if (!partes.length) return null;

    const integrarFinanceiro = dados?.integrarFinanceiro !== false;
    const grupoId = gerarId();
    const idTransacao = integrarFinanceiro ? gerarId() : "";
    const agora = dados.dataHora || new Date().toISOString();
    const total = Number(dados.valorTotal || 0);
    const sentido = dados.sentido === "eu_devo" ? "eu_devo" : "me_deve";
    const categoria = dados.categoria || "Burrice";
    const formaPagamento = dados.formaPagamento || "outros";
    const cartaoId =
      formaPagamento === "credito" ? dados.cartaoId || null : null;

    const somaPercentuaisPartes = partes.reduce(
      (s, parte) => s + Number(parte?.porcentagem || 0),
      0
    );

    const minhaPartePercentual = Number(
      (
        dados.minhaPartePercentual != null
          ? Number(dados.minhaPartePercentual || 0)
          : Math.max(0, 100 - somaPercentuaisPartes)
      ).toFixed(2)
    );

    const minhaParteValor = Number(
      (
        dados.minhaParteValor != null
          ? Number(dados.minhaParteValor || 0)
          : total > 0
            ? (total * minhaPartePercentual) / 100
            : 0
      ).toFixed(2)
    );

    const lancamentosNovos = partes.map((parte) => {
      const pct = Number(parte.porcentagem || 0);
      const valorParte = Number(
        parte.valor != null
          ? parte.valor
          : ((total * pct) / 100).toFixed(2)
      );

      return {
        id: gerarId(),
        grupoId,
        transacaoId: idTransacao,
        tipo: "divida",
        sentido,
        pessoaId: parte.pessoaId,
        descricao: dados.descricao || "Despesa dividida",
        deOnde: dados.deOnde || "",
        formaPagamento,
        cartaoId,
        categoria,
        integrarFinanceiro,
        valorTotal: total || valorParte,
        porcentagem: pct || 100,
        valor: valorParte,
        minhaParteValor,
        minhaPartePercentual,
        jurosTaxa: Number(dados.jurosTaxa || 0),
        jurosUnidade: dados.jurosUnidade || "mes",
        observacao: dados.observacao || "",
        dataHora: agora,
        origemImportacao: dados.origemImportacao || "manual",
      };
    });

    setQuemMeDeve((atual) => ({
      ...atual,
      lancamentos: [...lancamentosNovos, ...(atual.lancamentos || [])],
    }));

    if (integrarFinanceiro) {
      // "Eles me devem": o dinheiro já saiu, então registra a compra inteira
      // como despesa. "Eu devo": cria apenas um registro neutro no Histórico;
      // o dinheiro só sai quando o pagamento for registrado.
      setTransacoes((lista) => [
        {
          id: idTransacao,
          tipo: sentido === "me_deve" ? "despesa" : "nulo",
          valor:
            total ||
            lancamentosNovos.reduce(
              (s, l) => s + Number(l.valor || 0),
              0
            ),
          categoria,
          descricao: dados.descricao || "Despesa dividida",
          formaPagamento,
          cartaoId,
          dataHora: agora,
          origemMovimento: "quem_me_deve",
          origemAcertos: true,
          quemMeDeveGrupoId: grupoId,
          pessoaIds: lancamentosNovos.map((l) => l.pessoaId),
          minhaParteValor,
          minhaPartePercentual,
          naoContabilizar: sentido === "eu_devo",
        },
        ...lista,
      ]);
    }

    notificar(
      integrarFinanceiro
        ? `${dados.descricao || "Dívida"} salva em Acertos e vinculada ao Histórico/Finanças.`
        : `${dados.descricao || "Dívida"} salva somente em Acertos.`,
      "sucesso"
    );

    return {
      grupoId,
      lancamentos: lancamentosNovos,
      integrado: integrarFinanceiro,
    };
  }

  function registrarPagamento(dados) {
    if (!dados?.pessoaId) return null;

    const integrarFinanceiro = dados?.integrarFinanceiro !== false;
    const idLancamento = gerarId();
    const idTransacao = integrarFinanceiro ? gerarId() : "";
    const agora = dados.dataHora || new Date().toISOString();
    const sentido = dados.sentido === "eu_devo" ? "eu_devo" : "me_deve";
    const formaPagamento = dados.formaPagamento || "outros";
    const cartaoId =
      formaPagamento === "credito" ? dados.cartaoId || null : null;
    const categoria = dados.categoria || "Burrice";

    const lancamento = {
      ...dados,
      id: idLancamento,
      tipo: "ressarcimento",
      sentido,
      categoria,
      formaPagamento,
      cartaoId,
      integrarFinanceiro,
      dataHora: agora,
      transacaoId: idTransacao,
    };

    setQuemMeDeve((atual) => ({
      ...atual,
      lancamentos: [lancamento, ...(atual.lancamentos || [])],
    }));

    if (integrarFinanceiro) {
      // Eu pagando alguém = saída real.
      // Pessoa me pagando = entrada real de caixa, mas classificada como
      // reembolso para não inflar "Receitas do mês".
      const tipoHistorico =
        sentido === "eu_devo" ? "despesa" : "reembolso";

      setTransacoes((lista) => [
        {
          id: idTransacao,
          tipo: tipoHistorico,
          valor: Number(dados.valor || 0),
          categoria,
          descricao:
            dados.descricao ||
            (sentido === "eu_devo"
              ? "Pagamento de dívida"
              : "Ressarcimento"),
          formaPagamento,
          cartaoId,
          dataHora: agora,
          origemMovimento: "quem_me_deve",
          origemAcertos: true,
          quemMeDeveLancamentoId: idLancamento,
          pessoaId: dados.pessoaId,
          naoContabilizarReceita: sentido === "me_deve",
          movimentaSaldo: true,
        },
        ...lista,
      ]);
    }

    notificar(
      integrarFinanceiro
        ? sentido === "eu_devo"
          ? "Pagamento registrado em Acertos e descontado nas Finanças."
          : "Ressarcimento registrado: entra no saldo, mas não vira receita normal."
        : "Acerto registrado somente em Acertos.",
      "sucesso"
    );

    return lancamento;
  }

  function atualizarLancamentoQuemMeDeve(id, patch) {
    const original = (quemMeDeve.lancamentos || []).find(
      (lancamento) => lancamento.id === id
    );

    if (!original) return;

    let atualizado = {
      ...original,
      ...patch,
      dataHora: patch.dataHora || original.dataHora,
    };

    if (original.tipo === "divida" && original.grupoId) {
      const novoTotal =
        patch.valorTotal != null
          ? Number(patch.valorTotal || 0)
          : Number(original.valorTotal || 0);

      setQuemMeDeve((atual) => ({
        ...atual,
        lancamentos: (atual.lancamentos || []).map((lancamento) => {
          if (lancamento.grupoId !== original.grupoId) return lancamento;

          const base = {
            ...lancamento,
            descricao: patch.descricao ?? lancamento.descricao,
            deOnde: patch.deOnde ?? lancamento.deOnde,
            formaPagamento:
              patch.formaPagamento ?? lancamento.formaPagamento,
            cartaoId:
              patch.cartaoId !== undefined
                ? patch.cartaoId
                : lancamento.cartaoId,
            categoria: patch.categoria ?? lancamento.categoria,
            dataHora: patch.dataHora ?? lancamento.dataHora,
            sentido: patch.sentido ?? lancamento.sentido,
            valorTotal: novoTotal || lancamento.valorTotal,
            minhaParteValor:
              patch.minhaParteValor ?? lancamento.minhaParteValor,
            minhaPartePercentual:
              patch.minhaPartePercentual ??
              lancamento.minhaPartePercentual,
          };

          if (lancamento.id === id) {
            atualizado = { ...base, ...patch, dataHora: patch.dataHora || base.dataHora };
            return atualizado;
          }

          if (patch.valorTotal != null) {
            base.valor = Number(
              ((novoTotal * Number(base.porcentagem || 0)) / 100).toFixed(2)
            );
          }

          return base;
        }),
      }));

      const sentido = atualizado.sentido === "eu_devo" ? "eu_devo" : "me_deve";
      setTransacoes((lista) =>
        lista.map((transacao) =>
          transacao.quemMeDeveGrupoId === original.grupoId
            ? {
                ...transacao,
                tipo: sentido === "me_deve" ? "despesa" : "nulo",
                valor: Number(atualizado.valorTotal || transacao.valor || 0),
                descricao: atualizado.descricao || transacao.descricao,
                formaPagamento:
                  atualizado.formaPagamento || transacao.formaPagamento,
                cartaoId:
                  atualizado.formaPagamento === "credito"
                    ? atualizado.cartaoId || null
                    : null,
                categoria:
                  atualizado.categoria || transacao.categoria,
                dataHora: atualizado.dataHora || transacao.dataHora,
                minhaParteValor:
                  atualizado.minhaParteValor ??
                  transacao.minhaParteValor,
                minhaPartePercentual:
                  atualizado.minhaPartePercentual ??
                  transacao.minhaPartePercentual,
                naoContabilizar: sentido === "eu_devo",
              }
            : transacao
        )
      );
    } else {
      setQuemMeDeve((atual) => ({
        ...atual,
        lancamentos: (atual.lancamentos || []).map((lancamento) =>
          lancamento.id === id ? atualizado : lancamento
        ),
      }));

      const sentido =
        atualizado.sentido === "eu_devo" ? "eu_devo" : "me_deve";
      const tipoHistorico =
        atualizado.tipo === "divida"
          ? sentido === "me_deve"
            ? "despesa"
            : "nulo"
          : sentido === "eu_devo"
            ? "despesa"
            : "reembolso";

      setTransacoes((lista) =>
        lista.map((transacao) =>
          transacao.quemMeDeveLancamentoId === id
            ? {
                ...transacao,
                tipo: tipoHistorico,
                valor: Number(atualizado.valor || 0),
                descricao: atualizado.descricao || transacao.descricao,
                formaPagamento:
                  atualizado.formaPagamento || transacao.formaPagamento,
                cartaoId:
                  atualizado.formaPagamento === "credito"
                    ? atualizado.cartaoId || null
                    : null,
                categoria:
                  atualizado.categoria || transacao.categoria,
                dataHora: atualizado.dataHora || transacao.dataHora,
                pessoaId: atualizado.pessoaId || transacao.pessoaId,
                naoContabilizar: tipoHistorico === "nulo",
                naoContabilizarReceita:
                  tipoHistorico === "reembolso",
              }
            : transacao
        )
      );
    }

    notificar("Lançamento atualizado.", "sucesso");
  }


  function transferirDividaQuemMeDeve({
    lancamentoId,
    pessoaDestinoId,
    valor,
    destinos,
  }) {
    const listaAtual = Array.isArray(quemMeDeve.lancamentos)
      ? quemMeDeve.lancamentos
      : [];

    const original = listaAtual.find(
      (lancamento) => lancamento.id === lancamentoId
    );

    if (!original || original.tipo !== "divida") {
      return false;
    }

    const valorOriginal = Number(original.valor || 0);
    if (!(valorOriginal > 0)) return false;

    const entradas = Array.isArray(destinos) && destinos.length
      ? destinos
      : pessoaDestinoId
        ? [{ pessoaId: pessoaDestinoId, valor }]
        : [];

    const mapaDestinos = new Map();

    entradas.forEach((entrada) => {
      const id = entrada?.pessoaId;
      const valorEntrada = Number(entrada?.valor || 0);
      if (!id || !(valorEntrada > 0)) return;
      mapaDestinos.set(
        id,
        Number(((mapaDestinos.get(id) || 0) + valorEntrada).toFixed(2))
      );
    });

    const destinosNormalizados = Array.from(mapaDestinos.entries()).map(
      ([pessoaIdNormalizada, valorNormalizado]) => ({
        pessoaId: pessoaIdNormalizada,
        valor: valorNormalizado,
      })
    );

    if (!destinosNormalizados.length) return false;

    if (
      destinosNormalizados.some(
        (item) => item.pessoaId === original.pessoaId
      )
    ) {
      return false;
    }

    const pessoasValidas = new Set(
      (quemMeDeve.pessoas || []).map((pessoa) => pessoa.id)
    );

    if (
      destinosNormalizados.some(
        (item) => !pessoasValidas.has(item.pessoaId)
      )
    ) {
      return false;
    }

    const valorTotalTransferir = Number(
      destinosNormalizados
        .reduce((soma, item) => soma + Number(item.valor || 0), 0)
        .toFixed(2)
    );

    if (
      !(valorTotalTransferir > 0) ||
      valorTotalTransferir > valorOriginal + 0.01
    ) {
      return false;
    }

    const transferenciaTotal =
      Math.abs(valorTotalTransferir - valorOriginal) <= 0.01;

    const pessoaOrigem = (quemMeDeve.pessoas || []).find(
      (pessoa) => pessoa.id === original.pessoaId
    );

    const grupoEfetivo =
      original.grupoId ||
      (destinosNormalizados.length > 1 || !transferenciaTotal
        ? gerarId()
        : "");

    const percentualOriginal = Number(original.porcentagem || 0);
    const valorTotalReferencia = Math.max(
      Number(original.valorTotal || valorOriginal),
      0.000001
    );

    // Caso simples antigo: uma pessoa recebe a dívida inteira.
    if (
      !grupoEfetivo &&
      destinosNormalizados.length === 1 &&
      transferenciaTotal
    ) {
      const destino = destinosNormalizados[0];

      const novosLancamentos = listaAtual.map((lancamento) =>
        lancamento.id === original.id
          ? {
              ...lancamento,
              pessoaId: destino.pessoaId,
              transferidoEm: new Date().toISOString(),
              transferenciaOrigemPessoaId: original.pessoaId,
            }
          : lancamento
      );

      setQuemMeDeve((atual) => ({
        ...atual,
        lancamentos: novosLancamentos,
      }));

      setTransacoes((lista) =>
        lista.map((transacao) =>
          transacao.quemMeDeveLancamentoId === original.id ||
          transacao.id === original.transacaoId
            ? {
                ...transacao,
                pessoaId: destino.pessoaId,
              }
            : transacao
        )
      );

      const pessoaDestino = (quemMeDeve.pessoas || []).find(
        (pessoa) => pessoa.id === destino.pessoaId
      );

      notificar(
        `Dívida transferida de ${pessoaOrigem?.nome || "Pessoa anterior"} para ${pessoaDestino?.nome || "Nova pessoa"}.`,
        "sucesso"
      );

      return true;
    }

    let novosLancamentos = listaAtual.filter(
      (lancamento) => lancamento.id !== original.id
    );

    const valorRestante = Number(
      Math.max(0, valorOriginal - valorTotalTransferir).toFixed(2)
    );

    const percentualTransferidoTotal = Number(
      destinosNormalizados
        .reduce((soma, item) => {
          const proporcao = Number(item.valor || 0) / Math.max(valorOriginal, 0.000001);
          const percentual =
            percentualOriginal > 0
              ? percentualOriginal * proporcao
              : (Number(item.valor || 0) / valorTotalReferencia) * 100;
          return soma + percentual;
        }, 0)
        .toFixed(2)
    );

    const percentualRestante = Number(
      Math.max(0, percentualOriginal - percentualTransferidoTotal).toFixed(2)
    );

    if (valorRestante > 0.009) {
      novosLancamentos.push({
        ...original,
        grupoId: grupoEfetivo,
        valor: valorRestante,
        porcentagem: percentualRestante,
      });
    }

    destinosNormalizados.forEach((destino) => {
      const proporcao =
        Number(destino.valor || 0) / Math.max(valorOriginal, 0.000001);

      const percentualDestino = Number(
        (
          percentualOriginal > 0
            ? percentualOriginal * proporcao
            : (Number(destino.valor || 0) / valorTotalReferencia) * 100
        ).toFixed(2)
      );

      const existenteIndex = novosLancamentos.findIndex(
        (lancamento) =>
          lancamento.tipo === "divida" &&
          lancamento.grupoId === grupoEfetivo &&
          lancamento.pessoaId === destino.pessoaId &&
          (lancamento.sentido || "me_deve") ===
            (original.sentido || "me_deve")
      );

      if (existenteIndex >= 0) {
        const existente = novosLancamentos[existenteIndex];
        novosLancamentos[existenteIndex] = {
          ...existente,
          valor: Number(
            (
              Number(existente.valor || 0) +
              Number(destino.valor || 0)
            ).toFixed(2)
          ),
          porcentagem: Number(
            (
              Number(existente.porcentagem || 0) +
              percentualDestino
            ).toFixed(2)
          ),
          transferidoEm: new Date().toISOString(),
          transferenciaOrigemPessoaId: original.pessoaId,
        };
      } else {
        novosLancamentos.push({
          ...original,
          id: gerarId(),
          grupoId: grupoEfetivo,
          pessoaId: destino.pessoaId,
          valor: Number(Number(destino.valor || 0).toFixed(2)),
          porcentagem: percentualDestino,
          transferidoEm: new Date().toISOString(),
          transferenciaOrigemPessoaId: original.pessoaId,
          criadoEm: new Date().toISOString(),
        });
      }
    });

    setQuemMeDeve((atual) => ({
      ...atual,
      lancamentos: novosLancamentos,
    }));

    const pessoaIdsDoGrupo = [
      ...new Set(
        novosLancamentos
          .filter(
            (lancamento) =>
              lancamento.grupoId === grupoEfetivo &&
              lancamento.tipo === "divida"
          )
          .map((lancamento) => lancamento.pessoaId)
          .filter(Boolean)
      ),
    ];

    setTransacoes((lista) =>
      lista.map((transacao) => {
        const pertenceAoGrupo =
          transacao.quemMeDeveGrupoId === grupoEfetivo;

        const eraLancamentoIndividualConvertido =
          !original.grupoId &&
          transacao.quemMeDeveLancamentoId === original.id;

        if (!pertenceAoGrupo && !eraLancamentoIndividualConvertido) {
          return transacao;
        }

        return {
          ...transacao,
          quemMeDeveGrupoId: grupoEfetivo,
          quemMeDeveLancamentoId: undefined,
          pessoaId: undefined,
          pessoaIds: pessoaIdsDoGrupo,
        };
      })
    );

    const valorFormatado = valorTotalTransferir.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    notificar(
      destinosNormalizados.length > 1
        ? `${valorFormatado} divididos entre ${destinosNormalizados.length} pessoas.`
        : `${valorFormatado} transferidos para outra pessoa.`,
      "sucesso"
    );

    return true;
  }

  function removerLancamentoQuemMeDeve(id) {
    const original = (quemMeDeve.lancamentos || []).find(
      (lancamento) => lancamento.id === id
    );
    if (!original) return;

    const outrosDoGrupo = original.grupoId
      ? (quemMeDeve.lancamentos || []).filter(
          (l) => l.grupoId === original.grupoId && l.id !== id
        )
      : [];

    setQuemMeDeve((atual) => ({
      ...atual,
      lancamentos: (atual.lancamentos || []).filter(
        (lancamento) => lancamento.id !== id
      ),
    }));

    setTransacoes((lista) =>
      lista.filter((transacao) => {
        if (original.grupoId) {
          if (outrosDoGrupo.length > 0) return true;
          return transacao.quemMeDeveGrupoId !== original.grupoId;
        }

        return (
          transacao.id !== original.transacaoId &&
          transacao.quemMeDeveLancamentoId !== id
        );
      })
    );

    notificar("Lançamento removido.", "aviso");
  }

  /* =====================================================
     MÊS DE REFERÊNCIA
  ===================================================== */

  function irParaMesAtual() {
    const dataAtual = new Date();

    setMesReferencia({
      mes: dataAtual.getMonth(),
      ano: dataAtual.getFullYear(),
    });
  }

  function mudarMesReferencia(delta) {
    setMesReferencia((referenciaAtual) => {
      let novoMes = referenciaAtual.mes + delta;
      let novoAno = referenciaAtual.ano;

      if (novoMes < 0) {
        novoMes = 11;
        novoAno -= 1;
      }

      if (novoMes > 11) {
        novoMes = 0;
        novoAno += 1;
      }

      return {
        mes: novoMes,
        ano: novoAno,
      };
    });
  }

  /* =====================================================
     LIMPAR TODOS OS DADOS
  ===================================================== */

  function apagarDadosDaArea(area) {
    const configuracoes = {
      perfil: { chave: CHAVES_LOCAIS.profile, limpar: () => setProfile(perfilInicial), nome: "Perfil" },
      financas: { chave: CHAVES_LOCAIS.transacoes, limpar: () => setTransacoes([]), nome: "Finanças, Transações e Histórico" },
      transacoes: { chave: CHAVES_LOCAIS.transacoes, limpar: () => setTransacoes([]), nome: "Transações e Histórico" },
      historico: { chave: CHAVES_LOCAIS.transacoes, limpar: () => setTransacoes([]), nome: "Histórico e Transações" },
      reserva: { chave: CHAVES_LOCAIS.reserva, limpar: () => setReserva(reservaInicial), nome: "Reserva" },
      cartoes: { chave: CHAVES_LOCAIS.cartoes, limpar: () => setCartoes([]), nome: "Cartões" },
      acertos: {
        chave: CHAVES_LOCAIS.quemMeDeve,
        limpar: () => {
          setQuemMeDeve(quemMeDeveInicial);
          setTransacoes((listaAtual) => listaAtual.filter((transacao) => transacao.origemMovimento !== "quem_me_deve"));
        },
        nome: "Acertos",
      },
      estudos: { chave: CHAVES_LOCAIS.estudos, limpar: () => setEstudos([]), nome: "Estudos" },
      lista: { chave: CHAVES_LOCAIS.lista, limpar: () => setLista([]), nome: "Lista" },
      lembretes: { chave: CHAVES_LOCAIS.lembretes, limpar: () => setLembretes([]), nome: "Lembretes" },
      receitas: { chave: CHAVES_LOCAIS.receitas, limpar: () => setReceitas([]), nome: "Receitas" },
    };

    const configuracao = configuracoes[area];
    if (!configuracao) return;

    window.localStorage.removeItem(configuracao.chave);
    configuracao.limpar();
    notificar(`${configuracao.nome} apagado(a).`, "aviso");
  }

  function limparTodosOsDados() {
    Object.values(CHAVES_LOCAIS).forEach((chave) =>
      window.localStorage.removeItem(chave)
    );

    setProfile(perfilInicial);
    setTransacoes([]);
    setCartoes([]);
    setReserva(reservaInicial);
    setQuemMeDeve(quemMeDeveInicial);
    setEstudos([]);
    setLista([]);
    setLembretes([]);
    setReceitas([]);
    notificar("Todos os dados foram apagados.", "aviso");
  }

  /* =====================================================
     DADOS COMPARTILHADOS ENTRE AS PÁGINAS
  ===================================================== */

  const contexto = useMemo(
    () => ({
      profile,
      atualizarProfile,
      notificar,

      user,
      estaOnline,
      statusNuvem,
      loginComGoogle,
      logout,

      transacoes,
      adicionarTransacao,
      atualizarTransacao,
      removerTransacao,

      cartoes,
      adicionarCartao,
      atualizarCartoes,

      reserva,
      setReserva: atualizarReserva,

      quemMeDeve,
      adicionarPessoa,
      atualizarPessoa,
      removerPessoaQuemMeDeve,
      adicionarGrupoQuemMeDeve,
      removerGrupoQuemMeDeve,
      adicionarDivida,
      registrarPagamento,
      atualizarLancamentoQuemMeDeve,
      transferirDividaQuemMeDeve,
      removerLancamentoQuemMeDeve,

      estudos,
      setEstudos,
      lista,
      setLista,
      lembretes,
      setLembretes,
      receitas,
      setReceitas,

      abaAtiva,
      setAbaAtiva,
      irParaAba,

      mesReferencia,
      mudarMesReferencia,
      irParaMesAtual,

      limparTodosOsDados,
      apagarDadosDaArea,
    }),
    [
      profile,
      user,
      estaOnline,
      statusNuvem,
      transacoes,
      cartoes,
      reserva,
      quemMeDeve,
      estudos,
      lista,
      lembretes,
      receitas,
      abaAtiva,
      mesReferencia,
    ]
  );

  /* =====================================================
     ESCOLHA DA PÁGINA
  ===================================================== */

  function renderizarPagina() {
    switch (abaAtiva) {
      case "dashboard":
        return <DashboardPage />;
  
      case "financas":
        return <FinancasPage />;
  
      case "reserva":
        return <ReservaPage />;
  
      case "transacoes":
        return <TransacoesPage />;
  
      case "cartoes":
        return <CartoesPage />;
  
      case "historico":
        return <HistoricoPage />;
  
      case "perfil":
        return (
          <>
            <PerfilPage />
            <section className="card" style={{ marginTop: 16 }}>
              <p className="muted small" style={{ marginTop: 0 }}>
                Conta conectada: {user?.email || "Conta Google"}
              </p>
              <button
                type="button"
                className="toggle-btn"
                style={{ width: "100%" }}
                onClick={() => logout()}
              >
                🚪 Sair da conta
              </button>
            </section>
          </>
        );

      case "estudos":
        return <EstudosPage />;

      case "lista":
        return <ListaPage />;

      case "lembretes":
        return <LembretesPage />;

      case "receitas":
        return <ReceitasPage />;

      case "quem-me-deve":
        return <QuemMeDevePage />;
  
      case "backup":
        return <BackupPage />;
  
      case "configuracoes":
        return <ConfiguracoesPage />;
  
      case "sobre":
        return <SobrePage />;
  
      default:
        return <DashboardPage />;
    }
  }

  const textoStatusNuvem = {
    carregando: "☁️ Carregando",
    conectando: "☁️ Conectando",
    sincronizando: "☁️ Sincronizando",
    salvando: "☁️ Salvando",
    sincronizado: "🟢 Sincronizado",
    offline: "🟠 Offline · salvo no aparelho",
    erro: "🔴 Erro de sincronização",
    desconectado: "⚪ Desconectado",
  }[statusNuvem] || "☁️ Conectando";

  async function entrarComGoogle() {
    setErroLogin("");

    if (!navigator.onLine) {
      setErroLogin("Conecte-se à internet para entrar pela primeira vez.");
      return;
    }

    try {
      await loginComGoogle();
    } catch (erro) {
      console.error("Erro no login com Google:", erro);
      setErroLogin(
        erro?.code === "auth/popup-closed-by-user"
          ? "A janela de login foi fechada antes de concluir."
          : "Não foi possível entrar. Confira o Firebase e tente novamente."
      );
    }
  }

  /* =====================================================
     INTERFACE
  ===================================================== */

  if (authLoading || (user && !dadosCarregados)) {
    return (
      <div className="app-root">
        <div className="app-overlay">
          <header className="app-header">
            <h1 className="app-title">Finanças Online</h1>
          </header>
          <main className="app-main">
            <div className="card">
              <p>{authLoading ? "Verificando sua conta..." : "Sincronizando seus dados..."}</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-root">
        <div className="app-overlay">
          <header className="app-header">
            <h1 className="app-title">Finanças Online</h1>
          </header>
          <main className="app-main">
            <div className="card profile-card">
              <h2 className="page-title">Entrar</h2>
              <p className="muted small">
                Entre com sua conta Google para acessar os mesmos dados no celular e no computador.
              </p>
              <button
                type="button"
                className="primary-btn"
                style={{ marginTop: 12 }}
                onClick={entrarComGoogle}
              >
                🔐 Entrar com Google
              </button>
              {erroLogin ? (
                <p role="alert" style={{ marginTop: 10, color: "#ef4444" }}>
                  {erroLogin}
                </p>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <FinanceContext.Provider value={contexto}>
      {notificacaoFlash ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            zIndex: 5000,
            width: "min(340px, calc(100vw - 24px))",
            padding: "11px 13px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(15,23,42,.96)",
            boxShadow: "0 16px 42px rgba(0,0,0,.34)",
            display: "grid",
            gap: 4,
          }}
        >
          <strong style={{ overflowWrap: "anywhere" }}>
            {notificacaoFlash.texto}
          </strong>
          <span style={{ fontSize: 11, opacity: 0.68 }}>
            {new Date(notificacaoFlash.dataHora).toLocaleDateString("pt-BR")} · {" "}
            {new Date(notificacaoFlash.dataHora).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      ) : null}

      <div className="app-root">
        <div className="bolinhas-background">
          {Array.from({ length: 60 }).map((_, indice) => (
            <span
              key={indice}
              className="bolinha"
              style={{
                left: `${Math.random() * 100}%`,
                animationDuration: `${4 + Math.random() * 6}s`,
                animationDelay: `${Math.random() * 8}s`,
                transform: `scale(${
                  0.5 + Math.random() * 1.2
                })`,
              }}
            />
          ))}
        </div>

        <div className="app-overlay">
          <header className="app-header">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                width: "100%",
              }}
            >
              <div>
                <h1 className="app-title">Finanças Online</h1>
                <small style={{ opacity: 0.72 }}>{textoStatusNuvem}</small>
              </div>
              <button
                type="button"
                className="icon-btn"
                style={{ width: "auto", padding: "7px 12px", fontSize: 24 }}
                onClick={() => setMenuMaisAberto(true)}
                aria-label="Abrir mais páginas"
                aria-expanded={menuMaisAberto}
                title="Mais páginas"
              >
                ⋯
              </button>
            </div>
          </header>

          <main className="app-main">
            {renderizarPagina()}
          </main>

          {mostrarMenuInferior ? (
          <nav className="bottom-nav">
            <button
              type="button"
              className={`bottom-nav-item ${
                abaAtiva === "financas"
                  ? "bottom-nav-item-active"
                  : ""
              }`}
              onClick={() => setAbaAtiva("financas")}
            >
              <span className="bottom-nav-icon" aria-hidden="true">💰</span>
              <span className="bottom-nav-label">Finanças</span>
            </button>

            <button
              type="button"
              className={`bottom-nav-item ${
                abaAtiva === "reserva"
                  ? "bottom-nav-item-active"
                  : ""
              }`}
              onClick={() => setAbaAtiva("reserva")}
            >
              <span className="bottom-nav-icon" aria-hidden="true">💰</span>
              <span className="bottom-nav-label">Reserva</span>
            </button>

            <button
              type="button"
              className={`bottom-nav-item ${
                abaAtiva === "transacoes"
                  ? "bottom-nav-item-active"
                  : ""
              }`}
              onClick={() => setAbaAtiva("transacoes")}
            >
              <span className="bottom-nav-icon" aria-hidden="true">📥</span>
              <span className="bottom-nav-label">Transações</span>
            </button>

            <button
              type="button"
              className={`bottom-nav-item ${
                abaAtiva === "cartoes"
                  ? "bottom-nav-item-active"
                  : ""
              }`}
              onClick={() => setAbaAtiva("cartoes")}
            >
              <span className="bottom-nav-icon" aria-hidden="true">💳</span>
              <span className="bottom-nav-label">Cartões</span>
            </button>

            <button
              type="button"
              className={`bottom-nav-item ${
                abaAtiva === "historico"
                  ? "bottom-nav-item-active"
                  : ""
              }`}
              onClick={() => setAbaAtiva("historico")}
            >
              <span className="bottom-nav-icon" aria-hidden="true">📜</span>
              <span className="bottom-nav-label">Histórico</span>
            </button>

            <button
              type="button"
              className={`bottom-nav-item ${
                abaAtiva === "quem-me-deve"
                  ? "bottom-nav-item-active"
                  : ""
              }`}
              onClick={() => setAbaAtiva("quem-me-deve")}
            >
              <span className="bottom-nav-icon" aria-hidden="true">👥</span>
              <span className="bottom-nav-label">Acertos</span>
            </button>

            <button
              type="button"
              className={`bottom-nav-item ${
                abaAtiva === "perfil"
                  ? "bottom-nav-item-active"
                  : ""
              }`}
              onClick={() => setAbaAtiva("perfil")}
            >
              <span className="bottom-nav-icon" aria-hidden="true">👤</span>
              <span className="bottom-nav-label">Perfil</span>
            </button>
          </nav>
          ) : null}

          {menuMaisAberto ? (
            <div
              className="modal-overlay"
              style={{ zIndex: 12000 }}
              onClick={() => setMenuMaisAberto(false)}
            >
              <div
                className="modal-card"
                style={{ width: "min(360px, calc(100vw - 28px))" }}
                onClick={(evento) => evento.stopPropagation()}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <h3 style={{ margin: 0 }}>Mais páginas</h3>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: "auto" }}
                    onClick={() => setMenuMaisAberto(false)}
                    aria-label="Fechar menu"
                  >
                    ×
                  </button>
                </div>

                <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                  {itensMenuMais.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`toggle-btn ${
                        abaAtiva === item.key ? "toggle-active" : ""
                      }`}
                      style={{ width: "100%", textAlign: "left" }}
                      onClick={() => abrirAbaPeloMenuMais(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </FinanceContext.Provider>
  );
}
