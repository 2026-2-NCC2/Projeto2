
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { modoExecucao } = require("./isolamento.cjs");
const homologacao = process.env.TROCATICKET_HOMOLOGACAO === undefined
  ? false : process.env.TROCATICKET_HOMOLOGACAO === "escrita-descartavel"
    ? require("./homologacao-escrita.cjs").confirmarEntrada()
    : require("./homologacao.cjs").confirmarEntrada();
if (!homologacao && modoExecucao() === "principal") require("dotenv").config();
if (!homologacao && process.env.TROCATICKET_HOMOLOGACAO !== undefined) {
  require("./homologacao.cjs").confirmarEntrada(); // Recusar flag vinda do .env sem inicializador.
}

// Manter a trava de startup antes de criar qualquer cliente/pool.
const { validarInicializacaoBanco } = require("./config/banco.cjs");
if (!homologacao) require("./config/startup-controlado.cjs").validarEntrada(process.env, modoExecucao());
const { criarPersistencia } = require("./repositories/index.cjs");
const { repositorios, servicos, supervisor } = criarPersistencia();
const {
  usuarios: usuariosRepository, eventos: eventosRepository,
  custos: custosRepository, cotacoes: cotacoesRepository,
  propostas: propostasRepository, inscricoes: inscricoesRepository,
  solicitacoesAcesso: solicitacoesAcessoRepository,
} = repositorios;
const { ErroServico } = require("./services/suporte-transacoes.cjs");

// Somente erros sanitizados pelos servicos podem fornecer texto/status publico.
function responderErroServico(res, erro, mensagem) {
  const conhecido = erro instanceof ErroServico &&
    [400, 401, 403, 404, 409, 500].includes(erro.respostaStatus);
  return res.status(conhecido ? erro.respostaStatus : 500)
    .json({ erro: conhecido ? erro.message : mensagem });
}

const app = express();
// Inativo por padrao; estado congelado privado prevalece inclusive em reinicios.
if (supervisor) supervisor.instalar(app);

app.use(cors({
  origin: "http://localhost:5173"
}));

app.use(express.json());

// Janelas por IP, independentes por rota e locais a este processo.
// Nao confiar em X-Forwarded-For sem uma topologia de proxy validada.
function limitarFrequencia(limite, janelaMs) {
  const clientes = new Map();
  const capacidade = 10000;
  let proximaLimpeza = 0;
  return (req, res, next) => {
    const agora = Date.now();
    if (agora >= proximaLimpeza || clientes.size >= capacidade) {
      for (const [ip, estado] of clientes) {
        if (estado.expira <= agora) clientes.delete(ip);
      }
      proximaLimpeza = agora + 60000;
    }
    const ip = req.ip || req.socket?.remoteAddress || "desconhecido";
    let estado = clientes.get(ip);
    if (estado && estado.expira <= agora) {
      clientes.delete(ip);
      estado = undefined;
    }
    if (!estado && clientes.size < capacidade) {
      estado = { tentativas: 0, expira: agora + janelaMs };
      clientes.set(ip, estado);
    }
    // Ao atingir a capacidade, recusar novas chaves sem descartar bloqueios ativos.
    if (!estado || estado.tentativas >= limite) {
      res.setHeader("Retry-After", String(Math.max(1,
        Math.ceil(((estado?.expira ?? agora + janelaMs) - agora) / 1000))));
      return res.status(429).json({ erro: "Muitas tentativas. Tente novamente mais tarde." });
    }
    estado.tentativas++;
    return next();
  };
}

app.get("/", (req, res) => {
  res.json({
    mensagem: "Backend do TrocaTicket funcionando!"
  });
});

// Listar usuários sem expor senhas
app.get("/eventos", autenticar, async (req, res) => {
  try {
    const eventos = await eventosRepository.listarPorUsuario(req.usuario.id);

    return res.status(200).json(eventos);

  } catch (erro) {
    console.error("Falha em GET /eventos.");

    return res.status(500).json({
      erro: "Erro interno ao listar eventos."
    });
  }
});

