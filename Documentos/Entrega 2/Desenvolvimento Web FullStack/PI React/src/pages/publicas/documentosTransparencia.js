import termosUso from './termosUso.json' with { type: 'json' }
export const documentosTransparencia = {
  privacidade: {
    titulo: 'Política de Privacidade',
    descricao: 'Como a versão atual do TrocaTicket trata informações pessoais e quais definições ainda estão pendentes.',
    secoes: [
      { id: 'responsavel', titulo: 'Responsável pelo tratamento', textos: ['O TrocaTicket é um projeto acadêmico de gestão e participação em eventos. A identificação de quem responderá como controlador, o canal institucional e a organização do atendimento ainda dependem de definição. Não há indicação de encarregado formalmente designado nesta minuta.'] },
      { id: 'dados', titulo: 'Categorias de dados e finalidades', textos: ['O cadastro solicita nome, e-mail e senha para criar a conta. O backend armazena um hash da senha e utiliza o perfil de acesso para autorizar funcionalidades. A sessão utiliza um token temporário.', 'A inscrição relaciona o usuário ao evento, com identificadores, data e estado. Eventos registram organizador, nome, data, horário, local, descrição e informações de público e capacidade.', 'Solicitações de acesso registram o perfil solicitado e a justificativa. Cotações, propostas e portfólios registram informações de serviços, valores propostos e textos inseridos pelos usuários. Esses valores não representam pagamentos realizados.'] },
      { id: 'opcionais', titulo: 'Dados obrigatórios e opcionais', textos: ['Nome, e-mail e senha são exigidos no cadastro atual. Telefone, biografia, redes sociais, informações profissionais, foto e capa são opcionais nos respectivos recursos, quando disponíveis.', 'Não inclua informações sensíveis, documentos ou dados de terceiros em campos livres sem necessidade e autorização adequada. A política para participação de menores de idade ainda precisa de definição e revisão antes da operação com usuários reais.'] },
      { id: 'bases', titulo: 'Bases legais — pendência de revisão', textos: ['As bases legais de cada finalidade ainda não foram definidas e validadas. Esta minuta não atribui uma base legal presumida às operações nem considera o cadastro como consentimento genérico. O aceite contratual está preparado, mas novos cadastros dependem de uma versão aprovada e publicada dos Termos. Eventuais consentimentos separados não estão implementados.'] },
      { id: 'armazenamento', titulo: 'Armazenamento, sessão e segurança', textos: ['A arquitetura utiliza backend Node/Express e banco Supabase PostgreSQL. Imagens, quando disponíveis, utilizam o Storage do Supabase com acesso por URLs assinadas. O processamento de imagens de perfil verifica formatos e limites e remove metadados.', 'O navegador utiliza armazenamento de sessão para token, perfil e navegação. Na aplicação auditada não foram identificadas integrações de publicidade ou analytics; novas integrações e a infraestrutura de hospedagem deverão ser avaliadas separadamente.', 'Há controles de autenticação, autorização, validação e limpeza de imagens. Esses controles não são garantia de segurança absoluta nem certificação de conformidade. Região de armazenamento, contratos, acessos operacionais e configuração efetiva de produção precisam de confirmação.'] },
      { id: 'compartilhamento', titulo: 'Visibilidade e prestadores de serviços', textos: ['Informações são apresentadas conforme os perfis e permissões da aplicação. Administradores consultam registros administrativos; organizadores e fornecedores utilizam informações vinculadas às cotações e propostas. Portfólios de fornecedores podem ser consultados por usuários autenticados autorizados.', 'Supabase é utilizado na arquitetura de banco e armazenamento de imagens. A relação completa de prestadores, seus papéis, regiões, suboperadores e eventuais transferências internacionais depende de avaliação contratual e operacional.'] },
      { id: 'direitos', titulo: 'Direitos dos titulares', textos: ['A consulta e a correção de alguns dados pessoais e profissionais já estão disponíveis no próprio perfil. A exportação consolidada e o encerramento de contas reais ainda não possuem fluxo específico nesta versão.', 'O processo de atendimento deverá permitir solicitar informações sobre o tratamento, acesso, correção e análise de pedidos de eliminação e outros direitos aplicáveis. O canal de privacidade ainda não está operacional; consulte a página de contato para conhecer as pendências.'] },
      { id: 'retencao', titulo: 'Retenção, backups e eliminação', textos: ['Os prazos de retenção e os critérios de conservação ou eliminação ainda precisam de aprovação por categoria de dado. Não há prazo geral de exclusão aprovado nesta minuta.', 'Existem históricos relacionados a eventos, inscrições, propostas, imagens e mecanismos de backup. A eliminação deverá considerar esses vínculos, cópias de segurança e hipóteses de conservação aplicáveis. A quarentena técnica da limpeza de imagens não substitui uma política geral de retenção.'] },
      { id: 'atualizacoes', titulo: 'Contato e atualizações', textos: ['A página Contato de Privacidade informa a situação do canal de atendimento. Não envie documentos, senhas ou outros dados pessoais por meios improvisados.', 'Esta é a minuta A.1, sem vigência como política definitiva aprovada. Alterações futuras deverão ter identificação de versão e revisão antes da publicação final. Não existem aceites anteriores presumidos por este documento.'] },
    ],
  },
  termos: {
    titulo: termosUso.titulo,
    estado: termosUso.estado,
    versao: termosUso.versao,
    aprovacao: termosUso.aprovacao,
    descricao: termosUso.descricao,
    secoes: termosUso.secoes,
  },
  'contato-privacidade': {
    titulo: 'Contato de Privacidade',
    descricao: 'Informações sobre consulta, correção e futuros pedidos relacionados aos seus dados pessoais.',
    secoes: [
      { id: 'situacao', titulo: 'Situação do atendimento', textos: ['A operação do canal institucional de privacidade depende de criação e validação pela equipe responsável. A disponibilidade de um endereço é informada na seção Canal de atendimento. Não há formulário de envio ou protocolo de atendimento disponível nesta página. O canal precisa estar operacional antes de permitir uso real da plataforma.'] },
      { id: 'perfil', titulo: 'O que pode ser consultado no perfil', textos: ['Usuários que já possuem acesso podem consultar o próprio perfil e corrigir os campos disponibilizados pela aplicação. Essa funcionalidade não substitui um processo completo de atendimento aos titulares.'] },
      { id: 'solicitacoes', titulo: 'Como o atendimento deverá funcionar', textos: ['Quando houver um canal real validado, será possível encaminhar pedidos de acesso, correção ou análise de eliminação dos dados e obter orientação sobre outros direitos aplicáveis.', 'A equipe deverá definir como confirmar a identidade de quem solicita, responder com segurança e tratar registros vinculados a eventos, inscrições, propostas e backups. Não envie senhas, tokens ou documentos sem uma orientação segura de atendimento.', 'A exportação consolidada e o encerramento de contas reais ainda não estão disponíveis como fluxo específico. Nenhuma solicitação é enviada ou registrada ao consultar esta página.'] },
    ],
  },
}

export function documentoDaRota(caminho) {
  if (typeof caminho !== 'string') return null
  const nome = caminho.replace(/\/$/, '').slice(1)
  return Object.hasOwn(documentosTransparencia, nome) && caminho.startsWith('/') ? nome : null
}
