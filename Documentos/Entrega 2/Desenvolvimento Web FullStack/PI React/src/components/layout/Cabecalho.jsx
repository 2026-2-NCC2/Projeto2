import { Marca } from '../ui/Marca.jsx'
import { IdentidadeConta } from './IdentidadeConta.jsx'
export function Cabecalho() {
  return (
    <header className="cabecalhoOrganizador">
      <div className="logo">
        <Marca />
      </div>
      <div className="empresa">Gestão Corporativa</div>
      <div className="usuario">
        <IdentidadeConta />
      </div>
    </header>
  )
}
