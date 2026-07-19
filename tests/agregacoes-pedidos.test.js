const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appPath = path.join(__dirname, "..", "assets", "js", "app.js");
const source = fs.readFileSync(appPath, "utf8").split("/* =====================================================================\n   (2) REGISTROS")[0];
const orders = {
  "order-a": { id: "order-a", numero: "100", quantidade: 1000 },
  "order-b": { id: "order-b", numero: "200", quantidade: 500 }
};
const sandbox = {
  window: {
    Padroes: {
      pedidoDetails: (numero) => Object.values(orders).find((order) => order.numero === String(numero)) || null,
      pedidoPorId: (id) => orders[id] || null
    }
  },
  console
};

vm.runInNewContext(source, sandbox, { filename: appPath });
const Store = sandbox.window.Store;
const records = [
  { id: "r1", pedidoId: "order-a", pedido: "100", fornecedor: "Fornecedor A", dataRef: "2026-07-20", volPedido: 1000, volPronto: 120, volInspecionado: 100, volTransportado: 40 },
  { id: "r2", pedidoId: "order-a", pedido: "100", fornecedor: "Fornecedor A", dataRef: "2026-07-20", volPedido: 9999, volPronto: 180, volInspecionado: 150, volTransportado: 60 },
  { id: "r3", pedidoId: "order-a", pedido: "100", fornecedor: "Fornecedor A", dataRef: "2026-07-21", volPedido: 1000, volPronto: 200, volInspecionado: 170, volTransportado: 90 },
  { id: "r4", pedidoId: "order-b", pedido: "200", fornecedor: "Fornecedor B", dataRef: "2026-07-21", volPedido: 500, volPronto: 80, volInspecionado: 70, volTransportado: 50 }
];

assert.equal(Store.totalPedidos(records), 1500, "o total de cada pedido deve entrar uma única vez");
assert.equal(Store.sumStage(records, "volPronto"), 580, "os movimentos diários fabricados devem ser somados");
assert.equal(Store.sumStage(records, "volInspecionado"), 490, "os movimentos diários inspecionados devem ser somados");
assert.equal(Store.sumStage(records, "volTransportado"), 240, "os movimentos diários transportados devem ser somados");

const byOrder = Store.pedidoVsTransportado(records, "pedido");
const orderA = byOrder.find((item) => item.label === "100");
assert.deepEqual(
  { total: orderA.pedido, fabricado: orderA.fabricado, inspecionado: orderA.inspecionado, transportado: orderA.transportado, saldo: orderA.saldo },
  { total: 1000, fabricado: 500, inspecionado: 420, transportado: 190, saldo: 810 }
);

const history = Store.cumulativeTransported(records);
assert.equal(history.length, 2, "vários registros do mesmo dia devem formar um único ponto diário");
assert.deepEqual(Array.from(history, (item) => item.total), [100, 240]);

console.log("Agregações de pedidos validadas com sucesso.");
