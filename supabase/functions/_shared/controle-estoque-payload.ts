export type ControleEstoquePayload = {
  excel_id: string;
  data_ref: string | null;
  semana: number | null;
  fiscal: string | null;
  fornecedor: string;
  local: string | null;
  pedido: string;
  pedido_id: string | null;
  vol_pedido: number;
  vol_fabricar: number;
  vol_pronto: number;
  vol_inspecionado: number;
  vol_liberado: number;
  vol_transportado: number;
};

export class PayloadError extends Error {
  field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "PayloadError";
    this.field = field;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_BR_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const VOLUME_FIELDS = [
  "vol_pedido",
  "vol_fabricar",
  "vol_pronto",
  "vol_inspecionado",
  "vol_liberado",
  "vol_transportado",
] as const;

function textValue(
  source: Record<string, unknown>,
  field: string,
  options: { required?: boolean; maxLength?: number } = {},
): string | null {
  const raw = source[field];
  const value = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!value) {
    if (options.required) throw new PayloadError(field, `O campo ${field} é obrigatório.`);
    return null;
  }
  if (value.length > (options.maxLength ?? 500)) {
    throw new PayloadError(field, `O campo ${field} excede o tamanho permitido.`);
  }
  return value;
}

function volumeValue(source: Record<string, unknown>, field: string): number {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === "") return 0;

  let normalized: string | number = raw as string | number;
  if (typeof raw === "string") {
    normalized = raw.trim().replace(/\s/g, "");
    const comma = normalized.lastIndexOf(",");
    const dot = normalized.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
      normalized = comma > dot
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
    } else if (comma >= 0) {
      normalized = normalized.replace(",", ".");
    }
  }
  const value = typeof normalized === "number" ? normalized : Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    throw new PayloadError(field, `O campo ${field} deve ser um número maior ou igual a zero.`);
  }
  return value;
}

function dateValue(source: Record<string, unknown>): string | null {
  const raw = source.data_ref;
  if (raw === undefined || raw === null || raw === "") return null;
  const value = String(raw).trim();
  if (!value) return null;

  // O conector do Excel pode entregar a data como número serial.
  if (/^\d+(?:[.,]\d+)?$/.test(value)) {
    const serial = Number(value.replace(",", "."));
    if (Number.isFinite(serial) && serial > 0 && serial < 2958466) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
      return date.toISOString().slice(0, 10);
    }
  }

  const br = value.match(DATE_BR_PATTERN);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : value.slice(0, 10);
  if (!DATE_PATTERN.test(iso)) {
    throw new PayloadError("data_ref", "O campo data_ref deve conter uma data válida.");
  }
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
    throw new PayloadError("data_ref", "O campo data_ref contém uma data inválida.");
  }
  return iso;
}

function weekValue(source: Record<string, unknown>): number | null {
  const raw = source.semana;
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(String(raw).trim().replace(",", "."));
  if (!Number.isInteger(value) || value < 1 || value > 53) {
    throw new PayloadError("semana", "O campo semana deve ser um número inteiro entre 1 e 53.");
  }
  return value;
}

export function isBlankControleEstoqueRow(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const source = body as Record<string, unknown>;
  const fornecedor = source.fornecedor == null ? "" : String(source.fornecedor).trim();
  const pedido = source.pedido == null ? "" : String(source.pedido).trim();
  return !fornecedor || fornecedor === "0" || !pedido || pedido === "0";
}

export function normalizeControleEstoquePayload(body: unknown): ControleEstoquePayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PayloadError("body", "O corpo deve ser um objeto JSON.");
  }
  const source = body as Record<string, unknown>;
  const pedidoId = textValue(source, "pedido_id", { maxLength: 36 });
  if (pedidoId && !UUID_PATTERN.test(pedidoId)) {
    throw new PayloadError("pedido_id", "O campo pedido_id deve ser um UUID válido.");
  }

  const payload: ControleEstoquePayload = {
    excel_id: textValue(source, "excel_id", { required: true, maxLength: 200 })!,
    data_ref: dateValue(source),
    semana: weekValue(source),
    fiscal: textValue(source, "fiscal", { maxLength: 200 }),
    fornecedor: textValue(source, "fornecedor", { required: true, maxLength: 200 })!,
    local: textValue(source, "local", { maxLength: 200 }),
    pedido: textValue(source, "pedido", { required: true, maxLength: 100 })!,
    pedido_id: pedidoId,
    vol_pedido: 0,
    vol_fabricar: 0,
    vol_pronto: 0,
    vol_inspecionado: 0,
    vol_liberado: 0,
    vol_transportado: 0,
  };

  for (const field of VOLUME_FIELDS) payload[field] = volumeValue(source, field);
  return payload;
}
