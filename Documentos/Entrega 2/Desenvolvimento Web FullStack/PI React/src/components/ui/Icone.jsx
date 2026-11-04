const desenhos = {
  ticket: 'M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6V4Zm11 0v3m0 3v4m0 3v3',
  eventos: 'M4 5h16v15H4V5Zm3-3v6m10-6v6M4 10h16',
  adicionar: 'M12 5v14M5 12h14',
  custos: 'M4 20h16M7 16v-5m5 5V4m5 12V8',
  documento: 'M6 3h9l4 4v14H6V3Zm8 0v5h5M9 12h7m-7 4h7',
  perfil: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  camera: 'M8 5 10 2h4l2 3h5v16H3V5h5Zm8 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  sair: 'M9 4H4v16h5m6-13 5 5-5 5m-7-5h12',
  busca: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-2 4 6 6',
  inicio: 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7',
  local: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Zm-4 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  acesso: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6',
}

// Ícones decorativos; o nome acessível permanece no texto do controle.
export function Icone({ nome, tamanho = 20 }) {
  return (
    <svg className="icone" width={tamanho} height={tamanho} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={desenhos[nome] || desenhos.documento} />
    </svg>
  )
}
