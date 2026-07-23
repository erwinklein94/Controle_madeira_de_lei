const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const html = read("index.html");
const app = read("assets", "js", "app.js");
const page = read("assets", "js", "historico-atualizacoes.js");
const edge = read("supabase", "functions", "receber-controle-estoque", "index.ts");
const migration = read(
  "supabase",
  "migrations",
  "20260723142736_criar_historico_atualizacoes_integracao.sql"
);

test("Histórico de Atualizações aparece abaixo de Registros e possui sua própria rota", () => {
  const recordsPosition = html.indexOf('href="#registros" data-view="registros"');
  const historyPosition = html.indexOf('href="#historico-atualizacoes" data-view="historico-atualizacoes"');
  const supplierInfoPosition = html.indexOf('href="#pendentes" data-view="pendentes"');

  assert.ok(recordsPosition >= 0);
  assert.ok(historyPosition > recordsPosition);
  assert.ok(historyPosition < supplierInfoPosition);
  assert.match(html, /id="view-historico-atualizacoes"/);
  assert.match(html, /Atualização automática a cada 1 hora/);
  assert.match(html, /id="historico-kpis"/);
  assert.match(html, /id="historico-lista"/);
  assert.match(html, /assets\/js\/historico-atualizacoes\.js\?v=historico-integracao-1/);
  assert.match(app, /"historico-atualizacoes": document\.getElementById/);
  assert.match(app, /window\.HistoricoAtualizacoesUI\.render/);
});

test("página explica linhas novas, alteradas, iguais, ignoradas e com erro", () => {
  for (const action of ["created", "updated", "unchanged", "skipped", "error"]) {
    assert.match(page, new RegExp(`${action}:`));
  }
  assert.match(page, /\.from\("integracao_atualizacoes"\)/);
  assert.match(page, /\.from\("integracao_atualizacoes_itens"\)/);
  assert.match(page, /campos_alterados/);
  assert.match(page, /O histórico começa a partir desta implantação/);
});

test("banco agrupa eventos por hora com RLS e função restrita ao service role", () => {
  assert.match(migration, /create table if not exists public\.integracao_atualizacoes/i);
  assert.match(migration, /create table if not exists public\.integracao_atualizacoes_itens/i);
  assert.match(migration, /date_trunc\('hour', p_recebido_em\)/i);
  assert.match(migration, /using \(\(select public\.has_full_access\(\)\)\)/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to anon/i);
});

test("Edge Function classifica alterações e grava o resultado da integração", () => {
  assert.match(edge, /function changedFields/);
  assert.match(edge, /recordIntegrationHistory\(admin, action/);
  assert.match(edge, /"unchanged"/);
  assert.match(edge, /x-integration-run-id/);
  assert.match(edge, /registrar_atualizacao_integracao/);
});
