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

test("normaliza uma linha da programação semanal", async () => {
  const { normalizeProgramacaoSemanalPayload } = await import(pathToFileURL(payloadModule));
  const payload = normalizeProgramacaoSemanalPayload({
    excel_id: " PROG-001 ",
    ano: "2026",
    semana: "31",
    fiscal: " Walter ",
    fornecedor: " Três Guri ",
    local: " Marcelândia ",
    expectativa_pecas: "1.250",
    observacoes: " Prioridade alta "
  });

  assert.deepEqual(payload, {
    excel_id: "PROG-001",
    ano: 2026,
    semana: 31,
    fiscal: "Walter",
    fornecedor: "Três Guri",
    local: "Marcelândia",
    expectativa_pecas: 1250,
    observacoes: "Prioridade alta"
  });
});

test("rejeita programação sem identificação ou com período inválido", async () => {
  const { normalizeProgramacaoSemanalPayload, ProgramacaoPayloadError } =
    await import(pathToFileURL(payloadModule));
  const base = {
    excel_id: "PROG-1",
    ano: 2026,
    semana: 31,
    fiscal: "Fiscal",
    local: "Local",
    expectativa_pecas: 100
  };

  assert.throws(
    () => normalizeProgramacaoSemanalPayload({ ...base, excel_id: "" }),
    (error) => error instanceof ProgramacaoPayloadError && error.field === "excel_id"
  );
  assert.throws(
    () => normalizeProgramacaoSemanalPayload({ ...base, semana: 54 }),
    (error) => error instanceof ProgramacaoPayloadError && error.field === "semana"
  );
});

test("integração faz upsert seguro pelo ID da linha do Excel", () => {
  const migration = read(
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

  assert.match(migration, /unique \(excel_id\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /using \(\(select public\.has_full_access\(\)\)\)/);
  assert.match(migration, /grant select on table public\.programacao_semanal to authenticated/i);
  assert.match(fn, /POWER_AUTOMATE_INTEGRATION_KEY/);
  assert.match(fn, /x-integration-key/);
  assert.match(fn, /upsert\(row, \{ onConflict: "excel_id" \}\)/);
  assert.match(config, /\[functions\.receber-programacao-semanal\][\s\S]*verify_jwt = false/);
});

test("site possui a página mural Programação Semanal", () => {
  const html = read("index.html");
  const app = read("assets", "js", "app.js");
  const page = read("assets", "js", "programacao-semanal.js");

  assert.match(html, /href="#programacao-semanal"[^>]+data-view="programacao-semanal"/);
  assert.match(html, /id="view-programacao-semanal"[\s\S]*?<h1>Programação Semanal<\/h1>/);
  for (const filter of ["ano", "semana", "fiscal", "fornecedor", "local"]) {
    assert.match(html, new RegExp(`id="programacao-${filter}"`));
  }
  assert.match(app, /"programacao-semanal": document\.getElementById\("view-programacao-semanal"\)/);
  assert.match(page, /from\("programacao_semanal"\)/);
  assert.match(page, /programacao-card__expectativa/);
  assert.match(page, /expectativa_pecas/);
});

test("documentação mostra o segundo loop do Power Automate", () => {
  const docs = read("docs", "POWER_AUTOMATE_PROGRAMACAO_SEMANAL.md");
  assert.match(docs, /tbProgramacaoSemanal/);
  assert.match(docs, /receber-programacao-semanal/);
  assert.match(docs, /x-integration-key/);
  assert.match(docs, /"excel_id": "@\{item\(\)\?\['ID Programação'\]\}"/);
  assert.match(docs, /segundo \*\*Aplicar a cada\*\*/);
});
