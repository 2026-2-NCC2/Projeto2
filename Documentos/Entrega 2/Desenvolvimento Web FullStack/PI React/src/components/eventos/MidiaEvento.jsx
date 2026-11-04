import { Icone } from '../ui/Icone.jsx'
import { conferirImagensEvento } from '../../services/imagensEvento.js'

// Sem efeitos, fetch, preview local ou upload. Só renderiza dados já aprovados
// pelo acesso ao evento; não altera as regras atuais de listagem/detalhes.
export function MidiaEvento({ eventoId, editar = false, imagens = [] }) {
  let validas = []
  let erro = ''
  if (!Array.isArray(imagens)) erro = 'Imagens indisponíveis.'
  else if (imagens.length) {
    try { validas = conferirImagensEvento(eventoId, imagens) } catch { erro = 'Imagens indisponíveis.' }
  }
  const capa = validas.find(i => i.posicao === 0)
  const galeria = validas.filter(i => i.posicao > 0).sort((a,b) => a.posicao-b.posicao)
  return <details className="eventoMidia">
    <summary>Capa e galeria do evento</summary>
    <div className="eventoMidiaCorpo">
      {erro && <p role="alert">{erro}</p>}
      {capa ? <img className="eventoCapa" src={capa.url} alt="Capa do evento" referrerPolicy="no-referrer" /> :
        <div className="eventoCapaVazia"><Icone nome="eventos" /><span>Sem capa disponível</span></div>}
      {galeria.length > 0 ? <div className="eventoGaleria">{galeria.map(i => <img key={i.posicao} src={i.url} alt={`Imagem ${i.posicao} da galeria do evento`} referrerPolicy="no-referrer" />)}</div> : <p>Nenhuma imagem disponível na galeria.</p>}
      {editar && <>
        <p role="status">Gerenciamento em preparação. Uploads permanecem bloqueados.</p>
        {!eventoId && <p>Salve o evento antes de gerenciar suas imagens.</p>}
        <p>Uma capa e até oito imagens. JPEG, PNG ou WebP, até 10 MiB por arquivo.</p>
        <label>Selecionar capa<input type="file" accept="image/jpeg,image/png,image/webp" disabled /></label>
        <label>Selecionar imagens da galeria<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled /></label>
        <div className="acoes"><button type="button" className="secundario" disabled>Atualizar capa</button><button type="button" className="secundario" disabled>Atualizar galeria</button><button type="button" className="secundario" disabled>Remover imagem</button></div>
      </>}
    </div>
  </details>
}
