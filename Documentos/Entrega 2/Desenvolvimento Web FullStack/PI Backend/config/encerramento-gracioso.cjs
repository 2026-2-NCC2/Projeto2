'use strict';

// Controle somente em memória. Não altera o estado privado do cutover.
function criarEncerramentoGracioso({ obterRuntime, supervisor, prazoMs = 30000 }) {
  let encerrando = false, encerramento;
  return {
    middleware(_req, res, next) {
      if (!encerrando) return next();
      res.setHeader('Connection', 'close');
      res.setHeader('Retry-After', '60');
      return res.status(503).json({ erro: 'Servidor em encerramento.' });
    },
    encerrar(servidor) {
      if (encerramento) return encerramento;
      encerrando = true;
      encerramento = (async () => {
        let limite, expirou = false;
        const drenagem = (async () => {
          const http = new Promise((resolve, reject) => servidor.close(e => e ? reject(e) : resolve()));
          const runtime = obterRuntime();
          // Suspende o timer imediatamente, mas preserva a operação já iniciada.
          const limpeza = runtime?.pararLimpeza();
          await Promise.all([http, limpeza]);
          while (supervisor) {
            if (expirou) throw Error('ENCERRAMENTO_DRENAGEM_PENDENTE');
            const s = supervisor.status();
            if (s.resultadosIncertos) throw Error('ENCERRAMENTO_RESULTADO_INCERTO');
            if (!s.requisicoesPendentes && !s.operacoesPersistenciaPendentes && !s.escritasPendentes) break;
            await new Promise(resolve => setTimeout(resolve, 25));
          }
        })();
        try {
          await Promise.race([drenagem, new Promise((_, reject) => {
            limite = setTimeout(() => {
              expirou = true;
              reject(Error('ENCERRAMENTO_DRENAGEM_PENDENTE'));
            }, prazoMs);
          })]);
        } finally { clearTimeout(limite); }
        await obterRuntime()?.fechar();
      })();
      return encerramento;
    },
  };
}
module.exports = { criarEncerramentoGracioso };
