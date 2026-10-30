const { modoExecucao, obterBancoIsolado } = require("./isolamento.cjs");
const { validarInicializacaoBanco } = require("./config/banco.cjs");
const modo = modoExecucao();

if (modo === "isolado") {
  validarInicializacaoBanco(process.env, modo);
  module.exports = obterBancoIsolado();
} else {
require("dotenv").config();
validarInicializacaoBanco(process.env, modo);

const mysql = require("mysql2/promise");

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = db;
}
