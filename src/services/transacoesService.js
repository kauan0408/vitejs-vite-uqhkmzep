import {
  lerStorage,
  salvarStorage,
  removerStorage,
} from "./storageService.js";

const CHAVE = "financas_transacoes";

export function carregarTransacoes() {
  return lerStorage(CHAVE, []);
}

export function salvarTransacoes(transacoes) {
  return salvarStorage(CHAVE, transacoes);
}

export function criarTransacao(dados) {
  return {
    ...dados,

    id:
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,

    dataHora:
      dados.dataHora ||
      new Date().toISOString(),
  };
}

export function apagarTransacoes() {
  return removerStorage(CHAVE);
}