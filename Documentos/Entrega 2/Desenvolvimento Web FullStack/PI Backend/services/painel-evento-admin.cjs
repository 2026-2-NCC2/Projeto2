'use strict';
const {autorizar,falha}=require('./suporte-transacoes.cjs');
function unicos(lista){
  if(!Array.isArray(lista)||lista.some(x=>!Number.isSafeInteger(x.id)||x.id<=0)||new Set(lista.map(x=>x.id)).size!==lista.length)
    throw falha(503,'Dados do painel inconsistentes. Atualize a consulta.');
  return lista;
}
// Somar em centavos, sem arredondamento binário nem serializar BigInt no JSON.
function totalEstimado(lista,campo){
  const valor=lista.reduce((s,x)=>{
    const text=String(x[campo]);
    if(!/^-?\d+(?:\.\d{1,2})?$/.test(text))throw falha(503,'Valor estimado inválido.');
    const [inteiro,fracao='']=text.replace('-','').split('.');
    return s+(BigInt(inteiro)*100n+BigInt(fracao.padEnd(2,'0')))*(text.startsWith('-')?-1n:1n);
  },0n);
  const abs=valor<0n?-valor:valor;
  return `${valor<0n?'-':''}${abs/100n}.${String(abs%100n).padStart(2,'0')}`;
}
function criarPainelEventoAdmin(repositorios){
 return {async consultar(ator,entrada){
  autorizar(ator,'admin');
  if(!/^[1-9]\d*$/.test(String(entrada))||!Number.isSafeInteger(Number(entrada))||Number(entrada)>2147483647)throw falha(400,'Evento inválido.');
  const id=Number(entrada),{eventos,custos,cotacoes,propostas}=repositorios;
  const evento=eventos.buscarAdministrativo?await eventos.buscarAdministrativo(id):(await eventos.listarAdministrativo()).find(e=>e.id===id);
  if(!evento)throw falha(404,'Evento não encontrado.');
  const [custosLista,cotacoesLista,propostasLista]=await Promise.all([custos.listarPorEvento(id),cotacoes.listarAdministrativo(id),propostas.listarAdministrativo(id)]);
  const c=unicos(custosLista);if(c.some(x=>x.evento_id!==id))throw falha(503,'Custos inconsistentes.');
  const qs=unicos(cotacoesLista.filter(x=>x.evento_id===id));
  const ids=new Set(qs.map(x=>x.id));
  const ps=unicos(propostasLista.filter(x=>x.evento_id===id));
  if(ps.some(p=>!ids.has(p.cotacao_id)))throw falha(503,'Relações alteradas durante a consulta. Atualize o painel.');
  const relacionadas=[];
  // Consultas sequenciais evitam disparar uma requisição simultânea por cotação.
  for(const q of qs)relacionadas.push({...q,itens:unicos(await cotacoes.listarItens(q.id))});
  return {evento,custos:c,cotacoes:relacionadas,propostas:ps,
    resumo:{custos:c.length,cotacoes:qs.length,itens:relacionadas.reduce((n,q)=>n+q.itens.length,0),propostas:ps.length,total_custos_estimados:totalEstimado(c,'valor_estimado')},
    consultado_em:new Date().toISOString(),aviso:'Valores estimados e ofertas comerciais; não representam pagamentos realizados. As seções são consultadas separadamente.'};
 }};
}
module.exports={criarPainelEventoAdmin,totalEstimado};
