// src/pages/EstudosPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useFinance } from "../../App.jsx";

/* -------------------- helpers -------------------- */

function pad2(n) {
  return String(n).padStart(2, "0");
}
function ymdFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function dateFromYMD(ymd) {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function addDaysYMD(ymd, delta) {
  const dt = dateFromYMD(ymd);
  if (!dt) return ymd;
  dt.setDate(dt.getDate() + Number(delta || 0));
  return ymdFromDate(dt);
}
function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function formatMinutes(min) {
  const m = Number(min || 0);
  if (!m) return "—";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${mm} min`;
  if (mm === 0) return `${h}h`;
  return `${h}h${pad2(mm)}`;
}

function parseDurationToMinutes(s) {
  const raw = String(s || "").trim().toLowerCase();
  if (!raw) return 0;

  const mClock = raw.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
  if (mClock) return Number(mClock[1]) * 60 + Number(mClock[2]);

  let minutes = 0;

  const mh = raw.match(/(\d+)\s*h/);
  if (mh) minutes += Number(mh[1]) * 60;

  const mmin = raw.match(/(\d+)\s*min/);
  if (mmin) minutes += Number(mmin[1]);

  const mhm = raw.match(/(\d+)\s*h\s*(\d{1,2})\b/);
  if (mhm && !mmin) minutes += Number(mhm[2] || 0);

  if (minutes > 0) return minutes;

  if (/^\d+$/.test(raw)) return Number(raw);

  return 0;
}

/**
 * Parser para cronograma grande:
 * - cabeçalho: 2026-02-18:
 * - itens: - 09:00 Matemática: ... (60min)
 * - Revisão: Física - Newton (30min)
 */
function parseCronogramaText(text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let currentYMD = null;
  const items = [];
  const todayYMD = ymdFromDate(new Date());

  for (const line of lines) {
    const mYMD = line.match(/^(\d{4})-(\d{2})-(\d{2})\s*:?\s*$/);
    if (mYMD) {
      currentYMD = `${mYMD[1]}-${mYMD[2]}-${mYMD[3]}`;
      continue;
    }

    const clean = line.replace(/^[-•]\s*/, "");

    let hora = "";
    let rest = clean;
    const mHora = clean.match(/^(\d{1,2}:\d{2})\s+(.*)$/);
    if (mHora) {
      hora = mHora[1];
      rest = mHora[2];
    }

    let tipo = /revis[aã]o/i.test(rest) ? "revisao" : "conteudo";

    let minutos = 0;
    const mTime = rest.match(/\(([^)]+)\)\s*$/);
    if (mTime) {
      minutos = parseDurationToMinutes(mTime[1]);
      rest = rest.replace(/\(([^)]+)\)\s*$/, "").trim();
    } else {
      const mTime2 = rest.match(/(?:-|—)?\s*(\d+\s*h(?:\s*\d{1,2})?|\d+\s*min|\d{1,2}:\d{2}|\d+)\s*$/i);
      if (mTime2) {
        minutos = parseDurationToMinutes(mTime2[1]);
        rest = rest.replace(mTime2[0], "").trim();
      }
    }

    let materia = "";
    let conteudo = "";

    const mSplit = rest.match(/^([^:]+)\s*:\s*(.+)$/);
    if (mSplit) {
      materia = String(mSplit[1]).trim();
      conteudo = String(mSplit[2]).trim();
    } else {
      const mSplit2 = rest.match(/^([^-–—]+)\s*[-–—]\s*(.+)$/);
      if (mSplit2) {
        materia = String(mSplit2[1]).trim();
        conteudo = String(mSplit2[2]).trim();
      } else {
        materia = "Estudos";
        conteudo = rest.trim();
      }
    }

    if (/^revis[aã]o$/i.test(materia)) {
      tipo = "revisao";
      const mMat = conteudo.match(/^([A-Za-zÀ-ÿ0-9 ]+)\s*[:\-–—]\s*(.+)$/);
      if (mMat) {
        materia = mMat[1].trim();
        conteudo = mMat[2].trim();
      } else {
        materia = "Revisão";
      }
    }

    items.push({
      id: makeId(),
      ymd: currentYMD || todayYMD,
      hora,
      materia,
      conteudo,
      minutos: Number(minutos || 0),
      tipo,
      status: "pendente",
      createdAtISO: new Date().toISOString(),
      doneAtISO: "",
      nota: "",
    });
  }

  return items;
}

/* -------------------- toast -------------------- */

function Toast({ text, onClose }) {
  if (!text) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 9999,
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(0,0,0,0.75)",
        color: "#fff",
        fontSize: 14,
        maxWidth: 320,
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
      onClick={onClose}
      role="status"
      aria-live="polite"
      title="Clique para fechar"
    >
      {text}
    </div>
  );
}

/* -------------------- pie (sem libs) -------------------- */

function PieChart({ data }) {
  const total = data.reduce((acc, d) => acc + Number(d.value || 0), 0);
  if (!total) return <p className="muted small" style={{ marginTop: 10 }}>Sem dados suficientes para o gráfico.</p>;

  const colors = [
    "#4f8cff", "#9b6bff", "#ff7aa2", "#ffb86b", "#63d297",
    "#39c6d6", "#ffd36b", "#b9c0ff", "#ff6b6b", "#6bffb2"
  ];

  let acc = 0;
  const stops = data.map((d, i) => {
    const v = Number(d.value || 0);
    const start = (acc / total) * 360;
    acc += v;
    const end = (acc / total) * 360;
    const color = colors[i % colors.length];
    return `${color} ${start}deg ${end}deg`;
  });

  const bg = `conic-gradient(${stops.join(",")})`;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "center", marginTop: 10 }}>
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: bg,
          boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
        }}
        aria-label="Gráfico de pizza"
        title="Gráfico de pizza"
      />
      <div style={{ display: "grid", gap: 6 }}>
        {data.map((d, i) => {
          const color = colors[i % colors.length];
          const pct = Math.round((Number(d.value || 0) / total) * 100);
          return (
            <div key={d.label} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
                <span style={{ fontSize: 14 }}>{d.label}</span>
              </div>
              <span className="muted small">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------- page -------------------- */

export default function EstudosPage() {
  const { estudos, setEstudos } = useFinance();

  const tarefas = estudos?.tarefas || [];
  const materias = estudos?.materias || [];

  const hojeYMD = useMemo(() => ymdFromDate(new Date()), []);

  // “abas” (botões normais)
  const [secao, setSecao] = useState("hoje"); // hoje | cronograma | analises | ajustes

  const [toast, setToast] = useState("");

  const [diaSelecionado, setDiaSelecionado] = useState(hojeYMD);
  const [busca, setBusca] = useState("");

  // cronograma
  const [textoCronograma, setTextoCronograma] = useState("");

  // análises
  const [intervaloDias, setIntervaloDias] = useState(30);

  // ajustes (a partir de um dia)
  const [inicioAjuste, setInicioAjuste] = useState(hojeYMD);

  // 1) trocar matéria
  const [trocaDe, setTrocaDe] = useState("");
  const [trocaPara, setTrocaPara] = useState("");

  // 2) mover cronograma
  const [moverDelta, setMoverDelta] = useState(7);

  // 3) substituir cronograma
  const [textoSubstituir, setTextoSubstituir] = useState("");

  // toast auto-fecha 3s
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const setTarefas = (updater) => {
    setEstudos((prev) => {
      const base = prev && typeof prev === "object" ? prev : { tarefas: [], materias: [] };
      const nextTarefas = typeof updater === "function" ? updater(base.tarefas || []) : updater;
      return { ...base, tarefas: nextTarefas };
    });
  };

  const setMaterias = (updater) => {
    setEstudos((prev) => {
      const base = prev && typeof prev === "object" ? prev : { tarefas: [], materias: [] };
      const nextMaterias = typeof updater === "function" ? updater(base.materias || []) : updater;
      return { ...base, materias: nextMaterias };
    });
  };

  const tarefasHoje = useMemo(() => {
    return (tarefas || [])
      .filter((t) => t.ymd === hojeYMD)
      .sort((a, b) => (a.hora || "99:99").localeCompare(b.hora || "99:99"));
  }, [tarefas, hojeYMD]);

  const resumoHoje = useMemo(() => {
    const itens = tarefasHoje;
    const pend = itens.filter((t) => t.status !== "feito").length;
    const feitos = itens.filter((t) => t.status === "feito").length;
    const totalMin = itens.reduce((acc, t) => acc + Number(t.minutos || 0), 0);
    return { pend, feitos, totalMin, qtd: itens.length };
  }, [tarefasHoje]);

  const tarefasDoDiaSelecionado = useMemo(() => {
    const q = String(busca || "").trim().toLowerCase();
    return (tarefas || [])
      .filter((t) => t.ymd === diaSelecionado)
      .filter((t) => {
        if (!q) return true;
        const blob = `${t.materia} ${t.conteudo} ${t.nota || ""}`.toLowerCase();
        return blob.includes(q);
      })
      .sort((a, b) => (a.hora || "99:99").localeCompare(b.hora || "99:99"));
  }, [tarefas, diaSelecionado, busca]);

  function importarCronograma() {
    const parsed = parseCronogramaText(textoCronograma);
    if (!parsed.length) {
      setToast("Não consegui ler. Use datas: 2026-02-18: e itens com (2h) ou (40min).");
      return;
    }
    setTarefas((prev) => [...parsed, ...(prev || [])]);
    setTextoCronograma("");
    setToast(`Importado: ${parsed.length} item(ns).`);
    if (parsed[0]?.ymd) setDiaSelecionado(parsed[0].ymd);
  }

  function marcarFeito(id) {
    setTarefas((prev) =>
      (prev || []).map((t) =>
        t.id === id ? { ...t, status: "feito", doneAtISO: new Date().toISOString() } : t
      )
    );
    setToast("Marcado como feito.");
  }

  function desfazerFeito(id) {
    setTarefas((prev) =>
      (prev || []).map((t) => (t.id === id ? { ...t, status: "pendente", doneAtISO: "" } : t))
    );
    setToast("Desfeito.");
  }

  function removerTarefa(id) {
    setTarefas((prev) => (prev || []).filter((t) => t.id !== id));
    setToast("Removido.");
  }

  function salvarNotaTarefa(id, nota) {
    setTarefas((prev) =>
      (prev || []).map((t) => (t.id === id ? { ...t, nota: String(nota || "") } : t))
    );
  }

  /* -------------------- análises -------------------- */

  // pizza por matéria (tempo FEITO)
  const pizzaMateria = useMemo(() => {
    const map = new Map();
    (tarefas || [])
      .filter((t) => t.status === "feito")
      .forEach((t) => {
        const key = String(t.materia || "Outros").trim() || "Outros";
        map.set(key, (map.get(key) || 0) + Number(t.minutos || 0));
      });
    const arr = Array.from(map.entries()).map(([label, value]) => ({ label, value }));
    arr.sort((a, b) => b.value - a.value);
    return arr.slice(0, 10);
  }, [tarefas]);

  // pizza “dias estudados vs não estudados”
  const pizzaDias = useMemo(() => {
    const n = Math.max(1, Number(intervaloDias || 30));
    const end = dateFromYMD(hojeYMD);
    if (!end) return [{ label: "Estudados", value: 0 }, { label: "Não estudados", value: 0 }];

    const studiedSet = new Set();
    // dia estudado = tem pelo menos 1 tarefa FEITA naquele dia
    (tarefas || []).forEach((t) => {
      if (t.status === "feito" && t.ymd) studiedSet.add(t.ymd);
    });

    let studied = 0;
    for (let i = 0; i < n; i++) {
      const d = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      d.setDate(d.getDate() - i);
      const key = ymdFromDate(d);
      if (studiedSet.has(key)) studied += 1;
    }
    const notStudied = n - studied;

    return [
      { label: "Estudados", value: studied },
      { label: "Não estudados", value: notStudied },
    ];
  }, [tarefas, intervaloDias, hojeYMD]);

  // autoavaliação (bom/ruim) continua existindo e fica em análises
  const materiasDetectadas = useMemo(() => {
    const set = new Set();
    (tarefas || []).forEach((t) => {
      const m = String(t.materia || "").trim();
      if (m) set.add(m);
    });
    (materias || []).forEach((m) => {
      const nome = String(m.nome || "").trim();
      if (nome) set.add(nome);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tarefas, materias]);

  const materiasResumo = useMemo(() => {
    const byName = new Map((materias || []).map((m) => [m.nome, m]));
    return materiasDetectadas.map((nome) => {
      const m = byName.get(nome);
      return {
        nome,
        nivel: m?.nivel || "medio",
        obs: m?.obs || "",
      };
    });
  }, [materias, materiasDetectadas]);

  const [materiaSelecionada, setMateriaSelecionada] = useState("");
  const [notaMateria, setNotaMateria] = useState("");
  const [nivelMateria, setNivelMateria] = useState("medio"); // bom|medio|ruim

  function carregarMateria(nome) {
    const found = (materias || []).find((m) => m.nome === nome);
    setMateriaSelecionada(nome);
    setNotaMateria(found?.obs || "");
    setNivelMateria(found?.nivel || "medio");
  }

  function salvarMateria() {
    const nome = String(materiaSelecionada || "").trim();
    if (!nome) {
      setToast("Escolha uma matéria.");
      return;
    }
    setMaterias((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const idx = list.findIndex((m) => m.nome === nome);
      const novo = { nome, nivel: nivelMateria, obs: notaMateria };
      if (idx >= 0) {
        const next = [...list];
        next[idx] = { ...next[idx], ...novo };
        return next;
      }
      return [...list, novo];
    });
    setToast("Matéria salva.");
  }

  /* -------------------- ajustes: a partir de um dia -------------------- */

  function trocarMateriaAPartir() {
    const start = String(inicioAjuste || "").trim();
    const de = String(trocaDe || "").trim();
    const para = String(trocaPara || "").trim();

    if (!start || !de || !para) {
      setToast("Preencha: data, matéria DE e matéria PARA.");
      return;
    }

    setTarefas((prev) =>
      (prev || []).map((t) => {
        if (String(t.ymd) >= start && String(t.materia || "").trim() === de) {
          return { ...t, materia: para };
        }
        return t;
      })
    );

    setToast(`Troca aplicada a partir de ${start}.`);
  }

  function moverCronogramaAPartir() {
    const start = String(inicioAjuste || "").trim();
    const delta = Number(moverDelta || 0);
    if (!start || !Number.isFinite(delta) || delta === 0) {
      setToast("Preencha: data e um delta diferente de 0.");
      return;
    }

    setTarefas((prev) =>
      (prev || []).map((t) => {
        if (String(t.ymd) >= start) {
          const novoYMD = addDaysYMD(t.ymd, delta);
          return { ...t, ymd: novoYMD };
        }
        return t;
      })
    );

    setToast(`Cronograma movido ${delta} dia(s) a partir de ${start}.`);
  }

  function substituirCronogramaAPartir() {
    const start = String(inicioAjuste || "").trim();
    if (!start) {
      setToast("Escolha a data de início.");
      return;
    }

    const parsed = parseCronogramaText(textoSubstituir);
    if (!parsed.length) {
      setToast("Cole um cronograma válido com datas (YYYY-MM-DD:).");
      return;
    }

    // mantém passado (< start), troca futuro (>= start)
    const novoFuturo = parsed.filter((t) => String(t.ymd) >= start);

    setTarefas((prev) => {
      const passado = (prev || []).filter((t) => String(t.ymd) < start);
      return [...novoFuturo, ...passado];
    });

    setTextoSubstituir("");
    setToast(`Substituído a partir de ${start}.`);
  }

  /* -------------------- UI -------------------- */

  return (
    <div className="card">
      <Toast text={toast} onClose={() => setToast("")} />

      <h2 className="page-title">📚 Estudos</h2>

      {/* BOTÕES NORMAIS (sem modal) */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button
          type="button"
          className={secao === "hoje" ? "primary-btn" : "toggle-btn"}
          style={{ width: "auto" }}
          onClick={() => setSecao("hoje")}
        >
          📅 Hoje
        </button>

        <button
          type="button"
          className={secao === "cronograma" ? "primary-btn" : "toggle-btn"}
          style={{ width: "auto" }}
          onClick={() => setSecao("cronograma")}
        >
          📥 Cronograma
        </button>

        <button
          type="button"
          className={secao === "analises" ? "primary-btn" : "toggle-btn"}
          style={{ width: "auto" }}
          onClick={() => setSecao("analises")}
        >
          📊 Análises
        </button>

        <button
          type="button"
          className={secao === "ajustes" ? "primary-btn" : "toggle-btn"}
          style={{ width: "auto" }}
          onClick={() => setSecao("ajustes")}
        >
          🛠 Ajustes
        </button>
      </div>

      {/* -------------------- HOJE -------------------- */}
      {secao === "hoje" && (
        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          <div style={{ fontWeight: 700 }}>Hoje ({hojeYMD})</div>
          <div className="muted small" style={{ marginTop: 6 }}>
            Pendentes: <b>{resumoHoje.pend}</b> • Feitos: <b>{resumoHoje.feitos}</b> • Total: <b>{formatMinutes(resumoHoje.totalMin)}</b>
          </div>

          {tarefasHoje.length === 0 ? (
            <p className="muted small" style={{ marginTop: 10 }}>Sem tarefas para hoje.</p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {tarefasHoje.map((t) => {
                const feito = t.status === "feito";
                return (
                  <div key={t.id} className="card" style={{ padding: 12, opacity: feito ? 0.75 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 240, flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>
                          {t.hora ? `🕘 ${t.hora} — ` : ""}
                          {t.materia} {t.tipo === "revisao" ? "🔁" : ""}
                        </div>
                        <div className="muted small" style={{ marginTop: 4 }}>{t.conteudo}</div>
                        <div className="muted small" style={{ marginTop: 6 }}>⏱ {formatMinutes(t.minutos)}</div>

                        <div style={{ marginTop: 10 }}>
                          <label className="muted small">Observação desta tarefa</label>
                          <input
                            className="input"
                            value={t.nota || ""}
                            onChange={(e) => salvarNotaTarefa(t.id, e.target.value)}
                            placeholder='Ex: "tô fraco nisso, revisar de novo"'
                          />
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {!feito ? (
                          <button type="button" className="primary-btn" onClick={() => marcarFeito(t.id)} style={{ width: "auto" }}>
                            ✅ Feito
                          </button>
                        ) : (
                          <button type="button" className="toggle-btn" onClick={() => desfazerFeito(t.id)} style={{ width: "auto" }}>
                            ↩️ Desfazer
                          </button>
                        )}
                        <button type="button" className="toggle-btn" onClick={() => removerTarefa(t.id)} style={{ width: "auto" }}>
                          🗑 Remover
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* -------------------- CRONOGRAMA -------------------- */}
      {secao === "cronograma" && (
        <div style={{ marginTop: 12 }}>
          <div className="card" style={{ padding: 12 }}>
            <h3 style={{ margin: 0 }}>📥 Colar cronograma</h3>
            <p className="muted small" style={{ marginTop: 6 }}>
              Use datas (cronograma de ano):
              <br />
              <span className="muted small">
                2026-02-18:
                <br />- 09:00 Matemática: Equações (60min)
                <br />- Revisão: Física - Newton (30min)
              </span>
            </p>

            <textarea
              className="input"
              value={textoCronograma}
              onChange={(e) => setTextoCronograma(e.target.value)}
              rows={10}
              placeholder="Cole aqui..."
              style={{ width: "100%", resize: "vertical" }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" className="toggle-btn" onClick={() => setTextoCronograma("")} style={{ width: "auto" }}>
                Limpar texto
              </button>
              <button type="button" className="primary-btn" onClick={importarCronograma} style={{ width: "auto" }}>
                ➕ Importar
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <h3 style={{ margin: 0 }}>📅 Ver um dia específico</h3>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
              <label className="muted small">Dia:</label>
              <input
                type="date"
                value={diaSelecionado}
                onChange={(e) => setDiaSelecionado(e.target.value)}
                className="input"
                style={{ maxWidth: 180 }}
              />

              <input
                type="text"
                className="input"
                placeholder="Buscar (matéria, conteúdo, nota)..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{ flex: 1, minWidth: 220 }}
              />
            </div>

            {tarefasDoDiaSelecionado.length === 0 ? (
              <p className="muted small" style={{ marginTop: 10 }}>Nada para este dia.</p>
            ) : (
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {tarefasDoDiaSelecionado.map((t) => {
                  const feito = t.status === "feito";
                  return (
                    <div key={t.id} className="card" style={{ padding: 12, opacity: feito ? 0.75 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 240, flex: 1 }}>
                          <div style={{ fontWeight: 700 }}>
                            {t.hora ? `🕘 ${t.hora} — ` : ""}
                            {t.materia} {t.tipo === "revisao" ? "🔁" : ""}
                          </div>
                          <div className="muted small" style={{ marginTop: 4 }}>{t.conteudo}</div>
                          <div className="muted small" style={{ marginTop: 6 }}>
                            ⏱ {formatMinutes(t.minutos)} • 📅 {t.ymd}
                          </div>

                          <div style={{ marginTop: 10 }}>
                            <label className="muted small">Observação desta tarefa</label>
                            <input
                              className="input"
                              value={t.nota || ""}
                              onChange={(e) => salvarNotaTarefa(t.id, e.target.value)}
                              placeholder='Ex: "preciso repetir exercícios"'
                            />
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          {!feito ? (
                            <button type="button" className="primary-btn" onClick={() => marcarFeito(t.id)} style={{ width: "auto" }}>
                              ✅ Feito
                            </button>
                          ) : (
                            <button type="button" className="toggle-btn" onClick={() => desfazerFeito(t.id)} style={{ width: "auto" }}>
                              ↩️ Desfazer
                            </button>
                          )}
                          <button type="button" className="toggle-btn" onClick={() => removerTarefa(t.id)} style={{ width: "auto" }}>
                            🗑 Remover
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------- ANÁLISES -------------------- */}
      {secao === "analises" && (
        <div style={{ marginTop: 12 }}>
          <div className="card" style={{ padding: 12 }}>
            <h3 style={{ margin: 0 }}>📊 Dias estudados vs não estudados</h3>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
              <label className="muted small">Intervalo:</label>
              <select className="input" style={{ maxWidth: 220 }} value={intervaloDias} onChange={(e) => setIntervaloDias(Number(e.target.value))}>
                <option value={7}>Últimos 7 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={90}>Últimos 90 dias</option>
                <option value={365}>Últimos 365 dias</option>
              </select>
            </div>

            <PieChart data={pizzaDias} />
          </div>

          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <h3 style={{ margin: 0 }}>🧠 Tempo estudado por matéria (tarefas FEITAS)</h3>
            <PieChart data={pizzaMateria} />
          </div>

          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <h3 style={{ margin: 0 }}>✅ Bom / ➖ Médio / ⚠️ Ruim (por matéria)</h3>

            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              <label className="muted small">Escolha uma matéria</label>
              <select
                className="input"
                value={materiaSelecionada}
                onChange={(e) => carregarMateria(e.target.value)}
              >
                <option value="">— selecionar —</option>
                {materiasDetectadas.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              <label className="muted small">Como você se sente nessa matéria?</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={nivelMateria === "bom" ? "primary-btn" : "toggle-btn"}
                  style={{ width: "auto" }}
                  onClick={() => setNivelMateria("bom")}
                >
                  ✅ Bom
                </button>
                <button
                  type="button"
                  className={nivelMateria === "medio" ? "primary-btn" : "toggle-btn"}
                  style={{ width: "auto" }}
                  onClick={() => setNivelMateria("medio")}
                >
                  ➖ Médio
                </button>
                <button
                  type="button"
                  className={nivelMateria === "ruim" ? "primary-btn" : "toggle-btn"}
                  style={{ width: "auto" }}
                  onClick={() => setNivelMateria("ruim")}
                >
                  ⚠️ Ruim
                </button>
              </div>

              <label className="muted small">Observações</label>
              <textarea
                className="input"
                rows={4}
                value={notaMateria}
                onChange={(e) => setNotaMateria(e.target.value)}
                placeholder='Ex: "tô fraco em função, preciso fazer mais questões"'
                style={{ width: "100%", resize: "vertical" }}
              />

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="button" className="primary-btn" onClick={salvarMateria} style={{ width: "auto" }}>
                  💾 Salvar
                </button>
              </div>

              <div style={{ marginTop: 6 }}>
                <div className="muted small" style={{ marginBottom: 6 }}>Resumo:</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {materiasResumo.map((m) => (
                    <div key={m.nome} className="card" style={{ padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <b>{m.nome}</b>
                        <span className="muted small">
                          {m.nivel === "bom" ? "✅ Bom" : m.nivel === "ruim" ? "⚠️ Ruim" : "➖ Médio"}
                        </span>
                      </div>
                      {m.obs ? <div className="muted small" style={{ marginTop: 6 }}>{m.obs}</div> : null}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* -------------------- AJUSTES (a partir de um dia) -------------------- */}
      {secao === "ajustes" && (
        <div style={{ marginTop: 12 }}>
          <div className="card" style={{ padding: 12 }}>
            <h3 style={{ margin: 0 }}>🛠 Mudanças a partir de um dia (sem mexer no passado)</h3>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
              <label className="muted small">A partir de:</label>
              <input
                type="date"
                className="input"
                style={{ maxWidth: 180 }}
                value={inicioAjuste}
                onChange={(e) => setInicioAjuste(e.target.value)}
              />
              <span className="muted small">(* tudo com data ≥ essa)</span>
            </div>
          </div>

          {/* trocar matéria */}
          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <h3 style={{ margin: 0 }}>🔁 Trocar matéria (do dia X em diante)</h3>

            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              <label className="muted small">Matéria DE</label>
              <input className="input" value={trocaDe} onChange={(e) => setTrocaDe(e.target.value)} placeholder="Ex: Física" />

              <label className="muted small">Matéria PARA</label>
              <input className="input" value={trocaPara} onChange={(e) => setTrocaPara(e.target.value)} placeholder="Ex: Química" />

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="button" className="primary-btn" onClick={trocarMateriaAPartir} style={{ width: "auto" }}>
                  ✅ Aplicar troca
                </button>
              </div>
            </div>
          </div>

          {/* mover cronograma */}
          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <h3 style={{ margin: 0 }}>📦 Mover cronograma (do dia X em diante)</h3>
            <p className="muted small" style={{ marginTop: 6 }}>
              Ex: +7 empurra 1 semana; -1 puxa 1 dia.
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
              <label className="muted small">Delta (dias):</label>
              <input
                type="number"
                className="input"
                style={{ maxWidth: 160 }}
                value={moverDelta}
                onChange={(e) => setMoverDelta(Number(e.target.value))}
              />

              <button type="button" className="primary-btn" onClick={moverCronogramaAPartir} style={{ width: "auto" }}>
                ✅ Mover
              </button>
            </div>
          </div>

          {/* substituir cronograma */}
          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <h3 style={{ margin: 0 }}>🧼 Substituir cronograma (do dia X em diante)</h3>
            <p className="muted small" style={{ marginTop: 6 }}>
              Isso mantém o passado e troca o futuro. Cole um cronograma com datas (YYYY-MM-DD:).
            </p>

            <textarea
              className="input"
              rows={10}
              value={textoSubstituir}
              onChange={(e) => setTextoSubstituir(e.target.value)}
              placeholder="Cole aqui o novo cronograma..."
              style={{ width: "100%", resize: "vertical", marginTop: 10 }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" className="toggle-btn" onClick={() => setTextoSubstituir("")} style={{ width: "auto" }}>
                Limpar texto
              </button>
              <button type="button" className="primary-btn" onClick={substituirCronogramaAPartir} style={{ width: "auto" }}>
                ✅ Substituir a partir de {inicioAjuste}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
