"use strict";

// Esta entrega reserva o contrato HTTP, sem parser de arquivo, SDK ou serviço.
// Nenhuma variável de ambiente consegue ativar uploads nesta fase.
function instalarRotasImagens(app, autenticar) {
  const indisponivel = (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ erro: "As imagens de perfil e capa ainda não estão disponíveis." });
  };
  for (const metodo of ["get", "put", "delete"]) {
    app[metodo]("/perfil/imagens/:tipo", autenticar, indisponivel);
  }
}
module.exports = { instalarRotasImagens };
