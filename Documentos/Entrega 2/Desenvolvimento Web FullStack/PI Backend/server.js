
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { modoExecucao } = require("./isolamento.cjs");
if (modoExecucao() === "principal") require("dotenv").config();

const db = require("./db");

const app = express();

app.use(cors({
  origin: "http://localhost:5173"
}));

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    mensagem: "Backend do TrocaTicket funcionando!"
  });
});

// Listar usuários sem expor senhas
app.get("/eventos", autenticar, async (req, res) => {
  try {
    const [eventos] = await db.execute(
      `SELECT id, nome, data, horario, local,
              categoria, publico, descricao, status, usuario_id
       FROM eventos
       WHERE usuario_id = ?
       ORDER BY id DESC`,
      [req.usuario.id]
    );

    return res.status(200).json(eventos);

  } catch (erro) {
    console.error(erro);

    return res.status(500).json({
      erro: "Erro interno ao listar eventos."
    });
  }
});

// Listar todos os eventos - somente administrador
app.get("/admin/eventos", autenticar, permitirPerfis("admin"), async (req, res) => {
    try {
      const [eventos] = await db.execute(
        `SELECT
            e.id,
            e.nome,
            e.data,
            e.horario,
            e.local,
            e.categoria,
            e.publico,
            e.descricao,
            e.status,
            e.usuario_id,
            u.nome AS organizador_nome
         FROM eventos e
         INNER JOIN usuarios u ON u.id = e.usuario_id
         ORDER BY e.id DESC`
      );

      return res.status(200).json(eventos);

    } catch (erro) {
      console.error(erro);

      return res.status(500).json({
        erro: "Erro interno ao listar eventos do administrador."
      });
    }
  }
);