// Listar todos os eventos - somente administrador
app.get("/admin/eventos", autenticar, permitirPerfis("admin"), async (req, res) => {
    try {
      const eventos = await eventosRepository.listarAdministrativo();

      return res.status(200).json(eventos);

    } catch (erro) {
      console.error("Falha em GET /admin/eventos.");

      return res.status(500).json({
        erro: "Erro interno ao listar eventos do administrador."
      });
    }
  }
);

app.get("/participante/eventos", autenticar, permitirPerfis("participante"), async (req, res) => {
    try {
      const eventos = await eventosRepository.listarAtivosParaParticipante();

      return res.status(200).json(eventos);

    } catch (erro) {
      console.error("Erro ao listar eventos para participantes:");

      return res.status(500).json({
        erro: "Erro interno ao listar eventos disponíveis."
      });
    }
  }
);

app.post("/participante/inscricoes", autenticar, permitirPerfis("participante"), async (req, res) => {
    try {
      const eventoId = Number(req.body?.evento_id);
      const usuarioId = req.usuario.id;

      if (!Number.isInteger(eventoId) || eventoId <= 0) {
        return res.status(400).json({
          erro: "ID do evento inválido."
        });
      }

      const eventos = await inscricoesRepository.buscarEventoAtivo(eventoId);

      if (eventos.length === 0) {
        return res.status(404).json({
          erro: "Evento não encontrado ou não publicado."
        });
      }

      const inscricoes = await inscricoesRepository.buscarPorUsuarioEEvento(usuarioId, eventoId);

      if (inscricoes.length > 0) {
        return res.status(409).json({
          erro: "Você já está inscrito neste evento."
        });
      }

      const inscricaoId = await inscricoesRepository.criar(usuarioId, eventoId);

      return res.status(201).json({
        mensagem: "Inscrição realizada com sucesso!",
        inscricao: {
          id: inscricaoId,
          usuario_id: usuarioId,
          evento_id: eventoId,
          status: "Confirmada"
        }
      });

    } catch (erro) {
      if (erro.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          erro: "Você já está inscrito neste evento."
        });
      }

      console.error("Erro ao realizar inscrição:");

      return res.status(500).json({
        erro: "Erro interno ao realizar inscrição."
      });
    }
  }
);

app.get("/participante/inscricoes", autenticar, permitirPerfis("participante"), async (req, res) => {
    try {
      const usuarioId = req.usuario.id;

      const inscricoes = await inscricoesRepository.listarPorUsuario(usuarioId);

      return res.status(200).json(inscricoes);

    } catch (erro) {
      console.error("Erro ao buscar inscrições:");

      return res.status(500).json({
        erro: "Erro interno ao buscar inscrições."
      });
    }
  }
);

app.get('/usuarios', autenticar, permitirPerfis('admin'), async (req, res) => {
  try {
    const usuarios = await usuariosRepository.listar();

    return res.status(200).json(usuarios);

  } catch (erro) {
    console.error("Falha em GET /usuarios.");

    return res.status(500).json({
      erro: "Erro interno ao listar usuários."
    });
  }
});

// Cadastrar usuário

