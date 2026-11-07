import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFocoModal } from '../../hooks/useFocoModal.js'
import { Alerta, Botao } from './Primitivas.jsx'
import './Feedbacks.css'

export function CentralNotificacoes({ notificacoes, aoDispensar }) {
  const regiao = useRef(null)
  const titulos = { sucesso: 'Sucesso', erro: 'Erro', aviso: 'Aviso', informacao: 'Informação' }
  return <section className="ttNotificacoes" aria-label="Notificações" tabIndex={-1} ref={regiao}>
    {notificacoes.map(item => <Alerta key={item.id} variante={item.tipo} titulo={item.titulo || titulos[item.tipo] || titulos.informacao}>
      <p>{item.mensagem}</p>
      {aoDispensar && <Botao variante="discreto" aria-label={`Dispensar notificação: ${item.titulo || titulos[item.tipo] || titulos.informacao}`}
        onClick={() => { aoDispensar(item.id); regiao.current?.focus() }}>Dispensar</Botao>}
    </Alerta>)}
  </section>
}

export function DialogoConfirmacao({ aberto, ...props }) {
  // Desmontar encerra somente a interface; nao cancela nem repete a operacao.
  // aoConfirmar deve resolver apenas apos sucesso confirmado e rejeitar em
  // falhas/resultados incertos. O dialogo nao interpreta respostas HTTP.
  return aberto ? <ConteudoConfirmacao {...props} /> : null
}

function ConteudoConfirmacao({ titulo, descricao, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar',
  destrutivo = false, ocupado = false, aoConfirmar, aoCancelar }) {
  const id = useId()
  const [estado, setEstado] = useState('pronto')
  const fase = useRef('pronto')
  const montado = useRef(false)
  const atuais = useRef({ ocupado, aoConfirmar, aoCancelar })
  useLayoutEffect(() => { atuais.current = { ocupado, aoConfirmar, aoCancelar } }, [ocupado, aoConfirmar, aoCancelar])
  const cancelar = useCallback(() => {
    if (fase.current !== 'ocupado' && !atuais.current.ocupado) atuais.current.aoCancelar?.()
  }, [])
  const modal = useFocoModal(true, cancelar)
  useEffect(() => {
    montado.current = true
    // Escolha conservadora: cancelar recebe foco antes da acao principal.
    if (!atuais.current.ocupado) modal.current?.querySelector('[data-cancelar]')?.focus()
    return () => { montado.current = false }
  }, [modal])

  async function confirmar() {
    if (fase.current !== 'pronto' || atuais.current.ocupado || typeof atuais.current.aoConfirmar !== 'function') return
    fase.current = 'ocupado' // trava sincrona: dois cliques antes do render nao duplicam a acao
    setEstado('ocupado')
    try {
      await atuais.current.aoConfirmar()
      fase.current = 'concluido'
      if (montado.current) setEstado('concluido')
    } catch {
      fase.current = 'incerto'
      if (montado.current) setEstado('incerto')
    }
  }

  const emAndamento = ocupado || estado === 'ocupado'
  return createPortal(<div className="ttConfirmacaoFundo">
    <section className="ttConfirmacao" role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-descricao`} aria-busy={emAndamento} tabIndex={-1} ref={modal}>
      <h2 id={`${id}-titulo`}>{titulo}</h2>
      <p id={`${id}-descricao`}>{descricao}</p>
      {estado === 'incerto' && <Alerta variante="erro" titulo="Resultado não confirmado">
        <p>Consulte o resultado da operação antes de tentar novamente. Esta confirmação não será reenviada.</p>
      </Alerta>}
      {estado === 'concluido' && <Alerta variante="sucesso">Operação concluída.</Alerta>}
      {emAndamento && <p role="status">Operação em andamento. Aguarde a confirmação do resultado.</p>}
      <div className="ttConfirmacaoAcoes">
        <Botao variante="secundario" data-cancelar disabled={emAndamento} onClick={cancelar}>
          {estado === 'incerto' || estado === 'concluido' ? 'Fechar' : textoCancelar}
        </Botao>
        <Botao variante={destrutivo ? 'destrutivo' : 'primario'} ocupado={emAndamento}
          disabled={estado !== 'pronto' || typeof aoConfirmar !== 'function'} onClick={confirmar}>{textoConfirmar}</Botao>
      </div>
    </section>
  </div>, document.body)
}
