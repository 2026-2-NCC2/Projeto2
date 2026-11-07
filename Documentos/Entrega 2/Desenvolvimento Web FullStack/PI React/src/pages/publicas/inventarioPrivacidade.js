// Inventário do código da aplicação; não representa inspeção da hospedagem.
// Rever antes de integrar novos recursos externos ou tecnologias opcionais.
export const tecnologiasNecessarias = [
  {
    nome: 'Sessão autenticada',
    tecnologia: 'sessionStorage: token e perfil',
    finalidade: 'Manter a sessão e identificar o perfil durante a navegação. O backend valida a autenticação e as permissões.',
    duracao: 'Armazenamento de sessão do navegador. O logout confirmado remove essas chaves; sessões inválidas também são removidas. A restauração de abas depende do navegador.',
  },
  {
    nome: 'Navegação entre páginas',
    tecnologia: 'sessionStorage: paginaAtual',
    finalidade: 'Lembrar a página selecionada durante a sessão, sem substituir as verificações de acesso.',
    duracao: 'Armazenamento de sessão do navegador, removido no logout confirmado ou na invalidação da sessão.',
  },
  {
    nome: 'Consultas e imagens',
    tecnologia: 'API do TrocaTicket e Supabase Storage',
    finalidade: 'Consultar os dados das funcionalidades e exibir imagens disponíveis por URLs assinadas. São requisições de rede para funcionamento, não ferramentas de publicidade ou estatísticas.',
    duracao: 'URLs de imagens têm validade limitada. Cache e registros técnicos dos serviços dependem da infraestrutura; seus prazos de retenção ainda precisam de definição e validação.',
  },
]
