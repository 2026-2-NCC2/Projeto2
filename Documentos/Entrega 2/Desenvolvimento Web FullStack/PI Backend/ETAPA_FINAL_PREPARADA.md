# Etapa final preparada — 31/10/2026

**Preparacao tecnica validada por simulacao. Janela real ainda nao executada.**
Inventario local confirmado pelo proprietario; backups/restauracoes e rollback
dos oito dominios permanecem aprovados. Nenhuma bateria anterior foi repetida.
Evidencia desta etapa: `evidencias/etapa-final-preparada-20261031.json`.

## Transicao integrada

`config/controlador-supervisor.cjs` integra `config/transicao-controlada.cjs`.
O fluxo exige uma unica instancia local conhecida, congelada/selada, zero
requests, operacoes pendentes ou incertezas e T0/delta aprovados. Depois,
encerra SOMENTE o filho conhecido e ja drenado, aguarda sua saida e admite uma
substituta selada. Nenhum processo real foi encerrado nesta etapa.

A autorizacao usa ticket de uso unico, identidade de boot, PID destino,
checkpoint e fingerprint privado da configuracao. Exige JWT novo diferente
do principal anterior e do de homologacao, sem gerar ou alterar chaves agora.
Projeto diferente, PID errado, ticket repetido, flag de homologacao ou
configuracao divergente sao recusados antes de carregar o servidor.

`scripts/lancador-planejado.cjs` e `iniciar-instancia-planejada.cjs` preparam o
processo futuro por IPC privado. A entrada aguarda autorizacao antes de importar
server.js; a porta futura e local em 127.0.0.1. Nenhum desses scripts foi iniciado.

Depois do boot autorizado, o controlador permite somente GET/HEAD/OPTIONS e
POST /login; novas escritas permanecem bloqueadas. O smoke precisa comprovar
recusa dos JWT antigos, perfis/GET e isolamento MySQL. Para a liberacao final,
sela/drena novamente, revalida o delta e exige autorizacao explicita de escritas.
Nao ha endpoint HTTP publico, timer ou variavel de ambiente que libere sozinho.

Falhas conservam congelamento/selagem e marcam a transicao INCERTA. Novo boot
nao planejado continua recusado; nao existe retry automatico de escrita.
Eventos atrasados do processo antigo nao interferem nos pedidos da substituta.
Leituras de background novas tambem sao recusadas depois da selagem; requests
admitidos anteriormente podem terminar antes da drenagem ser aprovada.

## Startup Supabase preparado, nao aplicado

`config/startup-controlado.cjs` valida o contexto privado da entrada planejada.
Depois da ativacao autorizada, a autorizacao persistente vincula o projeto e a
configuracao para reinicios normais; recusa retorno acidental ao startup MySQL.
O modo isolado MySQL mantem seu contrato independente do estado principal.

`fixtures/cutover-startup.proposta.patch` foi substituido por proposta protegida:
usa o guard novo em server.js, preservando o bloqueio historico sem autorizacao.
O patch passou em `git apply --check` e foi exercitado em VM com fabrica falsa,
antes de criar persistencia. PID/projeto/credenciais de teste ficam vinculados
ao ticket; startup nao autorizado continua recusado.

**O patch NAO foi aplicado.** `config/banco.cjs` nao foi liberado, server.js
continua usando o guard atual e DB_PROVIDER=supabase normal permanece bloqueado.
Nenhuma variavel, credencial ou chave JWT real foi alterada.

## Backups T0 e delta prontos para a janela

- `scripts/backups-t0.cjs`: produtor construido sem conexoes. Quando autorizado
  apos o gate, gera mysqldump completo, pg_dump completo, roles sem senhas,
  TOC e extracao COPY das oito tabelas public, sem restaurar nenhum banco.
- `scripts/preparar-diretorio-t0.ps1`: cria novo diretorio t0-UUID fora do Git,
  com ACL somente para usuario atual e SYSTEM. Sintaxe analisada; nao executado.
- Credenciais dos clientes ficam em arquivos privados temporarios, sem senha
  em argumentos. TLS verify-full no PostgreSQL e PGOPTIONS READ ONLY. Os clientes
  Docker recebem ID/label proprios; timeout nao causa retry e a limpeza recusa
  qualquer container sem identidade/label esperadas.
- O manifesto registra bytes e SHA256; T0 rejeita artefato dentro do repositorio,
  arquivo alterado, schema/RPC incompleto ou dump que nao corresponda ao snapshot.
  COPY preserva null, escapes e UTF8; o verificador recusa dados nao suportados
  em vez de tentar corrigir silenciosamente. Nenhum novo dump real foi gerado.
- `scripts/preparar-t0-delta.cjs` exige gate global antes/depois das etapas,
  compara dumps aos snapshots READ ONLY, grava checkpoint/catalogos somente
  no diretorio privado e prepara o delta final com dez adicionais preservados.
- `scripts/etapa-final-cutover.cjs` integra T0, revalidacao, controlador e smoke.
  Reconfere hashes e delta antes da substituicao e antes da abertura de escritas.
  Somente construir a API nao cria processos, diretorios ou conexoes.

API reservada para execucao futura com adapters operacionais do projeto:

```
const etapa = criarEtapaFinal({
  controlador, estado, opcoesT0,
  ambienteOrigem, ambienteNovo, lancar, validarSmoke
});
// Somente na janela autorizada, com controle de todos os escritores locais:
await controlador.congelar();
await controlador.selarEDrenar();
await etapa.prepararT0();
await etapa.transicionar();
await etapa.liberar({ autorizarEscritas: true });
```

`opcoesT0` recebe inventario/boot ID real, evidencias atuais dos escritores
manuais suspensos, verificacao de persistencia, produtor privado e coletor
READ ONLY. Adapters reais de smoke somente na janela autorizada. Nunca imprimir
ambientes, objetos de checkpoint ou erros brutos; somente resultado sanitizado.

## Validacao executada

17 testes NOVOS aprovados, zero falhas: execucoes filtradas de 5+4+3+2+1+1+1 casos.
Nao se reexecutaram os casos aprovados nem as suites anteriores. Tudo em
memoria/VM, IPC falso e arquivos temporarios ficticios removidos no fim.
Nenhum driver de banco real, processo principal ou marcador privado real
participou das simulacoes. A analise PS1 foi somente sintatica.

Cobertura: transicao completa, gates negativos, JWT ficticio reutilizado,
ticket/PID/projeto/configuracao, novo boot em leitura, liberacao explicita,
incerteza persistente, falta de drenagem, IPC atrasado, isolamento, integridade
T0, escapes COPY, destino fora do Git e fluxo integrado T0->troca->liberacao.

## Decisao e pendencias

Os bloqueios de IMPLEMENTACAO registrados na janela anterior foram tratados.
Estamos preparados para solicitar autorizacao da janela real; isso nao e
aprovacao antecipada da migracao definitiva.

Ainda dependem da janela autorizada:

1. Suspender as acoes manuais SQL/REST/homologacao e iniciar o unico backend
   sob supervisor, registrando boot ID real e evidencias atuais.
2. Congelamento/selagem/drenagem reais, backups T0 e delta real aprovados.
3. Aplicar a proposta protegida de startup e rotacionar JWT explicitamente;
   admitir a instancia Supabase ainda sem escritas e executar smoke real.
4. Liberar escritas somente depois de todos os gates, com retorno seguro
   antes/depois de T1 conforme plano existente e dez extras preservados.

Sem cutover real, Supabase ativado, dados/JWT alterados, frontend ou commits.