app.get("/participante/eventos", autenticar, permitirPerfis("participante"), async (req, res) => {
    try {
      const [eventos] = await db.execute(
        `SELECT id, nome, data, horario, local, categoria, publico, descricao, status
         FROM eventos
         WHERE status = 'Ativo'
         ORDER BY data ASC, id ASC`
      );

      return res.status(200).json(eventos);

    } catch (erro) {
      console.error("Erro ao listar eventos para participantes:", erro);

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

      const [eventos] = await db.execute(
        "SELECT id FROM eventos WHERE id = ? AND status = 'Ativo'",
        [eventoId]
      );

      if (eventos.length === 0) {
        return res.status(404).json({
          erro: "Evento não encontrado ou não publicado."
        });
      }

      const [inscricoes] = await db.execute(
        "SELECT id FROM inscricoes WHERE usuario_id = ? AND evento_id = ?",
        [usuarioId, eventoId]
      );

      if (inscricoes.length > 0) {
        return res.status(409).json({
          erro: "Você já está inscrito neste evento."
        });
      }

      const [resultado] = await db.execute(
        "INSERT INTO inscricoes (usuario_id, evento_id) VALUES (?, ?)",
        [usuarioId, eventoId]
      );

      return res.status(201).json({
        mensagem: "Inscrição realizada com sucesso!",
        inscricao: {
          id: resultado.insertId,
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

      console.error("Erro ao realizar inscrição:", erro);

      return res.status(500).json({
        erro: "Erro interno ao realizar inscrição."
      });
    }
  }
);

app.get("/participante/inscricoes", autenticar, permitirPerfis("participante"), async (req, res) => {
    try {
      const usuarioId = req.usuario.id;

      const [inscricoes] = await db.execute(
        `SELECT
          i.id,
          i.evento_id,
          i.status,
          i.data_inscricao,
          e.nome AS evento_nome,
          e.data AS evento_data,
          e.horario AS evento_horario,
          e.local AS evento_local,
          e.categoria AS evento_categoria
        FROM inscricoes i
        INNER JOIN eventos e ON i.evento_id = e.id
        WHERE i.usuario_id = ?
        ORDER BY i.data_inscricao DESC`,
        [usuarioId]
      );

      return res.status(200).json(inscricoes);

    } catch (erro) {
      console.error("Erro ao buscar inscrições:", erro);

      return res.status(500).json({
        erro: "Erro interno ao buscar inscrições."
      });
    }
  }
);

app.get('/usuarios', autenticar, permitirPerfis('admin'), async (req, res) => {
  try {
    const [usuarios] = await db.execute(
      "SELECT id, nome, email, perfil FROM usuarios ORDER BY id DESC"
    );

    return res.status(200).json(usuarios);

  } catch (erro) {
    console.error(erro);

    return res.status(500).json({
      erro: "Erro interno ao listar usuários."
    });
  }
});

// Cadastrar usuário

app.post("/usuarios", async (req, res) => {
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
    const [usuariosExistentes] = await db.execute(
      "SELECT id FROM usuarios WHERE email = ?",
      [emailNormalizado]
    );

    if (usuariosExistentes.length > 0) {
      return res.status(409).json({
        erro: "Email já cadastrado!"
      });
    }

    // Criptografar a senha
    const senhaHash = await bcrypt.hash(senha, 12);

    // Salvar usuário com o perfil escolhido
    const [resultado] = await db.execute(
      "INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)",
      [nome.trim(), emailNormalizado, senhaHash, perfil]
    );

    return res.status(201).json({
      mensagem: "Usuário cadastrado com sucesso!",
      usuario: {
        id: resultado.insertId,
        nome: nome.trim(),
        email: emailNormalizado,
        perfil
      }
    });

  } catch (erro) {
    console.error(erro);

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
app.post("/login", async (req, res) => {
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

    // Buscar usuário no MySQL
    const [usuariosEncontrados] = await db.execute(
      "SELECT id, nome, email, senha, perfil FROM usuarios WHERE email = ?",
      [emailNormalizado]
    );

    const usuario = usuariosEncontrados[0];
    
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
  { expiresIn: "1h" }
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
    console.error(erro);

    return res.status(500).json({
      erro: "Erro interno no login."
    });
  }
});

 // Publicar cotação de um evento
app.post("/cotacoes", autenticar, permitirPerfis("organizador"), async (req, res) => {
  const { evento_id, prazo, observacoes, itens } = req.body || {};

  if (
    !Number.isInteger(Number(evento_id)) ||
    Number(evento_id) <= 0 ||
    typeof prazo !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(prazo) ||
    !Array.isArray(itens) ||
    itens.length === 0 ||
    itens.some(item =>
      typeof item.categoria !== "string" ||
      !item.categoria.trim() ||
      typeof item.descricao !== "string" ||
      !item.descricao.trim() ||
      !Number.isFinite(Number(item.valor_estimado)) ||
      Number(item.valor_estimado) < 0
    )
  ) {
    return res.status(400).json({
      erro: "Informe evento, prazo válido e itens da cotação."
    });
  }

  const dataPrazo = new Date(`${prazo}T00:00:00Z`);

  if (
    Number.isNaN(dataPrazo.getTime()) ||
    dataPrazo.toISOString().slice(0, 10) !== prazo ||
    prazo < new Date().toISOString().slice(0, 10)
  ) {
    return res.status(400).json({
      erro: "O prazo da cotação deve ser uma data válida e não pode estar no passado."
    });
  }

  let conexao;

  try {
    conexao = await db.getConnection();

    await conexao.beginTransaction();

    const [eventos] = await conexao.execute(
      "SELECT id FROM eventos WHERE id = ? AND usuario_id = ?",
      [Number(evento_id), req.usuario.id]
    );

    if (eventos.length === 0) {
      await conexao.rollback();

      return res.status(404).json({
        erro: "Evento não encontrado ou não pertence ao usuário."
      });
    }

    const [resultado] = await conexao.execute(
      `INSERT INTO cotacoes
       (evento_id, prazo, modalidade, observacoes, status)
       VALUES (?, ?, 'Fechada', ?, 'Aberta')`,
      [Number(evento_id), prazo, observacoes || "",]
    );

    const cotacaoId = resultado.insertId;

    for (const item of itens) {
      await conexao.execute(
        `INSERT INTO itens_cotacao
         (cotacao_id, categoria, descricao, valor_estimado)
         VALUES (?, ?, ?, ?)`,
        [
          cotacaoId,
          item.categoria.trim(),
          item.descricao.trim(),
          Number(item.valor_estimado)
        ]
      );
    }

    await conexao.commit();

    return res.status(201).json({
      mensagem: "Cotação publicada com sucesso!",
      cotacao: {
        id: cotacaoId,
        evento_id: Number(evento_id),
        prazo,
        modalidade: "Fechada",
        observacoes: observacoes || "",
        status: "Aberta",
        itens
      }
    });

  } catch (erro) {
    if (conexao) {
      await conexao.rollback();
    }

    console.error("Erro ao publicar cotação:", erro);

    return res.status(500).json({
      erro: "Erro interno ao publicar cotação."
    });

  } finally {
    if (conexao) {
      conexao.release();
    }
  }
});

app.get("/cotacoes", autenticar, permitirPerfis("organizador"), async (req, res) => {
  try {
    const [cotacoes] = await db.execute(
      `SELECT
        c.id,
        c.evento_id,
        e.nome AS evento_nome,
        e.data AS evento_data,
        e.local AS evento_local,
        c.prazo,
        c.modalidade,
        c.observacoes,
        c.status,
        c.criada_em
      FROM cotacoes c
      INNER JOIN eventos e ON e.id = c.evento_id
      WHERE e.usuario_id = ?
      ORDER BY c.id DESC`,
      [req.usuario.id]
    );

    for (const cotacao of cotacoes) {
      const [itens] = await db.execute(
        `SELECT
          id,
          categoria,
          descricao,
          valor_estimado
        FROM itens_cotacao
        WHERE cotacao_id = ?
        ORDER BY id`,
        [cotacao.id]
      );

      cotacao.itens = itens;
    }

    return res.status(200).json(cotacoes);
  } catch (erro) {
    console.error("Erro ao consultar cotações:", erro);

    return res.status(500).json({
      erro: "Erro interno ao consultar cotações."
    });
  }
});

app.get("/admin/cotacoes", autenticar, permitirPerfis("admin"), async (req, res) => {
  try {
    const [cotacoes] = await db.execute(`
      SELECT
        c.id,
        c.evento_id,
        e.nome AS evento_nome,
        c.prazo,
        c.modalidade,
        c.observacoes,
        c.status,
        c.criada_em
      FROM cotacoes c
      INNER JOIN eventos e ON e.id = c.evento_id
      ORDER BY c.id DESC
    `);

    return res.status(200).json(cotacoes);
  } catch (erro) {
    console.error("Erro ao consultar cotações do administrador:", erro);

    return res.status(500).json({
      erro: "Erro interno ao consultar cotações."
    });
  }
});

app.get("/fornecedor/cotacoes", autenticar, permitirPerfis("fornecedor"), async (req, res) => {
  try {
    const [cotacoes] = await db.execute(
      `SELECT
        c.id,
        c.evento_id,
        e.nome AS evento_nome,
        e.data AS evento_data,
        e.local AS evento_local,
        c.prazo,
        c.modalidade,
        c.observacoes,
        c.status,
        c.criada_em
      FROM cotacoes c
      INNER JOIN eventos e ON e.id = c.evento_id
      WHERE c.status = 'Aberta'
        AND c.prazo >= CURDATE()
      ORDER BY c.id DESC`
    );

    for (const cotacao of cotacoes) {
      const [itens] = await db.execute(
        `SELECT
          id,
          categoria,
          descricao,
          valor_estimado
        FROM itens_cotacao
        WHERE cotacao_id = ?
        ORDER BY id`,
        [cotacao.id]
      );

      cotacao.itens = itens;
    }

    return res.status(200).json(cotacoes);

  } catch (erro) {
    console.error("Erro ao consultar cotações para fornecedores:", erro);

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

      const [cotacoes] = await db.query(
        `SELECT id
         FROM cotacoes
         WHERE id = ?
           AND status = 'Aberta'
           AND prazo >= CURDATE()`,
        [cotacao_id]
      );

      if (cotacoes.length === 0) {
        return res.status(404).json({
          erro: "Cotação não encontrada, encerrada ou com prazo expirado."
        });
      }

      const [resultado] = await db.query(
        `INSERT INTO propostas
          (cotacao_id, fornecedor_id, valor,
           condicoes_pagamento, detalhes_tecnicos)
         VALUES (?, ?, ?, ?, ?)`,
        [
          cotacao_id,
          req.usuario.id,
          valorNumerico,
          condicoes_pagamento.trim(),
          detalhes_tecnicos.trim()
        ]
      );

      return res.status(201).json({
        mensagem: "Proposta enviada com sucesso!",
        proposta_id: resultado.insertId
      });

    } catch (erro) {
      console.error("Erro ao enviar proposta:", erro);

      return res.status(500).json({
        erro: "Erro interno ao enviar proposta."
      });
    }
  }
);

app.get("/fornecedor/propostas", autenticar, permitirPerfis("fornecedor"),  async (req, res) => {
    try {
      const [propostas] = await db.query(
        `SELECT
          p.id,
          p.cotacao_id,
          p.valor,
          p.condicoes_pagamento,
          p.detalhes_tecnicos,
          p.status,
          p.criada_em,
          e.nome AS evento_nome,
          GROUP_CONCAT(DISTINCT i.categoria SEPARATOR ', ') AS categoria
        FROM propostas p
        INNER JOIN cotacoes c ON c.id = p.cotacao_id
        INNER JOIN eventos e ON e.id = c.evento_id
        LEFT JOIN itens_cotacao i ON i.cotacao_id = c.id
        WHERE p.fornecedor_id = ?
        GROUP BY
          p.id,
          p.cotacao_id,
          p.valor,
          p.condicoes_pagamento,
          p.detalhes_tecnicos,
          p.status,
          p.criada_em,
          e.nome
        ORDER BY p.criada_em DESC, p.id DESC`,
        [req.usuario.id]
      );

      return res.status(200).json(propostas);

    } catch (erro) {
      console.error("Erro ao buscar propostas:", erro);

      return res.status(500).json({
        erro: "Erro interno ao buscar propostas."
      });
    }
  }
);

app.get("/organizador/propostas", autenticar, permitirPerfis("organizador"), async (req, res) => {
    try {
      const [propostas] = await db.query(
        `SELECT
          p.id,
          p.cotacao_id,
          p.fornecedor_id,
          p.valor,
          p.condicoes_pagamento,
          p.detalhes_tecnicos,
          p.status,
          p.criada_em,
          e.id AS evento_id,
          e.nome AS evento_nome,
          u.nome AS fornecedor_nome
        FROM propostas p
        INNER JOIN cotacoes c ON c.id = p.cotacao_id
        INNER JOIN eventos e ON e.id = c.evento_id
        INNER JOIN usuarios u ON u.id = p.fornecedor_id
        WHERE e.usuario_id = ?
        ORDER BY p.criada_em DESC, p.id DESC`,
        [req.usuario.id]
      );

      return res.status(200).json(propostas);

    } catch (erro) {
      console.error("Erro ao buscar propostas recebidas:", erro);

      return res.status(500).json({
        erro: "Erro interno ao buscar propostas recebidas."
      });
    }
  }
);

app.get("/admin/propostas", autenticar, permitirPerfis("admin"), async (req, res) => {
  try {
    const [propostas] = await db.query(`
      SELECT
        p.id,
        p.cotacao_id,
        p.fornecedor_id,
        p.valor,
        p.condicoes_pagamento,
        p.detalhes_tecnicos,
        p.status,
        p.criada_em,
        e.id AS evento_id,
        e.nome AS evento_nome,
        u.nome AS fornecedor_nome
      FROM propostas p
      INNER JOIN cotacoes c ON c.id = p.cotacao_id
      INNER JOIN eventos e ON e.id = c.evento_id
      INNER JOIN usuarios u ON u.id = p.fornecedor_id
      ORDER BY p.criada_em DESC, p.id DESC
    `);

    return res.status(200).json(propostas);

  } catch (erro) {
    console.error("Erro ao buscar propostas do administrador:", erro);

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

      const [resultado] = await db.query(
        `UPDATE propostas p
         INNER JOIN cotacoes c ON c.id = p.cotacao_id
         INNER JOIN eventos e ON e.id = c.evento_id
         SET p.status = ?
         WHERE p.id = ?
           AND e.usuario_id = ?
           AND p.status = 'Em avaliação'`,
        [status, propostaId, req.usuario.id]
      );

      if (resultado.affectedRows === 0) {
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
      console.error("Erro ao avaliar proposta:", erro);

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
    dadosToken = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({
      erro: "Token inválido ou expirado."
    });
  }

  try {
    const [usuarios] = await db.execute(
      "SELECT id, nome, email, perfil FROM usuarios WHERE id = ?",
      [dadosToken.id]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({
        erro: "Usuário não encontrado."
      });
    }

    req.usuario = usuarios[0];

    next();
  } catch (erro) {
    console.error("Erro na autenticação:", erro);

    return res.status(500).json({
      erro: "Erro interno ao autenticar usuário."
    });
  }
}

// Rota protegida
app.get("/perfil", autenticar, async (req, res) => {
  try {
    const [usuarios] = await db.execute(
      "SELECT id, nome, email FROM usuarios WHERE id = ?",
      [req.usuario.id]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({
        erro: "Usuário não encontrado."
      });
    }

    return res.status(200).json(usuarios[0]);

  } catch (erro) {
    console.error(erro);

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
    const [resultado] = await db.execute(
      `INSERT INTO eventos
       (nome, data, horario, local, categoria,
        publico, descricao, status, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nomeFinal,
        data,
        horario,
        localFinal,
        categoriaFinal,
        publico,
        descricaoFinal,
        status,
        usuarioId
      ]
    );

    const novoEvento = {
      id: resultado.insertId,
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
    console.error(erro);

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

      const [resultado] = await db.execute(
        `UPDATE eventos
         SET status = 'Ativo'
         WHERE id = ?
           AND usuario_id = ?
           AND status = 'Em planejamento'`,
        [eventoId, req.usuario.id]
      );

      if (resultado.affectedRows === 0) {
        return res.status(404).json({
          erro: "Evento não encontrado, não pertence a você ou não está em planejamento."
        });
      }

      return res.status(200).json({
        mensagem: "Evento publicado com sucesso!",
        status: "Ativo"
      });

    } catch (erro) {
      console.error("Erro ao publicar evento:", erro);

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

    const [eventos] = await db.execute(
      "SELECT id FROM eventos WHERE id = ? AND usuario_id = ?",
      [id, req.usuario.id]
    );

    if (eventos.length === 0) {
      return res.status(404).json({
        erro: "Evento não encontrado."
      });
    }

    const [custos] = await db.execute(
      `SELECT id, evento_id, categoria, descricao, valor_estimado
       FROM custos_evento
       WHERE evento_id = ?
       ORDER BY id`,
      [id]
    );

    return res.status(200).json(custos);
  } catch (erro) {
    console.error("Erro ao listar custos do evento:", erro);

    return res.status(500).json({
      erro: "Erro interno ao listar custos do evento."
    });
  }
});

// Substituir os custos de um evento do organizador
app.put("/eventos/:id/custos", autenticar, permitirPerfis("organizador"), async (req, res) => {
  let conexao;

  try {
    const id = Number(req.params.id);
    const { custos } = req.body || {};

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        erro: "ID do evento inválido."
      });
    }

    if (!Array.isArray(custos)) {
      return res.status(400).json({
        erro: "Informe a propriedade custos como um array."
      });
    }

    const custosValidados = [];

    for (const item of custos) {
      if (
        !item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.categoria !== "string" || !item.categoria.trim() ||
        Array.from(item.categoria.trim()).length > 100 ||
        typeof item.descricao !== "string" || !item.descricao.trim() ||
        Array.from(item.descricao.trim()).length > 255 ||
        !["number", "string"].includes(typeof item.valor_estimado) ||
        (typeof item.valor_estimado === "number" && !Number.isFinite(item.valor_estimado))
      ) {
        return res.status(400).json({
          erro: "Informe categoria de até 100 caracteres, descrição de até 255 caracteres e valor estimado válido."
        });
      }

      const valor = String(item.valor_estimado).trim();

      if (!/^\d+(?:\.\d{1,2})?$/.test(valor)) {
        return res.status(400).json({
          erro: "O valor estimado deve ser não negativo e possuir no máximo duas casas decimais."
        });
      }

      const [inteiro, fracao = ""] = valor.split(".");
      const inteiroNormalizado = inteiro.replace(/^0+(?=\d)/, "");

      if (inteiroNormalizado.length > 10) {
        return res.status(400).json({
          erro: "O valor estimado não pode exceder 9999999999.99."
        });
      }

      custosValidados.push({
        categoria: item.categoria.trim(),
        descricao: item.descricao.trim(),
        valor_estimado: `${inteiroNormalizado}.${fracao.padEnd(2, "0")}`
      });
    }

    conexao = await db.getConnection();
    await conexao.beginTransaction();

    const [eventos] = await conexao.execute(
      "SELECT id FROM eventos WHERE id = ? AND usuario_id = ? FOR UPDATE",
      [id, req.usuario.id]
    );

    if (eventos.length === 0) {
      await conexao.rollback();
      return res.status(404).json({
        erro: "Evento não encontrado."
      });
    }

    await conexao.execute("DELETE FROM custos_evento WHERE evento_id = ?", [id]);

    for (const item of custosValidados) {
      await conexao.execute(
        `INSERT INTO custos_evento (evento_id, categoria, descricao, valor_estimado)
         VALUES (?, ?, ?, ?)`,
        [id, item.categoria, item.descricao, item.valor_estimado]
      );
    }

    const [custosSalvos] = await conexao.execute(
      `SELECT id, evento_id, categoria, descricao, valor_estimado
       FROM custos_evento
       WHERE evento_id = ?
       ORDER BY id`,
      [id]
    );

    await conexao.commit();
    return res.status(200).json(custosSalvos);
  } catch (erro) {
    if (conexao) {
      try {
        await conexao.rollback();
      } catch (erroRollback) {
        console.error("Erro ao reverter custos do evento:", erroRollback);
      }
    }

    console.error("Erro ao salvar custos do evento:", erro);
    return res.status(500).json({
      erro: "Erro interno ao salvar custos do evento."
    });
  } finally {
    if (conexao) conexao.release();
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

    const [eventos] = await db.execute(
      `SELECT * FROM eventos
       WHERE id = ? AND usuario_id = ?`,
      [id, req.usuario.id]
    );

    if (eventos.length === 0) {
      return res.status(404).json({
        erro: "Evento não encontrado."
      });
    }

    return res.status(200).json(eventos[0]);

  } catch (erro) {
    console.error(erro);

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

    const [resultado] = await db.execute(
      `UPDATE eventos
       SET nome = ?, data = ?, horario = ?, local = ?,
           categoria = ?, publico = ?, descricao = ?
       WHERE id = ? AND usuario_id = ?`,
      [
        nome.trim(),
        data,
        horario,
        local.trim(),
        categoria || "Corporativo",
        publico,
        descricao || "",
        id,
        req.usuario.id
      ]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        erro: "Evento não encontrado."
      });
    }

    return res.status(200).json({
      mensagem: "Evento atualizado com sucesso!"
    });

  } catch (erro) {
    console.error(erro);

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
    const [resultado] = await db.execute(
      `DELETE FROM eventos
       WHERE id = ? AND usuario_id = ?`,
      [id, req.usuario.id]
    );

    // Verificar se o evento existia
    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        erro: "Evento não encontrado."
      });
    }

    return res.status(200).json({
      mensagem: "Evento excluído com sucesso!"
    });

  } catch (erro) {
    console.error(erro);

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
    const [solicitacoesExistentes] = await db.execute(
      `SELECT id FROM solicitacoes_acesso
       WHERE usuario_id = ? AND status = 'pendente'`,
      [usuarioId]
    );

    if (solicitacoesExistentes.length > 0) {
      return res.status(409).json({
        erro: "Você já possui uma solicitação pendente."
      });
    }

    // Registrar a solicitação
    const [resultado] = await db.execute(
      `INSERT INTO solicitacoes_acesso
       (usuario_id, perfil_solicitado, justificativa)
       VALUES (?, ?, ?)`,
      [usuarioId, perfil_solicitado, justificativa.trim()]
    );

    return res.status(201).json({
      mensagem: "Solicitação enviada com sucesso!",
      solicitacao: {
        id: resultado.insertId,
        usuario_id: usuarioId,
        perfil_solicitado,
        justificativa: justificativa.trim(),
        status: "pendente"
      }
    });

  } catch (erro) {
    console.error(erro);
    return res.status(500).json({
      erro: "Erro interno ao solicitar acesso."
    });
  }
});

app.get("/solicitacoes-acesso",autenticar,permitirPerfis("admin"),async (req, res) => {
    try {
      const [solicitacoes] = await db.execute(`
        SELECT
          s.id,
          s.usuario_id,
          u.nome,
          u.email,
          s.perfil_solicitado,
          s.justificativa,
          s.status,
          s.criada_em
        FROM solicitacoes_acesso s
        INNER JOIN usuarios u ON u.id = s.usuario_id
        ORDER BY s.criada_em DESC, s.id DESC
      `);

      return res.status(200).json(solicitacoes);

    } catch (erro) {
      console.error(erro);

      return res.status(500).json({
        erro: "Erro interno ao buscar solicitações."
      });
    }
  }
);


app.patch("/solicitacoes-acesso/:id", autenticar, permitirPerfis("admin"), async (req, res) => {
    let conexao;

    try {
      const id = Number(req.params.id);
      const { status } = req.body || {};

      if (
        !Number.isInteger(id) ||
        id <= 0 ||
        !["aprovado", "rejeitado"].includes(status)
      ) {
        return res.status(400).json({
          erro: "Informe uma solicitação e um status válidos."
        });
      }

      conexao = await db.getConnection();
      await conexao.beginTransaction();

      const [solicitacoes] = await conexao.execute(
        `SELECT usuario_id, perfil_solicitado, status
         FROM solicitacoes_acesso
         WHERE id = ?
         FOR UPDATE`,
        [id]
      );

      if (solicitacoes.length === 0) {
        await conexao.rollback();
        return res.status(404).json({
          erro: "Solicitação não encontrada."
        });
      }

      const solicitacao = solicitacoes[0];

      if (solicitacao.status !== "pendente") {
        await conexao.rollback();
        return res.status(409).json({
          erro: "Esta solicitação já foi analisada."
        });
      }

      if (status === "aprovado") {
        const [resultadoUsuario] = await conexao.execute(
          `UPDATE usuarios
           SET perfil = ?
           WHERE id = ? AND perfil = 'participante'`,
          [solicitacao.perfil_solicitado, solicitacao.usuario_id]
        );

        if (resultadoUsuario.affectedRows !== 1) {
          await conexao.rollback();
          return res.status(409).json({
            erro: "O usuário não possui mais o perfil participante."
          });
        }
      }

      await conexao.execute(
        `UPDATE solicitacoes_acesso
         SET status = ?
         WHERE id = ?`,
        [status, id]
      );

      await conexao.commit();

      return res.status(200).json({
        mensagem: status === "aprovado"
          ? "Solicitação aprovada com sucesso!"
          : "Solicitação rejeitada com sucesso!"
      });

    } catch (erro) {
      if (conexao) await conexao.rollback();
      console.error(erro);

      return res.status(500).json({
        erro: "Erro interno ao analisar solicitação."
      });
    } finally {
      if (conexao) conexao.release();
    }
  }
);

const PORT = process.env.PORT || 3001

if (require.main === module && modoExecucao() === "principal") {
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})
}

module.exports = app;
