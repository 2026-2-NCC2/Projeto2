"use strict";

const campos = ["id", "nome", "data", "horario", "local", "categoria",
  "publico", "descricao", "status", "usuario_id"];

function respostaInvalida() {
  return Object.assign(new Error("Resposta invalida ao consultar evento."), {
    code: "SUPABASE_EVENTO_RESPONSE",
  });
}

// O mysql2 atual devolve DATE como Date a meia-noite no fuso local do backend.
// PostgREST devolve YYYY-MM-DD: preservar a serializacao existente, sem usar UTC
// implicitamente e sem alterar o fuso do processo.
function converterData(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw respostaInvalida();
  }
  const [ano, mes, dia] = valor.split("-").map(Number);
  const calendario = new Date(`${valor}T00:00:00Z`);
  if (!Number.isFinite(calendario.getTime()) || calendario.getUTCFullYear() !== ano ||
      calendario.getUTCMonth() + 1 !== mes || calendario.getUTCDate() !== dia) {
    throw respostaInvalida();
  }
  const data = new Date(`${valor}T00:00:00`);
  if (!Number.isFinite(data.getTime())) throw respostaInvalida();
  return data;
}

// Leituras, cadastro, edicao, exclusao e publicacao. Nao selecionados pelas
// rotas ainda. Reutiliza a fabrica existente; importar o modulo e inerte.
// Injetar o cliente permite testes sem SDK, credenciais ou consultas reais.
function criarRepositorioEventos(
  cliente = require("../../db-supabase.cjs").criarClienteSupabase(), {gestaoSegura=false}={}
) {
  const {validarEvento,inicioFuturo,erroRpc,consultarRpc}=require('../../services/eventos.cjs');
  const {falha}=require('../../services/suporte-transacoes.cjs');
  async function capacidades(){
    const {data,error}=await consultarRpc(cliente,'eventos_capacidades_v1',{});
    if(error&&!['PGRST202','42883'].includes(error.code))erroRpc(error);
    if(!error&&![1,3].includes(data))throw falha(503,'Versão da gestão de eventos não reconhecida.');
    const pronto=!error&&[1,3].includes(data);
    return {...(data===3?{controleCapacidade:true}:{}),criar:pronto,editar:pronto,publicar:pronto,inscrever:pronto,controleVersao:pronto,cancelar:true,encerrar:true,excluir:false};
  }
  async function gerir(acao,id,usuarioId,dados={},versao=null,chave=null){
    const caps=await capacidades();
    if(dados.capacidade_maxima!==undefined&&!caps.controleCapacidade)throw falha(503,'Controle de capacidade aguarda migração autorizada.');
    if(!caps.controleVersao)throw falha(503,'Gestão segura aguarda migração autorizada.');
    const {data,error}=await consultarRpc(cliente,'gerir_evento_v1',{
      p_acao:acao,p_usuario:usuarioId,p_evento:id,p_dados:dados,p_versao:versao,p_chave:chave,
    });
    if(error)erroRpc(error);
    if(!data||!Number.isSafeInteger(data.id)||(id!==null&&data.id!==id)||data.usuario_id!==usuarioId||!Number.isSafeInteger(data.versao))throw falha(503,'Resultado da operação não confirmado.',true);
    return data;
  }
  async function comVagas(lista){
    if(!gestaoSegura||!(await capacidades()).controleCapacidade||!lista.length)return lista;
    const mapa=new Map();
    for(let inicio=0;inicio<lista.length;inicio+=200){
      const ids=lista.slice(inicio,inicio+200).map(e=>e.id);
      const {data,error}=await consultarRpc(cliente,'eventos_vagas_v3',{p_eventos:ids});
      if(error)erroRpc(error);
      if(!Array.isArray(data)||data.length!==ids.length)throw respostaInvalida();
      for(const v of data){
        if(!ids.includes(v.id)||mapa.has(v.id)||!Number.isSafeInteger(v.inscritos_confirmados)||v.inscritos_confirmados<0||
          (v.capacidade_maxima!==null&&(!Number.isSafeInteger(v.capacidade_maxima)||v.capacidade_maxima<1))||
          v.vagas_restantes!==(v.capacidade_maxima===null?null:Math.max(0,v.capacidade_maxima-v.inscritos_confirmados))||
          v.lotado!==(v.capacidade_maxima!==null&&v.inscritos_confirmados>=v.capacidade_maxima))throw respostaInvalida();
        mapa.set(v.id,v);
      }
    }
    return lista.map(e=>({...e,...mapa.get(e.id)}));
  }
  async function camposLeitura(){return gestaoSegura&&(await capacidades()).controleVersao?[...campos,'versao']:campos;}
  // O contrato MySQL retorna a lista inteira. O limite de linhas do PostgREST
  // nao pode truncar silenciosamente esse retorno. Cada pagina exige contagem
  // exata; respostas incompletas/inconsistentes falham, sem retry ou fallback.
  // Chamadas REST separadas nao garantem snapshot transacional entre paginas.
  async function listarTodas(montarConsulta, selecao, administrativo = false, usuarioId) {
    const resultado = [];
    const ids = new Set();
    let total;
    do {
      const { data, error, count } = await montarConsulta()
        .range(resultado.length, resultado.length + 999);
      if (error) throw error;
      if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0 ||
          (total !== undefined && count !== total) ||
          resultado.length + data.length > count ||
          (data.length === 0 && resultado.length < count)) {
        throw respostaInvalida();
      }
      total = count;
      for (const evento of data) {
        if (!evento || typeof evento !== "object" || Array.isArray(evento) ||
            selecao.some(campo => !Object.hasOwn(evento, campo)) ||
            !Number.isSafeInteger(evento.id) || evento.id <= 0 || ids.has(evento.id) ||
            (usuarioId !== undefined && evento.usuario_id !== usuarioId)) {
          throw respostaInvalida();
        }
        const item = Object.fromEntries(selecao.map(campo => [campo,
          campo === "data" ? converterData(evento.data) : evento[campo]]));
        if (administrativo) {
          if (!evento.organizador || Array.isArray(evento.organizador) ||
              typeof evento.organizador.nome !== "string") throw respostaInvalida();
          item.organizador_nome = evento.organizador.nome;
        }
        ids.add(evento.id);
        resultado.push(item);
      }
    } while (resultado.length < total);
    return comVagas(resultado);
  }

  return {
    capacidades,
    async mudarEstado(id,usuarioId,{acao,estado_esperado,versao}={}){
      if(!Number.isSafeInteger(id)||id<=0||!['cancelar','encerrar'].includes(acao))throw falha(400,'Operação inválida.');
      if((await capacidades()).controleVersao)return gerir(acao,id,usuarioId,{},versao);
      // Compatível com o schema atual. Não apaga filhos e não depende de colunas novas.
      const {data:antes,error}=await cliente.schema('public').from('eventos').select(campos.join(',')).eq('id',id).eq('usuario_id',usuarioId).maybeSingle();
      if(error)erroRpc(error);if(!antes)throw falha(404,'Evento não encontrado.');
      if(antes.status!==estado_esperado||!(acao==='cancelar'?['Em planejamento','Ativo']:['Ativo']).includes(antes.status)||
        (acao==='encerrar'&&inicioFuturo(antes.data,antes.horario)))throw falha(409,'Transição indisponível. Consulte o evento novamente.');
      let q=cliente.schema('public').from('eventos').update({status:acao==='cancelar'?'Cancelado':'Encerrado'}).eq('id',id).eq('usuario_id',usuarioId);
      // Compare-and-swap do snapshot inteiro; uma edição concorrente não é ignorada.
      for(const campo of campos.filter(c=>!['id','usuario_id'].includes(c)))q=antes[campo]===null?q.is(campo,null):q.eq(campo,antes[campo]);
      const r=await q.select(campos.join(',')).retry(false);if(r.error)erroRpc(r.error);
      if(!Array.isArray(r.data)||r.data.length!==1)throw falha(409,'Evento alterado por outra operação. Consulte novamente.');
      if(r.data[0].id!==id||r.data[0].usuario_id!==usuarioId||r.data[0].status!==(acao==='cancelar'?'Cancelado':'Encerrado'))throw falha(503,'Transição não confirmada. Consulte o evento.',true);
      return r.data[0];
    },
    async publicar(id, usuarioId, versao) {
      if(gestaoSegura){await gerir('publicar',id,usuarioId,{},versao);return 1;}
      // Mesmo UPDATE atomico do MySQL: propriedade e estado conferidos na escrita.
      // Nao confundir com publicar_cotacao, que possui outro contrato/transacao.
      const { data: linhas, error } = await cliente.schema("public")
        .from("eventos")
        .update({ status: "Ativo" })
        .eq("id", id)
        .eq("usuario_id", usuarioId)
        .eq("status", "Em planejamento")
        .select("id")
        .retry(false);
      if (error) throw error;
      if (!Array.isArray(linhas) || linhas.length > 1 ||
          (linhas.length === 1 && (!linhas[0] || typeof linhas[0] !== "object" ||
            Array.isArray(linhas[0]) || !Object.hasOwn(linhas[0], "id") ||
            !Number.isSafeInteger(linhas[0].id) || linhas[0].id <= 0 || linhas[0].id !== id))) {
        throw Object.assign(new Error("Resposta invalida ao publicar evento."), {
          code: "SUPABASE_EVENTO_PUBLISH_RESPONSE", resultadoIncerto: true,
        });
      }
      return linhas.length;
    },

    async excluir(id, usuarioId) {
      if(gestaoSegura)throw falha(409,'Exclusão física indisponível. Cancele ou encerre o evento para preservar seu histórico.');
      // Uma unica exclusao condicional. FKs/cascatas pertencem ao banco;
      // nao remover dependencias manualmente nem ocultar falhas de integridade.
      const { data: linhas, error } = await cliente.schema("public")
        .from("eventos")
        .delete()
        .eq("id", id)
        .eq("usuario_id", usuarioId)
        .select("id")
        .retry(false);
      if (error) throw error;
      if (!Array.isArray(linhas) || linhas.length > 1 ||
          (linhas.length === 1 && (!linhas[0] || typeof linhas[0] !== "object" ||
            Array.isArray(linhas[0]) || !Object.hasOwn(linhas[0], "id") ||
            !Number.isSafeInteger(linhas[0].id) || linhas[0].id <= 0 || linhas[0].id !== id))) {
        throw Object.assign(new Error("Resposta invalida ao excluir evento."), {
          code: "SUPABASE_EVENTO_DELETE_RESPONSE", resultadoIncerto: true,
        });
      }
      return linhas.length;
    },

    async criar({ nome, data, horario, local, categoria, publico, descricao, capacidade_maxima, status, usuarioId, chaveIdempotencia }) {
      // A resposta atômica preserva também o estado atual em um replay de criação.
      if(gestaoSegura)return gerir('criar',null,usuarioId,validarEvento({nome,data,horario,local,categoria,publico,descricao,capacidade_maxima}),null,chaveIdempotencia);
      // Validacoes/defaults e identidade do organizador continuam no handler.
      // Nao aceitar usuario_id extra do corpo como substituto de usuarioId.
      const { data: criado, error } = await cliente.schema("public")
        .from("eventos")
        .insert({ nome, data, horario, local, categoria, publico, descricao, status, usuario_id: usuarioId })
        .select("id")
        .single()
        .retry(false);
      // FK, NOT NULL, tipo/data e demais erros mantem o caminho 500 existente.
      if (error) throw error;
      if (!criado || typeof criado !== "object" || Array.isArray(criado) ||
          !Object.hasOwn(criado, "id") || !Number.isSafeInteger(criado.id) || criado.id <= 0) {
        throw Object.assign(new Error("Resposta invalida ao cadastrar evento."), {
          code: "SUPABASE_EVENTO_CREATE_RESPONSE", resultadoIncerto: true,
        });
      }
      return criado.id;
    },

    async atualizar(id, usuarioId, { nome, data, horario, local, categoria, publico, descricao, capacidade_maxima }, versao) {
      if(gestaoSegura){await gerir('editar',id,usuarioId,validarEvento({nome,data,horario,local,categoria,publico,descricao,capacidade_maxima}),versao);return 1;}
      // Mesmo UPDATE condicional por id E proprietario, sem leitura previa.
      // Status e usuario_id nao sao editaveis; validacoes/perfil ficam no handler.
      const { data: linhas, error } = await cliente.schema("public")
        .from("eventos")
        .update({ nome, data, horario, local, categoria, publico, descricao })
        .eq("id", id)
        .eq("usuario_id", usuarioId)
        .select("id")
        .retry(false);
      if (error) throw error;
      if (!Array.isArray(linhas) || linhas.length > 1 ||
          (linhas.length === 1 && (!linhas[0] || typeof linhas[0] !== "object" ||
            Array.isArray(linhas[0]) || !Object.hasOwn(linhas[0], "id") ||
            !Number.isSafeInteger(linhas[0].id) || linhas[0].id <= 0 || linhas[0].id !== id))) {
        throw Object.assign(new Error("Resposta invalida ao atualizar evento."), {
          code: "SUPABASE_EVENTO_UPDATE_RESPONSE", resultadoIncerto: true,
        });
      }
      // Corresponde a affectedRows com FOUND_ROWS do mysql2: 1 mesmo sem mudanca.
      return linhas.length;
    },

    async listarPorUsuario(usuarioId) {
      const campos=await camposLeitura();
      return listarTodas(() => cliente.schema("public").from("eventos")
        .select(campos.join(", "), { count: "exact" })
        .eq("usuario_id", usuarioId)
        .order("id", { ascending: false }), campos, false, usuarioId);
    },

    async listarAdministrativo() {
      const campos=await camposLeitura();
      return listarTodas(() => cliente.schema("public").from("eventos")
        .select(`${campos.join(", ")}, organizador:usuarios!inner(nome)`, { count: "exact" })
        .order("id", { ascending: false }), campos, true);
    },

    async listarAtivosParaParticipante() {
      const camposParticipante = campos.filter(campo => campo !== "usuario_id");
      const lista=await listarTodas(() => cliente.schema("public").from("eventos")
        .select(camposParticipante.join(", "), { count: "exact" })
        .eq("status", "Ativo")
        .order("data", { ascending: true })
        .order("id", { ascending: true }), camposParticipante);
      return gestaoSegura?lista.filter(e=>inicioFuturo(e.data,e.horario)):lista;
    },

    async buscarPorIdDoUsuario(id, usuarioId) {
      const campos=await camposLeitura();
      const { data, error } = await cliente.schema("public")
        .from("eventos")
        .select(campos.join(", "))
        .eq("id", id)
        .eq("usuario_id", usuarioId)
        .maybeSingle();

      // Propagar falhas ao handler, que ja define a mensagem e o HTTP 500.
      // Nao converter falha em 404, repetir consulta ou usar fallback MySQL.
      if (error) throw error;
      if (data === null) return undefined;
      if (!data || typeof data !== "object" || Array.isArray(data) ||
          campos.some(campo => !Object.hasOwn(data, campo)) ||
          data.id !== id || data.usuario_id !== usuarioId) {
        throw respostaInvalida();
      }
      return (await comVagas([Object.fromEntries(campos.map(campo => [campo,
        campo === "data" ? converterData(data.data) : data[campo]]))]))[0];
    },
  };
}

module.exports = { criarRepositorioEventos };
