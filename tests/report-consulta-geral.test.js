const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("remove completamente a Consulta geral do Report dos fiscais", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "assets", "js", "report-semanal.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "assets", "css", "style.css"), "utf8");

  assert.doesNotMatch(html, /Consulta geral/i);
  assert.doesNotMatch(html, /report-history/);
  assert.doesNotMatch(script, /report-history|historyState|loadHistory|historySupplierOptions/);
  assert.doesNotMatch(css, /report-history|report-readonly/);
  assert.match(html, /id="report-fiscais"/);
});
