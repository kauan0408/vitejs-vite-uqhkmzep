// src/pages/ListaPage.jsx

// Importa React e hooks usados na página:
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFinance } from "../../App.jsx";
import "./ListaPage.css";

// ✅ Firebase (online sync)
// Ajuste o caminho se o seu firebase estiver em outro lugar
import { auth, db } from "../../firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

// Chave do localStorage onde a versão atual (v2) das listas é salva
const LS_KEY = "pwa_listas_v2";

// Constante em milissegundos de 1 semana (usada para auto-apagar listas 100% concluídas)
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Faz JSON.parse com segurança: se quebrar, retorna fallback
function safeJSONParse(v, fallback) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

// Gera um ID único:
function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

// Retorna data/hora atual em ISO string (ex.: 2026-01-22T...Z)
function nowISO() {
  return new Date().toISOString();
}

// Normaliza texto para facilitar comparação/busca:
function normalizeText(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// Calcula progresso de uma lista:
function calcProgress(items) {
  const total = items.length;
  const done = items.filter((i) => i.status === "done").length;
  const issue = items.filter((i) => i.status === "issue").length;
  const pending = total - done - issue;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pending, issue, percent };
}

// Formata uma data ISO para pt-BR (somente data)
function fmtDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
}

function splitIntoItems(raw) {
  const s = String(raw || "")
    .replace(/\bvirgula\b/gi, ",")
    .replace(/\bvírgula\b/gi, ",");
  return s
    .split(/[;,]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function numberValue(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function brl(v) {
  return numberValue(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseItemText(text) {
  const raw = String(text || "").trim();
  const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*(x|un|unid|unidade|unidades|kg|g|l|ml|pacote|pacotes|caixa|caixas)?\s+(.+)$/i);
  if (!m) return { text: raw, quantity: "", unit: "" };
  return {
    text: m[3].trim(),
    quantity: m[1].replace(",", "."),
    unit: (m[2] || "").toLowerCase(),
  };
}

const LIST_CATEGORIES = [
  ["mercado", "🛒 Mercado"],
  ["feira", "🥬 Feira"],
  ["casa", "🏠 Casa"],
  ["eletro", "🔌 Eletrodomésticos"],
  ["presentes", "🎁 Presentes"],
  ["escolar", "📚 Material escolar"],
  ["outros", "📋 Outros"],
];

const PRIORITIES = {
  urgente: "🔴 Urgente",
  normal: "🟡 Normal",
  depois: "🔵 Quando der",
};

/* ---------------- UI pieces (Modal / Toast) ---------------- */

function Modal({ open, title, children, onClose }) {
  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="lista-modal-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="lista-modal-card"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="lista-modal-header">
          <strong className="lista-modal-title">{title}</strong>

          <button
            type="button"
            className="lista-modal-close"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="lista-modal-content">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function Toast({ text }) {
  if (!text) return null;
  return (
    <div
      className="lista-toast"
      style={{
        position: "fixed",
        top: 18,
        right: 18,
        left: "auto",
        zIndex: 99999,
        maxWidth: "min(360px, calc(100vw - 36px))",
      }}
    >
      {text}
    </div>
  );
}

function ProgressBar({ percent }) {
  return (
    <div className="progress-bar" aria-label={`Progresso ${percent}%`}>
      <div className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

function Tab({ active, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className={"chip " + (active ? "chip-active" : "")}>
      {label}
    </button>
  );
}

/* -------------------- Page -------------------- */

export default function ListaPage() {
  const { lembretes, setLembretes } = useFinance?.() || {};
  const [store, setStore] = useState({
    version: 2,
    lists: {},
    items: {},
    ui: { selectedListId: null },
  });

  // ✅ ONLINE state
  const [uid, setUid] = useState(null);
  const [cloudReady, setCloudReady] = useState(false);

  const [newItemText, setNewItemText] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("pending");
  const [toastText, setToastText] = useState("");

  const [modalCreateOpen, setModalCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createType, setCreateType] = useState("compras");
  const [createCategory, setCreateCategory] = useState("mercado");
  const [createAutoDelete, setCreateAutoDelete] = useState("7dias");

  const [modalRenameOpen, setModalRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState({
    title: "",
    body: "",
    danger: false,
    action: null,
  });

  const [menuModalOpen, setMenuModalOpen] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState("");
  const [detailQuantity, setDetailQuantity] = useState("");
  const [detailUnit, setDetailUnit] = useState("");
  const [detailEstimated, setDetailEstimated] = useState("");
  const [detailPaid, setDetailPaid] = useState("");
  const [detailCategory, setDetailCategory] = useState("");
  const [detailPriority, setDetailPriority] = useState("normal");
  const [detailNote, setDetailNote] = useState("");
  const [detailPinned, setDetailPinned] = useState(false);

  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderItemId, setReminderItemId] = useState("");
  const [reminderWhen, setReminderWhen] = useState("");

  const [isListening, setIsListening] = useState(false);
  const recRef = useRef(null);
  const voiceFinalRef = useRef("");
  const restartingRef = useRef(false);

  // Revisão do que foi falado antes de realmente adicionar à lista.
  const [voiceReviewOpen, setVoiceReviewOpen] = useState(false);
  const [voiceDraftItems, setVoiceDraftItems] = useState([]);

  // ✅ FIX: ref para o estado atual de escuta (evita “state stale” no onend)
  const listeningRef = useRef(false);

  function toastMsg(texto) {
    setToastText(texto);
  }

  useEffect(() => {
    if (!toastText) return;
    const t = setTimeout(() => setToastText(""), 3000);
    return () => clearTimeout(t);
  }, [toastText]);


  useEffect(() => {
    if (!voiceReviewOpen || typeof document === "undefined") return undefined;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflowAnterior;
    };
  }, [voiceReviewOpen]);

  // ---- Auto-clean: delete lists 100% done after 1 week
  function cleanupAutoDeleteLists(currentStore) {
    const now = Date.now();
    const nextLists = { ...currentStore.lists };
    const nextItems = { ...currentStore.items };
    let changed = false;

    for (const listId of Object.keys(nextLists)) {
      const list = nextLists[listId];
      const items = Array.isArray(nextItems[listId]) ? nextItems[listId] : [];
      const p = calcProgress(items);

      if (p.total > 0 && p.percent === 100) {
        if (!list.completedAt) {
          nextLists[listId] = { ...list, completedAt: nowISO() };
          changed = true;
        } else if ((list.autoDelete || "7dias") === "7dias") {
          const completedMs = new Date(list.completedAt).getTime();
          if (!isNaN(completedMs) && now - completedMs >= ONE_WEEK_MS) {
            delete nextLists[listId];
            delete nextItems[listId];
            changed = true;
          }
        }
      } else {
        if (list.completedAt) {
          nextLists[listId] = { ...list, completedAt: null };
          changed = true;
        }
      }
    }

    if (!changed) return currentStore;

    const remainingIds = Object.keys(nextLists);
    const selected = currentStore.ui.selectedListId;
    const nextSelected = selected && nextLists[selected] ? selected : remainingIds[0] || null;

    return {
      ...currentStore,
      lists: nextLists,
      items: nextItems,
      ui: { ...currentStore.ui, selectedListId: nextSelected },
    };
  }

  /* -------------------- ✅ FIRESTORE helpers -------------------- */

  function cloudDocRef(userId) {
    // users/{uid}/pwa/listas
    return doc(db, "users", userId, "pwa", "listas");
  }

  async function loadFromCloud(userId) {
    try {
      const ref = cloudDocRef(userId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const data = snap.data();
      if (!data || !data.store) return null;
      return data.store;
    } catch (e) {
      // ✅ FIX: mostra o erro real
      console.error("Falha ao carregar Listas do cloud:", e);
      return null;
    }
  }

  async function saveToCloud(userId, nextStore) {
    try {
      const ref = cloudDocRef(userId);
      await setDoc(ref, { store: nextStore, updatedAt: nowISO() }, { merge: true });
    } catch (e) {
      // ✅ FIX: mostra o erro real (antes era silencioso)
      console.error("Falha ao salvar Listas no cloud:", e);
      toastMsg("⚠️ Não consegui salvar online (veja o Console).");
    }
  }

  // ✅ Salva (local + cloud se logada)
  function save(next) {
    setStore(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));

    if (uid && cloudReady) {
      saveToCloud(uid, next);
    }
  }

  // ---- Load + Migration + Cleanup + ✅ Cloud load depois
  useEffect(() => {
    // 1) carrega local primeiro (offline-first)
    const v2 = safeJSONParse(localStorage.getItem(LS_KEY) || "null", null);
    if (v2 && v2.version === 2 && v2.lists && v2.items) {
      const cleaned = cleanupAutoDeleteLists(v2);
      localStorage.setItem(LS_KEY, JSON.stringify(cleaned));
      setStore(cleaned);
    } else {
      const legacy = safeJSONParse(localStorage.getItem("pwa_listas_v1") || "null", null);
      if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
        const lists = {};
        const items = {};
        const ids = [];

        for (const title of Object.keys(legacy)) {
          const listId = uuid();
          ids.push(listId);

          lists[listId] = {
            id: listId,
            title,
            type: "compras",
            createdAt: nowISO(),
            completedAt: null,
          };

          const legacyItems = Array.isArray(legacy[title]) ? legacy[title] : [];
          items[listId] = legacyItems.map((it) => ({
            id: it.id || uuid(),
            text: String(it.text || ""),
            status: it.done ? "done" : "pending",
            createdAt: nowISO(),
            doneAt: it.done ? nowISO() : null,
            note: "",
          }));
        }

        const selected = ids[0] || null;

        let migrated = { version: 2, lists, items, ui: { selectedListId: selected } };
        migrated = cleanupAutoDeleteLists(migrated);

        localStorage.setItem(LS_KEY, JSON.stringify(migrated));
        setStore(migrated);
      } else {
        const defaultId = uuid();
        const fresh = {
          version: 2,
          lists: {
            [defaultId]: {
              id: defaultId,
              title: "Mercado",
              type: "compras",
              createdAt: nowISO(),
              completedAt: null,
            },
          },
          items: { [defaultId]: [] },
          ui: { selectedListId: defaultId },
        };
        localStorage.setItem(LS_KEY, JSON.stringify(fresh));
        setStore(fresh);
      }
    }

    // 2) observa login e carrega cloud (cloud “ganha”)
    const unsub = onAuthStateChanged(auth, async (user) => {
      const userId = user?.uid || null;
      setUid(userId);

      if (!userId) {
        setCloudReady(true);
        return;
      }

      const cloudStore = await loadFromCloud(userId);
      if (cloudStore && cloudStore.version === 2 && cloudStore.lists && cloudStore.items) {
        const cleanedCloud = cleanupAutoDeleteLists(cloudStore);
        setStore(cleanedCloud);
        localStorage.setItem(LS_KEY, JSON.stringify(cleanedCloud));
      }

      setCloudReady(true);
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cleanup on changes
  useEffect(() => {
    if (!store || store.version !== 2) return;
    const cleaned = cleanupAutoDeleteLists(store);
    if (cleaned !== store) save(cleaned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.lists, store.items]);

  const selectedListId = store.ui.selectedListId;
  const selectedList = selectedListId ? store.lists[selectedListId] : null;

  const listItems = useMemo(() => {
    if (!selectedListId) return [];
    return Array.isArray(store.items[selectedListId]) ? store.items[selectedListId] : [];
  }, [store.items, selectedListId]);

  const progress = useMemo(() => calcProgress(listItems), [listItems]);

  const ctaDoneLabel = selectedList?.type === "tarefas" ? "Já feito" : "Já comprado";

  const listOrder = useMemo(() => {
    const arr = Object.values(store.lists);
    return arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [store.lists]);

  const visibleItems = useMemo(() => {
    const q = normalizeText(search);
    let base = listItems;

    if (tab !== "all") base = base.filter((i) => i.status === tab);
    if (q) base = base.filter((i) => normalizeText(i.text).includes(q));

    const rankStatus = { pending: 0, issue: 1, done: 2 };
    const rankPriority = { urgente: 0, normal: 1, depois: 2 };
    base = [...base].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      if (tab === "all" && (rankStatus[a.status] ?? 9) !== (rankStatus[b.status] ?? 9)) {
        return (rankStatus[a.status] ?? 9) - (rankStatus[b.status] ?? 9);
      }
      return (rankPriority[a.priority || "normal"] ?? 9) - (rankPriority[b.priority || "normal"] ?? 9);
    });
    return base;
  }, [listItems, tab, search]);

  function updateItems(nextItems) {
    if (!selectedListId) return;

    const p = calcProgress(nextItems);
    const current = store.lists[selectedListId];

    let nextList = current;
    if (p.total > 0 && p.percent === 100) {
      if (!current.completedAt) nextList = { ...current, completedAt: nowISO() };
    } else {
      if (current.completedAt) nextList = { ...current, completedAt: null };
    }

    const nextStore = {
      ...store,
      lists: { ...store.lists, [selectedListId]: nextList },
      items: { ...store.items, [selectedListId]: nextItems },
    };
    save(nextStore);
  }

  function setSelectedList(id) {
    stopVoice(true);
    setMenuModalOpen(false);

    save({ ...store, ui: { ...store.ui, selectedListId: id } });
    setTab("pending");
    setSearch("");
    setNewItemText("");
    setEditingId(null);
    setEditingText("");
  }

  // ---------- List actions ----------
  function openCreateModal() {
    setCreateTitle("");
    setCreateType("compras");
    setCreateCategory("mercado");
    setCreateAutoDelete("7dias");
    setModalCreateOpen(true);
  }

  function createList() {
    const title = createTitle.trim();
    if (!title) return toastMsg("Digite um nome para a lista.");

    const existing = Object.values(store.lists).find((l) => normalizeText(l.title) === normalizeText(title));
    if (existing) {
      setModalCreateOpen(false);
      setSelectedList(existing.id);
      toastMsg("Lista já existia — selecionei ela.");
      return;
    }

    const id = uuid();
    const next = {
      ...store,
      lists: {
        ...store.lists,
        [id]: {
          id,
          title,
          type: createType,
          category: createCategory,
          autoDelete: createAutoDelete,
          createdAt: nowISO(),
          completedAt: null,
        },
      },
      items: { ...store.items, [id]: [] },
      ui: { ...store.ui, selectedListId: id },
    };
    save(next);
    setModalCreateOpen(false);
    setTab("pending");
    toastMsg("Lista criada.");
  }

  function openRenameModal() {
    if (!selectedList) return;
    setRenameTitle(selectedList.title);
    setModalRenameOpen(true);
  }

  function renameList() {
    if (!selectedList) return;
    const title = renameTitle.trim();
    if (!title) return toastMsg("Digite um nome válido.");

    save({
      ...store,
      lists: { ...store.lists, [selectedList.id]: { ...selectedList, title } },
    });
    setModalRenameOpen(false);
    toastMsg("Lista renomeada.");
  }

  function toggleListType() {
    if (!selectedList) return;
    const nextType = selectedList.type === "compras" ? "tarefas" : "compras";
    save({
      ...store,
      lists: { ...store.lists, [selectedList.id]: { ...selectedList, type: nextType } },
    });
    toastMsg("Tipo da lista alterado.");
  }

  function askDeleteList() {
    if (!selectedList) return;
    setConfirmCfg({
      title: "Excluir lista",
      body: `Tem certeza que quer excluir "${selectedList.title}"? Isso apaga todos os itens.`,
      danger: true,
      action: () => {
        const nextLists = { ...store.lists };
        const nextItems = { ...store.items };
        delete nextLists[selectedList.id];
        delete nextItems[selectedList.id];

        const remaining = Object.keys(nextLists);
        save({
          ...store,
          lists: nextLists,
          items: nextItems,
          ui: { selectedListId: remaining[0] || null },
        });
        toastMsg("Lista excluída.");
      },
    });
    setConfirmOpen(true);
  }

  // ---------- Item actions ----------
  function addItemsFromText(raw) {
    if (!selectedListId) return;
    const parts = splitIntoItems(raw);
    if (parts.length === 0) return;

    let next = [...listItems];
    let added = 0;

    for (const text of parts) {
      const exists = next.some((i) => normalizeText(i.text) === normalizeText(text));
      if (exists) continue;
      const parsed = parseItemText(text);
      next.push({
        id: uuid(),
        text: parsed.text,
        status: "pending",
        createdAt: nowISO(),
        doneAt: null,
        note: "",
        quantity: parsed.quantity,
        unit: parsed.unit,
        estimatedPrice: "",
        paidPrice: "",
        category: selectedList?.category || "",
        priority: "normal",
        pinned: false,
      });
      added++;
    }

    updateItems(next);
    setNewItemText("");
    voiceFinalRef.current = "";
    toastMsg(added > 1 ? `Adicionados ${added} itens.` : added === 1 ? "Item adicionado." : "Nada novo para adicionar.");
  }

  function addItem() {
    addItemsFromText(newItemText);
  }

  function clearInput() {
    setNewItemText("");
    voiceFinalRef.current = "";
    toastMsg("Campo limpo.");
  }

  function setStatus(id, status) {
    const next = listItems.map((i) => {
      if (i.id !== id) return i;
      return { ...i, status, doneAt: status === "done" ? nowISO() : null };
    });
    updateItems(next);
  }

  function removeItem(id) {
    setConfirmCfg({
      title: "Excluir item",
      body: "Excluir este item da lista?",
      danger: true,
      action: () => {
        updateItems(listItems.filter((i) => i.id !== id));
        toastMsg("Item excluído.");
      },
    });
    setConfirmOpen(true);
  }

  function startEdit(item, e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setEditingId(item.id);
    setEditingText(item.text);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText("");
  }

  function commitEdit(id) {
    const t = editingText.trim();
    if (!t) return toastMsg("Texto vazio não pode.");

    const parts = splitIntoItems(t);

    if (parts.length === 1) {
      updateItems(listItems.map((i) => (i.id === id ? { ...i, text: parts[0] } : i)));
      cancelEdit();
      toastMsg("Item atualizado.");
      return;
    }

    const first = parts[0];
    const rest = parts.slice(1);

    let next = listItems.map((i) => (i.id === id ? { ...i, text: first } : i));
    let added = 0;

    for (const text of rest) {
      const exists = next.some((i) => normalizeText(i.text) === normalizeText(text));
      if (exists) continue;
      const parsed = parseItemText(text);
      next.push({
        id: uuid(),
        text: parsed.text,
        status: "pending",
        createdAt: nowISO(),
        doneAt: null,
        note: "",
        quantity: parsed.quantity,
        unit: parsed.unit,
        estimatedPrice: "",
        paidPrice: "",
        category: selectedList?.category || "",
        priority: "normal",
        pinned: false,
      });
      added++;
    }

    updateItems(next);
    cancelEdit();
    toastMsg(`Atualizado + adicionados ${added} itens.`);
  }

  function openDetails(item) {
    setDetailId(item.id);
    setDetailQuantity(String(item.quantity ?? ""));
    setDetailUnit(item.unit || "");
    setDetailEstimated(String(item.estimatedPrice ?? ""));
    setDetailPaid(String(item.paidPrice ?? ""));
    setDetailCategory(item.category || selectedList?.category || "");
    setDetailPriority(item.priority || "normal");
    setDetailNote(item.note || "");
    setDetailPinned(Boolean(item.pinned));
    setDetailOpen(true);
  }

  function saveDetails() {
    updateItems(
      listItems.map((item) =>
        item.id === detailId
          ? {
              ...item,
              quantity: detailQuantity,
              unit: detailUnit,
              estimatedPrice: detailEstimated,
              paidPrice: detailPaid,
              category: detailCategory,
              priority: detailPriority,
              note: detailNote,
              pinned: detailPinned,
            }
          : item
      )
    );
    setDetailOpen(false);
    toastMsg("Detalhes salvos.");
  }

  function buyAgain(id) {
    updateItems(
      listItems.map((item) =>
        item.id === id
          ? { ...item, status: "pending", doneAt: null, paidPrice: "" }
          : item
      )
    );
    setTab("pending");
    toastMsg("Item voltou para a lista de compras.");
  }

  function buyAllAgain() {
    const done = listItems.filter((i) => i.status === "done");
    if (!done.length) return toastMsg("Não há itens concluídos para comprar novamente.");
    updateItems(
      listItems.map((item) =>
        item.status === "done"
          ? { ...item, status: "pending", doneAt: null, paidPrice: "" }
          : item
      )
    );
    setTab("pending");
    toastMsg("Itens concluídos voltaram para pendentes.");
  }

  function openReminder(item) {
    setReminderItemId(item.id);
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setHours(9, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setReminderWhen(local);
    setReminderOpen(true);
  }

  function createReminderForItem() {
    const item = listItems.find((x) => x.id === reminderItemId);
    if (!item || !reminderWhen) return toastMsg("Escolha a data e hora do lembrete.");
    if (typeof setLembretes !== "function") return toastMsg("Não consegui acessar os lembretes do app.");

    const novo = {
      id: uuid(),
      tipo: "avulso",
      titulo: `Comprar: ${item.text}`,
      quando: reminderWhen,
      done: false,
      nivel: item.priority === "urgente" ? "rapido" : "medio",
      categoria: "compras",
      conflictMode: "allow",
      createdAt: nowISO(),
      doneAt: null,
      updatedAt: nowISO(),
      origemListaId: selectedListId,
      origemItemId: item.id,
    };
    const atuais = Array.isArray(lembretes) ? lembretes : [];
    setLembretes([novo, ...atuais]);
    setReminderOpen(false);
    toastMsg("🔔 Lembrete criado.");
  }

  function toggleAutoDeletePolicy() {
    if (!selectedList) return;
    const atual = selectedList.autoDelete || "7dias";
    const proximo = atual === "7dias" ? "arquivar" : atual === "arquivar" ? "nunca" : "7dias";
    save({
      ...store,
      lists: {
        ...store.lists,
        [selectedList.id]: { ...selectedList, autoDelete: proximo },
      },
    });
    toastMsg("Destino da lista concluída atualizado.");
  }

  function askMarkAllDone() {
    if (listItems.length === 0) return;
    setConfirmCfg({
      title: `${ctaDoneLabel} (tudo)`,
      body: "Quer marcar todos os itens como concluídos?",
      danger: false,
      action: () => {
        updateItems(listItems.map((i) => (i.status === "done" ? i : { ...i, status: "done", doneAt: nowISO() })));
        toastMsg("Tudo concluído.");
      },
    });
    setConfirmOpen(true);
  }

  function askResetAll() {
    if (listItems.length === 0) return;
    setConfirmCfg({
      title: "Resetar lista",
      body: "Todos os itens voltarão para PENDENTE. Continuar?",
      danger: true,
      action: () => {
        updateItems(listItems.map((i) => ({ ...i, status: "pending", doneAt: null })));
        toastMsg("Lista resetada.");
      },
    });
    setConfirmOpen(true);
  }

  function askClearDone() {
    const doneCount = listItems.filter((i) => i.status === "done").length;
    if (doneCount === 0) return toastMsg("Nada para limpar.");
    setConfirmCfg({
      title: "Limpar concluídos",
      body: `Apagar ${doneCount} itens concluídos?`,
      danger: true,
      action: () => {
        updateItems(listItems.filter((i) => i.status !== "done"));
        toastMsg("Concluídos removidos.");
      },
    });
    setConfirmOpen(true);
  }

  // -------- Voice (SpeechRecognition) --------
  function isSpeechSupported() {
    return typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function montarRascunhosDaVoz(raw) {
    const partes = splitIntoItems(raw).slice(0, 50);

    const unicos = [];
    const vistos = new Set();

    for (const parte of partes) {
      const chave = normalizeText(parte);
      if (!chave || vistos.has(chave)) continue;
      vistos.add(chave);
      unicos.push(parte);
    }

    setVoiceDraftItems((atuais) => {
      const mapaAtual = new Map(
        atuais.map((item) => [normalizeText(item.text), item])
      );

      return unicos.map((parte) => {
        const anterior = mapaAtual.get(normalizeText(parte));
        return {
          id: anterior?.id || uuid(),
          text: parte,
          selected: anterior ? anterior.selected !== false : true,
        };
      });
    });
  }

  function stopVoice(silent = false) {
    try {
      if (recRef.current) recRef.current.onend = null;
    } catch {}

    try {
      recRef.current?.stop?.();
    } catch {}

    recRef.current = null;
    restartingRef.current = false;
    listeningRef.current = false;
    setIsListening(false);

    const textoFinal = String(
      voiceFinalRef.current || newItemText || ""
    ).trim();

    if (textoFinal) {
      montarRascunhosDaVoz(textoFinal);
      setVoiceReviewOpen(true);
    }

    if (!silent) {
      toastMsg("Voz parada. Revise os itens antes de adicionar.");
    }
  }

  function fecharRevisaoVoz() {
    if (listeningRef.current || isListening) {
      stopVoice(true);
    }

    setVoiceReviewOpen(false);
    setVoiceDraftItems([]);
    setNewItemText("");
    voiceFinalRef.current = "";
  }

  function alternarItemVoz(id) {
    setVoiceDraftItems((atuais) =>
      atuais.map((item) =>
        item.id === id
          ? { ...item, selected: !item.selected }
          : item
      )
    );
  }

  function selecionarTodosVoz(valor) {
    setVoiceDraftItems((atuais) =>
      atuais.map((item) => ({ ...item, selected: valor }))
    );
  }

  function adicionarSelecionadosDaVoz() {
    if (!selectedListId) return;

    const escolhidos = voiceDraftItems.filter(
      (item) => item.selected !== false
    );

    if (!escolhidos.length) {
      return toastMsg("Marque pelo menos um item para adicionar.");
    }

    let next = [...listItems];
    let added = 0;

    for (const itemVoz of escolhidos) {
      const texto = String(itemVoz.text || "").trim();
      if (!texto) continue;

      const exists = next.some(
        (item) => normalizeText(item.text) === normalizeText(texto)
      );

      if (exists) continue;

      const parsed = parseItemText(texto);

      next.push({
        id: uuid(),
        text: parsed.text,
        status: "pending",
        createdAt: nowISO(),
        doneAt: null,
        note: "",
        quantity: parsed.quantity,
        unit: parsed.unit,
        estimatedPrice: "",
        paidPrice: "",
        category: selectedList?.category || "",
        priority: "normal",
        pinned: false,
      });

      added++;
    }

    if (added > 0) {
      updateItems(next);
    }

    setVoiceReviewOpen(false);
    setVoiceDraftItems([]);
    setNewItemText("");
    voiceFinalRef.current = "";

    toastMsg(
      added > 1
        ? `${added} itens adicionados.`
        : added === 1
          ? "1 item adicionado."
          : "Os itens escolhidos já estavam na lista."
    );
  }

  function startVoice() {
    if (!isSpeechSupported()) {
      toastMsg("Seu navegador não suporta voz (SpeechRecognition).");
      return;
    }

    if (isListening) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    recRef.current = rec;

    rec.lang = "pt-BR";
    rec.interimResults = true;
    rec.continuous = true;

    // Começa sempre uma revisão nova para não misturar com uma gravação anterior.
    voiceFinalRef.current = "";
    setNewItemText("");
    setVoiceDraftItems([]);
    setVoiceReviewOpen(true);

    rec.onstart = () => {
      listeningRef.current = true;
      setIsListening(true);
      toastMsg("🎙️ Gravando... fale os itens e diga 'vírgula' para separar.");
    };

    rec.onresult = (e) => {
      let interim = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const trecho = e.results[i][0]?.transcript || "";

        if (e.results[i].isFinal) {
          voiceFinalRef.current += trecho + " ";
        } else {
          interim += trecho;
        }
      }

      const preview = (voiceFinalRef.current + interim).trim();
      setNewItemText(preview);
      montarRascunhosDaVoz(preview);
    };

    rec.onerror = () => {
      listeningRef.current = false;
      setIsListening(false);
      toastMsg("Falha ao usar microfone (permissão ou erro).");
    };

    rec.onend = () => {
      if (!restartingRef.current && listeningRef.current) {
        restartingRef.current = true;

        setTimeout(() => {
          restartingRef.current = false;

          try {
            rec.start();
          } catch {
            listeningRef.current = false;
            setIsListening(false);
          }
        }, 250);
      } else {
        listeningRef.current = false;
        setIsListening(false);
      }
    };

    try {
      rec.start();
    } catch {
      toastMsg("Não consegui iniciar o microfone.");
      listeningRef.current = false;
      setIsListening(false);
      setVoiceReviewOpen(false);
    }
  }

  const moneySummary = useMemo(() => {
    const estimated = listItems.reduce((sum, i) => sum + numberValue(i.estimatedPrice), 0);
    const paid = listItems
      .filter((i) => i.status === "done")
      .reduce((sum, i) => sum + numberValue(i.paidPrice || i.estimatedPrice), 0);
    return { estimated, paid, remaining: Math.max(0, estimated - paid) };
  }, [listItems]);

  const categoryLabel =
    LIST_CATEGORIES.find(([key]) => key === selectedList?.category)?.[1] || "📋 Sem categoria";

  const autoDeleteLabel =
    (selectedList?.autoDelete || "7dias") === "7dias"
      ? "Apagar 7 dias depois"
      : selectedList?.autoDelete === "arquivar"
      ? "Arquivar"
      : "Nunca apagar";

  const menuItems = selectedList
    ? [
        { label: "Renomear lista", onClick: openRenameModal },
        { label: `Trocar para ${selectedList.type === "compras" ? "Tarefas" : "Compras"}`, onClick: toggleListType },
        { label: `${ctaDoneLabel} (tudo)`, onClick: askMarkAllDone },
        { label: "↻ Comprar novamente (concluídos)", onClick: buyAllAgain },
        { label: `Destino ao concluir: ${autoDeleteLabel}`, onClick: toggleAutoDeletePolicy },
        { label: "Resetar lista", onClick: askResetAll, danger: true },
        { label: "Limpar concluídos", onClick: askClearDone, danger: true },
        { label: "Excluir lista", onClick: askDeleteList, danger: true },
      ]
    : [{ label: "Nova lista", onClick: openCreateModal }];

  return (
    <div className="page" onClick={() => { /* nada */ }}>
      <Toast text={toastText} />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-end" }}>
        <div>
          <h2 className="page-title">📋 Listas</h2>
          <p className="muted small" style={{ marginTop: 6 }}>
            Compras e tarefas, com progresso
          </p>
          <p className="muted small" style={{ marginTop: 6 }}>
            {uid ? "☁️ Online: salvando na conta" : "📵 Offline: salvando só no aparelho (faça login para salvar online)"}
          </p>
        </div>

        <button type="button" className="primary-btn" style={{ width: "auto" }} onClick={openCreateModal}>
          + Nova lista
        </button>
      </div>

      <div className="card mt" style={{ padding: 12 }}>
        {listOrder.length === 0 ? (
          <p className="muted">Nenhuma lista ainda.</p>
        ) : (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
            {listOrder.map((l) => {
              const p = calcProgress(store.items[l.id] || []);
              const active = l.id === selectedListId;

              return (
                <button
                  type="button"
                  key={l.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedList(l.id);
                  }}
                  className={"chip " + (active ? "chip-active" : "")}
                  style={{ flex: "0 0 auto", width: 210 }}
                  title={`${l.title} • ${p.percent}%`}
                >
                  <div style={{ fontWeight: 800 }}>{l.title}</div>
                  <div className="muted small">
                    {p.done}/{p.total} • {p.percent}%
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!selectedList ? (
        <p className="muted mt">Crie uma lista para começar.</p>
      ) : (
        <>
          <div className="card mt">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 15 }}>{selectedList.title}</strong>
                  <span className="chip" style={{ height: 28, padding: "0 10px" }}>
                    {selectedList.type === "tarefas" ? "🧩 Tarefas" : "🛒 Compras"}
                  </span>
                  <span className="chip" style={{ height: 28, padding: "0 10px" }}>
                    {categoryLabel}
                  </span>
                </div>

                <p className="muted small" style={{ marginTop: 8 }}>
                  Criada em: <strong>{fmtDate(selectedList.createdAt)}</strong>
                  {selectedList.completedAt ? (
                    <>
                      {" "}
                      • Concluída em: <strong>{fmtDate(selectedList.completedAt)}</strong> • {autoDeleteLabel.toLowerCase()}
                    </>
                  ) : null}
                </p>

                <div className="progress-container" style={{ marginTop: 8 }}>
                  <ProgressBar percent={progress.percent} />
                  <div className="progress-label">
                    {progress.percent}% • {progress.done}/{progress.total} concluídos
                    {progress.issue ? ` • ⚠ ${progress.issue} problema` : ""}
                  </div>
                </div>

                {selectedList.type === "compras" ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0,1fr))",
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <div className="card" style={{ padding: 10 }}>
                      <div className="muted small">Estimado</div>
                      <strong>{brl(moneySummary.estimated)}</strong>
                    </div>
                    <div className="card" style={{ padding: 10 }}>
                      <div className="muted small">Já gasto</div>
                      <strong>{brl(moneySummary.paid)}</strong>
                    </div>
                    <div className="card" style={{ padding: 10 }}>
                      <div className="muted small">Falta</div>
                      <strong>{brl(moneySummary.remaining)}</strong>
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuModalOpen(true);
                }}
                aria-label="Menu"
                title="Menu"
              >
                ⋯
              </button>
            </div>
          </div>

          <div className="card mt">
            <div className="field">
              <label>Adicionar itens</label>
              <input
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                placeholder="Ex: arroz, detergente, balões (vírgula cria novos itens)"
                onKeyDown={(e) => e.key === "Enter" && addItem()}
              />
              <p className="muted small" style={{ marginTop: 6 }}>
                🎙️ Ao falar, você revisa os itens em uma janela antes de adicionar.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="primary-btn"
                style={{ width: "auto" }}
                onClick={(e) => {
                  e.stopPropagation();
                  addItem();
                }}
              >
                Adicionar
              </button>

              <button
                type="button"
                className="chip"
                style={{ width: "auto" }}
                onClick={(e) => {
                  e.stopPropagation();
                  clearInput();
                }}
              >
                Limpar
              </button>

              <button
                type="button"
                className={"primary-btn"}
                style={{
                  width: "auto",
                  background: isListening ? "rgba(249,115,115,.28)" : undefined,
                  color: isListening ? "#0b1020" : undefined,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  isListening ? stopVoice() : startVoice();
                }}
                title={isListening ? "Parar voz" : "Gravar por voz"}
              >
                {isListening ? "⏹️ Parar" : "🎙️ Voz"}
              </button>
            </div>

            {!isSpeechSupported() ? (
              <p className="muted small" style={{ marginTop: 10, color: "var(--negative)" }}>
                ⚠️ Voz não suportada neste navegador. (Geralmente funciona no Chrome do Android.)
              </p>
            ) : null}
          </div>

          <div className="card mt">
            <div className="field">
              <label>Buscar</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: arroz, lavar roupa..." />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Tab active={tab === "pending"} label="Pendentes" onClick={() => setTab("pending")} />
              <Tab active={tab === "done"} label="Concluídos" onClick={() => setTab("done")} />
              <Tab active={tab === "issue"} label="Problema" onClick={() => setTab("issue")} />
              <Tab active={tab === "all"} label="Todos" onClick={() => setTab("all")} />
            </div>
          </div>

          <div className="card mt">
            {visibleItems.length === 0 ? (
              <p className="muted">{listItems.length === 0 ? "Sua lista está vazia." : "Nada nesse filtro/busca."}</p>
            ) : (
              <ul className="list">
                {visibleItems.map((i) => {
                  const isEditing = editingId === i.id;

                  return (
                    <li key={i.id} className="list-item" style={{ alignItems: "flex-start" }}>
                      <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, paddingTop: 2 }}>
                          <button
                            type="button"
                            className={"chip " + (i.status === "done" ? "chip-active" : "")}
                            style={{ width: "auto" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatus(i.id, i.status === "done" ? "pending" : "done");
                            }}
                            title={i.status === "done" ? "Voltar pendente" : ctaDoneLabel}
                          >
                            ✓
                          </button>

                          <button
                            type="button"
                            className={"chip " + (i.status === "issue" ? "chip-active" : "")}
                            style={{
                              width: "auto",
                              borderColor: i.status === "issue" ? "rgba(249,115,115,.55)" : undefined,
                              color: i.status === "issue" ? "var(--negative)" : undefined,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatus(i.id, i.status === "issue" ? "pending" : "issue");
                            }}
                            title={i.status === "issue" ? "Tirar problema" : "Marcar problema"}
                          >
                            !
                          </button>
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {!isEditing ? (
                            <>
                              <div
                                style={{
                                  wordBreak: "break-word",
                                  textDecoration: i.status === "done" ? "line-through" : "none",
                                  opacity: i.status === "done" ? 0.75 : 1,
                                  color: i.status === "issue" ? "var(--negative)" : "var(--text)",
                                }}
                                title={i.text}
                              >
                                {i.text}
                              </div>

                              <div className="muted small" style={{ marginTop: 6 }}>
                                {i.pinned ? "📌 " : ""}
                                {i.quantity ? `${i.quantity}${i.unit ? " " + i.unit : ""} • ` : ""}
                                {PRIORITIES[i.priority || "normal"] || PRIORITIES.normal}
                                {i.estimatedPrice ? ` • Est. ${brl(i.estimatedPrice)}` : ""}
                                {i.paidPrice ? ` • Pago ${brl(i.paidPrice)}` : ""}
                              </div>
                              {i.note ? (
                                <div className="muted small" style={{ marginTop: 4 }}>
                                  📝 {i.note}
                                </div>
                              ) : null}
                              <div className="muted small" style={{ marginTop: 6 }}>
                                {i.status === "done" ? "Concluído" : i.status === "issue" ? "Com problema" : "Pendente"}
                                {" • "}Criado: {fmtDate(i.createdAt)}
                                {i.doneAt ? ` • Feito: ${fmtDate(i.doneAt)}` : ""}
                              </div>
                            </>
                          ) : (
                            <div style={{ marginTop: 2 }}>
                              <div className="muted small" style={{ marginBottom: 6 }}>
                                Editando (vírgula = vários itens)
                              </div>

                              <input
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && commitEdit(i.id)}
                                autoFocus
                              />

                              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className="primary-btn"
                                  style={{ width: "auto" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    commitEdit(i.id);
                                  }}
                                >
                                  Salvar
                                </button>

                                <button
                                  type="button"
                                  className="chip"
                                  style={{ width: "auto" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelEdit();
                                  }}
                                >
                                  Cancelar
                                </button>
                              </div>

                              <div className="muted small" style={{ marginTop: 8 }}>
                                {i.status === "done" ? "Concluído" : i.status === "issue" ? "Com problema" : "Pendente"}
                                {" • "}Criado: {fmtDate(i.createdAt)}
                                {i.doneAt ? ` • Feito: ${fmtDate(i.doneAt)}` : ""}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {!isEditing ? (
                          <button
                            type="button"
                            className="chip"
                            style={{ width: "auto" }}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation();
                              startEdit(i, e);
                            }}
                          >
                            Editar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="chip"
                            style={{ width: "auto" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelEdit();
                            }}
                          >
                            Fechar
                          </button>
                        )}

                        {!isEditing ? (
                          <>
                            <button
                              type="button"
                              className="chip"
                              style={{ width: "auto" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetails(i);
                              }}
                            >
                              Detalhes
                            </button>

                            {selectedList.type === "compras" ? (
                              <button
                                type="button"
                                className="chip"
                                style={{ width: "auto" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openReminder(i);
                                }}
                              >
                                🔔 Lembrar
                              </button>
                            ) : null}

                            {i.status === "done" ? (
                              <button
                                type="button"
                                className="chip"
                                style={{ width: "auto" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  buyAgain(i.id);
                                }}
                              >
                                ↻ Novamente
                              </button>
                            ) : null}
                          </>
                        ) : null}

                        <button
                          type="button"
                          className="chip btn-danger"
                          style={{ width: "auto" }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeItem(i.id);
                          }}
                        >
                          Excluir
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {/* ---------- MODAL DO MENU (3 pontinhos) ---------- */}
      <Modal open={menuModalOpen} title="Ações da lista" onClose={() => setMenuModalOpen(false)}>
        {selectedList ? (
          <>
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div className="muted small">
                Criada em: <strong>{fmtDate(selectedList.createdAt)}</strong>
              </div>
              <div className="muted small" style={{ marginTop: 6 }}>
                Concluída em: <strong>{selectedList.completedAt ? fmtDate(selectedList.completedAt) : "—"}</strong>
              </div>
              {selectedList.completedAt ? (
                <div className="muted small" style={{ marginTop: 6 }}>
                  Auto-apaga: <strong>7 dias</strong> depois de concluir
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {menuItems.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  className={"chip " + (it.danger ? "btn-danger" : "")}
                  style={{ width: "100%" }}
                  onClick={() => {
                    setMenuModalOpen(false);
                    it.onClick?.();
                  }}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            type="button"
            className="primary-btn"
            style={{ width: "100%" }}
            onClick={() => {
              setMenuModalOpen(false);
              openCreateModal();
            }}
          >
            + Nova lista
          </button>
        )}
      </Modal>

      {/* ---------- REVISÃO DA VOZ ---------- */}
      {voiceReviewOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="lista-voice-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Revisar itens falados"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) fecharRevisaoVoz();
              }}
            >
              <button
                type="button"
                className="lista-voice-close"
                onClick={fecharRevisaoVoz}
                aria-label="Fechar revisão"
                title="Fechar"
              >
                ✕
              </button>

              <div
                className="lista-voice-card"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="lista-voice-header">
                  <div style={{ minWidth: 0 }}>
                <strong style={{ display: "block" }}>
                  🎙️ Revisar antes de lançar
                </strong>
                <span className="muted small">
                  Marque só o que você quer adicionar.
                </span>
              </div>

                  {isListening ? (
                    <button
                      type="button"
                      className="chip"
                      onClick={() => stopVoice()}
                      style={{ width: "auto" }}
                    >
                      ⏹️ Parar
                    </button>
                  ) : null}
                </div>

                {isListening ? (
              <div
                className="card"
                style={{
                  padding: 10,
                  border: "1px solid rgba(96,165,250,.35)",
                }}
              >
                <strong style={{ fontSize: 13 }}>🎙️ Estou ouvindo...</strong>
                <div className="muted small" style={{ marginTop: 4 }}>
                  Diga “vírgula” entre os itens.
                </div>
              </div>
            ) : null}

            {newItemText ? (
              <div
                className="muted small"
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,.04)",
                  maxHeight: 70,
                  overflowY: "auto",
                }}
              >
                <strong>Ouvi:</strong> {newItemText}
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                className="chip"
                style={{ width: "auto" }}
                onClick={() => selecionarTodosVoz(true)}
                disabled={!voiceDraftItems.length}
              >
                ✓ Todos
              </button>

              <button
                type="button"
                className="chip"
                style={{ width: "auto" }}
                onClick={() => selecionarTodosVoz(false)}
                disabled={!voiceDraftItems.length}
              >
                Nenhum
              </button>

              <span className="muted small">
                {voiceDraftItems.filter((item) => item.selected !== false).length}
                {" de "}
                {voiceDraftItems.length} selecionado(s)
              </span>
            </div>

            <div
              style={{
                minHeight: 110,
                maxHeight: "42vh",
                overflowY: "auto",
                display: "grid",
                gap: 7,
                paddingRight: 2,
              }}
            >
              {voiceDraftItems.length ? (
                voiceDraftItems.map((item, index) => (
                  <label
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px minmax(0, 1fr)",
                      gap: 8,
                      alignItems: "center",
                      padding: "9px 10px",
                      borderRadius: 12,
                      border: item.selected !== false
                        ? "1px solid rgba(96,165,250,.40)"
                        : "1px solid rgba(255,255,255,.08)",
                      background: item.selected !== false
                        ? "rgba(96,165,250,.09)"
                        : "rgba(255,255,255,.025)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={item.selected !== false}
                      onChange={() => alternarItemVoz(item.id)}
                      style={{ width: 18, height: 18 }}
                    />

                    <span style={{ minWidth: 0, wordBreak: "break-word" }}>
                      <strong style={{ marginRight: 6 }}>#{index + 1}</strong>
                      {item.text}
                    </span>
                  </label>
                ))
              ) : (
                <div
                  className="muted small"
                  style={{
                    display: "grid",
                    placeItems: "center",
                    minHeight: 110,
                    textAlign: "center",
                    padding: 16,
                  }}
                >
                  {isListening
                    ? "Os itens vão aparecer aqui conforme você falar."
                    : "Não encontrei itens para revisar."}
                </div>
              )}
            </div>

                <button
                  type="button"
                  className="primary-btn"
                  onClick={adicionarSelecionadosDaVoz}
                  disabled={
                    isListening ||
                    !voiceDraftItems.some((item) => item.selected !== false)
                  }
                  style={{ width: "100%", minHeight: 44 }}
                >
                  ＋ Adicionar selecionados
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {/* ---------- Modals ---------- */}

      <Modal open={modalCreateOpen} title="Nova lista" onClose={() => setModalCreateOpen(false)}>
        <div className="field">
          <label>Nome da lista</label>
          <input
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            placeholder="Ex: Casa, Festa, Materiais..."
            onKeyDown={(e) => e.key === "Enter" && createList()}
            autoFocus
          />
        </div>

        <div className="field">
          <label>Tipo</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setCreateType("compras")}
              className={"chip " + (createType === "compras" ? "chip-active" : "")}
            >
              🛒 Compras
            </button>
            <button
              type="button"
              onClick={() => setCreateType("tarefas")}
              className={"chip " + (createType === "tarefas" ? "chip-active" : "")}
            >
              🧩 Tarefas
            </button>
          </div>
        </div>

        <div className="field">
          <label>Categoria</label>
          <select value={createCategory} onChange={(e) => setCreateCategory(e.target.value)}>
            {LIST_CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Quando a lista ficar 100% concluída</label>
          <select value={createAutoDelete} onChange={(e) => setCreateAutoDelete(e.target.value)}>
            <option value="7dias">Apagar automaticamente depois de 7 dias</option>
            <option value="arquivar">Arquivar / manter no histórico</option>
            <option value="nunca">Nunca apagar</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="chip" style={{ width: "auto" }} onClick={() => setModalCreateOpen(false)}>
            Cancelar
          </button>
          <button type="button" className="primary-btn" style={{ width: "auto" }} onClick={createList}>
            Criar
          </button>
        </div>
      </Modal>

      <Modal open={modalRenameOpen} title="Renomear lista" onClose={() => setModalRenameOpen(false)}>
        <div className="field">
          <label>Novo nome</label>
          <input
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && renameList()}
            autoFocus
          />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="chip" style={{ width: "auto" }} onClick={() => setModalRenameOpen(false)}>
            Cancelar
          </button>
          <button type="button" className="primary-btn" style={{ width: "auto" }} onClick={renameList}>
            Salvar
          </button>
        </div>
      </Modal>

      <Modal open={detailOpen} title="Detalhes do item" onClose={() => setDetailOpen(false)}>
        <div className="filters-grid">
          <div className="field">
            <label>Quantidade</label>
            <input value={detailQuantity} onChange={(e) => setDetailQuantity(e.target.value)} placeholder="Ex: 2" />
          </div>
          <div className="field">
            <label>Unidade</label>
            <input value={detailUnit} onChange={(e) => setDetailUnit(e.target.value)} placeholder="Ex: pacotes, kg, un" />
          </div>
        </div>

        <div className="filters-grid">
          <div className="field">
            <label>Preço estimado</label>
            <input value={detailEstimated} onChange={(e) => setDetailEstimated(e.target.value)} inputMode="decimal" placeholder="Ex: 30,00" />
          </div>
          <div className="field">
            <label>Preço pago</label>
            <input value={detailPaid} onChange={(e) => setDetailPaid(e.target.value)} inputMode="decimal" placeholder="Ex: 28,90" />
          </div>
        </div>

        <div className="filters-grid">
          <div className="field">
            <label>Categoria</label>
            <select value={detailCategory} onChange={(e) => setDetailCategory(e.target.value)}>
              <option value="">Sem categoria</option>
              {LIST_CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Prioridade</label>
            <select value={detailPriority} onChange={(e) => setDetailPriority(e.target.value)}>
              <option value="urgente">🔴 Urgente</option>
              <option value="normal">🟡 Normal</option>
              <option value="depois">🔵 Quando der</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Observação</label>
          <textarea value={detailNote} onChange={(e) => setDetailNote(e.target.value)} placeholder="Ex: comprar a marca X" rows={3} />
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input type="checkbox" checked={detailPinned} onChange={(e) => setDetailPinned(e.target.checked)} />
          📌 Fixar este item
        </label>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" className="chip" onClick={() => setDetailOpen(false)}>Cancelar</button>
          <button type="button" className="primary-btn" style={{ width: "auto" }} onClick={saveDetails}>Salvar detalhes</button>
        </div>
      </Modal>

      <Modal open={reminderOpen} title="🔔 Lembrar de comprar" onClose={() => setReminderOpen(false)}>
        <div className="field">
          <label>Quando lembrar?</label>
          <input type="datetime-local" value={reminderWhen} onChange={(e) => setReminderWhen(e.target.value)} />
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>
          Isso cria um lembrete avulso na página Lembretes.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" className="chip" onClick={() => setReminderOpen(false)}>Cancelar</button>
          <button type="button" className="primary-btn" style={{ width: "auto" }} onClick={createReminderForItem}>Criar lembrete</button>
        </div>
      </Modal>

      <Modal open={confirmOpen} title={confirmCfg.title || "Confirmar"} onClose={() => setConfirmOpen(false)}>
        <div className="muted" style={{ lineHeight: 1.35 }}>
          {confirmCfg.body}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="chip" style={{ width: "auto" }} onClick={() => setConfirmOpen(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className={"primary-btn " + (confirmCfg.danger ? "btn-danger" : "")}
            style={{ width: "auto" }}
            onClick={() => {
              setConfirmOpen(false);
              confirmCfg.action?.();
            }}
          >
            Confirmar
          </button>
        </div>
      </Modal>
    </div>
  );
}
