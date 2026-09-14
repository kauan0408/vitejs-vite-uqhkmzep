export function lerStorage(
  chave,
  valorPadrao = null
) {
  try {
    const valor = localStorage.getItem(chave);

    if (valor === null) {
      return valorPadrao;
    }

    return JSON.parse(valor);
  } catch (erro) {
    console.error(
      `Erro ao ler ${chave}:`,
      erro
    );

    return valorPadrao;
  }
}

export function salvarStorage(chave, valor) {
  try {
    localStorage.setItem(
      chave,
      JSON.stringify(valor)
    );

    return true;
  } catch (erro) {
    console.error(
      `Erro ao salvar ${chave}:`,
      erro
    );

    return false;
  }
}

export function removerStorage(chave) {
  try {
    localStorage.removeItem(chave);
    return true;
  } catch (erro) {
    console.error(
      `Erro ao remover ${chave}:`,
      erro
    );

    return false;
  }
}

export function limparStorage() {
  try {
    localStorage.clear();
    sessionStorage.clear();

    return true;
  } catch (erro) {
    console.error(
      "Erro ao limpar os dados:",
      erro
    );

    return false;
  }
}