import './Marca.css'

export function Marca({ compacto = false, somenteSimbolo = false, tom = 'padrao', className = '' }) {
  return <span className={`ttMarca${compacto ? ' ttMarca--compacta' : ''}${tom === 'claro' ? ' ttMarca--clara' : ''} ${className}`.trim()} role="img" aria-label="TrocaTicket">
    <svg className="ttMarcaSimbolo" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path className="ttMarcaOrbita" d="M12 44C-1 37 10 17 31 12C49 8 65 16 57 29M52 40C44 51 27 58 16 53" />
      <g transform="rotate(-34 32 32)">
        <path className="ttMarcaGrafite" d="M12 19H52V26A6 6 0 0 0 52 38V45H12V38A6 6 0 0 0 12 26Z" />
        <path className="ttMarcaRecorte" d="M43 24V28M43 32V35M43 39V41" />
      </g>
      <g transform="rotate(32 32 32)">
        <path className="ttMarcaCoral" d="M12 19H52V26A6 6 0 0 0 52 38V45H12V38A6 6 0 0 0 12 26Z" />
        <path className="ttMarcaRecorte" d="M43 24V28M43 32V35M43 39V41" />
      </g>
      <path className="ttMarcaBrilho" d="M53 4V12M49 8H57" />
    </svg>
    {!somenteSimbolo && <span className="ttMarcaNome" aria-hidden="true"><span className="ttMarcaTroca">Troca</span><span className="ttMarcaTicket">Ticket</span></span>}
  </span>
}
