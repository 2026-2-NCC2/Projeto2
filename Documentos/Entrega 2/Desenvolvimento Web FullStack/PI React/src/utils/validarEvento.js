export function agendaBrasilia(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(agora)
  const p = tipo => partes.find(item => item.type === tipo).value
  return { data: `${p('year')}-${p('month')}-${p('day')}`, horario: `${p('hour')}:${p('minute')}:${p('second')}` }
}

export function validarFormularioEvento(evento, { controleCapacidade = false, agora = new Date() } = {}) {
  const erros = {}
  function texto(campo, titulo, limite, opcional = false) {
    const valor = evento[campo] ?? (campo === 'categoria' ? 'Corporativo' : '')
    if (typeof valor !== 'string' || (!opcional && !valor.trim())) erros[campo] = `Informe ${titulo}.`
    else if (Array.from(valor.trim()).length > limite) erros[campo] = `Use no máximo ${limite} caracteres para ${titulo}.`
    else if (Array.from(valor).some(c => (c.codePointAt(0) < 32 && !(campo === 'descricao' && [9, 10, 13].includes(c.codePointAt(0)))) || c.codePointAt(0) === 127)) erros[campo] = `Remova os caracteres de controle de ${titulo}.`
  }
  texto('nome', 'o nome do evento', 100)
  const data = evento.data, horario = evento.horario
  const calendario = typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data) && data >= '1000-01-01' &&
    Number.isFinite(Date.parse(data + 'T00:00:00Z')) && new Date(data + 'T00:00:00Z').toISOString().slice(0, 10) === data
  const horaValida = typeof horario === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(horario)
  if (!calendario) erros.data = data ? 'Informe uma data válida entre 1000 e 9999.' : 'Informe a data do evento.'
  if (!horaValida) erros.horario = horario ? 'Informe um horário válido entre 00:00 e 23:59.' : 'Informe o horário de início.'
  // Publicados permitem editar descrição/capacidade mesmo após o início.
  // Planejamento continua sujeito à mesma regra de futuro da RPC existente.
  if (!evento.id || evento.status !== 'Ativo') {
    const hoje = agendaBrasilia(agora)
    if (calendario && data < hoje.data) erros.data = 'Escolha hoje ou uma data futura no fuso de Brasília.'
    else if (calendario && horaValida && `${data} ${horario}:00` <= `${hoje.data} ${hoje.horario}`) erros.horario = 'Escolha um horário de início futuro no fuso de Brasília.'
  }
  texto('local', 'o local do evento', 200)
  if (evento.publico === '' || evento.publico == null) erros.publico = 'Informe o público previsto.'
  else if (!Number.isSafeInteger(evento.publico) || evento.publico < 1 || evento.publico > 2147483647) erros.publico = 'Informe um público inteiro entre 1 e 2147483647.'
  if (controleCapacidade && evento.capacidade_maxima != null && evento.capacidade_maxima !== '') {
    const capacidade = evento.capacidade_maxima
    if (!Number.isSafeInteger(capacidade) || capacidade < 1 || capacidade > 2147483647) erros.capacidade_maxima = 'Informe uma capacidade inteira entre 1 e 2147483647, ou deixe em branco.'
    else if (Number.isSafeInteger(evento.inscritos_confirmados) && capacidade < evento.inscritos_confirmados) erros.capacidade_maxima = 'A capacidade deve comportar os inscritos confirmados.'
  }
  texto('categoria', 'a categoria do evento', 100)
  texto('descricao', 'a descrição', 10000, true)
  return erros
}
