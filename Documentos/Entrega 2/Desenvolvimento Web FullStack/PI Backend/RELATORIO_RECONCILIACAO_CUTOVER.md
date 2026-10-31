# Reconciliacao atual MySQL → Supabase — 31/10/2026

**Leitura concluida, sem alteracoes. Cutover ainda nao autorizado.**

Evidencia sanitizada:
`evidencias/cutover-reconciliacao-b806c01c-4001-4fdb-ae15-261200b583f5.json`.
Coleta entre 05:07:44 e 05:07:49 UTC (02:07 no fuso America/Sao_Paulo).
Sem senhas, emails, hashes bcrypt ou corpos de registros exportados no relato.

Origem local explicitamente configurada: oito tabelas InnoDB, leitura em
transacao READ ONLY com snapshot consistente; ROLLBACK e conexao encerrada.
Destino: exclusivamente PI Backend, ref `gnwybroqfvwosiqzsfla`, apenas GET.
Nenhum servidor iniciado; nenhum dado, credencial ou permissao alterado.

## Contagens e conteudo

| Tabela | MySQL atual | Supabase atual | Adicionais exclusivos Supabase |
|---|---:|---:|---:|
| usuarios | 9 | 10 | 1 |
| eventos | 5 | 6 | 1 |
| custos_evento | 3 | 5 | 2 |
| cotacoes | 3 | 4 | 1 |
| itens_cotacao | 13 | 15 | 2 |
| propostas | 2 | 3 | 1 |
| inscricoes | 2 | 3 | 1 |
| solicitacoes_acesso | 5 | 6 | 1 |
| **Total** | **42** | **52** | **10** |

Os 42 IDs da origem estao presentes no destino. Nove usuarios correspondem
pelo mesmo ID e email normalizado: nenhuma colisao, remarcacao de ID,
identidade ausente, perfil divergente ou hash bcrypt diferente. A igualdade de
hashes foi verificada somente em memoria, sem autenticar ou alterar senhas.

Eventos, custos, cotações, itens, propostas, inscricoes e solicitacoes conservam
os campos de negocio dos registros comuns, incluindo dinheiro, status e FKs.
Nao ha orfaos nas nove FKs, nem eventos/propostas/inscricoes/solicitacoes
apontando para outra identidade entre as duas pontas.

## Datas: representacao diferente, instantes iguais

O comparador de componentes encontrou diferencas em 12 campos TIMESTAMP:
cotacoes.criada_em (3), propostas.criada_em (2), inscricoes.data_inscricao (2)
e solicitacoes_acesso.criada_em (5).

O dump foi exportado com `SET time_zone = "+00:00"`; a sessao MySQL atual usa
SYSTEM, com deslocamento atual de -180 minutos. A leitura independente de
UNIX_TIMESTAMP na mesma transacao foi comparada com o instante UTC Supabase:
**12 comparados, zero instantes divergentes, zero casos sem precisao comparavel**.

Isso nao demonstra alteracao dos dados: e diferenca de representacao por fuso.
Nao subtrair/adicionar tres horas aos dados automaticamente. DATE, horario e
demais campos comuns tambem coincidiram na comparacao executada. O smoke test
da futura entrada normal ainda deve conferir a serializacao HTTP esperada.

## Classificacao dos dez adicionais

Todos sao exclusivos do Supabase em relacao ao MySQL atual e ao dump. As
evidencias locais abaixo registram PASS, origem/header do projeto verificados
e uma tentativa de INSERT, com o ID correspondente. Nao se usou apenas nome
ou texto contendo "teste" para concluir a classificacao.

| Tabela / ID | Classificacao e vinculo |
|---|---|
| usuarios / 10 | Usuario de teste criado pelo diagnostico HTTPS; evidencia usuarios-criar-https-4313ea84-e760-4889-8f1f-bb90e0fb416c.json |
| eventos / 12 | Evento de teste do diagnostico HTTPS de publicacao; evidencia eventos-publicar-https-45ad5fa7-6424-4ae7-bf86-33cdb34caa00.json; dono e usuario importado 1 |
| custos_evento / 7, 8 | Dois custos associados exclusivamente ao evento de teste 12 |
| cotacoes / 6 | Cotacao associada ao evento de teste 12 |
| itens_cotacao / 22, 23 | Dois itens da cotacao de teste 6 |
| propostas / 3 | Proposta de teste criada pelo diagnostico HTTPS; evidencia propostas-criar-https-0a151341-304a-4d00-a4f8-b56dd410e365.json; ligada a cotacao importada 1 e fornecedor importado 3 |
| inscricoes / 3 | Inscricao do usuario de teste 10 no evento de teste 12 |
| solicitacoes_acesso / 6 | Pedido de teste do usuario 10; evidencia solicitacoes-acesso-criar-https-1bfdce4d-7349-43f2-b93a-b5368522cdde.json |

Resultado: quatro registros de teste comprovados diretamente e seis vinculados
ao evento de teste comprovado. Nenhum adicional ficou sem classificacao.
As evidencias citadas estao na pasta `evidencias`.

Nao sao residuos da rodada descartavel `f779e63e398b4da5bfb473d218ec7121`:
**nenhum dos 21 IDs daquela rodada permanece no destino**. Sao testes
anteriores, preexistentes a ela, e nao podem ser removidos pela autorizacao
de limpeza que abrangia somente os 21 registros novos. Todos foram preservados.

## Delta e bloqueios restantes

- Na origem atual, nao ha IDs novos ou removidos frente ao dump identificado.
  Fora das representacoes TIMESTAMP explicadas acima, os campos coincidem.
- O Supabase conserva o mesmo conjunto adicional observado na leitura anterior:
  dez registros, agora classificados. Nao se encontrou nova divergencia de
  negocio ou identidade nessa comparacao.
- Decidir explicitamente se esses dez testes anteriores serao preservados ou
  removidos, com eventual limpeza propria por IDs/dependencias. Nunca excluir
  seus pais importados: evento 12 e proposta 3 referenciam usuarios/cotacao
  importados que devem permanecer.
- A origem foi lida consistentemente, mas o REST nao fornece um snapshot unico
  entre tabelas/paginas e nao houve freeze de escritores. Repetir o delta final
  somente na janela autorizada; esta coleta nao e certificacao final do corte.
- Ainda pendem backups/restauracao, retorno seguro apos a primeira escrita real,
  rotacao autorizada do JWT principal, patch de startup e smoke tests finais.

MySQL permanece padrao. Supabase continua bloqueado no startup normal.
Oito testes locais do comparador/classificacao passaram, sem consultas de banco.
Nenhuma migracao, correcao de dados, alteracao de credenciais ou commit executado.