app.post("/usuarios", limitarFrequencia(5, 60 * 60 * 1000), async (req, res) => {
  try {
    const { nome, email, senha, perfil } = req.body || {};

    const perfisPermitidos = [
      "participante"
    ];

    if (
      typeof nome !== "string" ||
      !nome.trim() ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof senha !== "string" ||
      senha.length < 8 ||
      Buffer.byteLength(senha, "utf8") > 72 ||
      !perfisPermitidos.includes(perfil)
    ) {
      return res.status(400).json({
        erro: "Informe nome, email válido, senha de 8 a 72 bytes e um perfil permitido."
      });
    }

    const emailNormalizado = email.trim().toLowerCase();

    // Verificar se o email já existe
    const usuarioExistente = await usuariosRepository.buscarIdPorEmail(emailNormalizado);

    if (usuarioExistente) {
      return res.status(409).json({
        erro: "Email já cadastrado!"
      });
    }

    // Criptografar a senha
    const senhaHash = await bcrypt.hash(senha, 12);

    // Salvar usuário com o perfil escolhido
    const usuarioId = await usuariosRepository.criar({
      nome: nome.trim(), email: emailNormalizado, senhaHash, perfil
    });

    return res.status(201).json({
      mensagem: "Usuário cadastrado com sucesso!",
      usuario: {
        id: usuarioId,
        nome: nome.trim(),
        email: emailNormalizado,
        perfil
      }
    });

  } catch (erro) {
    console.error("Falha em POST /usuarios.");

    if (erro.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        erro: "Email já cadastrado!"
      });
    }

    return res.status(500).json({
      erro: "Erro interno no cadastro."
    });
  }
});

// Login
app.post("/login", limitarFrequencia(10, 15 * 60 * 1000), async (req, res) => {
  try {
    const { email, senha } = req.body || {};

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof senha !== "string"
    ) {
      return res.status(400).json({
        erro: "Email e senha são obrigatórios."
      });
    }

    const emailNormalizado = email.trim().toLowerCase();

    const usuario = await usuariosRepository.buscarParaLogin(emailNormalizado);
    
    // Verificar senha com bcrypt
    const senhaCorreta = usuario
      ? await bcrypt.compare(senha, usuario.senha)
      : false;

    if (!senhaCorreta) {
      return res.status(401).json({
        erro: "Email ou senha incorretos."
      });
    }

    // Gerar token JWT
    const token = jwt.sign(
  {
    id: usuario.id,
    perfil: usuario.perfil
  },
  process.env.JWT_SECRET,
  { algorithm: "HS256", expiresIn: "1h" }
);

    return res.status(200).json({
  mensagem: "Login realizado com sucesso!",
  token,
  usuario: {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil
  }
});

  } catch (erro) {
    console.error("Falha em POST /login.");

    return res.status(500).json({
      erro: "Erro interno no login."
    });
  }
});

 // Publicar cotação de um evento
app.post("/cotacoes", autenticar, permitirPerfis("organizador"), async (req, res) => {
  try {
    return res.status(201).json(await servicos.cotacoes.publicar(req.usuario, req.body));
  } catch (erro) {
    return responderErroServico(res, erro,
      "Não foi possível confirmar a publicação. Consulte as cotações antes de tentar novamente.");
  }
});

app.get("/cotacoes", autenticar, permitirPerfis("organizador"), async (req, res) => {
  try {
    const cotacoes = await cotacoesRepository.listarPorOrganizador(req.usuario.id);

    for (const cotacao of cotacoes) {
      const itens = await cotacoesRepository.listarItens(cotacao.id);

      cotacao.itens = itens;
    }

    return res.status(200).json(cotacoes);
  } catch (erro) {
    console.error("Erro ao consultar cotações:");

    return res.status(500).json({
      erro: "Erro interno ao consultar cotações."
    });
  }
});

app.get("/admin/cotacoes", autenticar, permitirPerfis("admin"), async (req, res) => {
  try {
    const cotacoes = await cotacoesRepository.listarAdministrativo();

    return res.status(200).json(cotacoes);
  } catch (erro) {
    console.error("Erro ao consultar cotações do administrador:");

    return res.status(500).json({
      erro: "Erro interno ao consultar cotações."
    });
  }
});

