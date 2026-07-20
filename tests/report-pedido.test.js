const assert = require("node:assert/strict");

global.window = global;
global.document = { getElementById: () => null };

const standards = [
  { id: "f1", categoria: "fornecedor", valor: "Fornecedor A", created_at: "2026-07-20", updated_at: "2026-07-20" },
  { id: "l1", categoria: "local", valor: "Local A", created_at: "2026-07-20", updated_at: "2026-07-20" }
];
const orders = [];
let insertedPayload = null;

function result(data) {
  return { then: (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject) };
}

function table(name) {
  return {
    select() {
      const rows = name === "padroes" ? standards : orders;
      return {
        eq() { return this; },
        order() { return result(rows.slice()); }
      };
    },
    insert(payload) {
      insertedPayload = payload;
      orders.push({
        id: "pedido-1",
        numero: payload.numero,
        fornecedor: payload.fornecedor,
        local: payload.local,
        quantidade_dormentes: payload.quantidade_dormentes,
        ativo: true,
        created_at: "2026-07-20",
        updated_at: "2026-07-20"
      });
      return { select: () => result([{ id: "pedido-1" }]) };
    }
  };
}

window.sbClient = { from: table };
require("../assets/js/padroes.js");

(async function () {
  await window.Padroes.load();
  const created = await window.Padroes.criarPedido({
    numero: " 4500123456 ",
    fornecedor: "Fornecedor A",
    local: "Local A",
    quantidade_dormentes: 1250
  });

  assert.deepEqual(insertedPayload, {
    numero: "4500123456",
    fornecedor: "Fornecedor A",
    local: "Local A",
    quantidade_dormentes: 1250,
    ativo: true
  });
  assert.deepEqual(created, {
    id: "pedido-1",
    numero: "4500123456",
    fornecedor: "Fornecedor A",
    local: "Local A",
    quantidade: 1250
  });
  assert.equal(window.Padroes.pedidos("", true).length, 1);
  console.log("Cadastro de pedido pelo Report validado com sucesso.");
})().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
