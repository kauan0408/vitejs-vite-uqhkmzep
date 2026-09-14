import {
  lerStorage,
  salvarStorage,
  removerStorage,
} from "./storageService.js";

const CHAVE = "financas_profile";

export const perfilInicial = {
  nome: "",
  rendaMensal: "",
  limiteGastoMensal: "",
  metaReservaMensal: "",
  reservaAcumulada: "",
  diaPagamento: "",
  avatarBase64: "",
  gastosFixos: [],
};

export function carregarPerfil() {
  return lerStorage(CHAVE, perfilInicial);
}

export function salvarPerfil(perfil) {
  return salvarStorage(CHAVE, perfil);
}

export function apagarPerfil() {
  return removerStorage(CHAVE);
}