const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("fornecedor possui página separada Contato com a Rumo", () => {
  const html = read("index.html");
  const access = read("assets", "js", "access-control.js");
  const app = read("assets", "js", "app.js");

  assert.match(html, /href="#contato-rumo"[^>]+data-view="contato-rumo"[^>]+data-supplier-nav/);
  assert.match(html, /id="view-contato-rumo"[\s\S]*?<h1>Contato com a Rumo<\/h1>/);
  assert.ok(html.indexOf('id="forncom-form"') > html.indexOf('id="view-contato-rumo"'));
  assert.ok(html.indexOf('id="forncom-form"') > html.indexOf('id="view-fornecedor"'));
  assert.match(access, /view === "fornecedor" \|\| view === "contato-rumo"/);
  assert.match(app, /"contato-rumo": document\.getElementById\("view-contato-rumo"\)/);
  assert.match(app, /view === "contato-rumo" && window\.FornComentariosUI/);
});

test("equipe escolhe uma conta de fornecedor como destinatária", () => {
  const html = read("index.html");
  const source = read("assets", "js", "comentarios.js");

  assert.match(html, /Fornecedor destinatário/);
  assert.match(html, /Enviar ao fornecedor/);
  assert.match(source, /from\("profiles"\)\.select\("fornecedor"\)\.eq\("role", "fornecedor"\)/);
  assert.match(source, /chaveTexto\(r\.fornecedor\) === fornKey/);
  assert.match(source, /\["Geral"\]\.concat/);
});

test("fornecedor consulta apenas a própria conversa", () => {
  const source = read("assets", "js", "comentarios.js");
  const sql = read("supabase", "comentarios.sql");

  assert.match(source, /listarComentarios\(fornecedor\)/);
  assert.match(source, /query = query\.eq\("fornecedor", fornecedor\)/);
  assert.match(sql, /for select to authenticated using[\s\S]*fornecedor = \(select public\.current_fornecedor\(\)\)/);
  assert.match(sql, /for insert to authenticated with check[\s\S]*fornecedor = \(select public\.current_fornecedor\(\)\)/);
});
