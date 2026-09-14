import React, {
  useEffect,
  useState,
} from "react";

import "./ConfiguracoesPage.css";

const CONFIG_KEY =
  "financas_configuracoes";

const configuracoesIniciais = {
  tema: "escuro",
  moeda: "BRL",
  confirmarExclusao: true,
  mostrarCentavos: true,
};

function carregarConfiguracoes() {
  try {
    const dados =
      localStorage.getItem(CONFIG_KEY);

    return dados
      ? {
          ...configuracoesIniciais,
          ...JSON.parse(dados),
        }
      : configuracoesIniciais;
  } catch {
    return configuracoesIniciais;
  }
}

export default function ConfiguracoesPage() {
  const [
    configuracoes,
    setConfiguracoes,
  ] = useState(carregarConfiguracoes);

  const [mensagem, setMensagem] =
    useState("");

  useEffect(() => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify(configuracoes)
    );
  }, [configuracoes]);

  function alterarCampo(evento) {
    const {
      name,
      value,
      type,
      checked,
    } = evento.target;

    setConfiguracoes((estadoAtual) => ({
      ...estadoAtual,
      [name]:
        type === "checkbox"
          ? checked
          : value,
    }));
  }

  function salvar() {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify(configuracoes)
    );

    setMensagem(
      "Configurações salvas."
    );

    window.setTimeout(() => {
      setMensagem("");
    }, 2000);
  }

  return (
    <div className="page configuracoes-page">
      <h2 className="page-title">
        Configurações
      </h2>

      {mensagem && (
        <div className="configuracoes-mensagem">
          {mensagem}
        </div>
      )}

      <section className="configuracoes-card">
        <h3>Aparência</h3>

        <label className="configuracoes-campo">
          <span>Tema</span>

          <select
            name="tema"
            value={configuracoes.tema}
            onChange={alterarCampo}
          >
            <option value="escuro">
              Escuro
            </option>

            <option value="claro">
              Claro
            </option>
          </select>
        </label>
      </section>

      <section className="configuracoes-card">
        <h3>Comportamento</h3>

        <label className="configuracoes-checkbox">
          <input
            type="checkbox"
            name="confirmarExclusao"
            checked={
              configuracoes.confirmarExclusao
            }
            onChange={alterarCampo}
          />

          Confirmar antes de excluir dados
        </label>

        <label className="configuracoes-checkbox">
          <input
            type="checkbox"
            name="mostrarCentavos"
            checked={
              configuracoes.mostrarCentavos
            }
            onChange={alterarCampo}
          />

          Mostrar centavos nos valores
        </label>
      </section>

      <button
        type="button"
        className="configuracoes-botao"
        onClick={salvar}
      >
        Salvar configurações
      </button>
    </div>
  );
}