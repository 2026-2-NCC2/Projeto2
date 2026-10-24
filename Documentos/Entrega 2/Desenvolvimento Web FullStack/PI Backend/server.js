
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

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


app.get("/usuarios", autenticar, async (req, res) => {
  try {
    const [usuarios] = await db.execute(
      "SELECT id, nome, email FROM usuarios ORDER BY id DESC"
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
    const { nome, email, senha } = req.body || {};

    if (
      typeof nome !== "string" ||
      !nome.trim() ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof senha !== "string" ||
      senha.length < 8 ||
      Buffer.byteLength(senha, "utf8") > 72
    ) {
      return res.status(400).json({
        erro: "Informe nome, email válido e senha de 8 a 72 bytes."
      });
    }

    const emailNormalizado = email.trim().toLowerCase();

    // Verificar se o email já existe no banco
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

    // Salvar usuário no MySQL
    const [resultado] = await db.execute(
      "INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)",
      [nome.trim(), emailNormalizado, senhaHash]
    );

    return res.status(201).json({
      mensagem: "Usuário cadastrado com sucesso!",
      usuario: {
        id: resultado.insertId,
        nome: nome.trim(),
        email: emailNormalizado
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
      "SELECT id, nome, email, senha FROM usuarios WHERE email = ?",
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
app.post("/cotacoes", autenticar, async (req, res) => {
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

app.get("/cotacoes", autenticar, async (req, res) => {
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

// Middleware de autenticação
function autenticar(req, res, next) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      erro: "Token não informado."
    });
  }

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      erro: "Token inválido ou expirado."
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

const eventos = [];

// Cadastrar novo evento
app.post("/eventos", autenticar, async (req, res) => {
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


app.put("/eventos/:id", autenticar, async (req, res) => {
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


app.delete("/eventos/:id", autenticar, async (req, res) => {
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


const PORT = process.env.PORT || 3001;

if (!process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32) {
  throw new Error("Configure um JWT_SECRET seguro no .env");
}

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
