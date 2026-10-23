
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(express.json());

const usuarios = [];

app.get("/", (req, res) => {
  res.json({
    mensagem: "Backend do TrocaTicket funcionando!"
  });
});

// Listar usuários sem expor senhas
app.get("/usuarios", (req, res) => {
  const lista = usuarios.map(({ id, nome, email }) => ({
    id,
    nome,
    email
  }));

  res.json(lista);
});

// Cadastrar usuário
app.post("/usuarios", async (req, res) => {
  try {
    const { nome, email, senha } = req.body || {};

    if (
      typeof nome !== "string" ||
      !nome.trim() ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof senha !== "string" ||
      senha.length < 8 ||
      Buffer.byteLength(senha, "utf8") > 72
    ) {
      return res.status(400).json({
        erro: "Informe nome, email válido e senha de 8 a 72 bytes."
      });
    }

    const emailNormalizado = email.trim().toLowerCase();

    if (usuarios.some(u => u.email === emailNormalizado)) {
      return res.status(409).json({
        erro: "Email já cadastrado!"
      });
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    const usuario = {
      id: usuarios.length + 1,
      nome: nome.trim(),
      email: emailNormalizado,
      senhaHash
    };

    usuarios.push(usuario);

    return res.status(201).json({
      mensagem: "Usuário cadastrado com sucesso!",
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email
      }
    });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({
      erro: "Erro interno no cadastro."
    });
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body || {};

    if (typeof email !== "string" ||
        typeof senha !== "string") {
      return res.status(400).json({
        erro: "Email e senha são obrigatórios."
      });
    }

    const usuario = usuarios.find(
      u => u.email === email.trim().toLowerCase()
    );

    const senhaCorreta = usuario
      ? await bcrypt.compare(senha, usuario.senhaHash)
      : false;

    if (!senhaCorreta) {
      return res.status(401).json({
        erro: "Email ou senha incorretos."
      });
    }

    const token = jwt.sign(
      { id: usuario.id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.json({
      mensagem: "Login realizado com sucesso!",
      token
    });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({
      erro: "Erro interno no login."
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
app.get("/perfil", autenticar, (req, res) => {
  const usuario = usuarios.find(
    u => u.id === req.usuario.id
  );

  if (!usuario) {
    return res.status(404).json({
      erro: "Usuário não encontrado."
    });
  }

  res.json({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email
  });
});

const PORT = process.env.PORT || 3001;

if (!process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32) {
  throw new Error("Configure um JWT_SECRET seguro no .env");
}

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
