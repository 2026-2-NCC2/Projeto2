import { Skeleton, Botao, Campo, Alerta, EstadoVazio } from '../../components/ui/Primitivas.jsx'
import './Organizador.css'
import { useEffect, useMemo, useState } from 'react'
import { formatarMoeda } from '../../utils/formatarMoeda.js'
import { rascunhoCustosTemAlteracoes } from '../../utils/rascunhosCustos.js'

function converterParaCentavos(texto) {
  const valor = texto.trim()
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(valor)) return null

  const [inteiro, fracao = ''] = valor.replace(',', '.').split('.')
  const inteiroNormalizado = inteiro.replace(/^0+(?=\d)/, '')
  if (inteiroNormalizado.length > 10) return null

  return Number(inteiroNormalizado) * 100 + Number(fracao.padEnd(2, '0'))
}

function formatarTotalCentavos(centavos) {
  const fracao = (centavos % 100n).toString().padStart(2, '0')
  return formatarMoeda(centavos / 100n).replace(/,\d{2}$/, `,${fracao}`)
}

export function Custos({
  evento,
  custos,
  setCustos,
  aoAlterarFormularioPendente,
  setPagina,
  rascunho,
  persistencia,
  aoUsarServidor,
}) {
  const [formulario, setFormulario] = useState({ categoria: '', descricao: '', valor: '' })
  const [edicao, setEdicao] = useState(null)
  const [erro, setErro] = useState('')
  const carregando = rascunho.get.estado === 'carregando'
  const salvando = rascunho.put.estado === 'salvando'
  const incerto = rascunho.put.estado === 'resultadoIncerto'
  const semId = !Number.isSafeInteger(evento.id) || evento.id <= 0
  const totalCentavos = useMemo(() => {
    return custos.reduce((total, item) => total + BigInt(Math.round(item.valor * 100)), 0n)
  }, [custos])

  useEffect(() => {
    return () => aoAlterarFormularioPendente(false)
  }, [aoAlterarFormularioPendente])

  function temAlteracoes(campos = formulario, original = edicao?.original) {
    return original
      ? Object.keys(campos).some((campo) => campos[campo] !== original[campo])
      : Object.values(campos).some((valor) => valor !== '')
  }

  function alterarCampo(campo, valor) {
    const proximos = { ...formulario, [campo]: valor }
    setFormulario(proximos)
    setErro('')
    aoAlterarFormularioPendente(temAlteracoes(proximos))
  }

  function limparFormulario() {
    setFormulario({ categoria: '', descricao: '', valor: '' })
    setEdicao(null)
    setErro('')
    aoAlterarFormularioPendente(false)
  }

  function confirmarDescarteFormulario() {
    return !temAlteracoes() || window.confirm(
      'Os campos digitados ainda não foram aplicados à lista de custos. Deseja descartá-los?'
    )
  }

  function iniciarEdicao(item) {
    if (!confirmarDescarteFormulario()) return

    const original = {
      categoria: item.categoria,
      descricao: item.descricao,
      valor: Number(item.valor).toFixed(2).replace('.', ','),
    }
    setFormulario(original)
    setEdicao({ id: item.id, original })
    setErro('')
    aoAlterarFormularioPendente(false)
  }

  function cancelarFormulario() {
    if (confirmarDescarteFormulario()) limparFormulario()
  }

  function removerItem(item) {
    const aviso = edicao?.id === item.id && temAlteracoes()
      ? '\nAs alterações deste item no formulário também serão descartadas.'
      : ''

    if (!window.confirm(`Remover o item "${item.descricao}" do rascunho local?${aviso}`)) return

    setCustos((atuais) => atuais.filter((custo) => custo.id !== item.id))
    if (edicao?.id === item.id) limparFormulario()
  }

  function aplicarFormulario(eventoFormulario) {
    eventoFormulario.preventDefault()
    const categoria = formulario.categoria.trim()
    const descricao = formulario.descricao.trim()

    if (!categoria || Array.from(categoria).length > 100) {
      setErro('Informe uma categoria de 1 a 100 caracteres.')
      return
    }
    if (!descricao || Array.from(descricao).length > 255) {
      setErro('Informe uma descrição de 1 a 255 caracteres.')
      return
    }
    if (!formulario.valor.trim()) {
      setErro('Informe o valor estimado. Um campo vazio não representa zero.')
      return
    }

    const centavos = converterParaCentavos(formulario.valor)
    if (centavos === null) {
      setErro('Informe um valor de 0 a 9999999999,99, com no máximo duas casas decimais e sem separador de milhar.')
      return
    }
    if (edicao && !custos.some((item) => item.id === edicao.id)) {
      setErro('Este item não está mais na lista. Os campos foram mantidos para conferência.')
      return
    }

    const dados = { categoria, descricao, valor: centavos / 100 }
    setCustos((atuais) => {
      if (edicao) {
        return atuais.map((item) => item.id === edicao.id ? { ...item, ...dados } : item)
      }

      let numeroLocal = 1
      while (atuais.some((item) => item.id === `local-${numeroLocal}`)) numeroLocal += 1
      return [...atuais, { id: `local-${numeroLocal}`, ...dados }]
    })
    limparFormulario()
  }

  return (
    <div className="organizadorPagina">
      <Botao className="voltar" variante="discreto" onClick={() => setPagina('criar')}>
        ← Voltar para Dados Básicos
      </Botao>
      <div className="tituloLinha">
        <div>
          <h1>ITENS DE CUSTO</h1>
          <p>
            Defina os itens necessários para <strong>{evento.nome}</strong>.
          </p>
        </div>
        <div className="tag">Etapa 2 de 3</div>
      </div>
      <form className="cartaoFormulario" onSubmit={aplicarFormulario} noValidate>
        <h2>{edicao ? 'Editar item do rascunho' : 'Adicionar item de custo'}</h2>
        <p>Adicionar, editar ou remover altera o rascunho. Use “Salvar custos no banco” para persistir a lista.</p>
        <Campo id="custo-categoria" label="Categoria"

          value={formulario.categoria}
          onChange={(e) => alterarCampo('categoria', e.target.value)}
          aria-describedby="custo-regras"
          obrigatorio
         />
        <Campo id="custo-descricao" label="Descrição"

          value={formulario.descricao}
          onChange={(e) => alterarCampo('descricao', e.target.value)}
          aria-describedby="custo-regras"
          obrigatorio
         />
        <Campo id="custo-valor" label="Valor estimado (R$)"

          type="text"
          inputMode="decimal"
          value={formulario.valor}
          onChange={(e) => alterarCampo('valor', e.target.value)}
          placeholder="0,00"
          aria-describedby="custo-regras"
          obrigatorio
         />
        <p id="custo-regras">
          Categoria: até 100 caracteres. Descrição: até 255 caracteres.
          Valor não negativo, com até duas casas decimais; use vírgula ou ponto, sem separador de milhar.
        </p>
        {erro && <Alerta variante="erro">{erro}</Alerta>}
        <div className="acoes" style={{ flexWrap: 'wrap' }}>
          <Botao variante="secundario" type="button" className="secundario" onClick={cancelarFormulario}>
            {edicao ? 'Cancelar edição' : 'Limpar campos'}
          </Botao>
          <Botao type="submit" className="principal">
            {edicao ? 'Aplicar edição ao rascunho' : 'Adicionar ao rascunho'}
          </Botao>
        </div>
      </form>
      <div className="resumoCategorias">
        {custos.map((itemCusto) => (
          <div key={itemCusto.id} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {itemCusto.categoria}
            <br />
            <b>{formatarMoeda(itemCusto.valor)}</b>
          </div>
        ))}
      </div>
      <div className="tabela" role="region" aria-label="Itens de custo do evento" tabIndex={0}>
        {custos.length === 0 ? (
          <EstadoVazio titulo="Nenhum item de custo cadastrado neste evento. Adicione o primeiro item ao rascunho." />
        ) : (
          <>
            <div className="tabelaCabecalho">
              <span>Categoria</span>
              <span>Descrição</span>
              <span>Custo estimado</span>
            </div>
            {custos.map((itemCusto) => (
              <div className="tabelaLinha" key={itemCusto.id}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{itemCusto.categoria}</span>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{itemCusto.descricao}</span>
                <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <strong>{formatarMoeda(itemCusto.valor)}</strong>
                  <div className="acoes" style={{ flexWrap: 'wrap', marginTop: 12 }}>
                    <Botao variante="secundario" type="button" className="secundario" onClick={() => iniciarEdicao(itemCusto)}>
                      Editar
                    </Botao>
                    <Botao variante="destrutivo" type="button" className="secundario" onClick={() => removerItem(itemCusto)}>
                      Remover
                    </Botao>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="total">
        <span>Total estimado</span>
        <strong>{formatarTotalCentavos(totalCentavos)}</strong>
      </div>
      {!persistencia.disponivel && <Alerta variante="informacao">Persistência disponível somente no ambiente isolado. Neste ambiente, os custos continuam locais.</Alerta>}
      {semId && <Alerta variante="informacao">Salve os dados básicos do evento antes de persistir custos.</Alerta>}
      {carregando && <Skeleton tipo="tabela" rotulo="Consultando os custos do evento..." />}
      {salvando && <Alerta variante="informacao">Salvando a lista enviada. Edições posteriores continuam locais.</Alerta>}
      {rascunho.get.erro && <Alerta variante="erro">{rascunho.get.erro}</Alerta>}
      {rascunho.put.erro && <Alerta variante="erro">{rascunho.put.erro}</Alerta>}
      {rascunho.put.mensagem && <Alerta variante="informacao">{rascunho.put.mensagem}</Alerta>}
      {rascunho.conflitoRemoto && <Alerta variante="erro">O servidor possui custos diferentes. O rascunho foi preservado. Revise antes de substituir a lista.</Alerta>}
      {rascunho.conflitoRemoto && (
        <details>
          <summary>Conferir última lista do servidor</summary>
          <ul>{rascunho.basePersistida.map(item => (
            <li key={item.id}>{item.categoria}: {item.descricao} — {formatarMoeda(item.valor)}</li>
          ))}</ul>
        </details>
      )}
      {temAlteracoes() && <Alerta variante="informacao">Aplique ou cancele os campos do formulário antes de salvar no banco.</Alerta>}
      <div className="acoes">
        <Botao variante="secundario" type="button" className="secundario" onClick={persistencia.carregar}
          disabled={!persistencia.disponivel || semId || carregando || salvando}>
          {incerto ? 'Verificar resultado no servidor' : 'Consultar custos no servidor'}
        </Botao>
        <Botao variante="secundario" type="button" className="secundario" onClick={aoUsarServidor}
          disabled={!persistencia.disponivel || rascunho.basePersistida === null || carregando || salvando || incerto || rascunho.get.estado !== 'carregado'}>
          Usar última lista do servidor
        </Botao>
        <Botao type="button" className="principal" onClick={persistencia.salvar}
          disabled={!persistencia.disponivel || semId || rascunho.basePersistida === null || carregando || salvando || incerto || temAlteracoes() || rascunho.get.estado !== 'carregado' || !rascunhoCustosTemAlteracoes(rascunho)}>
          {salvando ? 'Salvando custos...' : 'Salvar custos no banco'}
        </Botao>
      </div>
      <div className="acoes">
        <Botao variante="secundario"
          type="button"
          className="secundario"
          onClick={() => setPagina('criar')}
        >
          Voltar
        </Botao>
        <Botao
          type="button"
          className="principal"
          onClick={() => setPagina('cotacao')}
        >
          Revisar rascunho e avançar para Cotação →
        </Botao>
      </div>
    </div>
  )
}
