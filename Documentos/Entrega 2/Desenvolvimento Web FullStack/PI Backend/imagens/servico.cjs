"use strict";
const { contexto, novoArquivo, conferirReferencia, falha } = require("./politica.cjs");
const { processarImagem } = require("./processar.cjs");

// Protocolo preparado para testes locais. O repositório transacional descrito
// na proposta NÃO está conectado/implementado nesta fase. Não usar CRUD REST
// independente para simular as transações desses contratos.
function criarServicoImagens({ repositorio, storage, processar = processarImagem }) {
  return Object.freeze({
    async consultar(usuario, tipo) {
      contexto(usuario, tipo);
      const ref = await repositorio.buscar(usuario.id, tipo);
      if (!ref) return null;
      conferirReferencia(usuario, tipo, ref);
      return storage.assinar(usuario, tipo, ref);
    },
    async substituir(usuario, tipo, entrada) {
      contexto(usuario, tipo);
      const imagem = await processar(usuario, tipo, entrada);
      const arquivo = novoArquivo(usuario, tipo);
      const ref = { usuario_id: usuario.id, tipo, ...arquivo,
        mime: imagem.mime, largura: imagem.largura, altura: imagem.altura, tamanho: imagem.tamanho };
      // Reserva durável ANTES do upload, inclusive para queda do processo.
      await repositorio.reservar(ref);
      try {
        await storage.enviar(usuario, tipo, ref, imagem.dados);
        // Troca referência + agenda remoção da antiga na mesma transação.
        await repositorio.confirmar(usuario.id, tipo, arquivo.operacao);
      } catch {
        // Timeout não prova falha: nunca apagar o novo arquivo aqui. A reserva
        // permanece para reconciliação, inclusive se o commit foi confirmado
        // no banco mas a resposta se perdeu. Não repetir escrita automaticamente.
        throw falha(503, "Não foi possível confirmar a imagem. Consulte o perfil antes de tentar novamente.");
      }
      return { operacao: arquivo.operacao };
    },
    async remover(usuario, tipo) {
      contexto(usuario, tipo);
      // Retira referência e agenda limpeza atomicamente; idempotente.
      // Indisponibilidade do Storage não perde a intenção de exclusão.
      await repositorio.desvincular(usuario.id, tipo);
    },
  });
}

async function limparUmaImagem({ repositorio, storage }) {
  // Deve revalidar ausência de referência e tornar o caminho irrecuperável
  // para novas confirmações ANTES de liberar o lock da transação.
  const tarefa = await repositorio.reivindicarLimpeza();
  if (!tarefa) return false;
  try {
    const usuario = { id: tarefa.usuario_id, perfil: "participante" };
    conferirReferencia(usuario, tarefa.tipo, tarefa);
    await storage.remover(usuario, tarefa.tipo, tarefa);
    await repositorio.concluirLimpeza(tarefa.operacao);
    return true;
  } catch {
    await repositorio.adiarLimpeza(tarefa.operacao);
    throw falha(503, "Limpeza de imagem pendente de nova tentativa.");
  }
}
module.exports = { criarServicoImagens, limparUmaImagem };
