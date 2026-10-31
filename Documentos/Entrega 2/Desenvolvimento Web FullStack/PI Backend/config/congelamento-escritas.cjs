"use strict";
// Barreira local utilizada pelo supervisor. Nao le/edita .env.
// Contabiliza apenas este processo; jobs e outros clientes exigem freeze externo.
function criarBarreiraDeEscritas() {
  let congelado = false, sequencia = 0;
  const ativos = new Set(), incertos = new Set(), esperas = new Set();
  const erro = code => Object.assign(Error("Drenagem nao confirmada."), { code });
  function avisar() {
    for (const e of [...esperas]) {
      if (incertos.size) e.finalizar(erro("FREEZE_RESULTADO_INCERTO"));
      else if (!ativos.size) e.finalizar();
    }
  }
  function middleware(req, res, next) {
    const leitura = ["GET", "HEAD", "OPTIONS"].includes(req.method) || (req.method === "POST" && req.path === "/login");
    if (leitura) return next();
    if (congelado) {
      res.setHeader("Retry-After", "60");
      return res.status(503).json({ erro: "Escritas temporariamente suspensas para manutencao." });
    }
    const id = ++sequencia; ativos.add(id);
    const concluir = () => {
      res.removeListener("close", desconectou);
      if ((res.statusCode ?? 200) >= 500) incertos.add(id);
      else ativos.delete(id);
      avisar();
    };
    const desconectou = () => {
      // Close do socket nao comprova que a transacao foi cancelada/concluida.
      incertos.add(id); avisar();
    };
    res.once("finish", concluir); res.once("close", desconectou);
    return next();
  }
  return {
    middleware,
    congelar() { congelado = true; return this.status(); },
    status() { return { congelado, escritasPendentes: ativos.size, resultadosIncertos: incertos.size, escopo: "somente_este_processo" }; },
    aguardarDrenagem(ms = 30000) {
      if (!congelado) return Promise.reject(erro("FREEZE_NAO_ATIVO"));
      if (!Number.isSafeInteger(ms) || ms < 1) return Promise.reject(erro("FREEZE_PRAZO_INVALIDO"));
      if (incertos.size) return Promise.reject(erro("FREEZE_RESULTADO_INCERTO"));
      if (!ativos.size) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const e = { finalizar(falha) { clearTimeout(timer); esperas.delete(e); falha ? reject(falha) : resolve(); } };
        const timer = setTimeout(() => e.finalizar(erro("FREEZE_TIMEOUT")), ms); esperas.add(e);
      });
    },
    liberar() {
      if (ativos.size || incertos.size) throw erro("FREEZE_DRENAGEM_PENDENTE");
      congelado = false;
    },
  };
}
module.exports = { criarBarreiraDeEscritas };
