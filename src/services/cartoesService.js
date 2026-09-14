import {
  lerStorage,
  salvarStorage,
  removerStorage,
} from "./storageService.js";

const CHAVE = "financas_cartoes";

export function carregarCartoes() {
  return lerStorage(CHAVE, []);
}

export function salvarCartoes(cartoes) {
  return salvarStorage(CHAVE, cartoes);
}

export function criarCartao(dados) {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,

    nome: dados.nome,
    limite: Number(dados.limite || 0),
    diaFechamento: Number(
      dados.diaFechamento || 1
    ),
  };
}

export function apagarCartoes() {
  return removerStorage(CHAVE);
}