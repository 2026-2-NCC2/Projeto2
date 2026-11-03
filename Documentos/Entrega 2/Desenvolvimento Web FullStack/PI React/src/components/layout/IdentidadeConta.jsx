import { usePerfil } from '../../hooks/usePerfil.js'

export function IdentidadeConta() {
  const { perfil, erro } = usePerfil()
  return <span className="identidadeConta"><strong>{perfil?.nome || 'Conta'}</strong><small role={erro ? 'alert' : undefined}>{erro || perfil?.email || 'Carregando identidade...'}</small></span>
}
