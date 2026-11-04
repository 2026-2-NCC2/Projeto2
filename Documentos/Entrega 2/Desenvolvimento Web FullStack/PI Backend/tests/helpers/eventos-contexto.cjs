'use strict';
const {ErroServico}=require('../../services/suporte-transacoes.cjs');
module.exports={ErroServico,validarEvento:require('../../services/eventos.cjs').validarEvento,
  responderErroServico(res,e,mensagem){return res.status(e instanceof ErroServico?e.respostaStatus:500).json({erro:e instanceof ErroServico?e.message:mensagem});},
};
