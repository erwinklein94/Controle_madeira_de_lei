const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const payloadModule = path.join(
  root,
  "supabase",
  "functions",
  "_shared",
  "programacao-semanal-payload.ts"
);

test("normaliza as colunas da programação e calcula a semana pela Data Início", async () => {
  const { normalizeProgramacaoSemanalPayload } = await import(pathToFileURL(payloadModule));
  const payload = normalizeProgramacaoSemanalPayload({
    excel_id: " PROG-001 ",
    fornecedor: " Três Guri ",
    pedido: " 4502044120 ",
    fiscal: " Walter ",
    data_inicio: "27/07/2026",
    data_fim: "31/07/2026",
    qtde_pecas: "1.250",
    status: " Planejado ",
    observacoes: " Prioridade alta "
  });

  assert.deepEqual(payload, {
    excel_id: "PROG-001",
    ano: 2026,
    semana: 31,
    fornecedor: "Três Guri",
    pedido: "4502044120",
    fiscal: "Walter",
    data_inicio: "2026-07-27",
    data_fim: "2026-07-31",
    qtde_pecas: 1250,
    status: "Planejado",
    observacoes: "Prioridade alta"
  });
});

test("aceita número serial do Excel nas datas", async () => {
  const { normalizeProgramacaoSemanalPayload } = await import(pathToFileURL(payloadModule));
  const payload = normalizeProgramacaoSemanalPayload({
    excel_id: "PROG-2",
    fornecedor: "Fornecedor",
    pedido: "Pedido",
    fiscal: "Fiscal",
    data_inicio: 46230,
    data_fim: 46231,
    qtde_pecas: 100,
    status: "Planejado"
  });
  assert.match(payload.data_inicio, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(payload.data_fim, /^\d{4}-\d{2}-\d{2}$/);
});

test("rejeita programação sem ID ou com Data Fim anterior", async () => {
  const { normalizeProgramacaoSemanalPayload, ProgramacaoPayloadError } =
    await import(pathToFileURL(payloadModule));
  const base = {
    excel_id: "PROG-1",
    fornecedor: "Fornecedor",
    pedido: "Pedido",
    fiscal: "Fiscal",
    data_inicio: "31/07/2026",
    data_fim: "31/07/2026",
    qtde_pecas: 100,
    status: "Planejado"
  };

  assert.throws(
    () => normalizeProgramacaoSemanalPayload({ ...base, excel_id: "" }),
    (error) => error instanceof ProgramacaoPayloadError && error.field === "excel_id"
  );
  assert.throws(
    () => normalizeProgramacaoSemanalPayload({ ...base, data_fim: "30/07/2026" }),
    (error) => error instanceof ProgramacaoPayloadError && error.field === "data_fim"
  );
});

test("integração faz upsert seguro pelo ID da linha do Excel", () => {
  const migration = read(
    "supabase",
    "migrations",
    "20260723173411_ajustar_colunas_programacao_semanal.sql"
  );
  const originalMigration = read(
    "supabase",
    "migrations",
    "20260723171146_criar_programacao_semanal.sql"
  );
  const fn = read(
    "supabase",
    "functions",
    "receber-programacao-semanal",
    "index.ts"
  );
  const config = read("supabase", "config.toml");

  assert.match(originalMigration, /unique \(excel_id\)/i);
  assert.match(originalMigration, /enable row level security/i);
  assert.match(originalMigration, /using \(\(select public\.has_full_access\(\)\)\)/);
  assert.match(originalMigration, /grant select on table public\.programacao_semanal to authenticated/i);
  for (const column of ["pedido", "data_inicio", "data_fim", "qtde_pecas", "status"]) {
    assert.match(migration, new RegExp(column));
  }
  assert.match(fn, /POWER_AUTOMATE_INTEGRATION_KEY/);
  assert.match(fn, /x-integration-key/);
  assert.match(fn, /upsert\(row, \{ onConflict: "excel_id" \}\)/);
  assert.match(config, /\[functions\.receber-programacao-semanal\][\s\S]*verify_jwt = false/);
});

test("site possui mural e tabela com as nove colunas do Excel", () => {
  const html = read("index.html");
  const app = read("assets", "js", "app.js");
  const page = read("assets", "js", "programacao-semanal.js");
  const css = read("assets", "css", "style.css");

  assert.match(html, /href="#programacao-semanal"[^>]+data-view="programacao-semanal"/);
  assert.match(html, /id="view-programacao-semanal"[\s\S]*?<h1>Programação Semanal<\/h1>/);
  for (const filter of ["ano", "semana", "fiscal", "fornecedor", "pedido", "status-filtro"]) {
    assert.match(html, new RegExp(`id="programacao-${filter}"`));
  }
  assert.match(app, /"programacao-semanal": document\.getElementById\("view-programacao-semanal"\)/);
  assert.match(page, /from\("programacao_semanal"\)/);
  for (const heading of [
    "ID", "Fornecedor", "Pedido", "Fiscal", "Data Início",
    "Data Fim", "Qtde Peças", "Status", "Observações"
  ]) {
    assert.match(page, new RegExp(heading));
  }
  assert.doesNotMatch(page, /expectativa_pecas|programacao-local/);
  assert.match(css, /\.programacao-detalhes \{[\s\S]*?margin-top: 40px;[\s\S]*?border-top: 4px solid var\(--rumo-azul-claro\)/);
  assert.match(css, /\.programacao-detalhes::before/);
  assert.match(css, /\.programacao-detalhes \.card__head \{[\s\S]*?border-bottom: 1px solid var\(--borda\)/);
});

test("documentação mostra os cabeçalhos exatos e o segundo loop do Power Automate", () => {
  const docs = read("docs", "POWER_AUTOMATE_PROGRAMACAO_SEMANAL.md");
  assert.match(docs, /tbProgramacaoSemanal/);
  assert.match(docs, /receber-programacao-semanal/);
  assert.match(docs, /x-integration-key/);
  assert.match(docs, /"excel_id": "@\{item\(\)\?\['ID'\]\}"/);
  for (const column of [
    "Fornecedor", "Pedido", "Fiscal", "Data Início", "Data Fim",
    "Qtde Peças", "Status", "Observações"
  ]) {
    assert.match(docs, new RegExp(column));
  }
  assert.match(docs, /segundo \*\*Aplicar a cada\*\*/);
});
