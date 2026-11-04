export function VagasEvento({evento}) {
  if (evento.inscritos_confirmados === undefined) return null
  return <p role="status">
    <strong>{evento.lotado ? 'Lotado' : evento.vagas_restantes === null ? 'Sem limite de vagas configurado' : evento.vagas_restantes+' vagas disponíveis'}</strong>
    {' · '}{evento.inscritos_confirmados} inscritos confirmados
    {evento.capacidade_maxima !== null && <> · Capacidade: {evento.capacidade_maxima}</>}
  </p>
}