app.get("/fornecedor/cotacoes", autenticar, permitirPerfis("fornecedor"), async (req, res) => {
  try {
    const cotacoes = await cotacoesRepository.listarDisponiveisParaFornecedor();

    for (const cotacao of cotacoes) {
      const itens = await cotacoesRepository.listarItens(cotacao.id);

      cotacao.itens = itens;
    }

    return res.status(200).json(cotacoes);

  } catch (erro) {
    console.error("Erro ao consultar cotações para fornecedores:");

    return res.status(500).json({
      erro: "Erro interno ao consultar cotações disponíveis."
    });
  }
});

app.post("/fornecedor/propostas", autenticar, permitirPerfis("fornecedor"), async (req, res) => {
    try {
      const {
        cotacao_id,
        valor,
        condicoes_pagamento,
        detalhes_tecnicos
      } = req.body;

      const valorNumerico = Number(valor);

      if (
        !Number.isInteger(Number(cotacao_id)) ||
        Number(cotacao_id) <= 0 ||
        !Number.isFinite(valorNumerico) ||
        valorNumerico <= 0 ||
        typeof condicoes_pagamento !== "string" ||
        !condicoes_pagamento.trim() ||
        typeof detalhes_tecnicos !== "string" ||
        !detalhes_tecnicos.trim()
      ) {
        return res.status(400).json({
          erro: "Preencha todos os campos corretamente."
        });
      }

      const cotacoes = await propostasRepository.buscarCotacaoDisponivel(cotacao_id);

      if (cotacoes.length === 0) {
        return res.status(404).json({
          erro: "Cotação não encontrada, encerrada ou com prazo expirado."
        });
      }

      const propostaId = await propostasRepository.criar({
        cotacaoId: cotacao_id,
        fornecedorId: req.usuario.id,
        valor: valorNumerico,
        condicoesPagamento: condicoes_pagamento.trim(),
        detalhesTecnicos: detalhes_tecnicos.trim()
      });

      return res.status(201).json({
        mensagem: "Proposta enviada com sucesso!",
        proposta_id: propostaId
      });

    } catch (erro) {
      console.error("Erro ao enviar proposta:");

      return res.status(500).json({
        erro: "Erro interno ao enviar proposta."
      });
    }
  }
);

app.get("/fornecedor/propostas", autenticar, permitirPerfis("fornecedor"),  async (req, res) => {
    try {
      const propostas = await propostasRepository.listarPorFornecedor(req.usuario.id);

      return res.status(200).json(propostas);

    } catch (erro) {
      console.error("Erro ao buscar propostas:");

      return res.status(500).json({
        erro: "Erro interno ao buscar propostas."
      });
    }
  }
);

app.get("/organizador/propostas", autenticar, permitirPerfis("organizador"), async (req, res) => {
    try {
      const propostas = await propostasRepository.listarPorOrganizador(req.usuario.id);

      return res.status(200).json(propostas);

    } catch (erro) {
      console.error("Erro ao buscar propostas recebidas:");

      return res.status(500).json({
        erro: "Erro interno ao buscar propostas recebidas."
      });
    }
  }
);

app.get("/admin/propostas", autenticar, permitirPerfis("admin"), async (req, res) => {
  try {
    const propostas = await propostasRepository.listarAdministrativo();

    return res.status(200).json(propostas);

  } catch (erro) {
    console.error("Erro ao buscar propostas do administrador:");

    return res.status(500).json({
      erro: "Erro interno ao buscar propostas."
    });
  }
});

app.patch("/organizador/propostas/:id/status", autenticar, permitirPerfis("organizador"), async (req, res) => {
    try {
      const propostaId = Number(req.params.id);
      const { status } = req.body;

      if (!Number.isInteger(propostaId) || propostaId <= 0) {
        return res.status(400).json({
          erro: "ID da proposta inválido."
        });
      }

      if (!["Aprovada", "Recusada"].includes(status)) {
        return res.status(400).json({
          erro: "O status deve ser Aprovada ou Recusada."
        });
      }

      const affectedRows = await propostasRepository.avaliar(propostaId, req.usuario.id, status);

      if (affectedRows === 0) {
        return res.status(404).json({
          erro: "Proposta não encontrada, sem permissão ou já avaliada."
        });
      }

      return res.status(200).json({
        mensagem: `Proposta ${status.toLowerCase()} com sucesso!`,
        proposta_id: propostaId,
        status
      });

    } catch (erro) {
      console.error("Erro ao avaliar proposta:");

      return res.status(500).json({
        erro: "Erro interno ao avaliar proposta."
      });
    }
  }
);

