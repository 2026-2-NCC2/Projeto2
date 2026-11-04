"use strict";
// Chrome headless com perfil temporário; somente os botões de login/perfil/sair.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const pausa = () => new Promise(r => setTimeout(r, 200));

async function criarNavegador() {
  const app = require("express")();
  app.use(require("express").static(path.resolve(__dirname, "../../PI React/dist")));
  const web = await new Promise((resolve, reject) => {
    const s = app.listen(5173, "localhost", () => resolve(s)); s.once("error", reject);
  });
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), "trocaticket-chrome-"));
  const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${diretorio}`, "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  let ws, erroProcesso;
  chrome.on("error", erro => { erroProcesso = erro; });
  async function fechar() {
    ws?.close();
    if (chrome.exitCode === null) {
      chrome.kill();
      await Promise.race([new Promise(r => chrome.once("exit", r)), new Promise(r => setTimeout(r, 3000))]);
    }
    web.closeAllConnections(); await new Promise(r => web.close(r));
    // Mantém o perfil temporário para remoção manual se o navegador ainda tiver locks.
    assert.equal(path.dirname(path.resolve(diretorio)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(diretorio).startsWith("trocaticket-chrome-"));
    try { fs.rmSync(diretorio, { recursive: true }); } catch { /* fora do repositório */ }
  }
  try {
    const limite = Date.now() + 20000;
    const ativo = path.join(diretorio, "DevToolsActivePort");
    while (!fs.existsSync(ativo)) {
      assert.ok(!erroProcesso && Date.now() < limite, "CHROME_INDISPONIVEL"); await pausa();
    }
    const porta = fs.readFileSync(ativo, "utf8").split("\n")[0];
    const tabs = await (await fetch(`http://localhost:${porta}/json/list`)).json();
    ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const pendentes = new Map();
    ws.onmessage = e => {
      const m = JSON.parse(e.data), p = pendentes.get(m.id);
      if (p) { pendentes.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error("CDP_RECUSADO")) : p.resolve(m.result); }
    };
    function cdp(method, params = {}) {
      return new Promise((resolve, reject) => {
        const n = ++id;
        const timer = setTimeout(() => { pendentes.delete(n); reject(Error("CDP_TIMEOUT")); }, 20000);
        pendentes.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params }));
      });
    }
    async function avaliar(expression) {
      const r = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!r.exceptionDetails, "SCRIPT_NAVEGADOR_RECUSADO"); return r.result.value;
    }
    async function esperar(expression) {
      const fim = Date.now() + 25000;
      while (!await avaliar(expression)) { assert.ok(Date.now() < fim, "UI_TIMEOUT"); await pausa(); }
    }
    async function clicar(texto) {
      const busca = `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(texto)})`;
      await esperar(`!!(${busca})`); await avaliar(`(${busca}).click()`);
    }
    async function preencher(seletor, valor) {
      await avaliar(`(()=>{const e=document.querySelector(${JSON.stringify(seletor)});const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    }
    async function login(email, senha) {
      await esperar("!!document.querySelector('input[type=password]')");
      await preencher('input[type=email]', email); await preencher('input[type=password]', senha);
      await clicar("Entrar"); await abrirPerfil(); await esperar("!!document.querySelector('.perfilDados')");
      await esperar("!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Editar dados')");
    }
    async function abrirPerfil() {
      const busca = "[...document.querySelectorAll('button')].find(b=>['Meu perfil','Perfil fornecedor','Perfil'].includes(b.textContent.trim()))";
      await esperar(`!!(${busca})`); await avaliar(`(${busca}).click()`);
    }
    async function conferir(dados) {
      const atual = await avaliar("(()=>{const f=document.querySelector('.perfilDados');const i=f.querySelectorAll('input');return {nome:i[0].value,telefone:i[2].value,biografia:f.querySelector('textarea').value,emailReadOnly:i[1].readOnly};})()");
      assert.deepEqual(atual, { ...dados, emailReadOnly: true });
    }
    return {
      fechar,
      async profissional(email, senha, perfil, dados, comerciais) {
        await cdp("Page.navigate", { url: "http://localhost:5173" });
        // Limpa somente a sessão deste navegador temporário entre contas.
        await esperar("document.readyState==='complete'");
        await avaliar("sessionStorage.clear();localStorage.clear()");
        await cdp("Page.reload", { ignoreCache: true });
        await login(email, senha);
        const form = titulo => `[...document.querySelectorAll('form')].find(f=>f.querySelector('h2')?.textContent===${JSON.stringify(titulo)})`;
        const redes = form("Redes sociais");
        const titulo = perfil === "fornecedor" ? "Informações comerciais" : "Informações da organização";
        await esperar(`!!(${redes})`);
        async function editar(t, valores) {
          const f = form(t);
          await avaliar(`(${f}).querySelector('button').click()`);
          for (const [rotulo, valor] of Object.entries(valores)) {
            const e = `[...(${f}).querySelectorAll('label')].find(l=>l.firstChild.textContent===${JSON.stringify(rotulo)}).querySelector('input,textarea')`;
            await avaliar(`(()=>{const e=${e};const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
          }
          await avaliar(`(${f}).requestSubmit()`);
          await esperar(`!!(${f}).querySelector('.perfilSucesso')`);
        }
        await editar("Redes sociais", { Instagram: dados.instagram });
        if (comerciais) await editar(titulo, { [perfil === "fornecedor" ? "Nome comercial" : "Nome da organização"]: comerciais.nome_comercial });
        async function conferir() {
          await esperar(`!!(${redes})?.querySelector('a')`);
          assert.equal(await avaliar(`(${redes}).querySelector('a').getAttribute('href')`), dados.instagram);
          if (comerciais) {
            await esperar(`!!(${form(titulo)})?.querySelector('dd')`);
            assert.equal(await avaliar(`(${form(titulo)}).querySelector('dd').textContent`), comerciais.nome_comercial);
          } else assert.equal(await avaliar(`!!(${form("Informações comerciais")}) || !!(${form("Informações da organização")})`), false);
        }
        await conferir();
        await cdp("Page.reload", { ignoreCache: true });
        await abrirPerfil(); await conferir();
        await clicar("Sair"); await login(email, senha); await conferir();
        await avaliar(`(${redes}).querySelector('button').click()`);
        await avaliar(`[...(${redes}).querySelectorAll('button')].find(b=>b.textContent.trim()==='Remover informações').click()`);
        await esperar(`!!(${redes}).querySelector('.perfilSucesso') && !(${redes}).querySelector('a')`);
      },
      async salvarERecarregar(email, senha, dados) {
        await cdp("Page.navigate", { url: "http://localhost:5173" });
        await login(email, senha); await clicar("Editar dados");
        await preencher('.perfilDados input[autocomplete=name]', dados.nome);
        await preencher('.perfilDados input[type=tel]', dados.telefone);
        await preencher('.perfilDados textarea', dados.biografia);
        await clicar("Salvar alterações");
        await esperar("!!document.querySelector('.perfilSucesso')"); await conferir(dados);
        await cdp("Page.reload", { ignoreCache: true });
        // A seção administrativa é estado local e reabre pelo menu após reload.
        await esperar("!!document.querySelector('.adminMenu')"); await clicar("Meu perfil");
        await esperar("!!document.querySelector('.perfilDados')"); await conferir(dados);
        await clicar("Sair"); await login(email, senha); await conferir(dados);
      },
    };
  } catch (erro) { await fechar(); throw erro; }
}
module.exports = { criarNavegador };
