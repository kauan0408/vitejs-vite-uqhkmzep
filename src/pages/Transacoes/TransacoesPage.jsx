  // src/pages/Transacoes/TransacoesPage.jsx
  // Página completa de transações: lançamento manual, leitura rigorosa de
  // notificações bancárias por foto e lançamento de várias compras por voz.
  // Compatível com Android/PWA e com revisão de todos os campos antes de salvar.

  import React, { useEffect, useMemo, useRef, useState } from "react";
  import { createWorker } from "tesseract.js";
  import { useFinance } from "../../App.jsx";
  import "./TransacoesPage.css";

  // ✅ Data local (YYYY-MM-DD) sem UTC
  function toInputDateLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // ✅ Hora local (HH:MM)
  function toInputTimeLocal(d) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function normalizeText(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function categoriaPorDescricao(texto) {
    const t = normalizeText(texto);
    if (/mercado|supermerc|padaria|farmacia|remedio|aluguel|energia|agua|internet|posto|combustivel|gasolina|transporte|uber|\b99\b|barbearia|cabeleireiro|clinica|hospital/.test(t)) return "Essencial";
    if (/cinema|jogo|show|restaurante|lanchonete|ifood|delivery|bar|sorvete|viagem|passeio/.test(t)) return "Lazer";
    if (/invest|aplicacao|tesouro|acao|acoes|cdb|reserva/.test(t)) return "Investido";
    return "Essencial";
  }

  function novoIdLote() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function formatarDuracao(segundos) {
    const total = Math.max(0, Math.floor(Number(segundos) || 0));
    const minutos = Math.floor(total / 60);
    return `${String(minutos).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function AudioAnexoPlayer({ src, onRemove }) {
    const audioRef = useRef(null);
    const [tocando, setTocando] = useState(false);
    const [tempoAtual, setTempoAtual] = useState(0);
    const [duracao, setDuracao] = useState(0);

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      const atualizarDuracao = () => setDuracao(Number.isFinite(audio.duration) ? audio.duration : 0);
      const atualizarTempo = () => setTempoAtual(audio.currentTime || 0);
      const finalizar = () => setTocando(false);

      audio.addEventListener("loadedmetadata", atualizarDuracao);
      audio.addEventListener("durationchange", atualizarDuracao);
      audio.addEventListener("timeupdate", atualizarTempo);
      audio.addEventListener("ended", finalizar);

      return () => {
        audio.removeEventListener("loadedmetadata", atualizarDuracao);
        audio.removeEventListener("durationchange", atualizarDuracao);
        audio.removeEventListener("timeupdate", atualizarTempo);
        audio.removeEventListener("ended", finalizar);
      };
    }, [src]);

    const alternarReproducao = async () => {
      const audio = audioRef.current;
      if (!audio) return;

      if (audio.paused) {
        try {
          await audio.play();
          setTocando(true);
        } catch {
          setTocando(false);
        }
      } else {
        audio.pause();
        setTocando(false);
      }
    };

    return (
      <div className="anexo-audio-card">
        <audio ref={audioRef} src={src} preload="metadata" />
        <div className="anexo-audio-topo">
          <div className="anexo-icone">🎙️</div>
          <div>
            <strong>Áudio da transação</strong>
            <span>Gravação pronta para ouvir</span>
          </div>
          <button type="button" className="anexo-remover" onClick={onRemove} aria-label="Apagar áudio">
            ✕
          </button>
        </div>

        <div className="anexo-audio-controles">
          <button type="button" className="anexo-play" onClick={alternarReproducao} aria-label={tocando ? "Pausar" : "Ouvir"}>
            {tocando ? "❚❚" : "▶"}
          </button>
          <span>{formatarDuracao(tempoAtual)}</span>
          <input
            type="range"
            min="0"
            max={duracao || 0}
            step="0.1"
            value={Math.min(tempoAtual, duracao || 0)}
            onChange={(e) => {
              const novoTempo = Number(e.target.value);
              if (audioRef.current) audioRef.current.currentTime = novoTempo;
              setTempoAtual(novoTempo);
            }}
            aria-label="Posição do áudio"
          />
          <span>{formatarDuracao(duracao)}</span>
        </div>
      </div>
    );
  }

  export default function TransacoesPage() {
    const { adicionarTransacao, cartoes, mesReferencia, transacoes } = useFinance();

    // Form
    const [tipo, setTipo] = useState("despesa");
    const [valor, setValor] = useState("");
    const [descricao, setDescricao] = useState("");
    const [categoria, setCategoria] = useState("Essencial");
    const [formaPagamento, setFormaPagamento] = useState("dinheiro");
    const [cartaoId, setCartaoId] = useState("");
    const [fixo, setFixo] = useState(false);
    const [mensagem, setMensagem] = useState("");

    // Formulário manual fica fechado por padrão.
    const [mostrarManual, setMostrarManual] = useState(false);

    // Comprovantes: foto e áudio ficam salvos junto com a transação.
    const [fotoAnexo, setFotoAnexo] = useState("");
    const [fotoAmpliada, setFotoAmpliada] = useState(false);
    const fotoInputRef = useRef(null);

    const [audioAnexo, setAudioAnexo] = useState("");
    const [gravandoAudioAnexo, setGravandoAudioAnexo] = useState(false);
    const [segundosAudioAnexo, setSegundosAudioAnexo] = useState(0);
    const mediaRecorderRef = useRef(null);
    const audioStreamRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioTimerRef = useRef(null);

    const [parcelado, setParcelado] = useState(false);
    const [numeroParcelas, setNumeroParcelas] = useState(2);

    // ✅ NOVO: quando for Receita, poder marcar como "reembolso/emprestado" (não conta como receita)
    const [receitaEhReembolso, setReceitaEhReembolso] = useState(false);

    // ✅ DATA/HORA AUTOMÁTICAS (do aparelho) — NÃO depende de mesReferencia
    const [dataTransacao, setDataTransacao] = useState(() => toInputDateLocal(new Date()));
    const [horaTransacao, setHoraTransacao] = useState(() => toInputTimeLocal(new Date()));

    // ✅ se a pessoa mexer manualmente, não sobrescreve
    const [dataFoiEditada, setDataFoiEditada] = useState(false);
    const [horaFoiEditada, setHoraFoiEditada] = useState(false);

    // ✅ sempre que entrar na página (mount), garante hoje/agora
    useEffect(() => {
      const now = new Date();
      setDataTransacao(toInputDateLocal(now));
      setHoraTransacao(toInputTimeLocal(now));
      // não marca como editada, porque é automático
    }, []);

    // ✅ se mudar mesReferencia (ex.: você mudou mês lá nas Finanças),
    // a data/hora continuam sendo HOJE/AGORA (a não ser que você tenha editado manualmente)
    useEffect(() => {
      const now = new Date();
      if (!dataFoiEditada) setDataTransacao(toInputDateLocal(now));
      if (!horaFoiEditada) setHoraTransacao(toInputTimeLocal(now));
    }, [mesReferencia, dataFoiEditada, horaFoiEditada]);

    const isDespesa = tipo === "despesa";

    // Crédito: limite
    const [mostrarConfirmCredito, setMostrarConfirmCredito] = useState(false);
    const [pendenteCredito, setPendenteCredito] = useState(null);

    // Revisão por voz
    const [reviewOpen, setReviewOpen] = useState(false);
    const [reviewText, setReviewText] = useState("");

    // Importação em lote por foto ou voz.
    const [itensLote, setItensLote] = useState([]);
    // A conferência de foto e voz acontece sempre neste modal central.
    // Um item recusado continua visível, mas não é salvo.
    const [modalConferenciaAberto, setModalConferenciaAberto] = useState(false);
    const [itemLoteEmEdicao, setItemLoteEmEdicao] = useState(null);
    const [lendoFoto, setLendoFoto] = useState(false);
    const [progressoFoto, setProgressoFoto] = useState(0);
    const cameraInputRef = useRef(null);

    // Voz
    const [gravando, setGravando] = useState(false);
    const [processandoAudio, setProcessandoAudio] = useState(false);
    const recognitionRef = useRef(null);
    const [suportaVoz, setSuportaVoz] = useState(true);
    const [textoVoz, setTextoVoz] = useState("");

    const speechBufferRef = useRef("");
    const lastFinalRef = useRef("");
    const silenceTimerRef = useRef(null);
    const SILENCE_MS = 3000;

    // Controle para restart no mobile
    const wantListeningRef = useRef(false);
    const manualStopRef = useRef(false);

    function mostrarMensagem(texto) {
      setMensagem(texto);
      setTimeout(() => setMensagem(""), 2600);
    }

    async function garantirPermissaoMicrofone() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return true;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        return true;
      } catch {
        return false;
      }
    }

    const reduzirFoto = (arquivo) =>
      new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onerror = () => reject(new Error("Não foi possível abrir a foto."));
        leitor.onload = () => {
          const imagem = new Image();
          imagem.onerror = () => reject(new Error("A imagem escolhida não é válida."));
          imagem.onload = () => {
            const limite = 1400;
            const escala = Math.min(1, limite / Math.max(imagem.width, imagem.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(imagem.width * escala));
            canvas.height = Math.max(1, Math.round(imagem.height * escala));

            const ctx = canvas.getContext("2d");
            ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.78));
          };
          imagem.src = leitor.result;
        };
        leitor.readAsDataURL(arquivo);
      });

    const escolherFoto = async (e) => {
      const arquivo = e.target.files?.[0];
      e.target.value = "";
      if (!arquivo) return;

      if (!arquivo.type.startsWith("image/")) {
        mostrarMensagem("❌ Escolha uma imagem válida.");
        return;
      }

      if (arquivo.size > 12 * 1024 * 1024) {
        mostrarMensagem("❌ A foto original deve ter no máximo 12 MB.");
        return;
      }

      try {
        const fotoReduzida = await reduzirFoto(arquivo);
        setFotoAnexo(fotoReduzida);
        mostrarMensagem("📷 Foto adicionada.");
      } catch (erro) {
        console.error(erro);
        mostrarMensagem("❌ Não consegui preparar essa foto.");
      }
    };

    const liberarStreamAudio = () => {
      if (audioTimerRef.current) {
        clearInterval(audioTimerRef.current);
        audioTimerRef.current = null;
      }
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    };

    const pararAudioAnexo = () => {
      const gravador = mediaRecorderRef.current;
      if (gravador?.state === "recording") gravador.stop();
      else liberarStreamAudio();
      setGravandoAudioAnexo(false);
    };

    const iniciarAudioAnexo = async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        mostrarMensagem("❌ Este navegador não consegue gravar áudio. Use o Chrome.");
        return;
      }

      // A fala automática e a gravação de anexo não usam o microfone ao mesmo tempo.
      try {
        if (recognitionRef.current && gravando) {
          wantListeningRef.current = false;
          manualStopRef.current = true;
          recognitionRef.current.stop();
          setGravando(false);
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;
        audioChunksRef.current = [];

        const tipos = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
        const mimeType = tipos.find((tipoMime) => MediaRecorder.isTypeSupported?.(tipoMime));
        const gravador = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

        gravador.ondataavailable = (evento) => {
          if (evento.data?.size) audioChunksRef.current.push(evento.data);
        };

        gravador.onerror = () => {
          liberarStreamAudio();
          setGravandoAudioAnexo(false);
          mostrarMensagem("❌ Houve um erro durante a gravação.");
        };

        gravador.onstop = () => {
          const blob = new Blob(audioChunksRef.current, {
            type: gravador.mimeType || "audio/webm",
          });
          liberarStreamAudio();

          if (!blob.size) {
            mostrarMensagem("❌ O áudio ficou vazio. Tente novamente.");
            return;
          }

          if (blob.size > 3 * 1024 * 1024) {
            mostrarMensagem("❌ O áudio ficou muito grande. Grave uma mensagem menor.");
            return;
          }

          const leitor = new FileReader();
          leitor.onloadend = () => {
            setAudioAnexo(String(leitor.result || ""));
            mostrarMensagem("🎙️ Áudio pronto para ouvir.");
          };
          leitor.readAsDataURL(blob);
        };

        mediaRecorderRef.current = gravador;
        setAudioAnexo("");
        setSegundosAudioAnexo(0);
        setGravandoAudioAnexo(true);
        gravador.start(500);

        audioTimerRef.current = setInterval(() => {
          setSegundosAudioAnexo((atual) => {
            if (atual >= 59) {
              setTimeout(pararAudioAnexo, 0);
              return 60;
            }
            return atual + 1;
          });
        }, 1000);
      } catch (erro) {
        console.error(erro);
        liberarStreamAudio();
        setGravandoAudioAnexo(false);
        mostrarMensagem("❌ Microfone bloqueado. Libere a permissão do navegador/app.");
      }
    };

    useEffect(() => {
      return () => {
        try {
          if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
        } catch {}
        liberarStreamAudio();
      };
    }, []);

    // =========================
    // ✅ Salvar transação (com parcelamento)
    // =========================
    const processarTransacao = (dados) => {
      const {
        tipoForm,
        valorForm,
        descricaoForm,
        categoriaForm,
        formaForm,
        cartaoIdForm,
        parceladoForm,
        numeroParcelasForm,
        dataBaseISO,
        receitaEhReembolsoForm, // ✅ NOVO
        fotoAnexoForm,
        audioAnexoForm,
      } = dados;

      const v = parseFloat(String(valorForm).replace(",", "."));
      if (isNaN(v) || v <= 0) {
        mostrarMensagem("Informe um valor válido.");
        return;
      }

      const baseDate = dataBaseISO ? new Date(dataBaseISO) : new Date();

      // ✅ NOVO: se for "receita" e marcou reembolso, salva como tipo "reembolso"
      const tipoParaSalvar =
        tipoForm === "receita" && receitaEhReembolsoForm ? "reembolso" : tipoForm;

      const isDespesaLocal = tipoForm === "despesa";
      const ehDespesaCreditoLocal =
        isDespesaLocal && formaForm === "credito" && cartaoIdForm;

      const listaParaSalvar = [];

      if (ehDespesaCreditoLocal && parceladoForm && Number(numeroParcelasForm) > 1) {
        const n = clamp(parseInt(numeroParcelasForm, 10) || 2, 2, 36);
        const valorParcela = v / n;

        const groupId =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).slice(2);

        for (let i = 1; i <= n; i++) {
          const dataParcela = new Date(baseDate);
          dataParcela.setMonth(dataParcela.getMonth() + (i - 1));

          listaParaSalvar.push({
            tipo: "despesa",
            valor: Number(valorParcela.toFixed(2)),
            descricao: descricaoForm?.trim()
              ? `${descricaoForm} (parc. ${i}/${n})`
              : `Parcela ${i}/${n}`,
            categoria: categoriaForm,
            formaPagamento: "credito",
            cartaoId: cartaoIdForm,
            fixo: false,
            dataHora: dataParcela.toISOString(), // mantém ISO para consistência no banco
            parcelaAtual: i,
            parcelaTotal: n,
            groupId,
            totalCompra: v,
            // Evita repetir arquivos pesados em todas as parcelas.
            fotoAnexo: i === 1 ? fotoAnexoForm || null : null,
            audioAnexo: i === 1 ? audioAnexoForm || null : null,
          });
        }

        mostrarMensagem(`Compra parcelada em ${n}x lançada.`);
      } else {
        listaParaSalvar.push({
          tipo: tipoParaSalvar, // ✅ aqui
          valor: v,
          descricao: descricaoForm,
          categoria: isDespesaLocal ? categoriaForm : null,
          formaPagamento: formaForm,
          cartaoId: formaForm === "credito" ? cartaoIdForm || null : null,
          fixo: false,
          dataHora: baseDate.toISOString(),
          parcelaAtual: null,
          parcelaTotal: null,
          groupId: null,
          totalCompra: v,
          fotoAnexo: fotoAnexoForm || null,
          audioAnexo: audioAnexoForm || null,
        });

        if (tipoParaSalvar === "reembolso") {
          mostrarMensagem("Reembolso/Acerto salvo! (não conta como receita)");
        } else {
          mostrarMensagem("Transação salva!");
        }
      }

      listaParaSalvar.forEach((t) => adicionarTransacao(t));

      setValor("");
      setDescricao("");
      setCategoria("Essencial");
      setFormaPagamento("dinheiro");
      setCartaoId("");
      setFixo(false);
      setTipo("despesa");
      setParcelado(false);
      setNumeroParcelas(2);
      setFotoAnexo("");
      setFotoAmpliada(false);
      setAudioAnexo("");
      setSegundosAudioAnexo(0);

      // ✅ NOVO: reseta reembolso
      setReceitaEhReembolso(false);

      setReviewText("");
      setReviewOpen(false);

      // ✅ depois de salvar: volta pra HOJE + AGORA automaticamente
      const now = new Date();
      setDataFoiEditada(false);
      setHoraFoiEditada(false);
      setDataTransacao(toInputDateLocal(now));
      setHoraTransacao(toInputTimeLocal(now));
    };

    // ✅ monta uma ISO usando DATA + HORA escolhidas (no horário local)
    const montarBaseDateISO = (yyyyMmDd, hhmm) => {
      const agora = new Date();

      const [y, m, d] = String(yyyyMmDd || toInputDateLocal(agora))
        .split("-")
        .map(Number);

      const [hh, mm] = String(hhmm || toInputTimeLocal(agora))
        .split(":")
        .map(Number);

      const dt = new Date(
        y,
        (m || 1) - 1,
        d || 1,
        Number.isFinite(hh) ? hh : agora.getHours(),
        Number.isFinite(mm) ? mm : agora.getMinutes(),
        agora.getSeconds(),
        agora.getMilliseconds()
      );

      return dt.toISOString();
    };

    const confirmarSalvarAtual = () => {
      const v = parseFloat(String(valor).replace(",", "."));
      if (isNaN(v) || v <= 0) {
        mostrarMensagem("Informe um valor válido.");
        return;
      }

      // ✅ usa data + hora do formulário
      const baseISO = montarBaseDateISO(dataTransacao, horaTransacao);

      const ehDespesaCredito =
        tipo === "despesa" && formaPagamento === "credito" && cartaoId;

      if (ehDespesaCredito) {
        const cartao = cartoes.find((c) => c.id === cartaoId);
        const limite = cartao?.limite || 0;

        if (limite > 0) {
          let totalCompras = 0;
          let totalPagamentos = 0;

          transacoes.forEach((t) => {
            if (t.cartaoId === cartaoId) {
              if (t.tipo === "despesa" && t.formaPagamento === "credito") {
                totalCompras += Number(t.valor || 0);
              }
              if (t.tipo === "pagamentoCartao") {
                totalPagamentos += Number(t.valor || 0);
              }
            }
          });

          const gastoAtual = Math.max(0, totalCompras - totalPagamentos);
          const restante = limite - gastoAtual;

          if (v > restante + 0.01) {
            const excedente = v - Math.max(restante, 0);

            setPendenteCredito({
              dados: {
                tipoForm: tipo,
                valorForm: valor,
                descricaoForm: descricao,
                categoriaForm: categoria,
                formaForm: formaPagamento,
                cartaoIdForm: cartaoId,
                parceladoForm: parcelado,
                numeroParcelasForm: numeroParcelas,
                dataBaseISO: baseISO,
                receitaEhReembolsoForm: receitaEhReembolso, // ✅ NOVO
                fotoAnexoForm: fotoAnexo,
                audioAnexoForm: audioAnexo,
              },
              excedente,
              limite,
              gastoAtual,
              cartaoNome: cartao?.nome || "Cartão",
            });

            setMostrarConfirmCredito(true);
            return;
          }
        }
      }

      processarTransacao({
        tipoForm: tipo,
        valorForm: valor,
        descricaoForm: descricao,
        categoriaForm: categoria,
        formaForm: formaPagamento,
        cartaoIdForm: cartaoId,
        parceladoForm: parcelado,
        numeroParcelasForm: numeroParcelas,
        dataBaseISO: baseISO,
        receitaEhReembolsoForm: receitaEhReembolso, // ✅ NOVO
        fotoAnexoForm: fotoAnexo,
        audioAnexoForm: audioAnexo,
      });
    };

    const handleSubmit = (e) => {
      e.preventDefault();
      confirmarSalvarAtual();
    };

    const onChangeTipo = (novoTipo) => {
      setTipo(novoTipo);
      if (novoTipo === "receita") {
        setFixo(false);
        setParcelado(false);
        // mantém o valor atual do checkbox (não mexe)
      } else {
        // ✅ NOVO: ao sair de receita, desmarca reembolso
        setReceitaEhReembolso(false);
      }
    };

    const onChangeForma = (e) => {
      const v = e.target.value;
      setFormaPagamento(v);
      if (v !== "credito") {
        setCartaoId("");
        setParcelado(false);
      }
    };

    const confirmarCompraEstourandoLimite = () => {
      if (!pendenteCredito) return;
      processarTransacao(pendenteCredito.dados);
      setPendenteCredito(null);
      setMostrarConfirmCredito(false);
    };

    const cancelarCompraCredito = () => {
      setPendenteCredito(null);
      setMostrarConfirmCredito(false);
    };

    // =========================
    // ✅ Inteligência
    // =========================
    const cartoesNorm = useMemo(() => {
      return (cartoes || []).map((c) => ({
        ...c,
        _normNome: normalizeText(c.nome),
        _normWords: normalizeText(c.nome)
          .split(/\s+/)
          .map((p) => p.trim())
          .filter(Boolean),
      }));
    }, [cartoes]);

    const extrairDataYYYYMMDD = (tNorm) => {
      const hoje = new Date();
      let dt = new Date(hoje);

      if (tNorm.includes("hoje")) {
      } else if (tNorm.includes("ontem")) {
        dt.setDate(dt.getDate() - 1);
      } else if (tNorm.includes("amanha") || tNorm.includes("amanhã")) {
        dt.setDate(dt.getDate() + 1);
      } else {
        const mDia = tNorm.match(/\bdia\s+(\d{1,2})\b/);
        if (mDia && mDia[1]) {
          const dia = clamp(parseInt(mDia[1], 10) || hoje.getDate(), 1, 31);

          // aqui sim pode usar mesReferencia para “dia 15” dentro do mês selecionado,
          // mas se mesReferencia vier errado, ainda assim a DATA padrão do form é HOJE.
          const ano = mesReferencia?.ano ?? hoje.getFullYear();
          const mes = (mesReferencia?.mes ?? hoje.getMonth()) + 1;

          const y = ano;
          const mm = String(mes).padStart(2, "0");
          const dd = String(dia).padStart(2, "0");
          return `${y}-${mm}-${dd}`;
        }
        return null;
      }

      return toInputDateLocal(dt);
    };

    const extrairDadosDoTexto = (texto) => {
      const tOriginal = String(texto || "").trim();
      const tNorm = normalizeText(tOriginal);

      // ✅ NOVO: detectar reembolso/emprestado (parte do amigo)
      const reembolsoAuto =
        tNorm.includes("reembolso") ||
        tNorm.includes("reembols") ||
        tNorm.includes("devolucao") ||
        tNorm.includes("devolução") ||
        tNorm.includes("acerto") ||
        tNorm.includes("me devolveu") ||
        tNorm.includes("me pagou") ||
        tNorm.includes("me pagaram") ||
        tNorm.includes("parte dele") ||
        tNorm.includes("parte dela") ||
        tNorm.includes("metade") ||
        tNorm.includes("emprest") ||
        tNorm.includes("devolveu o emprest") ||
        tNorm.includes("pagou o emprest");

      // 1) Tipo
      let tipoAuto = "despesa";
      if (
        tNorm.includes("receita") ||
        tNorm.includes("ganho") ||
        tNorm.includes("salario") ||
        tNorm.includes("salário") ||
        tNorm.includes("entrada")
      ) {
        tipoAuto = "receita";
      }

      // ✅ se detectar reembolso, força como "receita" (mas vai salvar como "reembolso" depois)
      if (reembolsoAuto) tipoAuto = "receita";

      // 2) Valor
      let valorAuto = "";
      let m = tNorm.match(/r\$\s*(\d+(?:[.,]\d{1,2})?)/i);
      if (!m) m = tNorm.match(/(\d+(?:[.,]\d{1,2})?)\s*(reais?|real)\b/i);

      if (!m) {
        const allNums = tNorm.match(/\b\d+(?:[.,]\d{1,2})?\b/g);
        if (allNums?.length) {
          const candidates = allNums
            .map((x) => String(x).replace(",", "."))
            .map((x) => Number(x))
            .filter((n) => Number.isFinite(n) && n > 0);

          if (candidates.length) {
            const sorted = [...candidates].sort((a, b) => b - a);
            const max = sorted[0];

            const pareceParcelas =
              (tNorm.includes("x") || tNorm.includes("vez") || tNorm.includes("parcela")) &&
              max <= 36 &&
              sorted.length > 1;

            const escolhido = pareceParcelas ? sorted[1] : max;
            if (Number.isFinite(escolhido) && escolhido > 0) valorAuto = String(escolhido);
          }
        }
      } else if (m?.[1]) {
        valorAuto = String(m[1]).replace(",", ".");
      }

      // 3) Forma
      let formaAuto = "dinheiro";
      if (tNorm.includes("pix") || tNorm.includes("pics")) formaAuto = "pix";
      else if (tNorm.includes("debito") || tNorm.includes("débito")) formaAuto = "debito";
      else if (tNorm.includes("credito") || tNorm.includes("crédito")) formaAuto = "credito";
      else if (tNorm.includes("dinheiro")) formaAuto = "dinheiro";
      else if (tNorm.includes("cartao") || tNorm.includes("cartão")) formaAuto = "credito";

      // 4) Categoria simples
      let categoriaAuto = "Essencial";
      if (tNorm.includes("lazer")) categoriaAuto = "Lazer";
      if (tNorm.includes("essencial")) categoriaAuto = "Essencial";
      if (tNorm.includes("burrice")) categoriaAuto = "Burrice";
      // aceita "besteira" como sinônimo (mas salva como Burrice)
      if (tNorm.includes("besteira") || tNorm.includes("bestera")) categoriaAuto = "Burrice";

      // 5) Parcelas
      let parceladoAuto = false;
      let numeroParcelasAuto = 2;

      let mParc =
        tNorm.match(/\b(\d{1,2})\s*x\b/i) ||
        tNorm.match(/\b(\d{1,2})\s*(vez|vezes|parcela|parcelas)\b/i);

      if (mParc?.[1]) {
        const n = clamp(parseInt(mParc[1], 10) || 2, 2, 36);
        parceladoAuto = true;
        numeroParcelasAuto = n;
      } else if (tNorm.includes("parcelado")) {
        parceladoAuto = true;
        numeroParcelasAuto = 2;
      }

      // 6) Cartão
      let cartaoIdAuto = "";
      if (cartoesNorm.length) {
        const hit =
          cartoesNorm.find((c) => c._normNome && tNorm.includes(c._normNome)) ||
          cartoesNorm.find((c) =>
            (c._normWords || []).some((w) => w.length >= 3 && tNorm.includes(w))
          );

        if (hit) cartaoIdAuto = hit.id;
      }

      if (cartaoIdAuto) {
        formaAuto = "credito";
      }

      // 7) Data
      const dataAuto = extrairDataYYYYMMDD(tNorm);

      // 8) Stopwords
      const stopCartoes = new Set();
      (cartoesNorm || []).forEach((c) => {
        (c._normWords || []).forEach((w) => stopCartoes.add(w));
      });

      const stop = new Set([
        "despesa",
        "receita",
        "entrada",
        "ganho",
        "de",
        "por",
        "no",
        "na",
        "em",
        "r$",
        "real",
        "reais",
        "categoria",
        "essencial",
        "lazer",
        // ✅ CORRIGIDO: categoria certa
        "burrice",
        // aceita sinônimos também
        "besteira",
        "bestera",
        "pix",
        "pics",
        "debito",
        "débito",
        "credito",
        "crédito",
        "dinheiro",
        "cartao",
        "cartão",
        "hoje",
        "ontem",
        "amanha",
        "amanhã",
        "dia",
        "parcelado",
        "parcela",
        "parcelas",
        "vez",
        "vezes",
        "x",
        // ✅ NOVO (stopwords leves pro reembolso)
        "reembolso",
        "reembols",
        "devolucao",
        "devolução",
        "acerto",
        "metade",
        "emprestimo",
        "empréstimo",
        ...stopCartoes,
      ]);

      const palavras = tNorm
        .replace(/[^\p{L}\p{N}\s$.,]/gu, " ")
        .split(/\s+/)
        .filter(Boolean);

      const desc = palavras
        .map((p) => p.replace(/[.,]/g, ""))
        .filter((p) => {
          if (!p) return false;
          if (stop.has(p)) return false;
          if (/^\d+(?:[.,]\d{1,2})?$/.test(p)) return false;
          return true;
        })
        .join(" ")
        .trim();

      const descricaoAuto = desc || tOriginal;

      return {
        tipoAuto,
        valorAuto,
        descricaoAuto,
        categoriaAuto,
        formaAuto,
        cartaoIdAuto,
        parceladoAuto,
        numeroParcelasAuto,
        dataAuto,
        textoOriginal: tOriginal,
        reembolsoAuto, // ✅ NOVO
      };
    };

    const criarItemLoteDoTexto = (texto, origem = "voz") => {
      const dados = extrairDadosDoTexto(texto);
      const agora = new Date();
      const forma = dados.parceladoAuto ? "credito" : dados.formaAuto || "dinheiro";

      return {
        id: novoIdLote(),
        origem,
        tipo: dados.reembolsoAuto ? "reembolso" : dados.tipoAuto,
        valor: dados.valorAuto || "",
        descricao: dados.descricaoAuto || "",
        categoria: dados.tipoAuto === "despesa"
          ? categoriaPorDescricao(dados.descricaoAuto || texto)
          : "Essencial",
        formaPagamento: forma,
        cartaoId: dados.cartaoIdAuto || "",
        data: dados.dataAuto || toInputDateLocal(agora),
        hora: toInputTimeLocal(agora),
        textoOriginal: String(texto || "").trim(),
      };
    };

    const atualizarItemLote = (id, campo, valorNovo) => {
      setItensLote((atuais) =>
        atuais.map((item) => (item.id === id ? { ...item, [campo]: valorNovo } : item))
      );
    };

    const prepararItensParaConferencia = (novos) =>
      novos.map((item) => ({ ...item, usar: item.usar !== false }));

    const abrirConferenciaLote = (novos) => {
      const preparados = prepararItensParaConferencia(novos);
      setItensLote((atuais) => [...atuais, ...preparados]);
      setItemLoteEmEdicao(null);
      setModalConferenciaAberto(true);
      return preparados;
    };

    const alternarUsoItemLote = (id) => {
      setItensLote((atuais) =>
        atuais.map((item) => (item.id === id ? { ...item, usar: !item.usar } : item))
      );
    };

    const removerItemLote = (id) => {
      setItensLote((atuais) => atuais.filter((item) => item.id !== id));
    };

    const converterValorBRL = (valor) => {
      const limpo = String(valor || "")
        .replace(/\s/g, "")
        .replace(/\.(?=\d{3}(?:\D|$))/g, "")
        .replace(",", ".");
      const numero = Number(limpo);
      return Number.isFinite(numero) ? numero : 0;
    };

    // Só estes títulos confirmam que o retângulo é uma movimentação bancária.
    // Assim, anúncios que apenas mencionam R$ nunca são transformados em gastos.
    const classificarTituloNotificacao = (linha) => {
      const t = normalizeText(linha);

      if (/transferencia\s+recebida|pix\s+recebido|pagamento\s+recebido/.test(t)) {
        return { tipo: "receita", formaPagamento: /pix/.test(t) ? "pix" : "outros" };
      }
      if (/compra\s+no\s+debito\s+aprovad[ao]|compra\s+no\s+debito\s+realizad[ao]/.test(t)) {
        return { tipo: "despesa", formaPagamento: "debito" };
      }
      if (/compra\s+no\s+credito\s+aprovad[ao]|compra\s+no\s+credito\s+realizad[ao]/.test(t)) {
        return { tipo: "despesa", formaPagamento: "credito" };
      }
      if (/pagamento\s+com\s+nupay\s+aprovad[ao]|pagamento\s+aprovad[ao]/.test(t)) {
        return { tipo: "despesa", formaPagamento: "credito" };
      }
      return null;
    };

    const limparDescricaoNotificacao = (bloco, valorEncontrado, tipo) => {
      const semValor = String(bloco || "")
        .replace(valorEncontrado, " ")
        .replace(/\b(?:compra\s+no\s+(?:cr[eé]dito|d[eé]bito)\s+aprovad[ao]|pagamento\s+com\s+nupay\s+aprovad[ao]|pagamento\s+aprovad[ao]|transfer[eê]ncia\s+recebida|pix\s+recebido)\b/gi, " ")
        .replace(/\b(?:compra|pagamento|transfer[eê]ncia)\s+de\b/gi, " ")
        .replace(/\b(?:aprovad[ao]|recebid[ao]|voc[eê]\s+recebeu|em\s+1x\s+no\s+cr[eé]dito\s+sem\s+juros\s+com\s+nupay)\b/gi, " ")
        .replace(/\b(?:para\s+o\s+cart[aã]o\s+com\s+final\s+\d+)\b/gi, " ")
        .replace(/\s{2,}/g, " ")
        .trim();

      const padraoLocal = tipo === "receita"
        ? /\bde\s+(.+?)(?:[.!]|$)/i
        : /\bem\s+(.+?)(?:[.!]|$)/i;
      const local = semValor.match(padraoLocal)?.[1]
        || semValor.match(/\b(?:no|na|para)\s+(.+?)(?:[.!]|$)/i)?.[1];

      return String(local || semValor || (tipo === "receita" ? "Valor recebido" : "Compra aprovada"))
        .replace(/^[\s:,.\-–]+|[\s:,.\-–]+$/g, "")
        .trim();
    };

    const extrairItensDaFoto = (textoOcr) => {
      const linhas = String(textoOcr || "")
        .split(/\r?\n/)
        .map((linha) => linha.replace(/\s{2,}/g, " ").trim())
        .filter(Boolean);
      const encontrados = [];

      for (let indice = 0; indice < linhas.length; indice += 1) {
        const classificacao = classificarTituloNotificacao(linhas[indice]);
        if (!classificacao) continue;

        // Um retângulo de notificação tem um título e, normalmente, 1 ou 2 linhas
        // de corpo. Paramos antes do próximo título válido.
        const partes = [linhas[indice]];
        for (let proxima = indice + 1; proxima < Math.min(linhas.length, indice + 4); proxima += 1) {
          if (classificarTituloNotificacao(linhas[proxima])) break;
          partes.push(linhas[proxima]);
          if (/(?:R\$|RS|BRL)\s*\d/i.test(linhas[proxima])) break;
        }

        const bloco = partes.join(" ");
        // Cada retângulo gera no máximo um lançamento: usamos somente o primeiro valor.
        const achado = bloco.match(/(?:R\$|RS|BRL)\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2,3})|\d+(?:[.,]\d{2,3})?)/i);
        if (!achado) continue;

        const valorNumero = converterValorBRL(achado[1]);
        if (!(valorNumero > 0)) continue;

        const descricaoFoto = limparDescricaoNotificacao(bloco, achado[0], classificacao.tipo);
        encontrados.push({
          id: novoIdLote(),
          origem: "foto",
          tipo: classificacao.tipo,
          valor: valorNumero.toFixed(2),
          descricao: descricaoFoto,
          categoria: classificacao.tipo === "despesa" ? categoriaPorDescricao(descricaoFoto) : "Essencial",
          formaPagamento: classificacao.formaPagamento,
          cartaoId: "",
          data: toInputDateLocal(new Date()),
          hora: toInputTimeLocal(new Date()),
          textoOriginal: bloco,
        });
      }

      const chaves = new Set();
      return encontrados.filter((item) => {
        const chave = `${item.tipo}|${item.valor}|${normalizeText(item.descricao)}|${normalizeText(item.textoOriginal)}`;
        if (chaves.has(chave)) return false;
        chaves.add(chave);
        return true;
      });
    };

    const lerGastosDaFoto = async (evento) => {
      const arquivo = evento.target.files?.[0];
      evento.target.value = "";
      if (!arquivo) return;
      if (!arquivo.type.startsWith("image/")) {
        mostrarMensagem("❌ Escolha uma foto ou captura de tela.");
        return;
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
        await worker.setParameters({
          preserve_interword_spaces: "1",
          user_defined_dpi: "300",
        });
        const resultado = await worker.recognize(arquivo);
        const novos = extrairItensDaFoto(resultado.data?.text || "");
        if (!novos.length) {
          mostrarMensagem("Nenhuma compra, pagamento aprovado ou transferência recebida foi encontrada.");
          return;
        }
        abrirConferenciaLote(novos);
        mostrarMensagem(`✅ ${novos.length} lançamento(s) encontrado(s). Confira no centro da tela.`);
      } catch (erro) {
        console.error("Erro ao ler foto:", erro);
        mostrarMensagem("❌ Não consegui ler a foto. Confira se o tesseract.js foi instalado.");
      } finally {
        if (worker) await worker.terminate();
        setLendoFoto(false);
        setProgressoFoto(0);
      }
    };

    const separarLancamentosFalados = (texto) => {
      // Protege apenas vírgulas decimais antes de separar as compras. Não usa
      // lookbehind, para continuar compatível com WebViews Android mais antigas.
      const protegido = String(texto || "").replace(/(\d),(\d{1,2}\b)/g, "$1__DECIMAL__$2");
      return protegido
        .split(/\s*(?:,|;|\bvirgula\b|\bvírgula\b)\s*/i)
        .map((parte) => parte.replace(/__DECIMAL__/g, ",").trim())
        .filter(Boolean);
    };

    const salvarItensLote = () => {
      const escolhidos = itensLote.filter((item) => item.usar !== false);
      if (!escolhidos.length) {
        mostrarMensagem("⚠️ Escolha pelo menos um lançamento para salvar.");
        return;
      }

      const invalidos = escolhidos.filter(
        (item) => !item.descricao.trim() || !(Number(String(item.valor).replace(",", ".")) > 0)
      );
      if (invalidos.length) {
        mostrarMensagem(`❌ Corrija ${invalidos.length} lançamento(s) sem descrição ou valor válido.`);
        return;
      }

      escolhidos.forEach((item) => {
        adicionarTransacao({
          tipo: item.tipo,
          valor: Number(String(item.valor).replace(",", ".")),
          descricao: item.descricao.trim(),
          categoria: item.tipo === "despesa" ? item.categoria : null,
          formaPagamento: item.formaPagamento,
          cartaoId: item.formaPagamento === "credito" ? item.cartaoId || null : null,
          fixo: false,
          dataHora: montarBaseDateISO(item.data, item.hora),
          parcelaAtual: null,
          parcelaTotal: null,
          groupId: null,
          totalCompra: Number(String(item.valor).replace(",", ".")),
          origemImportacao: item.origem,
        });
      });

      const total = escolhidos.length;
      setItensLote([]);
      setModalConferenciaAberto(false);
      setItemLoteEmEdicao(null);
      mostrarMensagem(`✅ ${total} lançamento(s) salvo(s).`);
    };

    const aplicarDadosNoFormulario = (dados) => {
      setTipo(dados.tipoAuto);

      if (dados.valorAuto) setValor(String(dados.valorAuto));

      setDescricao(dados.descricaoAuto || "");
      setCategoria(dados.categoriaAuto || "Essencial");

      const formaFinal = dados.parceladoAuto ? "credito" : (dados.formaAuto || "dinheiro");
      setFormaPagamento(formaFinal);

      if (formaFinal === "credito") {
        if (dados.cartaoIdAuto) setCartaoId(dados.cartaoIdAuto);
      } else {
        setCartaoId("");
      }

      if (formaFinal === "credito" && dados.parceladoAuto) {
        setParcelado(true);
        setNumeroParcelas(dados.numeroParcelasAuto || 2);
      } else {
        setParcelado(false);
        setNumeroParcelas(2);
      }

      if (dados.dataAuto) {
        setDataTransacao(dados.dataAuto);
        setDataFoiEditada(true);
      }

      // ✅ NOVO: aplica reembolso se foi detectado por voz
      setReceitaEhReembolso(!!dados.reembolsoAuto);

      // ✅ mantém a hora atual quando veio por voz (não força)
      setReviewText(dados.textoOriginal || "");
      setReviewOpen(true);
    };

    const finalizarPorSilencio = (textoInformado) => {
      const finalText = String(textoInformado ?? speechBufferRef.current ?? "").trim();

      if (!finalText) {
        mostrarMensagem("❌ Não entendi. Tente falar de novo.");
        return;
      }

      const partes = separarLancamentosFalados(finalText);
      const novos = partes.map((parte) => criarItemLoteDoTexto(parte, "voz"));
      const validos = novos.filter(
        (item) => item.valor && Number(String(item.valor).replace(",", ".")) > 0
      );

      if (!validos.length) {
        mostrarMensagem("❌ Não achei valores. Ex.: 'mercado 50 vírgula Uber 20'.");
        return;
      }

      abrirConferenciaLote(validos);
      setReviewText(finalText);
      setTextoVoz(finalText);
      mostrarMensagem(`✅ ${validos.length} lançamento(s) criado(s). Confira no centro da tela.`);
    };

    // =========================
    // ✅ SpeechRecognition (Android/PWA)
    // =========================
    useEffect(() => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setSuportaVoz(false);
        return;
      }

      const rec = new SpeechRecognition();
      rec.lang = "pt-BR";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 3;

      rec.onstart = () => {
        setProcessandoAudio(false);
        setGravando(true);

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        mostrarMensagem("🎤 Ouvindo... (paro após 3s de silêncio)");
      };

      rec.onresult = (event) => {
        let interim = "";
        let finalChunk = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          const txt = r[0]?.transcript || "";
          if (r.isFinal) finalChunk += txt + " ";
          else interim += txt + " ";
        }

        if (finalChunk.trim()) {
          lastFinalRef.current += finalChunk;
        }

        speechBufferRef.current = (lastFinalRef.current + " " + interim).trim();
        setTextoVoz(speechBufferRef.current);

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          manualStopRef.current = false;
          wantListeningRef.current = false;

          try {
            rec.stop();
          } catch {}

          setGravando(false);
          setProcessandoAudio(false);

          finalizarPorSilencio();
        }, SILENCE_MS);
      };

      rec.onerror = (e) => {
        console.error("SpeechRecognition erro:", e);

        setGravando(false);
        setProcessandoAudio(false);

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        wantListeningRef.current = false;
        manualStopRef.current = true;

        if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
          mostrarMensagem("❌ Microfone bloqueado. Libere a permissão do navegador/app.");
        } else if (e?.error === "no-speech") {
          mostrarMensagem("❌ Não ouvi nada. Fale mais perto do microfone.");
        } else {
          mostrarMensagem("❌ Erro ao usar voz neste navegador/app.");
        }
      };

      rec.onend = () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        if (manualStopRef.current) {
          manualStopRef.current = false;
          setGravando(false);
          setProcessandoAudio(false);
          return;
        }

        if (wantListeningRef.current) {
          setTimeout(() => {
            try {
              rec.start();
            } catch {}
          }, 250);
        } else {
          setGravando(false);
          setProcessandoAudio(false);
        }
      };

      recognitionRef.current = rec;

      return () => {
        try {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          rec.onresult = null;
          rec.onstart = null;
          rec.onerror = null;
          rec.onend = null;
          rec.abort();
        } catch {}
      };
    }, []);

    const iniciarGravacao = async () => {
      if (!suportaVoz || !recognitionRef.current) {
        mostrarMensagem("❌ Seu navegador/app não suporta voz. Use o Chrome.");
        return;
      }

      setProcessandoAudio(true);

      const ok = await garantirPermissaoMicrofone();
      if (!ok) {
        setProcessandoAudio(false);
        mostrarMensagem("❌ Permissão do microfone negada. Ative nas permissões do app.");
        return;
      }

      try {
        speechBufferRef.current = "";
        lastFinalRef.current = "";
        setTextoVoz("");
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        manualStopRef.current = false;
        wantListeningRef.current = true;

        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
        setProcessandoAudio(false);
        mostrarMensagem("❌ Não consegui iniciar o áudio. Clique de novo.");
      }
    };

    const pararGravacao = () => {
      if (!recognitionRef.current) return;

      try {
        wantListeningRef.current = false;
        manualStopRef.current = true;

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        recognitionRef.current.stop();
      } catch (e) {
        console.error(e);
      } finally {
        setGravando(false);
        setProcessandoAudio(false);

        if (String(speechBufferRef.current || "").trim()) {
          finalizarPorSilencio();
        }
      }
    };

    const cartaoSelecionadoNome = useMemo(() => {
      const c = cartoes.find((x) => x.id === cartaoId);
      return c?.nome || "";
    }, [cartoes, cartaoId]);

    return (
      <div className="page">
        <h2 className="page-title">Transações</h2>

        <div className="card">
          <section className="voz-secao" aria-labelledby="titulo-voz">
            <div className="voz-cabecalho">
              <div className="voz-icone" aria-hidden="true">🎤</div>
              <div>
                <strong id="titulo-voz">Lançar compras por voz</strong>
                <span>Diga “vírgula” para começar outra compra</span>
              </div>
            </div>

            <div className="voz-acao-area">
            {!gravando && !processandoAudio && (
              <button
                type="button"
                className="voz-botao"
                onClick={iniciarGravacao}
              >
                <span className="voz-botao-icone">🎙️</span>
                <span>
                  <strong>Começar a falar</strong>
                  <small>Toque para ativar o microfone</small>
                </span>
              </button>
            )}

            {gravando && (
              <button
                type="button"
                className="voz-botao voz-botao-gravando"
                onClick={pararGravacao}
              >
                <span className="voz-botao-icone voz-pulso">●</span>
                <span>
                  <strong>Estou ouvindo...</strong>
                  <small>Toque aqui para parar</small>
                </span>
              </button>
            )}

            {processandoAudio && (
              <div className="voz-status">⏳ Iniciando microfone...</div>
            )}

            {!suportaVoz && (
              <p className="muted small" style={{ marginTop: 8 }}>
                ❌ Seu navegador/app não suporta voz. Use o Chrome.
              </p>
            )}

            </div>

            <p className="voz-ajuda">
              Cada compra aparecerá separadamente e poderá ser corrigida antes de salvar.
            </p>
          </section>

          <section className="anexos-secao" aria-labelledby="titulo-importacao">
            <div className="anexos-cabecalho">
              <div>
                <strong id="titulo-importacao">Ler movimentações de uma foto</strong>
                <span>Só compras/pagamentos aprovados e valores recebidos entram na lista</span>
              </div>
              <span className="anexos-opcional">Sem limite de itens</span>
            </div>

            <input
              ref={fotoInputRef}
              className="anexo-input-escondido"
              type="file"
              accept="image/*"
              onChange={lerGastosDaFoto}
            />
            <input
              ref={cameraInputRef}
              className="anexo-input-escondido"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={lerGastosDaFoto}
            />

            <div className="anexos-botoes">
              <button
                type="button"
                className="anexo-acao"
                onClick={() => fotoInputRef.current?.click()}
                disabled={lendoFoto}
              >
                <span>🖼️</span>
                <div>
                  <strong>Escolher foto ou print</strong>
                  <small>Ler notificações da galeria</small>
                </div>
              </button>

              <button
                type="button"
                className="anexo-acao"
                onClick={() => cameraInputRef.current?.click()}
                disabled={lendoFoto}
              >
                <span>📷</span>
                <div>
                  <strong>Tirar foto agora</strong>
                  <small>Abrir a câmera do celular</small>
                </div>
              </button>
            </div>

            {lendoFoto && (
              <div className="leitura-foto-status">
                <strong>🔎 Lendo a foto… {progressoFoto}%</strong>
                <div><span style={{ width: `${progressoFoto}%` }} /></div>
              </div>
            )}
          </section>

          {itensLote.length > 0 && !modalConferenciaAberto && (
            <section className="lote-secao">
              <div className="lote-topo">
                <div>
                  <h3>Conferir lançamentos</h3>
                  <p className="muted small">{itensLote.length} item(ns). Você pode corrigir tudo digitando.</p>
                </div>
                <button type="button" className="toggle-btn" onClick={() => setItensLote([])}>
                  Limpar lista
                </button>
              </div>

              <div className="lote-lista">
                {itensLote.map((item, indice) => (
                  <article className="lote-item" key={item.id}>
                    <div className="lote-item-topo">
                      <strong>#{indice + 1} · {item.origem === "foto" ? "📷 Foto" : "🎤 Voz"}</strong>
                      <button type="button" className="anexo-remover" onClick={() => removerItemLote(item.id)} aria-label={`Remover item ${indice + 1}`}>✕</button>
                    </div>

                    <div className="lote-campos">
                      <label>Tipo
                        <select value={item.tipo} onChange={(e) => atualizarItemLote(item.id, "tipo", e.target.value)}>
                          <option value="despesa">Despesa</option>
                          <option value="receita">Receita</option>
                          <option value="reembolso">Reembolso</option>
                        </select>
                      </label>
                      <label>Valor (R$)
                        <input type="number" step="0.01" value={item.valor} onChange={(e) => atualizarItemLote(item.id, "valor", e.target.value)} />
                      </label>
                      <label className="lote-campo-largo">Descrição
                        <input value={item.descricao} onChange={(e) => atualizarItemLote(item.id, "descricao", e.target.value)} />
                      </label>
                      {item.tipo === "despesa" && (
                        <label>Categoria
                          <select value={item.categoria} onChange={(e) => atualizarItemLote(item.id, "categoria", e.target.value)}>
                            <option value="Essencial">Essencial</option>
                            <option value="Lazer">Lazer</option>
                            <option value="Burrice">Burrice</option>
                            <option value="Investido">Investido</option>
                          </select>
                        </label>
                      )}
                      <label>Pagamento
                        <select value={item.formaPagamento} onChange={(e) => atualizarItemLote(item.id, "formaPagamento", e.target.value)}>
                          <option value="dinheiro">Dinheiro</option>
                          <option value="debito">Débito</option>
                          <option value="credito">Crédito</option>
                          <option value="pix">PIX</option>
                          <option value="outros">Outros</option>
                        </select>
                      </label>
                      {item.formaPagamento === "credito" && (
                        <label>Cartão
                          <select value={item.cartaoId} onChange={(e) => atualizarItemLote(item.id, "cartaoId", e.target.value)}>
                            <option value="">Selecione…</option>
                            {cartoes.map((cartao) => <option key={cartao.id} value={cartao.id}>{cartao.nome}</option>)}
                          </select>
                        </label>
                      )}
                      <label>Data
                        <input type="date" value={item.data} onChange={(e) => atualizarItemLote(item.id, "data", e.target.value)} />
                      </label>
                      <label>Hora
                        <input type="time" value={item.hora} onChange={(e) => atualizarItemLote(item.id, "hora", e.target.value)} />
                      </label>
                    </div>
                  </article>
                ))}
              </div>

              <button type="button" className="primary-btn lote-salvar" onClick={salvarItensLote}>
                Salvar os {itensLote.length} lançamentos
              </button>
            </section>
          )}

          <div className="manual-area" style={{ marginTop: 18 }}>
            <button
              type="button"
              className={"toggle-btn " + (mostrarManual ? "toggle-active" : "")}
              onClick={() => setMostrarManual((aberto) => !aberto)}
              aria-expanded={mostrarManual}
              style={{
                width: "100%",
                minHeight: 52,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <span>✏️ Lançar manualmente</span>
              <span>{mostrarManual ? "▲" : "▼"}</span>
            </button>

            {mostrarManual && (
              <div style={{ marginTop: 14 }}>
          <form className="form" onSubmit={handleSubmit}>
            <div className="field">
              <label>Tipo</label>
              <div className="toggle-group">
                <button
                  type="button"
                  className={"toggle-btn " + (tipo === "despesa" ? "toggle-active" : "")}
                  onClick={() => onChangeTipo("despesa")}
                >
                  Despesa
                </button>
                <button
                  type="button"
                  className={"toggle-btn " + (tipo === "receita" ? "toggle-active" : "")}
                  onClick={() => onChangeTipo("receita")}
                >
                  Receita
                </button>
              </div>
            </div>

            {/* ✅ NOVO: opção dentro de Receita */}
            {tipo === "receita" && (
              <div className="field checkbox-field">
                <label>
                  <input
                    type="checkbox"
                    checked={receitaEhReembolso}
                    onChange={(e) => setReceitaEhReembolso(e.target.checked)}
                  />{" "}
                  💸 Recebimento de empréstimo / reembolso (não conta como receita)
                </label>
                <p className="muted small" style={{ marginTop: 6 }}>
                  Ex.: você pagou algo para um amigo e ele te mandou a parte dele.
                </p>
              </div>
            )}

            <div className="field">
              <label>Data da transação</label>
              <input
                type="date"
                value={dataTransacao}
                onChange={(e) => {
                  setDataTransacao(e.target.value);
                  setDataFoiEditada(true);
                }}
              />
            </div>

            <div className="field">
              <label>Hora da transação</label>
              <input
                type="time"
                value={horaTransacao}
                onChange={(e) => {
                  setHoraTransacao(e.target.value);
                  setHoraFoiEditada(true);
                }}
              />
              <p className="muted small">
                Dica: por padrão ele usa a hora atual do seu aparelho (Brasil -03 normalmente).
              </p>
            </div>

            <div className="field">
              <label>Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Descrição</label>
              <input
                type="text"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder={isDespesa ? "Ex.: Aluguel, mercado..." : "Ex.: salário, extra"}
              />
            </div>

            {isDespesa && (
              <div className="field">
                <label>Categoria</label>
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  <option value="Essencial">Essencial</option>
                  <option value="Lazer">Lazer</option>
                  {/* ✅ CORRIGIDO */}
                  <option value="Burrice">Burrice</option>
                  <option value="Investido">Investido</option>
                </select>
              </div>
            )}

            <div className="field">
              <label>Forma de pagamento</label>
              <select value={formaPagamento} onChange={onChangeForma}>
                <option value="dinheiro">Dinheiro</option>
                <option value="debito">Débito</option>
                <option value="credito">Crédito</option>
                <option value="pix">PIX</option>
                <option value="outros">Outros</option>
              </select>
            </div>

            {formaPagamento === "credito" && (
              <div className="field">
                <label>Cartão utilizado</label>
                <select value={cartaoId || ""} onChange={(e) => setCartaoId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {cartoes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isDespesa && formaPagamento === "credito" && (
              <>
                <div className="field checkbox-field">
                  <label>
                    <input
                      type="checkbox"
                      checked={parcelado}
                      onChange={(e) => setParcelado(e.target.checked)}
                    />{" "}
                    Esta compra é parcelada?
                  </label>
                </div>

                {parcelado && (
                  <div className="field">
                    <label>Número de parcelas</label>
                    <input
                      type="number"
                      min="2"
                      max="36"
                      value={numeroParcelas}
                      onChange={(e) => setNumeroParcelas(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}

            <button className="primary-btn" style={{ marginTop: 10 }}>
              Salvar transação
            </button>

            {mensagem && <p className="feedback">{mensagem}</p>}
                </form>

              </div>
            )}
          </div>
        </div>

        {fotoAmpliada && fotoAnexo && (
          <div className="foto-modal" role="dialog" aria-modal="true" aria-label="Foto ampliada">
            <button
              type="button"
              className="foto-modal-fechar"
              onClick={() => setFotoAmpliada(false)}
              aria-label="Fechar foto"
            >
              ✕
            </button>
            <img src={fotoAnexo} alt="Comprovante ampliado" />
            <button type="button" className="foto-modal-trocar" onClick={() => fotoInputRef.current?.click()}>
              📷 Tirar outra foto
            </button>
          </div>
        )}

        {/* CENTRAL DE CONFERÊNCIA: foto e voz nunca salvam automaticamente. */}
        {modalConferenciaAberto && (
          <div
            className="conferencia-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conferencia-titulo"
          >
            <div className="conferencia-modal">
              <div className="conferencia-cabecalho">
                <div>
                  <span className="conferencia-etiqueta">REVISÃO ANTES DE SALVAR</span>
                  <h3 id="conferencia-titulo">Confira os lançamentos</h3>
                  <p>
                    Nada será salvo agora. Marque o que <strong>vai ficar</strong>,
                    edite o que estiver errado e deixe como <strong>não usar</strong>
                    o que não quiser lançar.
                  </p>
                </div>
                <button
                  type="button"
                  className="conferencia-fechar"
                  aria-label="Cancelar conferência"
                  onClick={() => {
                    setItensLote([]);
                    setModalConferenciaAberto(false);
                    setItemLoteEmEdicao(null);
                  }}
                >
                  ✕
                </button>
              </div>

              <div className="conferencia-resumo">
                <span>✅ {itensLote.filter((item) => item.usar !== false).length} vai/vão salvar</span>
                <span>🚫 {itensLote.filter((item) => item.usar === false).length} não usar</span>
              </div>

              <div className="conferencia-lista">
                {itensLote.map((item, indice) => {
                  const emEdicao = itemLoteEmEdicao === item.id;
                  const vaiUsar = item.usar !== false;
                  return (
                    <article
                      className={`conferencia-item ${vaiUsar ? "conferencia-item-usar" : "conferencia-item-ignorado"}`}
                      key={item.id}
                    >
                      <div className="conferencia-item-topo">
                        <div>
                          <span className="conferencia-numero">{indice + 1}</span>
                          <strong>{item.origem === "foto" ? "📷 Lido da foto" : "🎤 Entendido do áudio"}</strong>
                        </div>
                        <span className={vaiUsar ? "conferencia-status usar" : "conferencia-status ignorar"}>
                          {vaiUsar ? "VAI SALVAR" : "NÃO USAR"}
                        </span>
                      </div>

                      {!emEdicao ? (
                        <div className="conferencia-dados">
                          <strong>{item.descricao || "Sem descrição"}</strong>
                          <span>{formatCurrency(item.valor)} · {item.tipo} · {item.formaPagamento}</span>
                          {item.tipo === "despesa" && <span>{item.categoria}</span>}
                        </div>
                      ) : (
                        <div className="conferencia-campos">
                          <label>Descrição
                            <input value={item.descricao} onChange={(e) => atualizarItemLote(item.id, "descricao", e.target.value)} />
                          </label>
                          <label>Valor (R$)
                            <input type="number" inputMode="decimal" step="0.01" value={item.valor} onChange={(e) => atualizarItemLote(item.id, "valor", e.target.value)} />
                          </label>
                          <label>Tipo
                            <select value={item.tipo} onChange={(e) => atualizarItemLote(item.id, "tipo", e.target.value)}>
                              <option value="despesa">Despesa</option>
                              <option value="receita">Receita</option>
                              <option value="reembolso">Reembolso</option>
                            </select>
                          </label>
                          <label>Pagamento
                            <select value={item.formaPagamento} onChange={(e) => atualizarItemLote(item.id, "formaPagamento", e.target.value)}>
                              <option value="dinheiro">Dinheiro</option>
                              <option value="debito">Débito</option>
                              <option value="credito">Crédito</option>
                              <option value="pix">PIX</option>
                              <option value="outros">Outros</option>
                            </select>
                          </label>
                          {item.tipo === "despesa" && (
                            <label>Categoria
                              <select value={item.categoria} onChange={(e) => atualizarItemLote(item.id, "categoria", e.target.value)}>
                                <option value="Essencial">Essencial</option>
                                <option value="Lazer">Lazer</option>
                                <option value="Burrice">Burrice</option>
                                <option value="Investido">Investido</option>
                              </select>
                            </label>
                          )}
                        </div>
                      )}

                      <div className="conferencia-acoes-item">
                        <button type="button" className="conferencia-editar" onClick={() => setItemLoteEmEdicao(emEdicao ? null : item.id)}>
                          {emEdicao ? "✓ Terminei de editar" : "✏️ Editar"}
                        </button>
                        <button type="button" className={vaiUsar ? "conferencia-nao-usar" : "conferencia-usar"} onClick={() => alternarUsoItemLote(item.id)}>
                          {vaiUsar ? "🚫 Não usar" : "✅ Usar este"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="conferencia-rodape">
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={() => {
                    setItensLote([]);
                    setModalConferenciaAberto(false);
                    setItemLoteEmEdicao(null);
                  }}
                >
                  Cancelar tudo
                </button>
                <button type="button" className="primary-btn conferencia-salvar" onClick={salvarItensLote}>
                  ✅ Salvar os escolhidos
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ✅ MODAL DE REVISÃO (Voz) */}
        {reviewOpen && (
          <div className="modal-overlay">
            <div className="modal-card">
              <h3>Confirmar lançamento?</h3>
              <p className="muted small" style={{ marginTop: 6 }}>
                Eu esperei <strong>3 segundos de silêncio</strong> e preenchi os campos. Confira e confirme.
              </p>

              <div className="card" style={{ marginTop: 10 }}>
                <p className="muted small" style={{ marginBottom: 6 }}>
                  Você falou:
                </p>
                <p style={{ marginBottom: 10 }}>"{reviewText}"</p>

                <p className="muted small">
                  <strong>Tipo:</strong>{" "}
                  {tipo === "receita" && receitaEhReembolso ? "reembolso (não conta como receita)" : tipo}
                  <br />
                  <strong>Data:</strong> {dataTransacao || "-"}
                  <br />
                  <strong>Hora:</strong> {horaTransacao || "-"}
                  <br />
                  <strong>Valor:</strong> {valor ? formatCurrency(valor) : "-"}
                  <br />
                  <strong>Descrição:</strong> {descricao || "-"}
                  <br />
                  {tipo === "despesa" ? (
                    <>
                      <strong>Categoria:</strong> {categoria || "-"}
                      <br />
                    </>
                  ) : null}
                  <strong>Pagamento:</strong> {formaPagamento || "-"}
                  <br />
                  {formaPagamento === "credito" ? (
                    <>
                      <strong>Cartão:</strong> {cartaoSelecionadoNome || "(não selecionado)"}
                      <br />
                      <strong>Parcelado:</strong> {parcelado ? `Sim (${numeroParcelas}x)` : "Não"}
                      <br />
                    </>
                  ) : null}
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
                  onClick={() => {
                    setReviewOpen(false);
                    setReviewText("");
                  }}
                >
                  Ajustar manualmente
                </button>

                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => {
                    setReviewOpen(false);
                    confirmarSalvarAtual();
                  }}
                >
                  ✅ Confirmar e salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: limite do cartão estourado */}
        {mostrarConfirmCredito && pendenteCredito && (
          <div className="modal-overlay">
            <div className="modal-card">
              <h3>Limite do cartão estourado</h3>
              <p className="muted small">
                Cartão: <strong>{pendenteCredito.cartaoNome}</strong>
                <br />
                Limite: {formatCurrency(pendenteCredito.limite)}
                <br />
                Gasto atual: {formatCurrency(pendenteCredito.gastoAtual)}
                <br />
                Esta compra vai exceder o limite em{" "}
                <strong>{formatCurrency(pendenteCredito.excedente)}</strong>.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                <button type="button" className="primary-btn" onClick={confirmarCompraEstourandoLimite}>
                  ✅ Sim, lançar mesmo assim
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  style={{ background: "#374151", color: "#e5e7eb" }}
                  onClick={cancelarCompraCredito}
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
