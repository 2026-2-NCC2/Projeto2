# Correções de segurança do backend

## Controle de frequência

- `POST /login`: até 10 requisições por IP em uma janela de 15 minutos.
- `POST /usuarios`: até 5 requisições por IP em uma janela de 1 hora.
- Cada rota tem contagem independente. Requisições bem-sucedidas e corpos
  rejeitados pela validação da rota também consomem a cota. Login bem-sucedido
  não reinicia a contagem.
- Ao exceder a cota, a API retorna `429` com `Retry-After` em segundos,
  antes de consultar o banco ou executar bcrypt. Novas tentativas bloqueadas
  não prolongam a janela.
- O IP vem de `req.ip`, com a configuração padrão do Express, sem confiar
  diretamente em `X-Forwarded-For`. IPs compartilhados compartilham a cota.
- O armazenamento é em memória, separado por processo, com até 10.000 IPs
  por rota. Entradas expiradas são removidas; na capacidade máxima, novos
  IPs recebem `429` até existir espaço. Reiniciar o processo limpa as cotas.

Esses valores são parâmetros operacionais de segurança. Uma implantação com
proxy ou múltiplas instâncias exige definir os proxies confiáveis e um controle
compartilhado antes de considerar as cotas globais. Esta etapa não altera a
topologia nem adiciona serviços externos.

## Erros, tokens e eventos

Os logs das rotas e do handler final usam mensagens fixas, sem imprimir objetos
de erro, stack, SQL, parâmetros, corpo, tokens ou credenciais. Erros de parsing
de JSON retornam `400`, corpos grandes retornam `413` e erros inesperados
retornam `500`, com respostas genéricas.

A emissão e a verificação de JWT usam explicitamente `HS256`. O identificador
no token deve ser um número inteiro positivo seguro antes de consultar o
usuário. A expiração continua sendo de uma hora; o perfil e a autorização
continuam sendo determinados pelo usuário consultado no banco.

`GET /eventos/:id` seleciona apenas `id`, `nome`, `data`, `horario`, `local`,
`categoria`, `publico`, `descricao`, `status` e `usuario_id`, preservando o filtro
por proprietário.

## Verificação

Execute `npm test` dentro de `PI Backend` (ou `npm.cmd test` no PowerShell).
Os testes de segurança usam JWT real e simulam HTTP, bcrypt, banco e relógio.
A suíte não lê `.env`, não abre bancos e não executa migrações. Os testes de
regressão existentes verificam o adaptador MySQL e o isolamento com simulações;
eles não substituem uma verificação de integração com um banco em execução.