// Middleware de autenticação
async function autenticar(req, res, next) {
  const authorization = req.headers.authorization;

  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      erro: "Token não informado."
    });
  }

  let dadosToken;

  try {
    dadosToken = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (!dadosToken || typeof dadosToken !== "object" || Array.isArray(dadosToken) ||
        !Number.isSafeInteger(dadosToken.id) || dadosToken.id <= 0) {
      throw new Error("Identificador de usuario invalido.");
    }
  } catch {
    return res.status(401).json({
      erro: "Token inválido ou expirado."
    });
  }

  try {
    const usuario = await usuariosRepository.buscarParaAutenticacao(dadosToken.id);

    if (!usuario) {
      return res.status(401).json({
        erro: "Usuário não encontrado."
      });
    }

    req.usuario = usuario;

    next();
  } catch (erro) {
    console.error("Erro na autenticação:");

    return res.status(500).json({
      erro: "Erro interno ao autenticar usuário."
    });
  }
}

// Rota protegida
app.get("/perfil", autenticar, async (req, res) => {
  try {
    const usuario = await usuariosRepository.buscarPerfil(req.usuario.id);

    if (!usuario) {
      return res.status(404).json({
        erro: "Usuário não encontrado."
      });
    }

    return res.status(200).json(usuario);

  } catch (erro) {
    console.error("Falha em GET /perfil.");

    return res.status(500).json({
      erro: "Erro interno ao buscar perfil."
    });
  }
});
function permitirPerfis(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        erro: "Usuário não autenticado."
      });
    }

    if (!perfisPermitidos.includes(req.usuario.perfil)) {
      return res.status(403).json({
        erro: "Você não tem permissão para realizar esta ação."
      });
    }

    next();
  };
}


const eventos = [];

// Cadastrar novo evento
app.post("/eventos", autenticar, permitirPerfis("organizador"),async (req, res) => {
  try {
    const {
      nome,
      data,
      horario,
      local,
      categoria,
      publico,
      descricao
    } = req.body || {};

    // Validar campos obrigatórios
    if (
      typeof nome !== "string" || !nome.trim() ||
      typeof data !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
      !Number.isFinite(Date.parse(data)) ||
      typeof horario !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(horario) ||
      typeof local !== "string" || !local.trim() ||
      !Number.isInteger(publico) || publico <= 0 ||
      (categoria !== undefined && typeof categoria !== "string") ||
      (descricao !== undefined && typeof descricao !== "string")
    ) {
      return res.status(400).json({
        erro: "Informe nome, data, horário, local e público válidos."
      });
    }

    const nomeFinal = nome.trim();
    const localFinal = local.trim();
    const categoriaFinal = categoria || "Corporativo";
    const descricaoFinal = descricao || "";
    const status = "Em planejamento";
    const usuarioId = req.usuario.id;

    // Salvar evento no MySQL
    const eventoId = await eventosRepository.criar({
      nome: nomeFinal, data, horario, local: localFinal, categoria: categoriaFinal,
      publico, descricao: descricaoFinal, status, usuarioId
    });

    const novoEvento = {
      id: eventoId,
      nome: nomeFinal,
      data,
      horario,
      local: localFinal,
      categoria: categoriaFinal,
      publico,
      descricao: descricaoFinal,
      status,
      usuario_id: usuarioId
    };

    return res.status(201).json({
      mensagem: "Evento cadastrado com sucesso!",
      evento: novoEvento
    });

  } catch (erro) {
    console.error("Falha em POST /eventos.");

    return res.status(500).json({
      erro: "Erro interno ao cadastrar evento."
    });
  }
});

