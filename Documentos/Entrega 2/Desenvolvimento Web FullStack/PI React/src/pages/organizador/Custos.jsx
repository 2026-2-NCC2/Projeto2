import { useEffect, useMemo, useState } from 'react'
import { formatarMoeda } from '../../utils/formatarMoeda.js'

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
}) {
  const [formulario, setFormulario] = useState({ categoria: '', descricao: '', valor: '' })
  const [edicao, setEdicao] = useState(null)
  const [erro, setErro] = useState('')
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
    <div>
      <button className="voltar" onClick={() => setPagina('criar')}>
        ← Voltar para Dados Básicos
      </button>
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
        <p>Os itens ficam apenas na memória desta sessão. Nenhum custo foi salvo no banco.</p>
        <label htmlFor="custo-categoria">Categoria *</label>
        <input
          id="custo-categoria"
          value={formulario.categoria}
          onChange={(e) => alterarCampo('categoria', e.target.value)}
          aria-describedby="custo-regras"
          required
        />
        <label htmlFor="custo-descricao">Descrição *</label>
        <input
          id="custo-descricao"
          value={formulario.descricao}
          onChange={(e) => alterarCampo('descricao', e.target.value)}
          aria-describedby="custo-regras"
          required
        />
        <label htmlFor="custo-valor">Valor estimado (R$) *</label>
        <input
          id="custo-valor"
          type="text"
          inputMode="decimal"
          value={formulario.valor}
          onChange={(e) => alterarCampo('valor', e.target.value)}
          placeholder="0,00"
          aria-describedby="custo-regras"
          required
        />
        <p id="custo-regras">
          Categoria: até 100 caracteres. Descrição: até 255 caracteres.
          Valor não negativo, com até duas casas decimais; use vírgula ou ponto, sem separador de milhar.
        </p>
        {erro && <p role="alert">{erro}</p>}
        <div className="acoes" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="secundario" onClick={cancelarFormulario}>
            {edicao ? 'Cancelar edição' : 'Limpar campos'}
          </button>
          <button type="submit" className="principal">
            {edicao ? 'Aplicar edição ao rascunho' : 'Adicionar ao rascunho'}
          </button>
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
      <div className="tabela">
        {custos.length === 0 ? (
          <p role="status">Nenhum item de custo cadastrado neste evento. Adicione o primeiro item ao rascunho.</p>
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
                    <button type="button" className="secundario" onClick={() => iniciarEdicao(itemCusto)}>
                      Editar
                    </button>
                    <button type="button" className="secundario" onClick={() => removerItem(itemCusto)}>
                      Remover
                    </button>
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
      <div className="acoes">
        <button
          type="button"
          className="secundario"
          onClick={() => setPagina('criar')}
        >
          Voltar
        </button>
        <button
          type="button"
          className="principal"
          onClick={() => setPagina('cotacao')}
        >
          Revisar rascunho e avançar para Cotação →
        </button>
      </div>
    </div>
  )
}
