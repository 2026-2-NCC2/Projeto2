import { IdentidadeConta } from './IdentidadeConta.jsx'
export function Cabecalho() {
  return (
    <header className="cabecalhoOrganizador">
      <div className="logo">
        ▣ <span>TrocaTicket</span>
      </div>
      <div className="empresa">Gestão Corporativa</div>
      <div className="usuario">
        <IdentidadeConta />
      </div>
    </header>
  )
}
