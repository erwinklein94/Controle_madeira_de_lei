const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("centraliza cabeçalhos e células de todas as tabelas", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "assets", "css", "style.css"), "utf8");

  assert.match(css, /table th,\s*table td\s*\{\s*text-align:\s*center\s*!important;/);
});
