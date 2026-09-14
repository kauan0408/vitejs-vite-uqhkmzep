// src/pages/QuemMeDeve/QuemMeDevePage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createWorker } from "tesseract.js";
import { jsPDF } from "jspdf";
import { useFinance } from "../../App.jsx";
import "./QuemMeDevePage.css";

const EU_ID = "__eu__";

function brl(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function numero(valor) {
  const n = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function formatarDataHora(valor) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";

  return `${data.toLocaleDateString("pt-BR")} ${data.toLocaleTimeString(
    "pt-BR",
    { hour: "2-digit", minute: "2-digit" }
  )}`;
}

function idLocal() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formaLabel(forma) {
  const mapa = {
    pix: "PIX",
    dinheiro: "Dinheiro",
    debito: "Débito",
    credito: "Crédito",
    outros: "Outros",
  };
  return mapa[forma] || forma || "—";
}

function sentidoLabel(sentido) {
  return sentido === "eu_devo" ? "EU DEVO" : "ME DEVEM";
}

function calcularJuros(item, agora) {
  if (
    item?.tipo !== "divida" ||
    item?.ativo === false ||
    !(numero(item.jurosTaxa) > 0)
  ) {
    return 0;
  }

  const inicio = new Date(item.dataHora || item.criadoEm || agora);
  if (Number.isNaN(inicio.getTime()) || inicio >= agora) return 0;

  const horas = (agora.getTime() - inicio.getTime()) / 3600000;
  const periodos =
    item.jurosUnidade === "hora"
      ? horas
      : item.jurosUnidade === "dia"
        ? horas / 24
        : item.jurosUnidade === "ano"
          ? horas / (24 * 365.25)
          : horas / (24 * 30.4375);

  return Number(
    (numero(item.valor) * (numero(item.jurosTaxa) / 100) * periodos).toFixed(2)
  );
}

export default function QuemMeDevePage() {
  const {
    quemMeDeve,
    profile = {},
    cartoes = [],
    adicionarPessoa,
    atualizarPessoa,
    removerPessoaQuemMeDeve,
    adicionarGrupoQuemMeDeve,
    removerGrupoQuemMeDeve,
    adicionarDivida,
    registrarPagamento,
    atualizarLancamentoQuemMeDeve,
    removerLancamentoQuemMeDeve,
    transferirDividaQuemMeDeve,
    notificar,
  } = useFinance();

  const dados = quemMeDeve || { pessoas: [], lancamentos: [] };
  const pessoas = Array.isArray(dados.pessoas) ? dados.pessoas : [];
  const lancamentos = Array.isArray(dados.lancamentos)
    ? dados.lancamentos
    : [];
  const grupos = Array.isArray(dados.grupos) ? dados.grupos : [];

  const [pessoaAbertaId, setPessoaAbertaId] = useState("");
  const [pessoaRevelandoId, setPessoaRevelandoId] = useState("");
  const [historicoDetalhadoPessoaId, setHistoricoDetalhadoPessoaId] = useState("");
  const carrosselRef = useRef(null);
  const [modal, setModal] = useState("");
  const [mostrarAjuda, setMostrarAjuda] = useState(false);
  const [ajudaSecao, setAjudaSecao] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);
  const [mensagem, setMensagem] = useState("");
  const [tipoMensagem, setTipoMensagem] = useState("info");
  const timerMensagemRef = useRef(null);

  // PDF individual por pessoa.
  const [pdfPessoaId, setPdfPessoaId] = useState("");
  const [pdfIncluirAtivos, setPdfIncluirAtivos] = useState(true);
  const [pdfIncluirInativos, setPdfIncluirInativos] = useState(false);
  const [pdfMostrarFormaPagamento, setPdfMostrarFormaPagamento] = useState(true);
  const [pdfMostrarVencimento, setPdfMostrarVencimento] = useState(true);
  const [pdfMostrarObservacoes, setPdfMostrarObservacoes] = useState(true);
  const [pdfPronto, setPdfPronto] = useState(false);
  const [pdfPeriodo, setPdfPeriodo] = useState(() => {
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
  });

  // Pessoa editável / criação rápida dentro do lançamento.
  const [pessoaId, setPessoaId] = useState("");
  const [nomePessoa, setNomePessoa] = useState("");
  const [fotoPessoa, setFotoPessoa] = useState("");
  const [corPessoa, setCorPessoa] = useState("#3b82f6");
  const [formaRecebimentoPessoa, setFormaRecebimentoPessoa] = useState("pix");
  const [chavePagamentoPessoa, setChavePagamentoPessoa] = useState("");
  const [vencimentoPessoa, setVencimentoPessoa] = useState("");
  const [novaPessoaNome, setNovaPessoaNome] = useState("");
  const [novaPessoaFoto, setNovaPessoaFoto] = useState("");
  const [novaPessoaCor, setNovaPessoaCor] = useState("#3b82f6");

  // Dívida / acerto.
  const [sentido, setSentido] = useState("me_deve");
  const [pessoasSelecionadas, setPessoasSelecionadas] = useState([]);
  const [euSelecionado, setEuSelecionado] = useState(false);
  const [percentuais, setPercentuais] = useState({});
  const [descricao, setDescricao] = useState("");
  const [deOnde, setDeOnde] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [categoriaFinanceira, setCategoriaFinanceira] =
    useState("Burrice");
  const [cartaoId, setCartaoId] = useState("");
  const [integrarFinanceiro, setIntegrarFinanceiro] = useState(true);
  const [valorTotal, setValorTotal] = useState("");
  const [minhaParteValor, setMinhaParteValor] = useState("");
  const [minhaPartePercentual, setMinhaPartePercentual] = useState("");
  const [valorDireto, setValorDireto] = useState("");
  const [modoLancamentoDivida, setModoLancamentoDivida] = useState("lancar");
  const [observacao, setObservacao] = useState("");
  const [dataHora, setDataHora] = useState("");
  const [taxaJuros, setTaxaJuros] = useState("");
  const [unidadeJuros, setUnidadeJuros] = useState("mes");
  const [editandoLancamentoId, setEditandoLancamentoId] = useState("");

  // Transferência de dívida entre pessoas.
  const [transferindoLancamentoId, setTransferindoLancamentoId] = useState("");
  const [transferenciaPessoaDestinoId, setTransferenciaPessoaDestinoId] =
    useState("");
  const [transferenciaPessoaDestinoIds, setTransferenciaPessoaDestinoIds] = useState([]);
  const [transferenciaModo, setTransferenciaModo] = useState("total");
  const [transferenciaValor, setTransferenciaValor] = useState("");

  const [origemImportacao, setOrigemImportacao] = useState("manual");
  const [agoraJuros, setAgoraJuros] = useState(() => new Date());
  const [prazoArquivarQuitadaDias, setPrazoArquivarQuitadaDias] =
    useState("14");
  const [mostrarQuitadasArquivadas, setMostrarQuitadasArquivadas] =
    useState(false);

  // Seções recolhíveis do modal de lançamento.
  const [secaoImportacaoAberta, setSecaoImportacaoAberta] = useState(false);
  const [secaoPessoasAberta, setSecaoPessoasAberta] = useState(false);
  const [secaoCriarPessoaAberta, setSecaoCriarPessoaAberta] = useState(false);
  const [secaoDetalhesAberta, setSecaoDetalhesAberta] = useState(false);
  const [secaoObservacaoAberta, setSecaoObservacaoAberta] = useState(false);
  const [secaoGrupoAberta, setSecaoGrupoAberta] = useState(false);
  const [mostrarMaisLancamento, setMostrarMaisLancamento] = useState(false);
  const [painelParticipantesLancamento, setPainelParticipantesLancamento] = useState("");
  const [mostrarFotoLancamento, setMostrarFotoLancamento] = useState(false);
  const [mostrarDestinoFinanceiroModal, setMostrarDestinoFinanceiroModal] = useState(false);
  const [novoGrupoNome, setNovoGrupoNome] = useState("");
  const [novoGrupoPessoaIds, setNovoGrupoPessoaIds] = useState([]);
  const [editandoGrupoId, setEditandoGrupoId] = useState("");

  // Foto/OCR.
  const fotoImportacaoRef = useRef(null);
  const cameraImportacaoRef = useRef(null);
  const [lendoFoto, setLendoFoto] = useState(false);
  const [progressoFoto, setProgressoFoto] = useState(0);
  const [rascunhosImportados, setRascunhosImportados] = useState([]);

  // Voz.
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const bufferVozRef = useRef("");
  const [gravando, setGravando] = useState(false);
  const [suportaVoz, setSuportaVoz] = useState(true);
  const [textoVoz, setTextoVoz] = useState("");

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const classe = "acertos-nova-divida-aberta";
    const temJanelaAberta = Boolean(
      modal || confirmacao || ajudaSecao || mostrarDestinoFinanceiroModal
    );

    if (temJanelaAberta) {
      document.body.classList.add(classe);
    } else {
      document.body.classList.remove(classe);
    }

    return () => {
      document.body.classList.remove(classe);
    };
  }, [modal, confirmacao, ajudaSecao, mostrarDestinoFinanceiroModal]);

  function avisar(texto, tipo = "info") {
    setMensagem(texto);
    setTipoMensagem(tipo);
    notificar?.(texto, tipo);

    if (timerMensagemRef.current) {
      window.clearTimeout(timerMensagemRef.current);
    }

    timerMensagemRef.current = window.setTimeout(() => {
      setMensagem("");
    }, 3000);
  }

  useEffect(() => {
    return () => {
      if (timerMensagemRef.current) {
        window.clearTimeout(timerMensagemRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const intervalo = window.setInterval(
      () => setAgoraJuros(new Date()),
      60000
    );

    return () => window.clearInterval(intervalo);
  }, []);

  const extratos = useMemo(() => {
    return pessoas.map((pessoa) => {
      const itens = lancamentos
        .filter((item) => item.pessoaId === pessoa.id)
        .sort(
          (a, b) =>
            new Date(b.dataHora || 0).getTime() -
            new Date(a.dataHora || 0).getTime()
        );

      const dividasMeDevem = itens
        .filter(
          (item) =>
            item.tipo === "divida" &&
            item.ativo !== false &&
            (item.sentido || "me_deve") === "me_deve"
        )
        .reduce((s, item) => s + numero(item.valor), 0);

      const recebidos = itens
        .filter(
          (item) =>
            item.tipo !== "divida" &&
            (item.sentido || "me_deve") === "me_deve"
        )
        .reduce((s, item) => s + numero(item.valor), 0);

      const dividasEuDevo = itens
        .filter(
          (item) =>
            item.tipo === "divida" &&
            item.ativo !== false &&
            item.sentido === "eu_devo"
        )
        .reduce((s, item) => s + numero(item.valor), 0);

      const pagosPorMim = itens
        .filter(
          (item) => item.tipo !== "divida" && item.sentido === "eu_devo"
        )
        .reduce((s, item) => s + numero(item.valor), 0);

      const saldoMeDevem = Math.max(0, dividasMeDevem - recebidos);
      const saldoEuDevo = Math.max(0, dividasEuDevo - pagosPorMim);

      const jurosMeDevem = itens
        .filter(
          (item) =>
            item.tipo === "divida" &&
            (item.sentido || "me_deve") === "me_deve"
        )
        .reduce((s, item) => s + calcularJuros(item, agoraJuros), 0);

      const jurosEuDevo = itens
        .filter(
          (item) => item.tipo === "divida" && item.sentido === "eu_devo"
        )
        .reduce((s, item) => s + calcularJuros(item, agoraJuros), 0);

      const saldoRealMeDevem = Math.max(
        0,
        dividasMeDevem + jurosMeDevem - recebidos
      );
      const saldoRealEuDevo = Math.max(
        0,
        dividasEuDevo + jurosEuDevo - pagosPorMim
      );

      const baseProgresso = dividasMeDevem + dividasEuDevo;
      const totalAcertado = recebidos + pagosPorMim;
      const percentualAcertado =
        baseProgresso > 0
          ? Math.min(100, (totalAcertado / baseProgresso) * 100)
          : 0;

      let status = "Conta zerada";
      if (saldoMeDevem > 0 && saldoEuDevo > 0) status = "Pendências dos dois lados";
      else if (saldoMeDevem > 0) status = "A receber";
      else if (saldoEuDevo > 0) status = "A pagar";
      else if (baseProgresso > 0) status = "Em dia";

      return {
        pessoa,
        itens,
        dividasMeDevem,
        recebidos,
        dividasEuDevo,
        pagosPorMim,
        saldoMeDevem,
        saldoEuDevo,
        jurosMeDevem,
        jurosEuDevo,
        saldoRealMeDevem,
        saldoRealEuDevo,
        percentualAcertado,
        status,
        ultimoMovimento: itens[0] || null,
      };
    });
  }, [pessoas, lancamentos, agoraJuros]);

  const resumo = useMemo(() => {
    return {
      temParaReceber: extratos.reduce((s, e) => s + e.saldoMeDevem, 0),
      tenhoParaPagar: extratos.reduce((s, e) => s + e.saldoEuDevo, 0),
      jurosParaReceber: extratos.reduce((s, e) => s + e.jurosMeDevem, 0),
      jurosParaPagar: extratos.reduce((s, e) => s + e.jurosEuDevo, 0),
      saldoRealParaReceber: extratos.reduce(
        (s, e) => s + e.saldoRealMeDevem,
        0
      ),
      saldoRealParaPagar: extratos.reduce(
        (s, e) => s + e.saldoRealEuDevo,
        0
      ),
      pessoasComPendencia: extratos.filter(
        (e) => e.saldoMeDevem > 0 || e.saldoEuDevo > 0
      ).length,
    };
  }, [extratos]);

  const somaPercentuais = useMemo(
    () =>
      pessoasSelecionadas.reduce(
        (s, id) => s + numero(percentuais[id] || 0),
        0
      ),
    [pessoasSelecionadas, percentuais]
  );


  const resumoMinhaParte = useMemo(() => {
    const total = numero(valorTotal);

    if (!euSelecionado) {
      return {
        manual: false,
        valor: 0,
        percentual: 0,
        totalPercentual: Number(somaPercentuais.toFixed(2)),
        faltaPercentual: Number(
          Math.max(0, 100 - somaPercentuais).toFixed(2)
        ),
        excessoPercentual: Number(
          Math.max(0, somaPercentuais - 100).toFixed(2)
        ),
        valorOutrasPessoas: Number(
          ((total * somaPercentuais) / 100).toFixed(2)
        ),
      };
    }

    const percentualFoiDigitado =
      String(minhaPartePercentual ?? "").trim() !== "";
    const valorFoiDigitado =
      String(minhaParteValor ?? "").trim() !== "";

    const percentualDigitado = Math.max(
      0,
      Math.min(100, numero(minhaPartePercentual))
    );
    const valorDigitado = Math.max(0, numero(minhaParteValor));

    let percentual = 0;
    let valor = 0;

    if (percentualFoiDigitado) {
      percentual = percentualDigitado;
      valor =
        total > 0
          ? (total * percentualDigitado) / 100
          : 0;
    } else if (valorFoiDigitado) {
      valor = valorDigitado;
      percentual =
        total > 0
          ? (valorDigitado / total) * 100
          : 0;
    } else {
      percentual = Math.max(0, 100 - somaPercentuais);
      valor =
        total > 0
          ? (total * percentual) / 100
          : 0;
    }

    const totalPercentual = somaPercentuais + percentual;

    return {
      manual: percentualFoiDigitado || valorFoiDigitado,
      valor: Number(valor.toFixed(2)),
      percentual: Number(percentual.toFixed(2)),
      totalPercentual: Number(totalPercentual.toFixed(2)),
      faltaPercentual: Number(
        Math.max(0, 100 - totalPercentual).toFixed(2)
      ),
      excessoPercentual: Number(
        Math.max(0, totalPercentual - 100).toFixed(2)
      ),
      valorOutrasPessoas: Number(
        ((total * somaPercentuais) / 100).toFixed(2)
      ),
    };
  }, [
    valorTotal,
    minhaParteValor,
    minhaPartePercentual,
    somaPercentuais,
    euSelecionado,
  ]);

  function recalcularDivisaoIgual(
    ids = pessoasSelecionadas,
    incluirEu = euSelecionado
  ) {
    const participantes = ids.length + (incluirEu ? 1 : 0);

    if (!participantes) {
      setPercentuais({});
      setMinhaParteValor("");
      setMinhaPartePercentual("");
      return;
    }

    const igual = Number((100 / participantes).toFixed(2));
    const mapa = {};

    ids.forEach((id, indice) => {
      // Se "Eu" participa, o ajuste final de arredondamento fica na minha parte.
      // Se não participa, o último nome recebe o ajuste para fechar 100%.
      if (!incluirEu && indice === ids.length - 1) {
        const antes = igual * (ids.length - 1);
        mapa[id] = Number((100 - antes).toFixed(2));
      } else {
        mapa[id] = igual;
      }
    });

    setPercentuais(mapa);

    if (incluirEu) {
      const percentualDosOutros = Object.values(mapa).reduce(
        (s, valor) => s + numero(valor),
        0
      );
      const meuPercentual = Number(
        Math.max(0, 100 - percentualDosOutros).toFixed(2)
      );
      const total = numero(valorTotal);

      // Se já existe valor total, grava minha parte em reais.
      // Sem total, deixa automático para recalcular depois.
      setMinhaPartePercentual(
        meuPercentual > 0 ? String(meuPercentual) : ""
      );
      setMinhaParteValor(
        total > 0
          ? String(Number(((total * meuPercentual) / 100).toFixed(2)))
          : ""
      );
    } else {
      setMinhaParteValor("");
      setMinhaPartePercentual("");
    }
  }

  function dividirRestanteIgualmente() {
    recalcularDivisaoIgual(pessoasSelecionadas, euSelecionado);
    avisar("A divisão foi recalculada igualmente.", "sucesso");
  }

  function alternarEuSelecionado() {
    const novo = !euSelecionado;
    setEuSelecionado(novo);
    recalcularDivisaoIgual(pessoasSelecionadas, novo);
  }

  function limparFormulario() {
    setPessoaId("");
    setNomePessoa("");
    setFotoPessoa("");
    setCorPessoa("#3b82f6");
    setFormaRecebimentoPessoa("pix");
    setChavePagamentoPessoa("");
    setVencimentoPessoa("");
    setNovaPessoaNome("");
    setNovaPessoaFoto("");
    setNovaPessoaCor("#3b82f6");
    setSentido("me_deve");
    setPessoasSelecionadas([]);
    setEuSelecionado(false);
    setPercentuais({});
    setDescricao("");
    setDeOnde("");
    setFormaPagamento("pix");
    setCategoriaFinanceira("Burrice");
    setCartaoId("");
    setIntegrarFinanceiro(true);
    setValorTotal("");
    setMinhaParteValor("");
    setMinhaPartePercentual("");
    setValorDireto("");
    setModoLancamentoDivida("lancar");
    setObservacao("");
    setDataHora("");
    setPrazoArquivarQuitadaDias("14");
    setTaxaJuros("");
    setUnidadeJuros("mes");
    setEditandoLancamentoId("");
    setTransferindoLancamentoId("");
    setTransferenciaPessoaDestinoId("");
    setTransferenciaPessoaDestinoIds([]);
    setTransferenciaModo("total");
    setTransferenciaValor("");
    setOrigemImportacao("manual");
    setSecaoImportacaoAberta(false);
    setSecaoPessoasAberta(false);
    setSecaoCriarPessoaAberta(false);
    setSecaoDetalhesAberta(false);
    setSecaoObservacaoAberta(false);
    setSecaoGrupoAberta(false);
    setMostrarMaisLancamento(false);
    setPainelParticipantesLancamento("");
    setMostrarFotoLancamento(false);
    setMostrarDestinoFinanceiroModal(false);
    setNovoGrupoNome("");
    setNovoGrupoPessoaIds([]);
    setEditandoGrupoId("");
    setRascunhosImportados([]);
    setTextoVoz("");
  }

  function fecharModal() {
    setModal("");
    limparFormulario();
  }

  function recalcularIgual(ids) {
    recalcularDivisaoIgual(ids, euSelecionado);
  }

  function alternarPessoaSelecionada(id) {
    const novos = pessoasSelecionadas.includes(id)
      ? pessoasSelecionadas.filter((x) => x !== id)
      : [...pessoasSelecionadas, id];

    setPessoasSelecionadas(novos);
    recalcularDivisaoIgual(novos, euSelecionado);
  }

  function abrirNovaDivida(id = "", origem = "manual") {
    limparFormulario();
    setOrigemImportacao(origem);
    setModoLancamentoDivida("lancar");
    if (id) {
      setPessoasSelecionadas([id]);
      setPercentuais({ [id]: 100 });
    }
    setModal("nova-divida");
  }

  function abrirEditarPessoa(pessoa) {
    limparFormulario();
    setPessoaId(pessoa.id);
    setNomePessoa(pessoa.nome || "");
    setFotoPessoa(pessoa.fotoBase64 || "");
    setCorPessoa(pessoa.corCarta || "#3b82f6");
    setFormaRecebimentoPessoa(pessoa.formaRecebimento || "pix");
    setChavePagamentoPessoa(pessoa.chavePagamento || "");
    setVencimentoPessoa(pessoa.vencimento || "");
    setPrazoArquivarQuitadaDias(
      String(pessoa.arquivarQuitadaDias ?? 14)
    );
    setModal("editar-pessoa");
  }

  function abrirAcerto(id, sentidoAcerto) {
    limparFormulario();
    setPessoaId(id);
    setSentido(sentidoAcerto);
    setModoLancamentoDivida("quitar");
    const pendente = saldoPessoaPorSentido(id, sentidoAcerto);
    setValorDireto(
      pendente > 0 ? String(Number(pendente.toFixed(2))) : ""
    );
    setModal("acerto");
  }

  function abrirQuitacaoPessoa(id) {
    const extrato = extratos.find((item) => item.pessoa.id === id);
    if (!extrato) return;

    const sentidoInicial =
      extrato.saldoRealMeDevem > 0 ? "me_deve" : "eu_devo";

    abrirAcerto(id, sentidoInicial);
  }

  function mudarSentidoQuitacao(novoSentido) {
    setSentido(novoSentido);
    const pendente = saldoPessoaPorSentido(pessoaId, novoSentido);
    if (modoLancamentoDivida === "quitar") {
      setValorDireto(
        pendente > 0 ? String(Number(pendente.toFixed(2))) : ""
      );
    } else {
      setValorDireto("");
    }
  }

  function mudarModoQuitacao(novoModo) {
    setModoLancamentoDivida(novoModo);
    const pendente = saldoPessoaPorSentido(pessoaId, sentido);
    if (novoModo === "quitar") {
      setValorDireto(
        pendente > 0 ? String(Number(pendente.toFixed(2))) : ""
      );
    } else {
      setValorDireto("");
    }
  }

  function abrirEditarLancamento(item) {
    limparFormulario();
    setEditandoLancamentoId(item.id);
    setPessoaId(item.pessoaId || "");
    setSentido(item.sentido || "me_deve");
    setDescricao(item.descricao || "");
    setDeOnde(item.deOnde || "");
    setFormaPagamento(item.formaPagamento || "pix");
    setCategoriaFinanceira(item.categoria || "Burrice");
    setCartaoId(item.cartaoId || "");
    setIntegrarFinanceiro(item.integrarFinanceiro !== false);
    setValorTotal(String(item.valorTotal ?? ""));
    setMinhaParteValor(
      item.minhaParteValor != null ? String(item.minhaParteValor) : ""
    );
    setMinhaPartePercentual(
      item.minhaPartePercentual != null
        ? String(item.minhaPartePercentual)
        : item.minhaParteValor != null && numero(item.valorTotal) > 0
          ? String(
              Number(
                (
                  (numero(item.minhaParteValor) /
                    numero(item.valorTotal)) *
                  100
                ).toFixed(2)
              )
            )
          : ""
    );
    setValorDireto(String(item.valor ?? ""));
    setObservacao(item.observacao || "");
    setTaxaJuros(item.jurosTaxa ? String(item.jurosTaxa) : "");
    setUnidadeJuros(item.jurosUnidade || "mes");

    if (item.porcentagem != null) {
      setPercentuais({ [item.pessoaId]: item.porcentagem });
      setPessoasSelecionadas([item.pessoaId]);
    }

    if (item.dataHora) {
      const dt = new Date(item.dataHora);
      if (!Number.isNaN(dt.getTime())) {
        const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setDataHora(local);
      }
    }

    setModal("editar-lancamento");
  }

  function abrirTransferenciaDivida(item) {
    if (!item || item.tipo !== "divida") return;

    limparFormulario();
    setTransferindoLancamentoId(item.id);
    setTransferenciaPessoaDestinoId("");
    setTransferenciaPessoaDestinoIds([]);
    setTransferenciaModo("total");
    setTransferenciaValor(String(numero(item.valor).toFixed(2)));
    setModal("transferir-divida");
  }

  function alternarDestinoTransferencia(id) {
    setTransferenciaPessoaDestinoIds((atuais) =>
      atuais.includes(id)
        ? atuais.filter((item) => item !== id)
        : [...atuais, id]
    );
  }

  function aplicarGrupoTransferencia(grupo, pessoaOrigemId) {
    const ids = (Array.isArray(grupo?.pessoaIds) ? grupo.pessoaIds : [])
      .filter((id) => id !== EU_ID && id !== pessoaOrigemId)
      .filter((id) => pessoas.some((pessoa) => pessoa.id === id));

    if (!ids.length) {
      return avisar("Este grupo não tem outras pessoas disponíveis.", "erro");
    }

    setTransferenciaPessoaDestinoIds([...new Set(ids)]);
    avisar(`Grupo ${grupo.nome} selecionado para a transferência.`, "sucesso");
  }

  function dividirValorEntreDestinos(valorTotalTransferir, ids) {
    const lista = [...new Set(ids)].filter(Boolean);
    if (!lista.length) return [];

    const totalCentavos = Math.max(
      0,
      Math.round(numero(valorTotalTransferir) * 100)
    );
    const base = Math.floor(totalCentavos / lista.length);
    let resto = totalCentavos - base * lista.length;

    return lista.map((pessoaId) => {
      const centavos = base + (resto > 0 ? 1 : 0);
      if (resto > 0) resto -= 1;
      return { pessoaId, valor: centavos / 100 };
    });
  }

  function salvarTransferenciaDivida(evento) {
    evento.preventDefault();

    const original = lancamentos.find(
      (item) => item.id === transferindoLancamentoId
    );

    if (!original || original.tipo !== "divida") {
      return avisar("Não encontrei esta dívida.", "erro");
    }

    const idsDestino = [...new Set(transferenciaPessoaDestinoIds)].filter(
      (id) => id && id !== original.pessoaId
    );

    if (!idsDestino.length) {
      return avisar(
        "Escolha uma ou mais pessoas, ou selecione um grupo.",
        "erro"
      );
    }

    const valorAtual = numero(original.valor);
    const valorTransferir =
      transferenciaModo === "total"
        ? valorAtual
        : numero(transferenciaValor);

    if (!(valorTransferir > 0)) {
      return avisar("Digite um valor válido para transferir.", "erro");
    }

    if (valorTransferir > valorAtual + 0.01) {
      return avisar(
        `O máximo que pode ser transferido é ${brl(valorAtual)}.`,
        "erro"
      );
    }

    const destinos = dividirValorEntreDestinos(
      valorTransferir,
      idsDestino
    ).filter((item) => item.valor > 0);

    const resultado = transferirDividaQuemMeDeve?.({
      lancamentoId: original.id,
      destinos,
    });

    if (resultado === false) {
      return avisar("Não foi possível transferir esta dívida.", "erro");
    }

    setPessoaAbertaId(idsDestino[0] || original.pessoaId);
    avisar(
      idsDestino.length > 1
        ? `Dívida dividida entre ${idsDestino.length} pessoas.`
        : "Dívida transferida.",
      "sucesso"
    );
    fecharModal();
  }

  async function prepararFoto(arquivo) {
    if (!arquivo) return "";
    if (!arquivo.type?.startsWith("image/")) return "";

    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = reject;
      leitor.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const limite = 600;
          const escala = Math.min(1, limite / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * escala));
          canvas.height = Math.max(1, Math.round(img.height * escala));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.78));
        };
        img.src = String(leitor.result || "");
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  async function escolherFotoPessoa(evento, destino) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!arquivo) return;

    try {
      const foto = await prepararFoto(arquivo);
      if (!foto) return avisar("Escolha uma imagem válida.", "erro");
      if (destino === "nova") setNovaPessoaFoto(foto);
      else setFotoPessoa(foto);
    } catch {
      avisar("Não consegui preparar a foto.", "erro");
    }
  }

  function salvarPessoa(evento) {
    evento.preventDefault();
    const nome = nomePessoa.trim();
    if (!nome) return avisar("Digite o nome da pessoa.", "erro");

    atualizarPessoa?.(pessoaId, {
      nome,
      fotoBase64: fotoPessoa,
      corCarta: corPessoa,
      formaRecebimento: formaRecebimentoPessoa,
      chavePagamento: chavePagamentoPessoa.trim(),
      vencimento: vencimentoPessoa,
      arquivarQuitadaDias: Number(prazoArquivarQuitadaDias),
    });
    fecharModal();
  }

  function criarPessoaNoLancamento() {
    const nome = novaPessoaNome.trim();
    if (!nome) return avisar("Digite o nome da nova pessoa.", "erro");

    const pessoa = adicionarPessoa?.({
      nome,
      fotoBase64: novaPessoaFoto,
      corCarta: novaPessoaCor,
    });

    if (!pessoa?.id) return;

    setNovaPessoaNome("");
    setNovaPessoaFoto("");
    setNovaPessoaCor("#3b82f6");

    const novos = pessoasSelecionadas.includes(pessoa.id)
      ? pessoasSelecionadas
      : [...pessoasSelecionadas, pessoa.id];
    setPessoasSelecionadas(novos);
    recalcularIgual(novos);
  }

  function salvarDivida(evento) {
    evento.preventDefault();

    if (!pessoasSelecionadas.length) {
      return avisar("Selecione pelo menos uma pessoa.", "erro");
    }

    if (!descricao.trim()) {
      return avisar("Informe o nome da despesa.", "erro");
    }

    const total = numero(valorTotal);
    if (!(total > 0)) return avisar("Digite um valor total válido.", "erro");

    if (!(somaPercentuais > 0)) {
      return avisar("Informe a porcentagem das pessoas.", "erro");
    }

    if (somaPercentuais > 100.01) {
      return avisar("A soma das porcentagens não pode passar de 100%.", "erro");
    }

    if (resumoMinhaParte.valor > total + 0.01) {
      return avisar(
        "Sua parte não pode ser maior que o valor total da despesa.",
        "erro"
      );
    }

    if (
      integrarFinanceiro &&
      formaPagamento === "credito" &&
      !cartaoId
    ) {
      return avisar(
        cartoes.length
          ? "Escolha qual cartão foi usado."
          : "Cadastre um cartão antes de lançar esta despesa no crédito.",
        "erro"
      );
    }

    if (
      !euSelecionado &&
      Math.abs(somaPercentuais - 100) > 0.02
    ) {
      return avisar(
        `Sem "Eu" na divisão, as outras pessoas precisam fechar 100%. Agora está em ${somaPercentuais.toFixed(2)}%.`,
        "erro"
      );
    }

    if (
      euSelecionado &&
      resumoMinhaParte.manual &&
      Math.abs(resumoMinhaParte.totalPercentual - 100) > 0.02
    ) {
      const falta = resumoMinhaParte.faltaPercentual;
      const excesso = resumoMinhaParte.excessoPercentual;

      return avisar(
        excesso > 0
          ? `A divisão passou 100% em ${excesso.toFixed(2)}%.`
          : `Ainda faltam ${falta.toFixed(2)}% para fechar a divisão. Use "Dividir o restante igualmente" ou ajuste as porcentagens.`,
        "erro"
      );
    }

    const partes = pessoasSelecionadas.map((id) => {
      const pct = numero(percentuais[id]);
      return {
        pessoaId: id,
        porcentagem: pct,
        valor: Number(((total * pct) / 100).toFixed(2)),
      };
    });

    adicionarDivida?.({
      pessoas: partes,
      sentido,
      descricao: descricao.trim(),
      deOnde: deOnde.trim(),
      formaPagamento,
      categoria: categoriaFinanceira,
      cartaoId: formaPagamento === "credito" ? cartaoId || null : null,
      integrarFinanceiro,
      valorTotal: total,
      minhaParteValor: resumoMinhaParte.valor,
      minhaPartePercentual: resumoMinhaParte.percentual,
      observacao: observacao.trim(),
      jurosTaxa: numero(taxaJuros),
      jurosUnidade: unidadeJuros,
      dataHora: dataHora
        ? new Date(dataHora).toISOString()
        : new Date().toISOString(),
      origemImportacao,
    });

    setPessoaAbertaId(pessoasSelecionadas[0] || "");
    fecharModal();
  }

  function saldoPessoaPorSentido(id, sentidoAlvo) {
    const extrato = extratos.find((x) => x.pessoa.id === id);
    if (!extrato) return 0;
    return sentidoAlvo === "eu_devo"
      ? extrato.saldoRealEuDevo
      : extrato.saldoRealMeDevem;
  }

  const pendenciasSelecionadas = pessoasSelecionadas
    .map((id) => ({
      pessoaId: id,
      pessoa: pessoas.find((p) => p.id === id),
      valor: saldoPessoaPorSentido(id, sentido),
    }))
    .filter((item) => item.valor > 0.009);

  const totalPendenteSelecionado = pendenciasSelecionadas.reduce(
    (soma, item) => soma + numero(item.valor),
    0
  );

  useEffect(() => {
    if (modal !== "nova-divida") return;
    if (modoLancamentoDivida !== "quitar") return;

    setValorDireto(
      totalPendenteSelecionado > 0
        ? String(Number(totalPendenteSelecionado.toFixed(2)))
        : ""
    );
  }, [
    modal,
    modoLancamentoDivida,
    totalPendenteSelecionado,
  ]);

  function mudarModoLancamentoDivida(novoModo) {
    setModoLancamentoDivida(novoModo);

    if (novoModo === "lancar") {
      setValorDireto("");
      recalcularDivisaoIgual(pessoasSelecionadas, euSelecionado);
      return;
    }

    // Em pagamento/quitação, "Eu" não é uma pessoa que deve a si mesma.
    setEuSelecionado(false);
    setMinhaParteValor("");
    setMinhaPartePercentual("");
    setPercentuais({});

    if (novoModo === "quitar") {
      setValorDireto(
        totalPendenteSelecionado > 0
          ? String(Number(totalPendenteSelecionado.toFixed(2)))
          : ""
      );
    } else {
      setValorDireto("");
    }
  }

  function salvarQuitacaoOuAbatimento(evento) {
    evento.preventDefault();

    if (!pessoasSelecionadas.length) {
      return avisar(
        "Escolha quem está pagando ou recebendo em '3. Quem participa'.",
        "erro"
      );
    }

    if (!pendenciasSelecionadas.length) {
      return avisar(
        sentido === "eu_devo"
          ? "As pessoas selecionadas não têm valor pendente para você pagar."
          : "As pessoas selecionadas não têm valor pendente para te pagar.",
        "erro"
      );
    }

    if (
      integrarFinanceiro &&
      formaPagamento === "credito" &&
      !cartaoId
    ) {
      return avisar(
        cartoes.length
          ? "Escolha qual cartão foi usado."
          : "Cadastre um cartão antes de registrar este pagamento no crédito.",
        "erro"
      );
    }

    const dataRegistro = dataHora
      ? new Date(dataHora).toISOString()
      : new Date().toISOString();

    if (modoLancamentoDivida === "quitar") {
      pendenciasSelecionadas.forEach((item) => {
        registrarPagamento?.({
          pessoaId: item.pessoaId,
          sentido,
          descricao:
            descricao.trim() ||
            (sentido === "eu_devo"
              ? "Quitação de dívida"
              : "Quitação recebida"),
          deOnde: deOnde.trim(),
          formaPagamento,
          categoria: categoriaFinanceira,
          cartaoId:
            formaPagamento === "credito" ? cartaoId || null : null,
          integrarFinanceiro,
          valor: numero(item.valor),
          observacao: observacao.trim(),
          dataHora: dataRegistro,
        });
      });

      setPessoaAbertaId(pendenciasSelecionadas[0]?.pessoaId || "");
      avisar(
        pendenciasSelecionadas.length > 1
          ? `${pendenciasSelecionadas.length} dívidas quitadas.`
          : "Dívida quitada.",
        "sucesso"
      );
      fecharModal();
      return;
    }

    if (pessoasSelecionadas.length !== 1) {
      return avisar(
        "Para abater apenas uma parte, selecione uma pessoa por vez.",
        "erro"
      );
    }

    const item = pendenciasSelecionadas.find(
      (x) => x.pessoaId === pessoasSelecionadas[0]
    );
    if (!item) {
      return avisar("Esta pessoa não tem saldo pendente.", "erro");
    }

    const valor = numero(valorDireto);
    if (!(valor > 0)) {
      return avisar("Informe quanto será abatido agora.", "erro");
    }

    if (valor > item.valor + 0.01) {
      return avisar(
        `O máximo que pode ser abatido é ${brl(item.valor)}.`,
        "erro"
      );
    }

    registrarPagamento?.({
      pessoaId: item.pessoaId,
      sentido,
      descricao:
        descricao.trim() ||
        (sentido === "eu_devo"
          ? "Pagamento parcial de dívida"
          : "Pagamento parcial recebido"),
      deOnde: deOnde.trim(),
      formaPagamento,
      categoria: categoriaFinanceira,
      cartaoId:
        formaPagamento === "credito" ? cartaoId || null : null,
      integrarFinanceiro,
      valor,
      observacao: observacao.trim(),
      dataHora: dataRegistro,
    });

    setPessoaAbertaId(item.pessoaId);
    avisar(`Abatimento de ${brl(valor)} registrado.`, "sucesso");
    fecharModal();
  }

  function salvarLancamentoPrincipal(evento) {
    if (modoLancamentoDivida === "lancar") {
      return salvarDivida(evento);
    }

    return salvarQuitacaoOuAbatimento(evento);
  }

  function salvarAcerto(evento) {
    evento.preventDefault();
    const pendenteAtual = saldoPessoaPorSentido(pessoaId, sentido);
    const valor =
      modoLancamentoDivida === "quitar"
        ? pendenteAtual
        : numero(valorDireto);
    if (!pessoaId || !(valor > 0)) {
      return avisar("Informe a pessoa e o valor.", "erro");
    }

    if (
      integrarFinanceiro &&
      formaPagamento === "credito" &&
      !cartaoId
    ) {
      return avisar(
        cartoes.length
          ? "Escolha qual cartão foi usado."
          : "Cadastre um cartão antes de registrar este pagamento no crédito.",
        "erro"
      );
    }

    const pendente = saldoPessoaPorSentido(pessoaId, sentido);
    if (valor > pendente + 0.01) {
      return avisar(`O máximo pendente é ${brl(pendente)}.`, "erro");
    }

    registrarPagamento?.({
      pessoaId,
      sentido,
      descricao:
        descricao.trim() ||
        (sentido === "eu_devo" ? "Pagamento de dívida" : "Ressarcimento"),
      deOnde: deOnde.trim(),
      formaPagamento,
      categoria: categoriaFinanceira,
      cartaoId: formaPagamento === "credito" ? cartaoId || null : null,
      integrarFinanceiro,
      valor,
      observacao: observacao.trim(),
      dataHora: dataHora
        ? new Date(dataHora).toISOString()
        : new Date().toISOString(),
    });

    fecharModal();
  }

  function salvarEdicaoLancamento(evento) {
    evento.preventDefault();
    const original = lancamentos.find((x) => x.id === editandoLancamentoId);
    if (!original) return;

    const ehDivida = original.tipo === "divida";
    const pct = numero(percentuais[original.pessoaId] ?? original.porcentagem);
    const total = numero(valorTotal || original.valorTotal);
    const valor = ehDivida
      ? Number(((total * pct) / 100).toFixed(2))
      : numero(valorDireto);

    if (!(valor > 0)) return avisar("Digite um valor válido.", "erro");

    atualizarLancamentoQuemMeDeve?.(editandoLancamentoId, {
      pessoaId,
      sentido,
      descricao: descricao.trim(),
      deOnde: deOnde.trim(),
      formaPagamento,
      categoria: categoriaFinanceira,
      cartaoId: formaPagamento === "credito" ? cartaoId || null : null,
      valorTotal: ehDivida ? total : undefined,
      porcentagem: ehDivida ? pct : undefined,
      valor,
      minhaParteValor:
        ehDivida && String(minhaParteValor ?? "").trim() !== ""
          ? numero(minhaParteValor)
          : undefined,
      minhaPartePercentual:
        ehDivida &&
        String(minhaParteValor ?? "").trim() !== "" &&
        total > 0
          ? Number(((numero(minhaParteValor) / total) * 100).toFixed(2))
          : undefined,
      observacao: observacao.trim(),
      jurosTaxa: ehDivida ? numero(taxaJuros) : undefined,
      jurosUnidade: ehDivida ? unidadeJuros : undefined,
      dataHora: dataHora ? new Date(dataHora).toISOString() : undefined,
    });

    fecharModal();
  }

  function alternarAtivoLancamento(item) {
    if (!item || item.tipo !== "divida") return;

    atualizarLancamentoQuemMeDeve?.(item.id, {
      ativo: item.ativo === false,
    });

    avisar(
      item.ativo === false
        ? "Gasto reativado e incluído novamente nos cálculos."
        : "Gasto marcado como inativo e retirado dos cálculos.",
      "sucesso"
    );
  }

  function abrirPdfPessoa(id) {
    const agora = new Date();
    setPdfPessoaId(id);
    setPdfIncluirAtivos(true);
    setPdfIncluirInativos(false);
    setPdfMostrarFormaPagamento(true);
    setPdfMostrarVencimento(true);
    setPdfMostrarObservacoes(true);
    setPdfPeriodo(
      `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`
    );
    setPdfPronto(false);
    setModal("pdf-pessoa");
  }

  function slugArquivo(valor) {
    return String(valor || "pessoa")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "pessoa";
  }

  function montarPdfPessoa(id) {
    const pessoa = pessoas.find((p) => p.id === id);
    if (!pessoa) return null;

    if (!pdfIncluirAtivos && !pdfIncluirInativos && !pdfMostrarFormaPagamento && !pdfMostrarVencimento && !pdfMostrarObservacoes) {
      avisar("Selecione pelo menos uma informação para incluir no PDF.", "erro");
      return null;
    }

    const [anoPeriodo, mesPeriodo] = String(pdfPeriodo || "")
      .split("-")
      .map(Number);

    const periodoValido =
      Number.isFinite(anoPeriodo) &&
      Number.isFinite(mesPeriodo) &&
      anoPeriodo > 2000 &&
      mesPeriodo >= 1 &&
      mesPeriodo <= 12;

    const itensPessoa = lancamentos
      .filter((item) => item.pessoaId === id)
      .filter((item) => {
        if (!periodoValido) return true;
        const dt = new Date(item.dataHora || item.data);
        if (Number.isNaN(dt.getTime())) return false;
        return (
          dt.getFullYear() === anoPeriodo &&
          dt.getMonth() === mesPeriodo - 1
        );
      })
      .sort((a, b) => new Date(a.dataHora || 0) - new Date(b.dataHora || 0));

    const dividasAtivas = itensPessoa.filter(
      (item) => item.tipo === "divida" && item.ativo !== false
    );

    const dividasInativas = itensPessoa.filter(
      (item) => item.tipo === "divida" && item.ativo === false
    );

    const acertos = itensPessoa.filter((item) => item.tipo !== "divida");

    const soma = (lista, sentidoAlvo) =>
      lista
        .filter((item) => (item.sentido || "me_deve") === sentidoAlvo)
        .reduce((s, item) => s + numero(item.valor), 0);

    const recebido = soma(acertos, "me_deve");
    const pago = soma(acertos, "eu_devo");

    const totalAtivoMeDevem = soma(dividasAtivas, "me_deve");
    const totalAtivoEuDevo = soma(dividasAtivas, "eu_devo");

    const aReceber = Math.max(0, totalAtivoMeDevem - recebido);
    const aPagar = Math.max(0, totalAtivoEuDevo - pago);

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margem = 16;
    const largura = 178;
    let y = 18;

    const linha = (textoLinha, opcoes = {}) => {
      const { negrito = false, tamanho = 10, espaco = 6 } = opcoes;

      if (y > 278) {
        doc.addPage();
        y = 18;
      }

      doc.setFont("helvetica", negrito ? "bold" : "normal");
      doc.setFontSize(tamanho);

      const partes = doc.splitTextToSize(String(textoLinha || ""), largura);
      doc.text(partes, margem, y);
      y += Math.max(espaco, partes.length * 5);
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("RESUMO DE GASTOS", margem, y);
    y += 9;

    linha(`Pessoa: ${pessoa.nome}`, { negrito: true, tamanho: 11 });

    const periodoTexto = periodoValido
      ? new Date(anoPeriodo, mesPeriodo - 1, 1).toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
        })
      : "Todos os períodos";

    linha(`Período: ${periodoTexto}`, { espaco: 8 });

    const escreverGastos = (titulo, lista, inativo = false) => {
      if (!lista.length) return;

      linha(titulo, { negrito: true, tamanho: 12, espaco: 7 });

      lista.forEach((item) => {
        const sentidoTexto =
          item.sentido === "eu_devo" ? "Você deve" : "Te devem";

        linha(`${item.descricao || "Sem descrição"} — ${brl(item.valor)}`, {
          negrito: true,
          espaco: 5,
        });

        linha(
          `${sentidoTexto} · ${formaLabel(item.formaPagamento)}`,
          { espaco: 5 }
        );

        if (item.deOnde) {
          linha(`De onde: ${item.deOnde}`, { espaco: 5 });
        }

        if (item.dataHora) {
          linha(`Data: ${formatarDataHora(item.dataHora)}`, { espaco: 5 });
        }

        if (inativo) {
          linha("Status: INATIVO — não incluído no valor a pagar/receber.", {
            espaco: 5,
          });
        }

        if (pdfMostrarObservacoes && item.observacao) {
          linha(`Observação: ${item.observacao}`, { espaco: 5 });
        }

        y += 1;
      });

      y += 2;
    };

    if (pdfIncluirAtivos) {
      escreverGastos("GASTOS ATIVOS", dividasAtivas, false);
    }

    if (pdfIncluirInativos) {
      escreverGastos("GASTOS INATIVOS", dividasInativas, true);
    }

    if (acertos.length) {
      linha("PAGAMENTOS / ACERTOS", {
        negrito: true,
        tamanho: 12,
        espaco: 7,
      });

      acertos.forEach((item) => {
        const rotulo =
          item.sentido === "eu_devo" ? "Você pagou" : "Você recebeu";

        linha(`${item.descricao || rotulo} — ${brl(item.valor)}`, {
          negrito: true,
          espaco: 5,
        });

        linha(
          `${rotulo} · ${formaLabel(item.formaPagamento)}`,
          { espaco: 5 }
        );

        if (item.dataHora) {
          linha(`Data: ${formatarDataHora(item.dataHora)}`, { espaco: 5 });
        }

        if (pdfMostrarObservacoes && item.observacao) {
          linha(`Observação: ${item.observacao}`, { espaco: 5 });
        }

        y += 1;
      });

      y += 2;
    }

    linha("RESUMO", { negrito: true, tamanho: 12, espaco: 7 });

    linha(`Total ativo que te devem: ${brl(totalAtivoMeDevem)}`);
    linha(`Total já recebido: ${brl(recebido)}`);
    linha(`Valor a receber: ${brl(aReceber)}`, { negrito: true, espaco: 7 });

    linha(`Total ativo que você deve: ${brl(totalAtivoEuDevo)}`);
    linha(`Total já pago: ${brl(pago)}`);
    linha(`Valor a pagar: ${brl(aPagar)}`, { negrito: true, espaco: 8 });

    if (pdfMostrarFormaPagamento) {
      linha("FORMA DE PAGAMENTO", {
        negrito: true,
        tamanho: 12,
        espaco: 7,
      });

      linha(`Forma: ${formaLabel(pessoa.formaRecebimento || "pix")}`);

      if (pessoa.chavePagamento) {
        linha(`Chave: ${pessoa.chavePagamento}`);
      }

      y += 2;
    }

    if (pdfMostrarVencimento && pessoa.vencimento) {
      const dt = new Date(`${pessoa.vencimento}T12:00:00`);

      linha(
        `Vencimento: ${
          Number.isNaN(dt.getTime())
            ? pessoa.vencimento
            : dt.toLocaleDateString("pt-BR")
        }`,
        { negrito: true }
      );
    }

    const nomeArquivo = `gastos-${slugArquivo(pessoa.nome)}-${pdfPeriodo || "periodo"}.pdf`;
    return { doc, pessoa, nomeArquivo };
  }

  function gerarPdfPessoa(id = pdfPessoaId) {
    const resultado = montarPdfPessoa(id);
    if (!resultado) return avisar("Pessoa não encontrada.", "erro");
    resultado.doc.save(resultado.nomeArquivo);
    setPdfPronto(true);
    avisar("PDF gerado com sucesso.", "sucesso");
  }

  async function compartilharPdfPessoa(id = pdfPessoaId) {
    const resultado = montarPdfPessoa(id);
    if (!resultado) return avisar("Pessoa não encontrada.", "erro");

    const blob = resultado.doc.output("blob");
    const arquivo = new File([blob], resultado.nomeArquivo, {
      type: "application/pdf",
    });

    try {
      if (navigator.share && navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({
          title: `Resumo de gastos — ${resultado.pessoa.nome}`,
          text: `Resumo de gastos de ${resultado.pessoa.nome}`,
          files: [arquivo],
        });
        avisar("PDF compartilhado.", "sucesso");
      } else {
        resultado.doc.save(resultado.nomeArquivo);
        avisar("Compartilhamento direto indisponível. O PDF foi baixado.", "info");
      }
    } catch (erro) {
      if (erro?.name !== "AbortError") {
        resultado.doc.save(resultado.nomeArquivo);
        avisar("Não foi possível compartilhar diretamente. O PDF foi baixado.", "info");
      }
    }
  }

  function abrirAjudaSecao(titulo, texto) {
    setAjudaSecao({
      titulo: String(titulo || "Ajuda"),
      texto: String(texto || ""),
    });
  }

  function fecharAjudaSecao() {
    setAjudaSecao(null);
  }

  function BotaoAjudaSecao({ titulo, texto }) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          abrirAjudaSecao(titulo, texto);
        }}
        aria-label={`Ajuda: ${titulo}`}
        title={`Ajuda: ${titulo}`}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          boxSizing: "border-box",
          width: 32,
          minWidth: 32,
          maxWidth: 32,
          height: 32,
          minHeight: 32,
          maxHeight: 32,
          flex: "0 0 32px",
          padding: 0,
          margin: 0,
          borderRadius: 9999,
          border: "1px solid rgba(143,163,255,.42)",
          background: "rgba(143,163,255,.12)",
          color: "#dbe3ff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          fontWeight: 900,
          fontSize: 15,
          cursor: "pointer",
          userSelect: "none",
          boxShadow: "0 0 0 1px rgba(255,255,255,.02) inset",
        }}
      >
        ?
      </button>
    );
  }

  function abrirConfirmacao({
    titulo,
    mensagem,
    textoAcao = "Confirmar",
    tipo = "perigo",
    aoConfirmar,
  }) {
    setConfirmacao({
      titulo,
      mensagem,
      textoAcao,
      tipo,
      aoConfirmar,
    });
  }

  function fecharConfirmacao() {
    setConfirmacao(null);
  }

  function executarConfirmacao() {
    const acao = confirmacao?.aoConfirmar;
    setConfirmacao(null);

    if (typeof acao === "function") {
      acao();
    }
  }

  function apagarPessoa(id) {
    const pessoa = pessoas.find((item) => item.id === id);

    abrirConfirmacao({
      titulo: "🗑️ Apagar pessoa?",
      mensagem: `Você vai apagar ${
        pessoa?.nome || "esta pessoa"
      } e os lançamentos ligados a ela.`,
      textoAcao: "Apagar pessoa",
      aoConfirmar: () => {
        removerPessoaQuemMeDeve?.(id);
        if (pessoaAbertaId === id) setPessoaAbertaId("");
        avisar("Pessoa apagada.", "sucesso");
      },
    });
  }

  function apagarLancamento(id) {
    abrirConfirmacao({
      titulo: "🗑️ Apagar lançamento?",
      mensagem:
        "Este lançamento será removido de Acertos. Esta ação não pode ser desfeita.",
      textoAcao: "Apagar lançamento",
      aoConfirmar: () => {
        removerLancamentoQuemMeDeve?.(id);
        avisar("Lançamento apagado.", "sucesso");
      },
    });
  }

  function aplicarGrupo(grupo) {
    const idsGrupo = Array.isArray(grupo?.pessoaIds)
      ? grupo.pessoaIds
      : [];

    const incluiEu = idsGrupo.includes(EU_ID);
    const idsValidos = idsGrupo.filter(
      (id) =>
        id !== EU_ID &&
        pessoas.some((pessoa) => pessoa.id === id)
    );

    if (!idsValidos.length && !incluiEu) {
      return avisar(
        "Este grupo não tem participantes disponíveis.",
        "erro"
      );
    }

    const usarEu = modoLancamentoDivida === "lancar" && incluiEu;
    setEuSelecionado(usarEu);
    setPessoasSelecionadas(idsValidos);

    if (modoLancamentoDivida === "lancar") {
      recalcularDivisaoIgual(idsValidos, usarEu);
    } else {
      setPercentuais({});
      setMinhaParteValor("");
      setMinhaPartePercentual("");
    }

    avisar(`Grupo ${grupo.nome} selecionado.`, "sucesso");
  }

  function alternarPessoaGrupo(id) {
    setNovoGrupoPessoaIds((atuais) =>
      atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]
    );
  }

  function abrirEdicaoGrupo(grupo) {
    if (!grupo?.id) return;

    setEditandoGrupoId(grupo.id);
    setNovoGrupoNome(grupo.nome || "");
    setNovoGrupoPessoaIds(
      Array.isArray(grupo.pessoaIds) ? [...grupo.pessoaIds] : []
    );
    setSecaoGrupoAberta(true);
    setPainelParticipantesLancamento("grupos");
  }

  function cancelarEdicaoGrupo() {
    setEditandoGrupoId("");
    setNovoGrupoNome("");
    setNovoGrupoPessoaIds([]);
  }

  function apagarGrupoFixo(grupo) {
    if (!grupo?.id) return;

    abrirConfirmacao({
      titulo: "🗑️ Apagar grupo?",
      mensagem: `O grupo "${
        grupo.nome || "Sem nome"
      }" será apagado. As dívidas já lançadas continuam salvas.`,
      textoAcao: "Apagar grupo",
      aoConfirmar: () => {
        removerGrupoQuemMeDeve?.(grupo.id);

        if (editandoGrupoId === grupo.id) {
          cancelarEdicaoGrupo();
        }

        avisar("Grupo apagado.", "sucesso");
      },
    });
  }

  function salvarGrupoFixo() {
    const nome = novoGrupoNome.trim();

    if (!nome) {
      return avisar("Digite um nome para o grupo.", "erro");
    }

    if (!novoGrupoPessoaIds.length) {
      return avisar(
        "Selecione pelo menos um participante para o grupo.",
        "erro"
      );
    }

    // O contexto atual possui criar e apagar grupo.
    // Para editar com segurança, recriamos o grupo com os novos dados.
    if (editandoGrupoId) {
      const grupoAntigo = grupos.find(
        (grupo) => grupo.id === editandoGrupoId
      );

      removerGrupoQuemMeDeve?.(editandoGrupoId);

      const grupoAtualizado = adicionarGrupoQuemMeDeve?.({
        nome,
        pessoaIds: [...novoGrupoPessoaIds],
      });

      if (grupoAtualizado?.id) {
        setEditandoGrupoId("");
        setNovoGrupoNome("");
        setNovoGrupoPessoaIds([]);
        setSecaoGrupoAberta(false);
        aplicarGrupo(grupoAtualizado);
        avisar(
          `Grupo ${nome} atualizado.`,
          "sucesso"
        );
        return;
      }

      // Se por algum motivo a recriação falhar, tenta devolver o grupo antigo.
      if (grupoAntigo) {
        adicionarGrupoQuemMeDeve?.({
          nome: grupoAntigo.nome,
          pessoaIds: Array.isArray(grupoAntigo.pessoaIds)
            ? grupoAntigo.pessoaIds
            : [],
        });
      }

      return avisar(
        "Não foi possível atualizar o grupo.",
        "erro"
      );
    }

    const grupo = adicionarGrupoQuemMeDeve?.({
      nome,
      pessoaIds: [...novoGrupoPessoaIds],
    });

    if (grupo?.id) {
      setNovoGrupoNome("");
      setNovoGrupoPessoaIds([]);
      setSecaoGrupoAberta(false);
      aplicarGrupo(grupo);
      avisar(`Grupo ${nome} criado.`, "sucesso");
    }
  }

  // =============================
  // FOTO / OCR, baseado na página Transações.
  // =============================

  function converterValorBRL(valor) {
    const limpo = String(valor || "")
      .replace(/\s/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const n = Number(limpo);
    return Number.isFinite(n) ? n : 0;
  }

  function classificarTituloNotificacao(linha) {
    const t = normalizeText(linha);
    if (/transferencia\s+recebida|pix\s+recebido|pagamento\s+recebido/.test(t)) {
      return { tipo: "recebido", formaPagamento: /pix/.test(t) ? "pix" : "outros" };
    }
    if (/compra\s+no\s+debito\s+aprovad[ao]|compra\s+no\s+debito\s+realizad[ao]/.test(t)) {
      return { tipo: "gasto", formaPagamento: "debito" };
    }
    if (/compra\s+no\s+credito\s+aprovad[ao]|compra\s+no\s+credito\s+realizad[ao]/.test(t)) {
      return { tipo: "gasto", formaPagamento: "credito" };
    }
    if (/pagamento\s+com\s+nupay\s+aprovad[ao]|pagamento\s+aprovad[ao]/.test(t)) {
      return { tipo: "gasto", formaPagamento: "credito" };
    }
    return null;
  }

  function limparDescricaoNotificacao(bloco, valorEncontrado) {
    return String(bloco || "")
      .replace(valorEncontrado, " ")
      .replace(/\b(?:compra\s+no\s+(?:cr[eé]dito|d[eé]bito)\s+aprovad[ao]|pagamento\s+com\s+nupay\s+aprovad[ao]|pagamento\s+aprovad[ao]|transfer[eê]ncia\s+recebida|pix\s+recebido)\b/gi, " ")
      .replace(/\b(?:aprovad[ao]|recebid[ao]|voc[eê]\s+recebeu)\b/gi, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s:,.-]+|[\s:,.-]+$/g, "")
      .trim() || "Movimentação";
  }

  function pessoasMencionadas(texto) {
    const normal = normalizeText(texto);
    return pessoas
      .filter((p) => {
        const nome = normalizeText(p.nome);
        return nome.length >= 2 && normal.includes(nome);
      })
      .map((p) => p.id);
  }

  function extrairDadosTexto(texto, origem = "voz") {
    const original = String(texto || "").trim();
    const normal = normalizeText(original);

    const valorMatch =
      normal.match(/r\$\s*(\d+(?:[.,]\d{1,2})?)/i) ||
      normal.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:reais?|real)\b/i) ||
      normal.match(/\b(\d+(?:[.,]\d{1,2})?)\b/);

    let forma = "outros";
    if (normal.includes("pix") || normal.includes("pics")) forma = "pix";
    else if (normal.includes("debito")) forma = "debito";
    else if (normal.includes("credito") || normal.includes("cartao")) forma = "credito";
    else if (normal.includes("dinheiro")) forma = "dinheiro";

    const sentidoDetectado =
      /\beu\s+devo\b|\bdevo\s+(?:para|a)\b|\bficou\s+para\s+mim\b/.test(normal)
        ? "eu_devo"
        : "me_deve";

    const ids = pessoasMencionadas(original);

    let desc = original
      .replace(/r\$\s*\d+(?:[.,]\d{1,2})?/gi, " ")
      .replace(/\b\d+(?:[.,]\d{1,2})?\s*(?:reais?|real)\b/gi, " ")
      .replace(/\b(?:pix|pics|debito|débito|credito|crédito|cartao|cartão|dinheiro)\b/gi, " ")
      .replace(/\b(?:eu devo|me deve|me devem|devo para|devo a)\b/gi, " ");

    pessoas.forEach((p) => {
      const esc = String(p.nome || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (esc) desc = desc.replace(new RegExp(esc, "gi"), " ");
    });

    desc = desc.replace(/\s{2,}/g, " ").replace(/^[,;: -]+|[,;: -]+$/g, "").trim();

    return {
      id: idLocal(),
      origem,
      textoOriginal: original,
      valor: valorMatch?.[1] ? String(valorMatch[1]).replace(",", ".") : "",
      descricao: desc || "Despesa dividida",
      formaPagamento: forma,
      sentido: sentidoDetectado,
      pessoas: ids,
    };
  }

  function encontrarGrupoFalado(texto) {
    const normal = normalizeText(texto);
    return grupos.find((grupo) => {
      const nome = normalizeText(grupo.nome);
      return (
        nome &&
        (
          normal.includes(`grupo ${nome}`) ||
          normal.includes(`grupo de ${nome}`)
        )
      );
    }) || null;
  }

  function extrairValorDepoisDoNome(texto, nome) {
    const alvo = normalizeText(nome);
    const normal = normalizeText(texto);
    const esc = alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const pct = normal.match(
      new RegExp(
        `(?:^|[ ,;])${esc}\\s+(\\d+(?:[.,]\\d{1,2})?)\\s*(?:%|por cento)`,
        "i"
      )
    );
    if (pct?.[1]) {
      return {
        tipo: "percentual",
        valor: numero(pct[1]),
      };
    }

    const dinheiro = normal.match(
      new RegExp(
        `(?:^|[ ,;])${esc}\\s+(?:r\\$\\s*)?(\\d+(?:[.,]\\d{1,2})?)\\s*(?:reais?|real)?`,
        "i"
      )
    );
    if (dinheiro?.[1]) {
      return {
        tipo: "valor",
        valor: numero(dinheiro[1]),
      };
    }

    return null;
  }

  function extrairMinhaParteFalando(texto) {
    const normal = normalizeText(texto);

    const pct =
      normal.match(
        /(?:minha parte|eu fico com|para mim|eu)\s+(?:e\s+)?(\d+(?:[.,]\d{1,2})?)\s*(?:%|por cento)/i
      );

    if (pct?.[1]) {
      return {
        selecionado: true,
        tipo: "percentual",
        valor: numero(pct[1]),
      };
    }

    const dinheiro =
      normal.match(
        /(?:minha parte|eu fico com|para mim|eu)\s+(?:e\s+)?(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais?|real)?/i
      );

    if (dinheiro?.[1]) {
      return {
        selecionado: true,
        tipo: "valor",
        valor: numero(dinheiro[1]),
      };
    }

    if (
      /\bcomigo\b|\beu participo\b|\bme inclui\b|\bincluir eu\b/.test(
        normal
      )
    ) {
      return {
        selecionado: true,
        tipo: "automatico",
        valor: 0,
      };
    }

    return {
      selecionado: false,
      tipo: "",
      valor: 0,
    };
  }

  function extrairDadosCompletosDaVoz(texto) {
    const basico = extrairDadosTexto(texto, "voz");
    const original = String(texto || "").trim();
    const normal = normalizeText(original);
    const total = numero(basico.valor);

    let categoria = "Burrice";
    if (normal.includes("essencial")) categoria = "Essencial";
    else if (normal.includes("lazer")) categoria = "Lazer";
    else if (
      normal.includes("investido") ||
      normal.includes("investimento")
    ) {
      categoria = "Investido";
    } else if (
      normal.includes("burrice") ||
      normal.includes("besteira") ||
      normal.includes("idiotice")
    ) {
      categoria = "Burrice";
    }

    let integrar = true;
    if (
      normal.includes("so em acertos") ||
      normal.includes("somente em acertos") ||
      normal.includes("nao mandar para financas") ||
      normal.includes("nao enviar para financas") ||
      normal.includes("sem historico")
    ) {
      integrar = false;
    } else if (
      normal.includes("mandar para financas") ||
      normal.includes("enviar para financas") ||
      normal.includes("vai para financas") ||
      normal.includes("historico")
    ) {
      integrar = true;
    }

    let cartaoEncontrado = "";
    if (basico.formaPagamento === "credito") {
      const hit = cartoes.find((cartao) => {
        const nome = normalizeText(cartao.nome);
        if (!nome) return false;
        return (
          normal.includes(nome) ||
          nome
            .split(/\s+/)
            .filter((p) => p.length >= 3)
            .some((p) => normal.includes(p))
        );
      });
      cartaoEncontrado = hit?.id || "";
    }

    const jurosMatch =
      normal.match(
        /juros?\s+(?:de\s+)?(\d+(?:[.,]\d{1,2})?)\s*(?:%|por cento)(?:\s+(?:por|ao|a cada)\s+(hora|dia|mes|mês|ano))?/i
      );

    let unidade = "mes";
    const unidadeFal = normalizeText(jurosMatch?.[2] || "");
    if (unidadeFal.includes("hora")) unidade = "hora";
    else if (unidadeFal.includes("dia")) unidade = "dia";
    else if (unidadeFal.includes("ano")) unidade = "ano";

    const deOndeMatch = original.match(
      /(?:de onde|local|lugar)\s+(.+?)(?=\s+(?:pix|debito|débito|credito|crédito|dinheiro|categoria|juros|mandar|enviar|minha parte|eu fico|grupo)\b|[,;]|$)/i
    );

    const grupo = encontrarGrupoFalado(original);
    let ids = grupo
      ? (grupo.pessoaIds || []).filter((id) => id !== EU_ID)
      : pessoasMencionadas(original);

    ids = [...new Set(ids)].filter((id) =>
      pessoas.some((p) => p.id === id)
    );

    let incluiEu = grupo
      ? (grupo.pessoaIds || []).includes(EU_ID)
      : false;

    const minhaParte = extrairMinhaParteFalando(original);
    if (minhaParte.selecionado) incluiEu = true;

    const mapaPercentuais = {};
    let achouDivisaoFalando = false;

    ids.forEach((id) => {
      const pessoa = pessoas.find((p) => p.id === id);
      if (!pessoa) return;

      const achado = extrairValorDepoisDoNome(original, pessoa.nome);
      if (!achado) return;

      achouDivisaoFalando = true;

      if (achado.tipo === "percentual") {
        mapaPercentuais[id] = Number(achado.valor.toFixed(2));
      } else if (total > 0) {
        mapaPercentuais[id] = Number(
          ((achado.valor / total) * 100).toFixed(2)
        );
      }
    });

    let minhaParteEmReais = "";
    let meuPercentualFalado = null;

    if (incluiEu && minhaParte.tipo === "valor") {
      minhaParteEmReais = String(
        Number(minhaParte.valor.toFixed(2))
      );
      if (total > 0) {
        meuPercentualFalado = Number(
          ((minhaParte.valor / total) * 100).toFixed(2)
        );
      }
      achouDivisaoFalando = true;
    } else if (
      incluiEu &&
      minhaParte.tipo === "percentual" &&
      total > 0
    ) {
      meuPercentualFalado = Number(
        minhaParte.valor.toFixed(2)
      );
      minhaParteEmReais = String(
        Number(
          ((total * minhaParte.valor) / 100).toFixed(2)
        )
      );
      achouDivisaoFalando = true;
    }

    // Se citou pessoas/grupo, mas não falou a parte de cada um,
    // divide igualmente entre todos os participantes citados.
    if (
      (ids.length || incluiEu) &&
      !achouDivisaoFalando
    ) {
      const quantidade = ids.length + (incluiEu ? 1 : 0);
      const igual = quantidade
        ? Number((100 / quantidade).toFixed(2))
        : 0;

      ids.forEach((id) => {
        mapaPercentuais[id] = igual;
      });

      if (incluiEu && total > 0) {
        const somaOutros = Object.values(mapaPercentuais).reduce(
          (s, v) => s + numero(v),
          0
        );
        const meuPct = Math.max(0, 100 - somaOutros);
        minhaParteEmReais = String(
          Number(((total * meuPct) / 100).toFixed(2))
        );
      }
    } else if (ids.length && achouDivisaoFalando) {
      // Se só algumas pessoas tiveram valor explícito,
      // não inventa o restante. A tela mostra o que falta.
      ids.forEach((id) => {
        if (mapaPercentuais[id] == null) {
          mapaPercentuais[id] = 0;
        }
      });
    }

    return {
      ...basico,
      categoria,
      integrarFinanceiro: integrar,
      cartaoId: cartaoEncontrado,
      jurosTaxa: jurosMatch?.[1]
        ? String(jurosMatch[1]).replace(",", ".")
        : "",
      jurosUnidade: unidade,
      deOnde: deOndeMatch?.[1]?.trim() || "",
      grupo,
      pessoas: ids,
      incluiEu,
      percentuais: mapaPercentuais,
      minhaParteValor: minhaParteEmReais,
      meuPercentualFalado,
    };
  }

  function aplicarVozCompleta(texto) {
    const dadosVoz = extrairDadosCompletosDaVoz(texto);

    setOrigemImportacao("voz");
    setDescricao(dadosVoz.descricao || "");
    setValorTotal(dadosVoz.valor || "");
    setFormaPagamento(dadosVoz.formaPagamento || "outros");
    setSentido(dadosVoz.sentido || "me_deve");
    setCategoriaFinanceira(dadosVoz.categoria || "Burrice");
    setIntegrarFinanceiro(dadosVoz.integrarFinanceiro !== false);
    setCartaoId(dadosVoz.cartaoId || "");
    setTaxaJuros(dadosVoz.jurosTaxa || "");
    setUnidadeJuros(dadosVoz.jurosUnidade || "mes");
    setDeOnde(dadosVoz.deOnde || "");

    if (dadosVoz.pessoas?.length) {
      setPessoasSelecionadas(dadosVoz.pessoas);
    }

    setEuSelecionado(!!dadosVoz.incluiEu);

    if (
      dadosVoz.percentuais &&
      Object.keys(dadosVoz.percentuais).length
    ) {
      setPercentuais(dadosVoz.percentuais);
      setMinhaParteValor(dadosVoz.minhaParteValor || "");
      setMinhaPartePercentual(
        dadosVoz.meuPercentualFalado != null &&
        Number.isFinite(Number(dadosVoz.meuPercentualFalado))
          ? String(Number(dadosVoz.meuPercentualFalado))
          : ""
      );
    } else if (dadosVoz.pessoas?.length || dadosVoz.incluiEu) {
      recalcularDivisaoIgual(
        dadosVoz.pessoas || [],
        !!dadosVoz.incluiEu
      );
    }

    setTextoVoz(texto);
    avisar(
      "Áudio preenchido. Confira os campos e toque em Salvar.",
      "sucesso"
    );
  }


  function extrairItensDaFoto(textoOcr) {
    const linhas = String(textoOcr || "")
      .split(/\r?\n/)
      .map((linha) => linha.replace(/\s{2,}/g, " ").trim())
      .filter(Boolean);

    const encontrados = [];

    for (let i = 0; i < linhas.length; i += 1) {
      const classificacao = classificarTituloNotificacao(linhas[i]);
      if (!classificacao) continue;

      const partes = [linhas[i]];
      for (let j = i + 1; j < Math.min(linhas.length, i + 4); j += 1) {
        if (classificarTituloNotificacao(linhas[j])) break;
        partes.push(linhas[j]);
        if (/(?:R\$|RS|BRL)\s*\d/i.test(linhas[j])) break;
      }

      const bloco = partes.join(" ");
      const achado = bloco.match(/(?:R\$|RS|BRL)\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2,3})|\d+(?:[.,]\d{2,3})?)/i);
      if (!achado) continue;

      const valor = converterValorBRL(achado[1]);
      if (!(valor > 0)) continue;

      encontrados.push({
        id: idLocal(),
        origem: "foto",
        textoOriginal: bloco,
        valor: valor.toFixed(2),
        descricao: limparDescricaoNotificacao(bloco, achado[0]),
        formaPagamento: classificacao.formaPagamento,
        sentido: classificacao.tipo === "recebido" ? "me_deve" : "me_deve",
        pessoas: pessoasMencionadas(bloco),
      });
    }

    // Se não achou blocos formais, tenta usar o texto inteiro como um rascunho.
    if (!encontrados.length) {
      const simples = extrairDadosTexto(textoOcr, "foto");
      if (simples.valor) encontrados.push(simples);
    }

    return encontrados;
  }

  async function lerFoto(evento) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      return avisar("Escolha uma foto ou captura de tela.", "erro");
    }

    setLendoFoto(true);
    setProgressoFoto(0);
    let worker;

    try {
      worker = await createWorker("por", 1, {
        logger: (info) => {
          if (info.status === "recognizing text") {
            setProgressoFoto(Math.round((info.progress || 0) * 100));
          }
        },
      });

      const resultado = await worker.recognize(arquivo);
      const novos = extrairItensDaFoto(resultado.data?.text || "");

      if (!novos.length) {
        return avisar("Não encontrei um valor claro nessa foto.", "erro");
      }

      setRascunhosImportados((atuais) => [...atuais, ...novos]);
      avisar(`${novos.length} rascunho(s) criado(s) pela foto.`, "sucesso");
    } catch (erro) {
      console.error(erro);
      avisar("Não consegui ler a foto.", "erro");
    } finally {
      if (worker) await worker.terminate();
      setLendoFoto(false);
      setProgressoFoto(0);
    }
  }

  function aplicarRascunho(rascunho) {
    setOrigemImportacao(rascunho.origem || "manual");
    setDescricao(rascunho.descricao || "");
    setFormaPagamento(rascunho.formaPagamento || "outros");

    // Acerto usa valorDireto e mantém o sentido escolhido no cartão:
    // "Pessoa me pagou" ou "Eu paguei".
    if (modal === "acerto") {
      setValorDireto(rascunho.valor || "");
      setSecaoImportacaoAberta(false);
      avisar("Rascunho aplicado. Confira o valor antes de registrar.", "sucesso");
      return;
    }

    setValorTotal(rascunho.valor || "");
    setSentido(rascunho.sentido || "me_deve");
    setSecaoDetalhesAberta(true);

    if (rascunho.pessoas?.length) {
      setPessoasSelecionadas(rascunho.pessoas);
      recalcularIgual(rascunho.pessoas);
      setSecaoPessoasAberta(true);
    }

    setSecaoImportacaoAberta(false);
    avisar("Rascunho aplicado. Confira as pessoas e os valores.", "sucesso");
  }

  // =============================
  // VOZ
  // =============================
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSuportaVoz(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => {
      setGravando(true);
      bufferVozRef.current = "";
      setTextoVoz("");
    };

    rec.onresult = (evento) => {
      let texto = "";
      for (let i = 0; i < evento.results.length; i += 1) {
        texto += `${evento.results[i][0]?.transcript || ""} `;
      }
      bufferVozRef.current = texto.trim();
      setTextoVoz(bufferVozRef.current);

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        try {
          rec.stop();
        } catch {}
      }, 3000);
    };

    rec.onerror = () => {
      setGravando(false);
      avisar("Não consegui usar o microfone. Verifique a permissão.", "erro");
    };

    rec.onend = () => {
      setGravando(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      const texto = String(bufferVozRef.current || "").trim();
      if (!texto) return;

      aplicarVozCompleta(texto);
    };

    recognitionRef.current = rec;

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try {
        rec.abort();
      } catch {}
    };
  }, [pessoas]);

  async function iniciarVoz() {
    if (!suportaVoz || !recognitionRef.current) {
      return avisar("Seu navegador não suporta voz. Use o Chrome.", "erro");
    }

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
      bufferVozRef.current = "";
      setTextoVoz("");
      recognitionRef.current.start();
    } catch {
      avisar("Microfone bloqueado. Libere a permissão.", "erro");
    }
  }

  function pararVoz() {
    try {
      recognitionRef.current?.stop();
    } catch {}
  }

  function revelarCarta(pessoaId) {
    const jaEstaAberta = pessoaAbertaId === pessoaId;

    if (jaEstaAberta) {
      setPessoaAbertaId("");
      setHistoricoDetalhadoPessoaId("");
      return;
    }

    setPessoaAbertaId(pessoaId);
    setHistoricoDetalhadoPessoaId("");
    setPessoaRevelandoId(pessoaId);

    requestAnimationFrame(() => {
      const carrossel = carrosselRef.current;
      const carta = carrossel?.querySelector(
        `[data-pessoa-id="${pessoaId}"]`
      );

      if (!carrossel || !carta) return;

      carrossel.scrollTo({
        left: carta.offsetLeft - (carrossel.clientWidth - carta.clientWidth) / 2,
        behavior: "smooth",
      });
    });

    window.setTimeout(() => setPessoaRevelandoId(""), 1150);
  }

  const saldoRealLiquido =
    resumo.saldoRealParaReceber - resumo.saldoRealParaPagar;
  const totalDoGrafico = Math.max(
    1,
    resumo.saldoRealParaReceber + resumo.saldoRealParaPagar
  );
  const percentualReceber =
    (resumo.saldoRealParaReceber / totalDoGrafico) * 100;
  const percentualPagar =
    (resumo.saldoRealParaPagar / totalDoGrafico) * 100;
  const maioresPendencias = [...extratos]
    .filter((e) => e.saldoRealMeDevem > 0 || e.saldoRealEuDevo > 0)
    .sort(
      (a, b) =>
        Math.max(b.saldoRealMeDevem, b.saldoRealEuDevo) -
        Math.max(a.saldoRealMeDevem, a.saldoRealEuDevo)
    )
    .slice(0, 4);

  function contaDeveSerArquivada(extrato) {
    const diasConfigurados = Number(
      extrato.pessoa.arquivarQuitadaDias ?? 14
    );
    const diasParaArquivar = [0, 14, 30, 60, 90].includes(
      diasConfigurados
    )
      ? diasConfigurados
      : 14;

    if (diasParaArquivar === 0) return false;
    if (extrato.saldoRealMeDevem > 0.01 || extrato.saldoRealEuDevo > 0.01) {
      return false;
    }

    const dataUltimoMovimento = new Date(
      extrato.ultimoMovimento?.dataHora || ""
    );

    if (Number.isNaN(dataUltimoMovimento.getTime())) return false;

    const diasQuitada =
      (agoraJuros.getTime() - dataUltimoMovimento.getTime()) /
      (1000 * 60 * 60 * 24);

    return diasQuitada >= diasParaArquivar;
  }

  const contasArquivadas = extratos.filter(contaDeveSerArquivada);
  const extratosVisiveis = mostrarQuitadasArquivadas
    ? extratos
    : extratos.filter((extrato) => !contaDeveSerArquivada(extrato));

  return (
    <section className="devedores-page">
      <style>{`
        body.acertos-nova-divida-aberta .bottom-nav {
          display: none !important;
        }
      `}</style>
      <header className="devedores-cabecalho">
        <div>
          <h2>👥 Dívidas entre pessoas</h2>
          <p>Veja quem te deve, quem você deve e divida uma despesa entre várias pessoas.</p>
        </div>

        <div className="devedores-top-actions">
          <button
            type="button"
            className="devedores-help"
            onClick={() => setMostrarAjuda(true)}
            aria-label="Como funciona"
            title="Como funciona"
          >
            ?
          </button>
          <button type="button" className="primary-btn" onClick={() => abrirNovaDivida()}>
            ＋ Lançar
          </button>
        </div>
      </header>

      {mensagem ? (
        <div
          className={`devedores-flash devedores-flash-${tipoMensagem}`}
          role="status"
          aria-live="polite"
        >
          <span className="devedores-flash-icone">
            {tipoMensagem === "success" ? "✓" : tipoMensagem === "error" ? "!" : "i"}
          </span>
          <span>{mensagem}</span>
        </div>
      ) : null}

      <section className="devedores-resumo" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10 }}>
          <div>
            <small>Tenho para receber</small>
            <strong>{brl(resumo.saldoRealParaReceber)}</strong>
            <span className="muted small">Juros: {brl(resumo.jurosParaReceber)}</span>
          </div>
          <div>
            <small>Tenho para pagar</small>
            <strong>{brl(resumo.saldoRealParaPagar)}</strong>
            <span className="muted small">Juros: {brl(resumo.jurosParaPagar)}</span>
          </div>
          <div>
            <small>Saldo real líquido</small>
            <strong style={{ color: saldoRealLiquido >= 0 ? "#5eea9b" : "#ff9a9a" }}>
              {saldoRealLiquido >= 0 ? "+ " : "− "}{brl(Math.abs(saldoRealLiquido))}
            </strong>
            <span className="muted small">Receber menos pagar</span>
          </div>
          <div>
            <small>Pessoas com pendência</small>
            <strong>{resumo.pessoasComPendencia}</strong>
            <span className="muted small">Contas abertas</span>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <strong> Comparação do saldo real</strong>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, flexWrap: "wrap" }}>
            <div
              role="img"
              aria-label={`Gráfico: ${percentualReceber.toFixed(0)}% para receber e ${percentualPagar.toFixed(0)}% para pagar`}
              style={{
                width: 142,
                height: 142,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: `conic-gradient(#42ca8a 0 ${percentualReceber}%, #ee6875 ${percentualReceber}% 100%)`,
                boxShadow: "0 10px 28px rgba(0,0,0,.28)",
              }}
            >
              <div style={{ width: 104, height: 104, borderRadius: "50%", display: "grid", placeItems: "center", alignContent: "center", textAlign: "center", padding: 8, background: "#0b1c37", border: "1px solid rgba(255,255,255,.12)" }}>
                <small style={{ margin: 0 }}>Saldo líquido</small>
                <strong style={{ fontSize: 16, color: saldoRealLiquido >= 0 ? "#5eea9b" : "#ff9a9a" }}>
                  {saldoRealLiquido >= 0 ? "+" : "−"}{brl(Math.abs(saldoRealLiquido))}
                </strong>
              </div>
            </div>

            <div style={{ display: "grid", gap: 9, minWidth: 180 }}>
              <div>
                <small style={{ margin: 0, color: "#5eea9b" }}>● A receber · {percentualReceber.toFixed(0)}%</small>
                <strong style={{ fontSize: 17 }}>{brl(resumo.saldoRealParaReceber)}</strong>
              </div>
              <div>
                <small style={{ margin: 0, color: "#ff9a9a" }}>● A pagar · {percentualPagar.toFixed(0)}%</small>
                <strong style={{ fontSize: 17 }}>{brl(resumo.saldoRealParaPagar)}</strong>
              </div>
              <small className="muted" style={{ margin: 0 }}>
                {saldoRealLiquido >= 0
                  ? "Seu saldo entre pessoas está positivo."
                  : "Seu saldo entre pessoas está negativo."}
              </small>
            </div>
          </div>
        </div>

        {maioresPendencias.length ? (
          <div style={{ display: "grid", gap: 7 }}>
            <strong>📈 Maiores pendências</strong>
            {maioresPendencias.map((extrato) => {
              const valor = Math.max(extrato.saldoRealMeDevem, extrato.saldoRealEuDevo);
              const maiorValor = Math.max(
                1,
                ...maioresPendencias.map((item) => Math.max(item.saldoRealMeDevem, item.saldoRealEuDevo))
              );
              const aReceber = extrato.saldoRealMeDevem >= extrato.saldoRealEuDevo;

              return (
                <div key={extrato.pessoa.id} style={{ display: "grid", gap: 4 }}>
                  <div className="small" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>{extrato.pessoa.nome} · {((valor / totalDoGrafico) * 100).toFixed(0)}% do total</span>
                    <strong style={{ color: aReceber ? "#5eea9b" : "#ff9a9a" }}>
                      {aReceber ? "A receber " : "A pagar "}{brl(valor)}
                    </strong>
                  </div>
                  <div style={{ height: 7, overflow: "hidden", borderRadius: 99, background: "rgba(255,255,255,.1)" }}>
                    <span style={{ display: "block", height: "100%", width: `${(valor / maiorValor) * 100}%`, background: aReceber ? "#42ca8a" : "#ee6875" }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {contasArquivadas.length ? (
        <button
          type="button"
          className="toggle-btn"
          style={{ width: "100%", margin: "0 0 12px" }}
          onClick={() => setMostrarQuitadasArquivadas((atual) => !atual)}
        >
          {mostrarQuitadasArquivadas
            ? "Ocultar contas quitadas"
            : `🗂️ Ver ${contasArquivadas.length} conta(s) quitada(s)`}
        </button>
      ) : null}

      {extratosVisiveis.length === 0 ? (
        <div className="devedores-vazio">
          <strong>{extratos.length ? "As contas quitadas estão ocultas." : "Nenhuma pessoa ainda."}</strong>
          <span>
            {extratos.length
              ? "Use o botão acima para ver as contas arquivadas."
              : "Crie a pessoa dentro do próprio lançamento de dívida."}
          </span>
        </div>
      ) : null}

      <div className="devedores-carrossel-viewport">
        <div className="devedores-lista devedores-carrossel" ref={carrosselRef}>
        {extratosVisiveis.map((extrato, cardIndex) => {
          const { pessoa, itens, saldoMeDevem, saldoEuDevo, percentualAcertado, status, ultimoMovimento } = extrato;
          const aberto = pessoaAbertaId === pessoa.id;
          const accent = pessoa.corCarta || "#3b82f6";

          return (
            <article
              key={pessoa.id}
              className={`devedor-reveal-card ${aberto ? "aberto" : ""} ${pessoaRevelandoId === pessoa.id ? "devedor-carta-revelando" : ""}`}
              data-pessoa-id={pessoa.id}
              style={{ "--devedor-accent": accent }}
            >
              <button
                type="button"
                className="devedor-reveal-frente"
                onClick={() => revelarCarta(pessoa.id)}
              >
                <span className="devedor-card-numero">
                  {String(cardIndex + 1).padStart(2, "0")}
                </span>
                <span className="devedor-card-brilho" aria-hidden="true" />

                <div className="devedor-identidade">
                  {pessoa.fotoBase64 ? (
                    <img
                      className="devedor-avatar devedor-avatar-foto"
                      src={pessoa.fotoBase64}
                      alt={pessoa.nome}
                    />
                  ) : (
                    <span className="devedor-avatar">
                      {String(pessoa.nome || "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}

                  <div>
                    <small className="devedor-categoria-carta">CONTA PESSOAL</small>
                    <strong>{pessoa.nome}</strong>
                    <span className="devedor-status-chip">{status}</span>
                  </div>
                </div>

                <div className="devedor-saldo-area">
                  {saldoMeDevem > 0 ? (
                    <>
                      <small>A receber</small>
                      <b className="saldo-a-receber">{brl(saldoMeDevem)}</b>
                    </>
                  ) : saldoEuDevo > 0 ? (
                    <>
                      <small>A pagar</small>
                      <b className="saldo-a-pagar">{brl(saldoEuDevo)}</b>
                    </>
                  ) : (
                    <>
                      <small>Saldo entre vocês</small>
                      <b className="saldo-zero-carta">Tudo certo</b>
                    </>
                  )}
                </div>

                <div className="devedor-mini-info">
                  <span>{itens.length} {itens.length === 1 ? "movimento" : "movimentos"}</span>
                  {saldoMeDevem > 0 && saldoEuDevo > 0 ? (
                    <span>A pagar {brl(saldoEuDevo)}</span>
                  ) : (
                    <span>{percentualAcertado.toFixed(0)}% resolvido</span>
                  )}
                  <span className="devedor-abrir-indicador">
                    {aberto ? "FECHAR ▲" : "REVELAR ▼"}
                  </span>
                </div>

                <div className="devedor-progress">
                  <div style={{ width: `${percentualAcertado}%` }} />
                </div>
              </button>

              <div className="devedor-reveal-conteudo">
                <div className="devedor-status-grid">
                  <div><small>A receber</small><strong>{brl(saldoMeDevem)}</strong></div>
                  <div><small>A pagar</small><strong>{brl(saldoEuDevo)}</strong></div>
                  <div><small>Resolvido</small><strong>{percentualAcertado.toFixed(0)}%</strong></div>
                  <div><small>Último movimento</small><strong>{ultimoMovimento ? formatarDataHora(ultimoMovimento.dataHora) : "—"}</strong></div>
                </div>

                <div className="devedor-acoes">
                  <button type="button" className="primary-btn" onClick={() => abrirNovaDivida(pessoa.id)}>＋ Lançar</button>
                  {saldoMeDevem > 0 || saldoEuDevo > 0 ? (
                    <button type="button" className="toggle-btn" onClick={() => abrirQuitacaoPessoa(pessoa.id)}>✓ Quitar</button>
                  ) : null}
                  <button type="button" className="toggle-btn" onClick={() => abrirPdfPessoa(pessoa.id)}>📄 Gerar PDF</button>
                  <button type="button" className="toggle-btn" onClick={() => abrirEditarPessoa(pessoa)}>✏️ Personalizar</button>
                  <button type="button" className="toggle-btn danger-soft" onClick={() => apagarPessoa(pessoa.id)}>🗑️ Apagar</button>
                </div>

                <button
                  type="button"
                  className="toggle-btn"
                  style={{ width: "100%", marginTop: 10 }}
                  onClick={() =>
                    setHistoricoDetalhadoPessoaId((atual) =>
                      atual === pessoa.id ? "" : pessoa.id
                    )
                  }
                >
                  📜 Histórico detalhado {historicoDetalhadoPessoaId === pessoa.id ? "▲" : "▼"}
                </button>

                {historicoDetalhadoPessoaId === pessoa.id ? (
                <section className="devedor-historico-detalhado">
                  <div className="devedor-historico-titulo"><h4>Histórico detalhado</h4><p className="muted small">Para quem, de onde, o quê, porcentagem, valor e forma.</p></div>
                  {itens.length === 0 ? <p className="muted small">Nenhum movimento registrado.</p> : (
                    <div className="devedor-historico-lista">
                      {itens.map((item) => {
                        const ehDivida = item.tipo === "divida";

                        const itensDoMesmoGrupo =
                          ehDivida && item.grupoId
                            ? lancamentos.filter(
                                (outro) =>
                                  outro.tipo === "divida" &&
                                  outro.grupoId === item.grupoId
                              )
                            : ehDivida
                              ? [item]
                              : [];

                        const somaValorPartesGrupo = itensDoMesmoGrupo.reduce(
                          (s, parte) => s + numero(parte.valor),
                          0
                        );

                        const somaPercentuaisGrupo = itensDoMesmoGrupo.reduce(
                          (s, parte) => s + numero(parte.porcentagem),
                          0
                        );

                        const valorMinhaParteItem =
                          item.minhaParteValor != null
                            ? numero(item.minhaParteValor)
                            : ehDivida
                              ? Math.max(
                                  0,
                                  numero(item.valorTotal || item.valor) -
                                    somaValorPartesGrupo
                                )
                              : 0;

                        const percentualMinhaParteItem =
                          item.minhaPartePercentual != null
                            ? numero(item.minhaPartePercentual)
                            : ehDivida
                              ? Math.max(0, 100 - somaPercentuaisGrupo)
                              : 0;

                        return (
                          <div className="devedor-historico-item" key={item.id}>
                            <div className="devedor-historico-top">
                              <div><span className={`devedor-tipo ${ehDivida ? (item.sentido === "eu_devo" ? "eu-devo" : "divida") : "nulo"}`}>{ehDivida ? sentidoLabel(item.sentido) : item.sentido === "eu_devo" ? "EU PAGUEI" : "RESSARCIMENTO · NULO"}</span>{ehDivida ? <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, opacity: item.ativo === false ? 0.65 : 1 }}>{item.ativo === false ? "⚪ INATIVO" : "🟢 ATIVO"}</span> : null}<strong>{item.descricao || "Sem descrição"}</strong></div>
                              <b>{ehDivida ? "+" : "−"} {brl(item.valor)}</b>
                            </div>
                            <div className="devedor-dados-grid">
                              <div><small>Para quem</small><span>{pessoa.nome}</span></div>
                              <div><small>De onde</small><span>{item.deOnde || "Não informado"}</span></div>
                              <div><small>O quê</small><span>{item.descricao || "—"}</span></div>
                              <div><small>Como</small><span>{formaLabel(item.formaPagamento)}</span></div>
                              <div><small>Categoria</small><span>{item.categoria || "—"}</span></div>
                              <div><small>Integração</small><span>{item.integrarFinanceiro === false ? "Só Acertos" : "Histórico + Finanças"}</span></div>
                              {item.cartaoId ? <div><small>Cartão</small><span>{cartoes.find((c) => c.id === item.cartaoId)?.nome || "Cartão"}</span></div> : null}
                              {ehDivida ? <><div><small>Valor total</small><span>{brl(item.valorTotal || item.valor)}</span></div><div><small>Porcentagem</small><span>{numero(item.porcentagem || 0).toFixed(2)}%</span></div><div><small>Parte desta pessoa</small><span>{brl(item.valor)}</span></div><div><small>👤 Minha parte</small><span>{brl(valorMinhaParteItem)}</span></div><div><small>% da minha parte</small><span>{percentualMinhaParteItem.toFixed(2)}%</span></div></> : null}
                              <div><small>Data</small><span>{formatarDataHora(item.dataHora)}</span></div>
                            </div>
                            {item.observacao ? <p className="devedor-observacao">{item.observacao}</p> : null}
                            <div className="devedor-item-actions">{ehDivida ? <button type="button" className="toggle-btn" onClick={() => alternarAtivoLancamento(item)}>{item.ativo === false ? "🟢 Ativar gasto" : "⚪ Inativar gasto"}</button> : null}{ehDivida ? <button type="button" className="toggle-btn" onClick={() => abrirTransferenciaDivida(item)}>↔ Transferir</button> : null}<button type="button" className="toggle-btn" onClick={() => abrirEditarLancamento(item)}>✏️ Editar</button><button type="button" className="toggle-btn danger-soft" onClick={() => apagarLancamento(item.id)}>🗑️ Apagar</button></div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
                ) : null}
              </div>
            </article>
          );
        })}
        </div>
      </div>

      {typeof document !== "undefined" && confirmacao
        ? createPortal(
        <div
          className="devedores-modal"
          onClick={fecharConfirmacao}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483646,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(0,0,0,.72)",
          }}
        >
          <div
            className="devedores-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(430px, 100%)",
              maxWidth: 430,
              position: "relative",
              zIndex: 1,
            }}
          >
            <button
              type="button"
              className="fechar"
              onClick={fecharConfirmacao}
              aria-label="Fechar"
              title="Fechar"
            >
              ×
            </button>

            <div style={{ paddingRight: 34 }}>
              <h3 style={{ marginBottom: 6 }}>
                {confirmacao.titulo || "Confirmar ação"}
              </h3>
              <p
                className="muted"
                style={{ margin: 0, lineHeight: 1.5 }}
              >
                {confirmacao.mensagem}
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginTop: 18,
              }}
            >
              <button
                type="button"
                className="toggle-btn"
                onClick={fecharConfirmacao}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={executarConfirmacao}
                style={{
                  background:
                    confirmacao.tipo === "perigo"
                      ? "rgba(239,68,68,.95)"
                      : undefined,
                }}
              >
                {confirmacao.textoAcao || "Confirmar"}
              </button>
            </div>
          </div>
        </div>
          ,
            document.body
          )
        : null}

      {typeof document !== "undefined" && ajudaSecao
        ? createPortal(
        <div
          className="devedores-modal"
          onClick={fecharAjudaSecao}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(0,0,0,.72)",
          }}
        >
          <div
            className="devedores-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(430px, 100%)",
              maxWidth: 430,
              position: "relative",
              zIndex: 1,
            }}
          >
            <button
              type="button"
              className="fechar"
              onClick={fecharAjudaSecao}
              aria-label="Fechar explicação"
              title="Fechar"
            >
              ×
            </button>

            <div style={{ paddingRight: 34 }}>
              <h3 style={{ marginBottom: 8 }}>
                ❓ {ajudaSecao.titulo}
              </h3>
              <p
                className="muted"
                style={{
                  margin: 0,
                  lineHeight: 1.55,
                  whiteSpace: "pre-line",
                }}
              >
                {ajudaSecao.texto}
              </p>
            </div>

            <button
              type="button"
              className="primary-btn"
              onClick={fecharAjudaSecao}
              style={{ marginTop: 16, width: "100%" }}
            >
              Fechar
            </button>
          </div>
        </div>
          ,
            document.body
          )
        : null}

      {mostrarAjuda ? (
        <div className="devedores-modal" onClick={() => setMostrarAjuda(false)}>
          <div className="devedores-modal-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="fechar" onClick={() => setMostrarAjuda(false)}>×</button>
            <h3>❓ Como funciona</h3>
            <div className="devedores-ajuda">
              <p><b>Várias pessoas:</b> selecione quantas quiser. A porcentagem começa dividida igualmente e depois você pode mudar cada uma.</p>
              <p><b>Nova pessoa:</b> é criada dentro da própria tela de lançar dívida, sem precisar sair.</p>
              <p><b>Foto/áudio:</b> criam rascunhos para conferir antes de salvar.</p>
              <p><b>Enviar para Histórico/Finanças:</b> em cada dívida ou acerto você escolhe <b>Sim</b> ou <b>Não</b>. Se marcar Não, o registro fica somente em Acertos.</p>
              <p><b>Categoria e pagamento:</b> quando integrar, você pode usar Essencial, Lazer, Burrice ou Investido, além de Dinheiro, Débito, Crédito, PIX ou Outros. No crédito, escolha também o cartão.</p>
              <p><b>Te devem:</b> se a integração estiver ligada, a compra entra como despesa uma única vez. Quando te pagam, o dinheiro entra no saldo como <b>reembolso</b>, mas não aumenta “Receitas do mês”.</p>
              <p><b>Transferir dívida:</b> use ↔ Transferir em uma dívida para passar o valor inteiro ou só uma parte para outra pessoa. O gasto original não é duplicado.</p>
              <p><b>Você deve:</b> criar a dívida não tira dinheiro do saldo. Quando você registra “Eu paguei”, aí a saída vira despesa se a integração estiver ligada.</p>
              <p><b>Cartas:</b> cada pessoa pode ter nome, foto e cor. A carta mostra quanto ela te deve ou quanto você deve a ela.</p>
              <p><b>Histórico:</b> o detalhado continua dentro da pessoa. O Histórico geral recebe somente os lançamentos que você marcou para integrar.</p>
              <p><b>Ativo/Inativo:</b> gasto inativo continua salvo, mas não entra no valor a pagar ou receber.</p>
              <p><b>PDF:</b> cada pessoa pode gerar um resumo próprio e escolher se os gastos inativos aparecem.</p>
            </div>
          </div>
        </div>
      ) : null}

      {modal === "pdf-pessoa" ? (
        <div className="devedores-modal" onClick={fecharModal}>
          <div
            className="devedores-modal-card devedor-pdf-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="fechar" onClick={fecharModal}>×</button>

            <div className="devedor-pdf-cabecalho">
              <div className="devedor-pdf-icone">📄</div>
              <div>
                <h3>
                  Gerar PDF — {pessoas.find((p) => p.id === pdfPessoaId)?.nome || "Pessoa"}
                </h3>
                <p>
                  O valor a pagar ou receber considera somente os gastos ativos.
                </p>
              </div>
            </div>

            <label className="devedor-pdf-periodo">
              <span>
                <strong>Período do PDF</strong>
                <small>Mostra somente lançamentos deste mês.</small>
              </span>
              <input
                type="month"
                value={pdfPeriodo}
                onChange={(e) => {
                  setPdfPeriodo(e.target.value);
                  setPdfPronto(false);
                }}
              />
            </label>

            <div className="devedor-pdf-opcoes">
              <label className="devedor-pdf-opcao">
                <span>
                  <strong>Incluir gastos ativos</strong>
                  <small>Mostra os gastos que entram no valor final.</small>
                </span>
                <input
                  type="checkbox"
                  checked={pdfIncluirAtivos}
                  onChange={(e) => {
                    setPdfIncluirAtivos(e.target.checked);
                    setPdfPronto(false);
                  }}
                />
              </label>

              <label className="devedor-pdf-opcao">
                <span>
                  <strong>Mostrar gastos inativos</strong>
                  <small>Exibe no PDF, mas não soma no valor a pagar.</small>
                </span>
                <input
                  type="checkbox"
                  checked={pdfIncluirInativos}
                  onChange={(e) => {
                    setPdfIncluirInativos(e.target.checked);
                    setPdfPronto(false);
                  }}
                />
              </label>

              <label className="devedor-pdf-opcao">
                <span>
                  <strong>Mostrar forma de pagamento</strong>
                  <small>Inclui PIX, dinheiro, cartão ou outra forma salva.</small>
                </span>
                <input
                  type="checkbox"
                  checked={pdfMostrarFormaPagamento}
                  onChange={(e) => {
                    setPdfMostrarFormaPagamento(e.target.checked);
                    setPdfPronto(false);
                  }}
                />
              </label>

              <label className="devedor-pdf-opcao">
                <span>
                  <strong>Mostrar vencimento</strong>
                  <small>Exibe a data de vencimento cadastrada para a pessoa.</small>
                </span>
                <input
                  type="checkbox"
                  checked={pdfMostrarVencimento}
                  onChange={(e) => {
                    setPdfMostrarVencimento(e.target.checked);
                    setPdfPronto(false);
                  }}
                />
              </label>

              <label className="devedor-pdf-opcao">
                <span>
                  <strong>Mostrar observações</strong>
                  <small>Acrescenta as observações dos lançamentos no documento.</small>
                </span>
                <input
                  type="checkbox"
                  checked={pdfMostrarObservacoes}
                  onChange={(e) => {
                    setPdfMostrarObservacoes(e.target.checked);
                    setPdfPronto(false);
                  }}
                />
              </label>
            </div>

            <div className="devedor-pdf-acoes">
              <button
                type="button"
                className="primary-btn devedor-pdf-gerar"
                onClick={() => gerarPdfPessoa(pdfPessoaId)}
              >
                📄 Gerar PDF
              </button>

              <button
                type="button"
                className="toggle-btn devedor-pdf-compartilhar"
                onClick={() => compartilharPdfPessoa(pdfPessoaId)}
              >
                📤 Compartilhar
              </button>
            </div>

            <div className={`devedor-pdf-status ${pdfPronto ? "pronto" : ""}`}>
              <span>{pdfPronto ? "✓" : "i"}</span>
              <p>
                {pdfPronto
                  ? "PDF gerado. Você também pode compartilhar."
                  : "Você pode gerar ou compartilhar diretamente."}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {modal === "editar-pessoa" ? (
        <div className="devedores-modal">
          <form className="devedores-modal-card" onSubmit={salvarPessoa}>
            <button type="button" className="fechar" onClick={fecharModal}>×</button>
            <h3>Personalizar pessoa</h3>
            <div className="devedor-foto-editor">
              {fotoPessoa ? <img src={fotoPessoa} alt="Prévia" /> : <div className="devedor-foto-vazia">👤</div>}
              <label className="toggle-btn devedor-upload-label">📷 Escolher foto<input type="file" accept="image/*" hidden onChange={(e) => escolherFotoPessoa(e, "editar")} /></label>
              {fotoPessoa ? <button type="button" className="toggle-btn" onClick={() => setFotoPessoa("")}>Remover foto</button> : null}
            </div>
            <label>Nome<input value={nomePessoa} onChange={(e) => setNomePessoa(e.target.value)} /></label>
            <label>Cor da carta<input type="color" value={corPessoa} onChange={(e) => setCorPessoa(e.target.value)} /></label>
            <label>Forma de pagamento
              <select value={formaRecebimentoPessoa} onChange={(e) => setFormaRecebimentoPessoa(e.target.value)}>
                <option value="pix">PIX</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="debito">Débito</option>
                <option value="credito">Crédito</option>
                <option value="outros">Outros</option>
              </select>
            </label>
            <label>Chave / dados para pagamento<input value={chavePagamentoPessoa} onChange={(e) => setChavePagamentoPessoa(e.target.value)} placeholder="Ex.: chave PIX" /></label>
            <label>Vencimento<input type="date" value={vencimentoPessoa} onChange={(e) => setVencimentoPessoa(e.target.value)} /></label>
            <label>
              Depois de quitada, esconder esta conta após
              <select
                value={prazoArquivarQuitadaDias}
                onChange={(e) => setPrazoArquivarQuitadaDias(e.target.value)}
              >
                <option value="0">Nunca esconder</option>
                <option value="14">2 semanas</option>
                <option value="30">1 mês</option>
                <option value="60">2 meses</option>
                <option value="90">3 meses</option>
              </select>
            </label>
            <small className="muted">
              A opção padrão é 2 semanas. A conta só será escondida, nunca apagada.
            </small>
            <button className="primary-btn" type="submit">Salvar pessoa</button>
          </form>
        </div>
      ) : null}

      {modal === "nova-divida" ? (
        <div className="devedores-modal">
          <form
            className="devedores-modal-card devedores-modal-card-grande"
            onSubmit={salvarDivida}
          >
            <button
              type="button"
              className="fechar"
              onClick={fecharModal}
            >
              ×
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
                paddingRight: 34,
              }}
            >
              <div>
                <h3 style={{ marginBottom: 4 }}>＋ Lançar</h3>
                <p className="muted small" style={{ margin: 0 }}>
                  Fale tudo de uma vez ou preencha só o que precisar.
                </p>
              </div>

              <details style={{ position: "relative" }}>
                <summary
                  className="toggle-btn"
                  style={{
                    listStyle: "none",
                    cursor: "pointer",
                    width: 38,
                    height: 38,
                    display: "grid",
                    placeItems: "center",
                    padding: 0,
                    borderRadius: "50%",
                  }}
                  title="Como funciona"
                >
                  ?
                </summary>
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 44,
                    zIndex: 20,
                    width: "min(330px, 78vw)",
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,.14)",
                    background: "#111827",
                    boxShadow: "0 16px 38px rgba(0,0,0,.35)",
                    fontSize: 13,
                    lineHeight: 1.45,
                  }}
                >
                  <strong>Como Acertos funciona</strong>
                  <p style={{ margin: "7px 0 0" }}>
                    <b>Eu</b> pode participar da divisão junto com qualquer
                    pessoa ou grupo. Se marcar <b>acompanhar em Finanças</b>,
                    o movimento também vai para Histórico/Finanças. Se
                    desligar, fica somente em Acertos.
                  </p>
                  <p style={{ margin: "7px 0 0" }}>
                    Exemplo de voz: “Pizza 120 reais, grupo casa, eu 40,
                    Lívia 40, Soso 40, crédito Nubank, burrice, mandar para
                    Finanças”.
                  </p>
                </div>
              </details>
            </div>

            {/* 1. FALAR / FOTO */}
            <section
              style={{
                padding: 12,
                borderRadius: 16,
                border: "1px solid rgba(96,165,250,.24)",
                background: gravando
                  ? "rgba(239,68,68,.08)"
                  : "rgba(59,130,246,.06)",
                display: "grid",
                gap: 9,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <strong>🎤 1. Fale a dívida</strong>
                  <small className="muted" style={{ display: "block", marginTop: 2 }}>
                    Preencho automaticamente apenas o que eu conseguir identificar.
                  </small>
                </div>
                <BotaoAjudaSecao
                  titulo="Falar ou usar foto"
                  texto="Você pode falar os dados ou usar uma foto/print. Confira tudo antes de salvar."
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                <button
                  type="button"
                  className={`primary-btn ${gravando ? "danger-soft" : ""}`}
                  onClick={gravando ? pararVoz : iniciarVoz}
                  disabled={!suportaVoz}
                  style={{ minHeight: 44, padding: "8px 7px" }}
                >
                  {gravando ? "■ Parar" : "🎙️ Falar"}
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${mostrarFotoLancamento ? "toggle-active" : ""}`}
                  onClick={() => setMostrarFotoLancamento((v) => !v)}
                  style={{ minHeight: 44, padding: "8px 7px" }}
                >
                  📷 Foto
                </button>
              </div>

              {textoVoz ? (
                <div style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,.04)" }}>
                  <small className="muted">Entendi:</small>
                  <div style={{ marginTop: 2 }}>{textoVoz}</div>
                </div>
              ) : null}

              {mostrarFotoLancamento ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <input ref={fotoImportacaoRef} type="file" accept="image/*" hidden onChange={lerFoto} />
                  <input ref={cameraImportacaoRef} type="file" accept="image/*" capture="environment" hidden onChange={lerFoto} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                    <button type="button" className="toggle-btn" onClick={() => fotoImportacaoRef.current?.click()} disabled={lendoFoto}>🖼️ Galeria</button>
                    <button type="button" className="toggle-btn" onClick={() => cameraImportacaoRef.current?.click()} disabled={lendoFoto}>📷 Câmera</button>
                  </div>
                  {lendoFoto ? <small className="muted">Lendo foto… {progressoFoto}%</small> : null}
                  {rascunhosImportados.map((r) => (
                    <div key={r.id} style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,.04)", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descricao}</strong>
                        <small className="muted">{brl(r.valor)} · {formaLabel(r.formaPagamento)}</small>
                      </div>
                      <button type="button" className="toggle-btn" onClick={() => aplicarRascunho(r)}>Usar</button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            {/* 2. EMPRÉSTIMO / DÍVIDA */}
            <section style={{ padding: 12, borderRadius: 16, border: "1px solid rgba(255,255,255,.09)", background: "rgba(255,255,255,.025)", display: "grid", gap: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <strong>💰 2. Empréstimo ou dívida</strong>
                <BotaoAjudaSecao
                  titulo="Empréstimo ou dívida"
                  texto="Empréstimo significa que a pessoa ficou te devendo. Dívida significa que você ficou devendo à pessoa."
                />
              </div>

              <div className="devedor-sentido-grid">
                <button type="button" className={`toggle-btn ${sentido === "me_deve" ? "toggle-active" : ""}`} onClick={() => setSentido("me_deve")}>💵 Empréstimo</button>
                <button type="button" className={`toggle-btn ${sentido === "eu_devo" ? "toggle-active" : ""}`} onClick={() => setSentido("eu_devo")}>🧾 Dívida</button>
              </div>

              <div className="devedor-detalhes-grid">
                <label>O quê<input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Pizza" /></label>
                <label>
                  Valor total
                  <input
                    inputMode="decimal"
                    value={valorTotal}
                    onChange={(e) => {
                      const novoValorTotal = e.target.value;
                      setValorTotal(novoValorTotal);
                      const totalNovo = numero(novoValorTotal);
                      if (euSelecionado && String(minhaPartePercentual).trim() !== "") {
                        const pctEu = Math.max(0, Math.min(100, numero(minhaPartePercentual)));
                        setMinhaParteValor(totalNovo > 0 ? String(Number(((totalNovo * pctEu) / 100).toFixed(2))) : "");
                      } else if (euSelecionado && String(minhaParteValor).trim() !== "" && totalNovo > 0) {
                        setMinhaPartePercentual(String(Number(((numero(minhaParteValor) / totalNovo) * 100).toFixed(2))));
                      }
                    }}
                    placeholder="0,00"
                  />
                </label>
              </div>
            </section>

            {/* PAGAMENTO */}
            <section style={{ padding: 12, borderRadius: 16, border: "1px solid rgba(255,255,255,.09)", background: "rgba(255,255,255,.025)", display: "grid", gap: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <strong>💳 Pagamento</strong>
                <BotaoAjudaSecao titulo="Pagamento" texto="Escolha como o valor foi pago e a categoria. No crédito, informe também o cartão." />
              </div>
              <div className="devedor-detalhes-grid">
                <label>
                  Forma
                  <select value={formaPagamento} onChange={(e) => { setFormaPagamento(e.target.value); if (e.target.value !== "credito") setCartaoId(""); }}>
                    <option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito</option><option value="outros">Outros</option>
                  </select>
                </label>
                <label>
                  Categoria
                  <select value={categoriaFinanceira} onChange={(e) => setCategoriaFinanceira(e.target.value)}>
                    <option value="Burrice">Burrice</option><option value="Essencial">Essencial</option><option value="Lazer">Lazer</option><option value="Investido">Investido</option>
                  </select>
                </label>
                {formaPagamento === "credito" ? (
                  <label>Cartão<select value={cartaoId} onChange={(e) => setCartaoId(e.target.value)}><option value="">Selecione...</option>{cartoes.map((cartao) => <option key={cartao.id} value={cartao.id}>{cartao.nome}</option>)}</select></label>
                ) : null}
              </div>
            </section>

            {/* 3. QUEM PARTICIPA — abre só o necessário */}
            <section style={{ padding: 12, borderRadius: 16, border: "1px solid rgba(94,234,155,.20)", background: "rgba(94,234,155,.04)", display: "grid", gap: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <div>
                  <strong>👥 3. Quem participa</strong>
                  <small className="muted" style={{ display: "block", marginTop: 2 }}>Abra somente a parte que você precisa.</small>
                </div>
                <BotaoAjudaSecao titulo="Quem participa" texto="Use Grupos para escolher várias pessoas de uma vez, Pessoas para marcar individualmente e Criar para cadastrar uma pessoa ou grupo novo." />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 6 }}>
                <button type="button" className={`toggle-btn ${painelParticipantesLancamento === "grupos" ? "toggle-active" : ""}`} onClick={() => setPainelParticipantesLancamento((v) => v === "grupos" ? "" : "grupos")}>👥 Grupos</button>
                <button type="button" className={`toggle-btn ${painelParticipantesLancamento === "pessoas" ? "toggle-active" : ""}`} onClick={() => setPainelParticipantesLancamento((v) => v === "pessoas" ? "" : "pessoas")}>👤 Pessoas</button>
                <button type="button" className={`toggle-btn ${painelParticipantesLancamento === "criar" ? "toggle-active" : ""}`} onClick={() => setPainelParticipantesLancamento((v) => v === "criar" ? "" : "criar")}>＋ Criar</button>
              </div>

              {painelParticipantesLancamento === "grupos" ? (
                <div style={{ display: "grid", gap: 8, padding: 9, borderRadius: 12, background: "rgba(255,255,255,.025)" }}>
                  <div><strong style={{ fontSize: 13 }}>👥 Grupos salvos</strong><small className="muted" style={{ display: "block" }}>Toque no nome para usar. ✏️ edita e 🗑️ apaga.</small></div>
                  {grupos.length ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 6 }}>
                      {grupos.map((grupo) => {
                        const temEu = (grupo.pessoaIds || []).includes(EU_ID);
                        const quantidade = (grupo.pessoaIds || []).filter((id) => id !== EU_ID).length + (temEu ? 1 : 0);
                        return (
                          <div key={grupo.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 28px 28px", gap: 3, alignItems: "center", padding: 3, borderRadius: 9, background: editandoGrupoId === grupo.id ? "rgba(94,234,155,.10)" : "rgba(255,255,255,.025)", border: editandoGrupoId === grupo.id ? "1px solid rgba(94,234,155,.34)" : "1px solid rgba(255,255,255,.07)" }}>
                            <button type="button" className="toggle-btn" onClick={() => aplicarGrupo(grupo)} style={{ justifyContent: "flex-start", minWidth: 0, minHeight: 30, padding: "4px 5px", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>👥 {grupo.nome} · {quantidade}</button>
                            <button type="button" className="toggle-btn" onClick={() => abrirEdicaoGrupo(grupo)} title="Editar grupo" style={{ width: 28, minWidth: 28, height: 28, padding: 0, fontSize: 11 }}>✏️</button>
                            <button type="button" className="toggle-btn danger-soft" onClick={() => apagarGrupoFixo(grupo)} title="Apagar grupo" style={{ width: 28, minWidth: 28, height: 28, padding: 0, fontSize: 11 }}>🗑️</button>
                          </div>
                        );
                      })}
                    </div>
                  ) : <small className="muted">Nenhum grupo criado ainda.</small>}

                  {editandoGrupoId ? (
                    <div style={{ padding: 10, borderRadius: 12, border: "1px solid rgba(94,234,155,.28)", background: "rgba(94,234,155,.055)", display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><strong>✏️ Editar grupo</strong><button type="button" className="toggle-btn" onClick={cancelarEdicaoGrupo}>✕</button></div>
                      <label>Nome do grupo<input value={novoGrupoNome} onChange={(e) => setNovoGrupoNome(e.target.value)} /></label>
                      <div className="devedor-grupo-pessoas">
                        <button type="button" className={`devedor-pessoa-chip ${novoGrupoPessoaIds.includes(EU_ID) ? "ativo" : ""}`} onClick={() => alternarPessoaGrupo(EU_ID)} style={{ "--chip-accent": "#5eea9b" }}><span>EU</span><b>Eu</b><em>{novoGrupoPessoaIds.includes(EU_ID) ? "✓" : "+"}</em></button>
                        {pessoas.map((p) => { const ativo = novoGrupoPessoaIds.includes(p.id); return <button type="button" key={p.id} className={`devedor-pessoa-chip ${ativo ? "ativo" : ""}`} onClick={() => alternarPessoaGrupo(p.id)} style={{ "--chip-accent": p.corCarta || "#3b82f6" }}>{p.fotoBase64 ? <img src={p.fotoBase64} alt="" /> : <span>{String(p.nome || "?")[0].toUpperCase()}</span>}<b>{p.nome}</b><em>{ativo ? "✓" : "+"}</em></button>; })}
                      </div>
                      <button type="button" className="primary-btn" onClick={salvarGrupoFixo}>💾 Salvar alterações</button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {painelParticipantesLancamento === "pessoas" ? (
                <div style={{ display: "grid", gap: 9, padding: 9, borderRadius: 12, background: "rgba(255,255,255,.025)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div><strong style={{ fontSize: 13 }}>👤 Participantes desta dívida</strong><small className="muted" style={{ display: "block" }}>“Eu” também pode participar.</small></div>
                    {(pessoasSelecionadas.length + (euSelecionado ? 1 : 0)) > 1 ? <button type="button" className="toggle-btn" onClick={dividirRestanteIgualmente}>⚖️ Dividir igual</button> : null}
                  </div>
                  <div className="devedor-pessoas-grid">
                    <button type="button" className={`devedor-pessoa-chip ${euSelecionado ? "ativo" : ""}`} onClick={alternarEuSelecionado} style={{ "--chip-accent": "#5eea9b" }}><span>EU</span><b>{profile?.nome ? `Eu · ${profile.nome}` : "Eu"}</b><em>{euSelecionado ? "✓" : "+"}</em></button>
                    {pessoas.map((p) => { const ativo = pessoasSelecionadas.includes(p.id); return <button type="button" key={p.id} className={`devedor-pessoa-chip ${ativo ? "ativo" : ""}`} onClick={() => alternarPessoaSelecionada(p.id)} style={{ "--chip-accent": p.corCarta || "#3b82f6" }}>{p.fotoBase64 ? <img src={p.fotoBase64} alt="" /> : <span>{String(p.nome || "?")[0].toUpperCase()}</span>}<b>{p.nome}</b><em>{ativo ? "✓" : "+"}</em></button>; })}
                  </div>

                  {pessoasSelecionadas.length || euSelecionado ? (
                    <div style={{ display: "grid", gap: 7, paddingTop: 4 }}>
                      <strong style={{ fontSize: 13 }}>📊 Divisão da dívida</strong>
                      {euSelecionado ? (
                        <div className="devedor-percentual-item"><span>👤 Eu</span><label><input inputMode="decimal" value={minhaPartePercentual} onChange={(e) => { const bruto = e.target.value; if (bruto !== "" && !/^\d{0,3}(?:[.,]\d{0,2})?$/.test(bruto)) return; setMinhaPartePercentual(bruto); if (bruto === "") { setMinhaParteValor(""); return; } const pct = Math.max(0, Math.min(100, numero(bruto))); const total = numero(valorTotal); setMinhaParteValor(total > 0 ? String(Number(((total * pct) / 100).toFixed(2))) : ""); }} placeholder={`${resumoMinhaParte.percentual.toFixed(2)}% auto`} /><b>%</b></label><strong>{brl(resumoMinhaParte.valor)}</strong></div>
                      ) : null}
                      {pessoasSelecionadas.map((id) => { const p = pessoas.find((x) => x.id === id); const pct = numero(percentuais[id]); const parte = numero(valorTotal) > 0 ? (numero(valorTotal) * pct) / 100 : 0; return <div className="devedor-percentual-item" key={id}><span>{p?.nome || "Pessoa"}</span><label><input inputMode="decimal" value={percentuais[id] ?? ""} onChange={(e) => setPercentuais((atual) => ({ ...atual, [id]: e.target.value }))} placeholder="%" /><b>%</b></label><strong>{brl(parte)}</strong></div>; })}
                      <small className="muted">Total da divisão: <b>{resumoMinhaParte.totalPercentual.toFixed(2)}%</b></small>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {painelParticipantesLancamento === "criar" ? (
                <div style={{ display: "grid", gap: 10, padding: 9, borderRadius: 12, background: "rgba(255,255,255,.025)" }}>
                  <div style={{ display: "grid", gap: 7 }}><strong>➕ Nova pessoa</strong><div className="devedor-criar-inline-grid"><input value={novaPessoaNome} onChange={(e) => setNovaPessoaNome(e.target.value)} placeholder="Nome" /><label className="toggle-btn devedor-upload-label">📷 Foto<input type="file" accept="image/*" hidden onChange={(e) => escolherFotoPessoa(e, "nova")} /></label><button type="button" className="primary-btn" onClick={criarPessoaNoLancamento}>Adicionar</button></div></div>
                  <div style={{ display: "grid", gap: 7, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,.08)" }}><strong>👥 Novo grupo</strong><input value={novoGrupoNome} onChange={(e) => setNovoGrupoNome(e.target.value)} placeholder="Nome do grupo" /><div className="devedor-grupo-pessoas"><button type="button" className={`devedor-pessoa-chip ${novoGrupoPessoaIds.includes(EU_ID) ? "ativo" : ""}`} onClick={() => alternarPessoaGrupo(EU_ID)} style={{ "--chip-accent": "#5eea9b" }}><span>EU</span><b>Eu</b><em>{novoGrupoPessoaIds.includes(EU_ID) ? "✓" : "+"}</em></button>{pessoas.map((p) => { const ativo = novoGrupoPessoaIds.includes(p.id); return <button type="button" key={p.id} className={`devedor-pessoa-chip ${ativo ? "ativo" : ""}`} onClick={() => alternarPessoaGrupo(p.id)} style={{ "--chip-accent": p.corCarta || "#3b82f6" }}>{p.fotoBase64 ? <img src={p.fotoBase64} alt="" /> : <span>{String(p.nome || "?")[0].toUpperCase()}</span>}<b>{p.nome}</b><em>{ativo ? "✓" : "+"}</em></button>; })}</div><button type="button" className="primary-btn" onClick={salvarGrupoFixo}>＋ Salvar grupo</button></div>
                </div>
              ) : null}
            </section>

            <button type="button" className="toggle-btn" onClick={() => setMostrarDestinoFinanceiroModal(true)} style={{ minHeight: 44, width: "100%", justifyContent: "space-between" }}>
              <span>📊 Onde este lançamento vai aparecer?</span>
              <b>{integrarFinanceiro ? "Finanças + Histórico" : "Só Acertos"}</b>
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <button type="button" className="toggle-btn" onClick={() => setMostrarMaisLancamento((v) => !v)} style={{ flex: 1 }}>{mostrarMaisLancamento ? "▲ Fechar mais opções" : "＋ Mais opções"}</button>
              <BotaoAjudaSecao titulo="Mais opções" texto="Use para informar de onde veio a dívida, juros, data, hora ou observação." />
            </div>

            {mostrarMaisLancamento ? (
              <div style={{ display: "grid", gap: 9, padding: 10, borderRadius: 12, background: "rgba(255,255,255,.025)" }}>
                <div className="devedor-detalhes-grid"><label>De onde<input value={deOnde} onChange={(e) => setDeOnde(e.target.value)} placeholder="Ex.: Restaurante" /></label><label>Juros (%)<input inputMode="decimal" value={taxaJuros} onChange={(e) => setTaxaJuros(e.target.value)} placeholder="0" /></label><label>Juros por<select value={unidadeJuros} onChange={(e) => setUnidadeJuros(e.target.value)}><option value="hora">Hora</option><option value="dia">Dia</option><option value="mes">Mês</option><option value="ano">Ano</option></select></label><label>Data e hora<input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} /></label></div>
                <label>Observação<textarea rows="3" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" /></label>
              </div>
            ) : null}

            <button
              className="primary-btn devedor-salvar-final"
              type="submit"
              style={{ minHeight: 52, fontSize: 15 }}
            >
              Salvar dívida
            </button>
          </form>
        </div>
      ) : null}

      {typeof document !== "undefined" && mostrarDestinoFinanceiroModal
        ? createPortal(
            <div
              className="devedores-modal"
              onClick={() => setMostrarDestinoFinanceiroModal(false)}
              style={{ position: "fixed", inset: 0, zIndex: 2147483645 }}
            >
              <div className="devedores-modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "min(440px, 100%)" }}>
                <button type="button" className="fechar" onClick={() => setMostrarDestinoFinanceiroModal(false)}>×</button>
                <h3>📊 Onde este lançamento vai aparecer?</h3>
                <p className="muted small">Escolha se ele também deve acompanhar seu dinheiro.</p>
                <div style={{ display: "grid", gap: 8 }}>
                  <button type="button" className={`toggle-btn ${integrarFinanceiro ? "toggle-active" : ""}`} onClick={() => setIntegrarFinanceiro(true)}>✓ Acertos + Finanças + Histórico</button>
                  <button type="button" className={`toggle-btn ${!integrarFinanceiro ? "toggle-active" : ""}`} onClick={() => setIntegrarFinanceiro(false)}>○ Somente em Acertos</button>
                </div>
                <div style={{ marginTop: 10, padding: 10, borderRadius: 12, background: "rgba(255,255,255,.035)" }}>
                  <small className="muted">{integrarFinanceiro ? "✓ Também será usado no Histórico e nos cálculos de Finanças." : "○ Ficará apenas em Acertos e não alterará Finanças nem Histórico."}</small>
                </div>
                <button type="button" className="primary-btn" style={{ width: "100%", marginTop: 12 }} onClick={() => setMostrarDestinoFinanceiroModal(false)}>Concluir</button>
              </div>
            </div>,
            document.body
          )
        : null}

      {modal === "acerto" ? (() => {
        const extratoAtual = extratos.find((item) => item.pessoa.id === pessoaId);
        const pendenteReceber = extratoAtual?.saldoRealMeDevem || 0;
        const pendentePagar = extratoAtual?.saldoRealEuDevo || 0;
        const pendenteAtual = sentido === "eu_devo" ? pendentePagar : pendenteReceber;

        return (
          <div className="devedores-modal">
            <form className="devedores-modal-card" onSubmit={salvarAcerto}>
              <button type="button" className="fechar" onClick={fecharModal}>×</button>
              <h3>✓ Quitar</h3>
              <p className="muted small">Quite tudo de uma vez ou registre somente uma parte.</p>

              {pendenteReceber > 0 && pendentePagar > 0 ? (
                <div className="devedor-sentido-grid">
                  <button type="button" className={`toggle-btn ${sentido === "me_deve" ? "toggle-active" : ""}`} onClick={() => mudarSentidoQuitacao("me_deve")}>Receber · {brl(pendenteReceber)}</button>
                  <button type="button" className={`toggle-btn ${sentido === "eu_devo" ? "toggle-active" : ""}`} onClick={() => mudarSentidoQuitacao("eu_devo")}>Pagar · {brl(pendentePagar)}</button>
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                <button type="button" className={`toggle-btn ${modoLancamentoDivida === "quitar" ? "toggle-active" : ""}`} onClick={() => mudarModoQuitacao("quitar")}>✓ Quitar tudo</button>
                <button type="button" className={`toggle-btn ${modoLancamentoDivida === "abater" ? "toggle-active" : ""}`} onClick={() => mudarModoQuitacao("abater")}>− Abater valor</button>
              </div>

              <div style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,.035)", display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span className="muted">Pendente</span><strong>{brl(pendenteAtual)}</strong></div>
                <label>
                  {modoLancamentoDivida === "quitar" ? "Valor da quitação" : "Quanto será abatido agora"}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 7 }}>
                    <input inputMode="decimal" value={valorDireto} readOnly={modoLancamentoDivida === "quitar"} onChange={(e) => setValorDireto(e.target.value)} placeholder="0,00" />
                    {modoLancamentoDivida === "abater" ? <button type="button" className="toggle-btn" onClick={() => setValorDireto(String(Number(pendenteAtual.toFixed(2))))}>Tudo</button> : null}
                  </div>
                </label>
                {modoLancamentoDivida === "abater" ? <small className="muted">Depois deste pagamento restará {brl(Math.max(0, pendenteAtual - numero(valorDireto)))}.</small> : null}
              </div>

              <label>Referência<input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={modoLancamentoDivida === "quitar" ? "Ex.: Quitação da pizza" : "Ex.: Parte da pizza"} /></label>

              <div className="devedor-detalhes-grid">
                <label>Forma<select value={formaPagamento} onChange={(e) => { setFormaPagamento(e.target.value); if (e.target.value !== "credito") setCartaoId(""); }}><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito</option><option value="outros">Outros</option></select></label>
                <label>Categoria<select value={categoriaFinanceira} onChange={(e) => setCategoriaFinanceira(e.target.value)}><option value="Essencial">Essencial</option><option value="Lazer">Lazer</option><option value="Burrice">Burrice</option><option value="Investido">Investido</option></select></label>
                {formaPagamento === "credito" ? <label>Cartão<select value={cartaoId} onChange={(e) => setCartaoId(e.target.value)}><option value="">Selecione...</option>{cartoes.map((cartao) => <option key={cartao.id} value={cartao.id}>{cartao.nome}</option>)}</select></label> : null}
              </div>

              <button type="button" className="toggle-btn" onClick={() => setMostrarDestinoFinanceiroModal(true)} style={{ width: "100%", justifyContent: "space-between" }}><span>📊 Onde este acerto vai aparecer?</span><b>{integrarFinanceiro ? "Finanças + Histórico" : "Só Acertos"}</b></button>

              <details>
                <summary className="toggle-btn" style={{ cursor: "pointer", width: "100%" }}>＋ Mais opções</summary>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}><label>De onde / para onde<input value={deOnde} onChange={(e) => setDeOnde(e.target.value)} /></label><label>Data e hora<input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} /></label><label>Observação<textarea rows="3" value={observacao} onChange={(e) => setObservacao(e.target.value)} /></label></div>
              </details>

              <button className="primary-btn" type="submit">{modoLancamentoDivida === "quitar" ? "✓ Quitar dívida" : "− Registrar abatimento"}</button>
            </form>
          </div>
        );
      })() : null}

      {modal === "transferir-divida" ? (() => {
        const divida = lancamentos.find((item) => item.id === transferindoLancamentoId);
        const pessoaOrigem = pessoas.find((pessoa) => pessoa.id === divida?.pessoaId);
        const valorAtual = numero(divida?.valor);
        const valorTransferir = transferenciaModo === "total" ? valorAtual : Math.min(valorAtual, numero(transferenciaValor));
        const destinosDisponiveis = pessoas.filter((pessoa) => pessoa.id !== divida?.pessoaId);
        const partesPreview = dividirValorEntreDestinos(valorTransferir, transferenciaPessoaDestinoIds);
        const valorRestante = Math.max(0, valorAtual - valorTransferir);

        return (
          <div className="devedores-modal">
            <form className="devedores-modal-card" onSubmit={salvarTransferenciaDivida}>
              <button type="button" className="fechar" onClick={fecharModal}>×</button>
              <h3>↔ Transferir / dividir dívida</h3>
              <p className="muted small">Passe a dívida para uma pessoa, várias pessoas ao mesmo tempo ou use um grupo salvo.</p>

              <div className="card" style={{ padding: 10, display: "grid", gap: 4 }}><small className="muted">Dívida atual</small><strong>{pessoaOrigem?.nome || "Pessoa"} · {brl(valorAtual)}</strong></div>

              {grupos.length ? (
                <div style={{ display: "grid", gap: 7 }}>
                  <strong style={{ fontSize: 13 }}>👥 Usar um grupo</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 }}>
                    {grupos.map((grupo) => (
                      <button key={grupo.id} type="button" className="toggle-btn" onClick={() => aplicarGrupoTransferencia(grupo, divida?.pessoaId)}>👥 {grupo.nome}</button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{ display: "grid", gap: 7 }}>
                <strong style={{ fontSize: 13 }}>👤 Pessoas que receberão a dívida</strong>
                <div className="devedor-pessoas-grid">
                  {destinosDisponiveis.map((pessoa) => {
                    const ativo = transferenciaPessoaDestinoIds.includes(pessoa.id);
                    return <button type="button" key={pessoa.id} className={`devedor-pessoa-chip ${ativo ? "ativo" : ""}`} onClick={() => alternarDestinoTransferencia(pessoa.id)} style={{ "--chip-accent": pessoa.corCarta || "#3b82f6" }}>{pessoa.fotoBase64 ? <img src={pessoa.fotoBase64} alt="" /> : <span>{String(pessoa.nome || "?")[0].toUpperCase()}</span>}<b>{pessoa.nome}</b><em>{ativo ? "✓" : "+"}</em></button>;
                  })}
                </div>
              </div>

              <div className="devedor-sentido-grid">
                <button type="button" className={`toggle-btn ${transferenciaModo === "total" ? "toggle-active" : ""}`} onClick={() => { setTransferenciaModo("total"); setTransferenciaValor(String(valorAtual.toFixed(2))); }}>Dívida toda</button>
                <button type="button" className={`toggle-btn ${transferenciaModo === "parte" ? "toggle-active" : ""}`} onClick={() => { setTransferenciaModo("parte"); if (!numero(transferenciaValor) || numero(transferenciaValor) >= valorAtual) setTransferenciaValor(String((valorAtual / 2).toFixed(2))); }}>Só uma parte</button>
              </div>

              {transferenciaModo === "parte" ? <label>Quanto transferir<input inputMode="decimal" value={transferenciaValor} onChange={(e) => setTransferenciaValor(e.target.value)} placeholder="0,00" /><small className="muted">Máximo: {brl(valorAtual)}</small></label> : null}

              <div className="card" style={{ padding: 10, display: "grid", gap: 7 }}>
                <strong>Prévia da divisão</strong>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span>{pessoaOrigem?.nome || "Pessoa atual"} fica com</span><b>{brl(valorRestante)}</b></div>
                {partesPreview.map((parte) => {
                  const pessoa = pessoas.find((item) => item.id === parte.pessoaId);
                  return <div key={parte.pessoaId} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span>{pessoa?.nome || "Pessoa"}</span><b>{brl(parte.valor)}</b></div>;
                })}
                {!partesPreview.length ? <small className="muted">Escolha pelo menos uma pessoa ou um grupo.</small> : null}
              </div>

              <button className="primary-btn" type="submit" disabled={!transferenciaPessoaDestinoIds.length || !(valorTransferir > 0) || valorTransferir > valorAtual + 0.01}>↔ Confirmar transferência</button>
            </form>
          </div>
        );
      })() : null}

      {modal === "editar-lancamento" ? (
        <div className="devedores-modal">
          <form className="devedores-modal-card" onSubmit={salvarEdicaoLancamento}>
            <button type="button" className="fechar" onClick={fecharModal}>×</button>
            <h3>Editar lançamento</h3>
            <label>Pessoa<select value={pessoaId} onChange={(e) => setPessoaId(e.target.value)}>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
            <div className="devedor-sentido-grid"><button type="button" className={`toggle-btn ${sentido === "me_deve" ? "toggle-active" : ""}`} onClick={() => setSentido("me_deve")}>Me deve</button><button type="button" className={`toggle-btn ${sentido === "eu_devo" ? "toggle-active" : ""}`} onClick={() => setSentido("eu_devo")}>Eu devo</button></div>
            <label>O quê<input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></label>
            <label>De onde<input value={deOnde} onChange={(e) => setDeOnde(e.target.value)} /></label>
            <label>Forma<select value={formaPagamento} onChange={(e) => { setFormaPagamento(e.target.value); if (e.target.value !== "credito") setCartaoId(""); }}><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito</option><option value="outros">Outros</option></select></label>
            <label>Categoria<select value={categoriaFinanceira} onChange={(e) => setCategoriaFinanceira(e.target.value)}><option value="Essencial">Essencial</option><option value="Lazer">Lazer</option><option value="Burrice">Burrice</option><option value="Investido">Investido</option></select></label>
            {formaPagamento === "credito" ? <label>Cartão<select value={cartaoId} onChange={(e) => setCartaoId(e.target.value)}><option value="">Selecione...</option>{cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label> : null}
            {lancamentos.find((x) => x.id === editandoLancamentoId)?.tipo === "divida" ? <div className="devedores-form-grid"><label>Valor total<input value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} /></label><label>Porcentagem desta pessoa<input value={percentuais[pessoaId] ?? ""} onChange={(e) => setPercentuais((a) => ({...a,[pessoaId]:e.target.value}))} /></label></div> : <label>Valor<input value={valorDireto} onChange={(e) => setValorDireto(e.target.value)} /></label>}
            {lancamentos.find((x) => x.id === editandoLancamentoId)?.tipo === "divida" ? <div className="devedores-form-grid"><label>Juros (%)<input inputMode="decimal" value={taxaJuros} onChange={(e) => setTaxaJuros(e.target.value)} placeholder="0" /></label><label>Aplicar por<select value={unidadeJuros} onChange={(e) => setUnidadeJuros(e.target.value)}><option value="hora">Hora</option><option value="dia">Dia</option><option value="mes">Mês</option><option value="ano">Ano</option></select></label></div> : null}
            <label>Data e hora<input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} /></label>
            <label>Observação<textarea rows="3" value={observacao} onChange={(e) => setObservacao(e.target.value)} /></label>
            <button className="primary-btn" type="submit">Salvar alterações</button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
