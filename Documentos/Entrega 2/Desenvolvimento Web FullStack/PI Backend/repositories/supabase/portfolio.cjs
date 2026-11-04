"use strict";
const {randomUUID}=require('node:crypto');
const {validarItem,uuid,erro}=require('../../portfolio.cjs');
const campos='id,fornecedor_id,titulo,descricao,categoria,versao,criado_em,atualizado_em';
const limite=20;
function conferirItem(item,id){
  if(!item||!uuid(item.id)||item.fornecedor_id!==id||!Number.isInteger(item.versao)||item.versao<1||
      typeof item.criado_em!=='string'||typeof item.atualizado_em!=='string')throw erro(503,'Resposta de portfólio inválida.');
  let texto;try{texto=validarItem({titulo:item.titulo,descricao:item.descricao,categoria:item.categoria});}catch{throw erro(503,'Resposta de portfólio inválida.');}
  return{id:item.id,fornecedor_id:id,...texto,versao:item.versao,criado_em:item.criado_em,atualizado_em:item.atualizado_em};
}
function criarRepositorioPortfolio(cliente){
  const tabela=()=>cliente.schema('public').from('portfolio_itens');
  function conferirErro(error){if(error){if(['42P01','42703','PGRST204','PGRST205'].includes(error.code))error.resultadoIncerto=false;throw error;}}
  function paginar(data,count,pagina){
    if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||data.length>limite)throw erro(503,'Consulta incompleta.');
    return{itens:data,total:count,pagina,totalPaginas:Math.max(1,Math.ceil(count/limite))};
  }
  return{
    async listar(pagina=1){
      const {data,error,count}=await cliente.schema('public').from('usuarios').select('id,nome',{count:'exact'})
        .eq('perfil','fornecedor').order('nome').order('id').range((pagina-1)*limite,pagina*limite-1);
      conferirErro(error);
      if(data?.some(u=>!Number.isSafeInteger(u.id)||typeof u.nome!=='string'))throw erro(503,'Fornecedor inválido.');
      return paginar(data,count,pagina);
    },
    async buscarPerfil(id){
      const {data,error}=await cliente.schema('public').from('usuarios').select('id,nome').eq('id',id).eq('perfil','fornecedor').maybeSingle();
      conferirErro(error);if(data===null)return null;
      if(data?.id!==id||typeof data.nome!=='string')throw erro(503,'Fornecedor inválido.');return{id,nome:data.nome};
    },
    async listarPorFornecedor(id,pagina=1){
      const {data,error,count}=await tabela().select(campos,{count:'exact'}).eq('fornecedor_id',id)
        .order('criado_em',{ascending:false}).order('id').range((pagina-1)*limite,pagina*limite-1);
      conferirErro(error);return paginar(Array.isArray(data)?data.map(i=>conferirItem(i,id)):data,count,pagina);
    },
    async criar(id,dados){
      const valores={id:randomUUID(),fornecedor_id:id,...validarItem(dados)};
      const {data,error}=await tabela().insert(valores).select(campos).single().retry(false);conferirErro(error);
      const item=conferirItem(data,id);
      if(item.id!==valores.id||['titulo','descricao','categoria'].some(k=>item[k]!==valores[k])||item.versao!==1)throw erro(503,'Criação não confirmada.');return item;
    },
    async atualizar(id,itemId,dados){
      const validos=validarItem(dados,true),versao=validos.versao;delete validos.versao;
      const {data,error}=await tabela().update({...validos,versao:versao+1,atualizado_em:new Date().toISOString()})
        .eq('id',itemId).eq('fornecedor_id',id).eq('versao',versao).select(campos).maybeSingle().retry(false);conferirErro(error);
      if(data===null)return null;const item=conferirItem(data,id);
      if(item.id!==itemId||item.versao!==versao+1||Object.keys(validos).some(k=>item[k]!==validos[k]))throw erro(503,'Edição não confirmada.');return item;
    },
    async excluir(id,itemId,versao){
      const {data,error}=await tabela().delete().eq('id',itemId).eq('fornecedor_id',id).eq('versao',versao).select(campos).maybeSingle().retry(false);
      conferirErro(error);if(data===null)return null;const item=conferirItem(data,id);if(item.id!==itemId||item.versao!==versao)throw erro(503,'Remoção não confirmada.');return item;
    },
  };
}
module.exports={criarRepositorioPortfolio};