app.patch("/eventos/:id/publicar", autenticar, permitirPerfis("organizador"), async (req, res) => {
    try {
      const eventoId = Number(req.params.id);

      if (!Number.isInteger(eventoId) || eventoId <= 0) {
        return res.status(400).json({
          erro: "ID do evento inválido."
        });
      }

      const affectedRows = await eventosRepository.publicar(eventoId, req.usuario.id);

      if (affectedRows === 0) {
        return res.status(404).json({
          erro: "Evento não encontrado, não pertence a você ou não está em planejamento."
        });
      }

      return res.status(200).json({
        mensagem: "Evento publicado com sucesso!",
        status: "Ativo"
      });

    } catch (erro) {
      console.error("Erro ao publicar evento:");

      return res.status(500).json({
        erro: "Erro interno ao publicar evento."
      });
    }
  }
);

// Listar custos de um evento do organizador
app.get("/eventos/:id/custos", autenticar, permitirPerfis("organizador"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        erro: "ID do evento inválido."
      });
    }

    const eventos = await custosRepository.buscarEventoDoUsuario(id, req.usuario.id);

    if (eventos.length === 0) {
      return res.status(404).json({
        erro: "Evento não encontrado."
      });
    }

    const custos = await custosRepository.listarPorEvento(id);

    return res.status(200).json(custos);
  } catch (erro) {
    console.error("Erro ao listar custos do evento:");

    return res.status(500).json({
      erro: "Erro interno ao listar custos do evento."
    });
  }
});

// Substituir os custos de um evento do organizador
app.put("/eventos/:id/custos", autenticar, permitirPerfis("organizador"), async (req, res) => {
  try {
    return res.status(200).json(await servicos.custos.substituir(
      req.usuario, req.params.id, req.body?.custos
    ));
  } catch (erro) {
    return responderErroServico(res, erro, "Erro interno ao salvar custos do evento.");
  }
});

// Listar eventos do usuário
app.get("/eventos/:id", autenticar, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        erro: "ID do evento inválido."
      });
    }

    const evento = await eventosRepository.buscarPorIdDoUsuario(id, req.usuario.id);

    if (!evento) {
      return res.status(404).json({
        erro: "Evento não encontrado."
      });
    }

    return res.status(200).json(evento);

  } catch (erro) {
    console.error("Falha em GET /eventos/:id.");

    return res.status(500).json({
      erro: "Erro interno ao buscar evento."
    });
  }
});


app.put("/eventos/:id", autenticar, permitirPerfis("organizador"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        erro: "ID do evento inválido."
      });
    }

    const {
      nome, data, horario, local,
      categoria, publico, descricao
    } = req.body || {};

    if (
      typeof nome !== "string" || !nome.trim() ||
      typeof data !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
      !Number.isFinite(Date.parse(data)) ||
      typeof horario !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(horario) ||
      typeof local !== "string" || !local.trim() ||
      !Number.isInteger(publico) || publico <= 0 ||
      (categoria !== undefined && typeof categoria !== "string") ||
      (descricao !== undefined && typeof descricao !== "string")
    ) {
      return res.status(400).json({
        erro: "Informe dados válidos para atualizar o evento."
      });
    }

    const affectedRows = await eventosRepository.atualizar(id, req.usuario.id, {
      nome: nome.trim(), data, horario, local: local.trim(),
      categoria: categoria || "Corporativo", publico, descricao: descricao || ""
    });

    if (affectedRows === 0) {
      return res.status(404).json({
        erro: "Evento não encontrado."
      });
    }

    return res.status(200).json({
      mensagem: "Evento atualizado com sucesso!"
    });

  } catch (erro) {
    console.error("Falha em PUT /eventos/:id.");

    return res.status(500).json({
      erro: "Erro interno ao atualizar evento."
    });
  }
});


