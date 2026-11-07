// Somente feedback de interface, em memoria desta aba. Nao armazena conta,
// credenciais ou sessao e nao determina a navegacao nem a autenticacao.
let aviso = ''
export function guardarAvisoCadastro(mensagem) { aviso = mensagem }
export function lerAvisoCadastro() { return aviso }
export function limparAvisoCadastro() { aviso = '' }
