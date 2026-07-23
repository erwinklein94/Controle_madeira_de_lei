const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const payloadModule = path.join(
  root,
  "supabase",
  "functions",
  "_shared",
  "controle-estoque-payload.ts"
);

test("normaliza uma linha completa do Excel", async () => {
  const { normalizeControleEstoquePayload } = await import(pathToFileURL(payloadModule));
  const payload = normalizeControleEstoquePayload({
    excel_id: " ESTOQUE-1 ",
    data_ref: "17/07/2026",
    semana: "30",
    fiscal: " Fiscal A ",
    fornecedor: " Fornecedor A ",
    local: " Local A ",
    pedido: 4500123456,
    vol_pedido: "1.200,5",
    vol_transportado: "25,5"
  });

  assert.equal(payload.excel_id, "ESTOQUE-1");
  assert.equal(payload.pedido, "4500123456");
  assert.equal(payload.data_ref, "2026-07-17");
  assert.equal(payload.semana, 29, "a data deve prevalecer sobre uma semana incompatível");
  assert.equal(payload.vol_pedido, 1200.5);
  assert.equal(payload.vol_transportado, 25.5);
  assert.equal(payload.vol_inspecionado, 0);
});

test("aceita data serial do Excel e identifica linhas vazias", async () => {
  const { normalizeControleEstoquePayload, isBlankControleEstoqueRow } = await import(pathToFileURL(payloadModule));
  const payload = normalizeControleEstoquePayload({
    excel_id: "EST-2", data_ref: 45855, fornecedor: "Fornecedor", pedido: "P-2"
  });
  assert.match(payload.data_ref, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(payload.semana >= 1 && payload.semana <= 53);
  assert.equal(isBlankControleEstoqueRow({ excel_id: "EST-3", fornecedor: 0, pedido: 0 }), true);
});

test("rejeita identificador ausente, data inválida e volume negativo", async () => {
  const { normalizeControleEstoquePayload, PayloadError } = await import(pathToFileURL(payloadModule));
  const base = { excel_id: "X-1", fornecedor: "Fornecedor", pedido: "P-1" };

  assert.throws(
    () => normalizeControleEstoquePayload({ fornecedor: "Fornecedor", pedido: "P-1" }),
    (error) => error instanceof PayloadError && error.field === "excel_id"
  );
  assert.throws(
    () => normalizeControleEstoquePayload({ ...base, data_ref: "2026-02-30" }),
    (error) => error instanceof PayloadError && error.field === "data_ref"
  );
  assert.throws(
    () => normalizeControleEstoquePayload({ ...base, vol_pronto: -1 }),
    (error) => error instanceof PayloadError && error.field === "vol_pronto"
  );
});

test("migration e função garantem upsert idempotente sem chave no frontend", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase", "migrations", "20260722211848_integrar_controle_estoque_excel.sql"),
    "utf8"
  );
  const edgeFunction = fs.readFileSync(
    path.join(root, "supabase", "functions", "receber-controle-estoque", "index.ts"),
    "utf8"
  );
  const frontendConfig = fs.readFileSync(path.join(root, "assets", "js", "supabase-config.js"), "utf8");

  assert.match(migration, /create unique index[\s\S]*registros_excel_id_unique_idx/i);
  assert.match(edgeFunction, /upsert\(row, \{ onConflict: "excel_id" \}\)/);
  assert.match(edgeFunction, /POWER_AUTOMATE_INTEGRATION_KEY/);
  assert.doesNotMatch(frontendConfig, /SERVICE_ROLE|sb_secret_/i);
});

test("aba Registros exibe ID, Semana e todas as colunas de volume", () => {
  const source = fs.readFileSync(path.join(root, "assets", "js", "app.js"), "utf8");

  assert.match(source, /select\("id, excel_id, data_ref, semana,/);
  assert.match(source, /<th class="col-text">ID<\/th>/);
  assert.match(source, /<th>Semana<\/th>/);
  assert.match(source, /\.map\(fromDb\)\.filter\(isUsefulRecord\)/);
  assert.match(source, /filled\(rec\.fornecedor\) && filled\(rec\.pedido\)/);
  for (const field of [
    "vol_pedido",
    "vol_fabricar",
    "vol_pronto",
    "vol_inspecionado",
    "vol_liberado",
    "vol_transportado",
  ]) {
    assert.match(source, new RegExp(field));
  }
});
