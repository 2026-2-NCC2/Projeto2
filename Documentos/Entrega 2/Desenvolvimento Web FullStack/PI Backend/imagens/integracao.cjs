"use strict";
const { criarRepositorioImagens } = require('./repositorio.cjs');
const { criarStorageImagens } = require('./storage.cjs');
const { criarServicoImagens, limparUmaImagem } = require('./servico.cjs');

// Construção explícita com dependências já validadas. Inerte ao importar.
// O chamador de homologação confere mesmo projeto no PG e Storage, permissões
// de SET ROLE e schema. Não é conectado ao server.js nesta etapa.
function prepararIntegracaoImagens({ pool, clienteStorage, origemStorage, supervisor }) {
  const origem = new URL(origemStorage);
  if (origem.protocol !== 'https:' || origem.origin !== origemStorage || origem.username || origem.password) throw Error('Origem Storage inválida.');
  const repositorio = criarRepositorioImagens(pool);
  const storage = criarStorageImagens(clienteStorage, { origem: origemStorage });
  const servico = criarServicoImagens({ repositorio, storage });
  const acompanhar = (acao, escrita) => supervisor ? supervisor.executarPersistencia(acao, escrita) : acao();
  let limpando = false;
  return Object.freeze({
    servico: Object.freeze(Object.fromEntries(Object.entries(servico).map(([nome, acao]) =>
      [nome, (...args) => acompanhar(() => acao(...args), nome !== 'consultar')]))),
    async limpar({ executar = false, limite = 10 } = {}) {
      if (!Number.isInteger(limite) || limite < 1 || limite > 100) throw Error('Limite de limpeza inválido.');
      if (limpando) throw Error('Limpeza já está em execução neste processo.');
      limpando = true;
      try {
        return await acompanhar(async () => {
          if (!executar) return { executado: false, pendencias: await repositorio.listarPendencias() };
          let limpos = 0;
          for (; limpos < limite; limpos++) if (!await limparUmaImagem({ repositorio, storage })) break;
          return { executado: true, limpos };
        }, executar);
      } finally { limpando = false; }
    },
  });
}
module.exports = { prepararIntegracaoImagens };