app.delete("/eventos/:id", autenticar, permitirPerfis("organizador"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    // Validar o ID
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        erro: "ID do evento inválido."
      });
    }

    // Excluir apenas eventos do usuário logado
    const affectedRows = await eventosRepository.excluir(id, req.usuario.id);

    // Verificar se o evento existia
    if (affectedRows === 0) {
      return res.status(404).json({
        erro: "Evento não encontrado."
      });
    }

    return res.status(200).json({
      mensagem: "Evento excluído com sucesso!"
    });

  } catch (erro) {
    console.error("Falha em DELETE /eventos/:id.");

    return res.status(500).json({
      erro: "Erro interno ao excluir evento."
    });
  }
});

if (!process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32) {
  throw new Error("Configure um JWT_SECRET seguro no .env");
}


app.post("/solicitacoes-acesso", autenticar, async (req, res) => {
  try {
    const { perfil_solicitado, justificativa } = req.body || {};
    const usuarioId = req.usuario.id;

    // Validar os dados
    if (
      !["organizador", "fornecedor"].includes(perfil_solicitado) ||
      typeof justificativa !== "string" ||
      !justificativa.trim()
    ) {
      return res.status(400).json({
        erro: "Informe um perfil válido e uma justificativa."
      });
    }

    // Somente participantes podem solicitar outro perfil
    if (req.usuario.perfil !== "participante") {
      return res.status(403).json({
        erro: "Somente participantes podem solicitar acesso."
      });
    }

    // Impedir solicitações pendentes duplicadas
    const solicitacoesExistentes = await solicitacoesAcessoRepository.buscarPendentesPorUsuario(usuarioId);

    if (solicitacoesExistentes.length > 0) {
      return res.status(409).json({
        erro: "Você já possui uma solicitação pendente."
      });
    }

    // Registrar a solicitação
    const solicitacaoId = await solicitacoesAcessoRepository.criar(usuarioId, perfil_solicitado, justificativa.trim());

    return res.status(201).json({
      mensagem: "Solicitação enviada com sucesso!",
      solicitacao: {
        id: solicitacaoId,
        usuario_id: usuarioId,
        perfil_solicitado,
        justificativa: justificativa.trim(),
        status: "pendente"
      }
    });

  } catch (erro) {
    console.error("Falha em POST /solicitacoes-acesso.");
    return res.status(500).json({
      erro: "Erro interno ao solicitar acesso."
    });
  }
});

app.get("/solicitacoes-acesso",autenticar,permitirPerfis("admin"),async (req, res) => {
    try {
      const solicitacoes = await solicitacoesAcessoRepository.listar();

      return res.status(200).json(solicitacoes);

    } catch (erro) {
      console.error("Falha em GET /solicitacoes-acesso.");

      return res.status(500).json({
        erro: "Erro interno ao buscar solicitações."
      });
    }
  }
);


app.patch("/solicitacoes-acesso/:id", autenticar, permitirPerfis("admin"), async (req, res) => {
  try {
    return res.status(200).json(await servicos.solicitacoesAcesso.decidir(
      req.usuario, req.params.id, req.body?.status
    ));
  } catch (erro) {
    return responderErroServico(res, erro, "Erro interno ao analisar solicitação.");
  }
});

// Evita o handler padrao do Express, que pode registrar stack/mensagem do erro.
app.use((erro, req, res, next) => {
  console.error("Erro no processamento da requisicao.");
  if (res.headersSent) return res.destroy();
  const status = erro?.type === "entity.parse.failed" ? 400
    : erro?.type === "entity.too.large" ? 413 : 500;
  return res.status(status).json({ erro: status === 500
    ? "Erro interno no servidor." : "Corpo da requisicao invalido ou muito grande." });
});

const PORT = process.env.PORT || 3001

if (require.main === module && modoExecucao() === "principal") {
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})
}

module.exports = app;
