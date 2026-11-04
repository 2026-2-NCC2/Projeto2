"use strict";

// Sem integração explícita, preserva o bloqueio. Nenhuma variável de ambiente
// ativa uploads. O chamador deve validar destino/permissões antes da montagem.
function instalarRotasImagens(app, autenticar, integracao) {
  if (integracao !== undefined) {
    if (!integracao?.servico || !['consultar','substituir','remover'].every(nome => typeof integracao.servico[nome] === 'function')) {
      throw Error('Integração de imagens inválida.');
    }
    app.use('/perfil/imagens', require('./http.cjs').criarRouterImagens({ autenticar, servico: integracao.servico }));
    return;
  }
  const indisponivel = (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ erro: "As imagens de perfil e capa ainda não estão disponíveis." });
  };
  for (const metodo of ["get", "put", "delete"]) {
    app[metodo]("/perfil/imagens/:tipo", autenticar, indisponivel);
  }
}
module.exports = { instalarRotasImagens };
