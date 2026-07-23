// Recebe uma linha do Excel Online enviada pelo Power Automate.
// A credencial privilegiada e a chave da integração existem apenas no servidor.
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  isBlankControleEstoqueRow,
  normalizeControleEstoquePayload,
  PayloadError,
  type ControleEstoquePayload,
} from "../_shared/controle-estoque-payload.ts";

type Pedido = {
  id: string;
  numero: string;
  fornecedor: string | null;
  local: string | null;
  quantidade_dormentes: number | null;
};
type Database = {
  public: {
    Tables: {
      pedidos: {
        Row: Pedido;
        Insert: {
          numero: string;
          fornecedor?: string | null;
          local?: string | null;
          quantidade_dormentes?: number | null;
          ativo?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["pedidos"]["Insert"]>;
        Relationships: [];
      };
      registros: {
        Row: {
          id: string;
          excel_id: string | null;
          data_ref: string | null;
          semana: number | null;
          fiscal: string | null;
          fornecedor: string;
          local: string | null;
          pedido: string;
          pedido_id: string;
          vol_pedido: number;
          vol_fabricar: number;
          vol_pronto: number;
          vol_inspecionado: number;
          vol_liberado: number;
          vol_transportado: number;
          updated_at: string;
        };
        Insert: {
          excel_id?: string | null;
          origem_integracao?: string | null;
          integrado_em?: string | null;
          data_ref?: string | null;
          semana?: number | null;
          fiscal?: string | null;
          fornecedor: string;
          local?: string | null;
          pedido: string;
          pedido_id: string;
          vol_pedido?: number;
          vol_fabricar?: number;
          vol_pronto?: number;
          vol_inspecionado?: number;
          vol_liberado?: number;
          vol_transportado?: number;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["registros"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      registrar_atualizacao_integracao: {
        Args: {
          p_acao: "created" | "updated" | "unchanged" | "skipped" | "error";
          p_excel_id?: string | null;
          p_registro_id?: string | null;
          p_pedido?: string | null;
          p_fornecedor?: string | null;
          p_fiscal?: string | null;
          p_campos_alterados?: Record<string, FieldChange>;
          p_dados?: Record<string, unknown>;
          p_mensagem?: string | null;
          p_chave_execucao?: string | null;
          p_recebido_em?: string;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
type AdminClient = ReturnType<typeof createClient<Database>>;
type RegistroRow = Database["public"]["Tables"]["registros"]["Row"];
type RegistroInsert = Database["public"]["Tables"]["registros"]["Insert"];
type IntegrationAction = "created" | "updated" | "unchanged" | "skipped" | "error";
type FieldChange = { label: string; before: unknown; after: unknown };

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const TRACKED_FIELDS: Array<{
  key: keyof RegistroInsert;
  label: string;
  numeric?: boolean;
}> = [
  { key: "data_ref", label: "Data" },
  { key: "semana", label: "Semana", numeric: true },
  { key: "fiscal", label: "Fiscal" },
  { key: "fornecedor", label: "Fornecedor" },
  { key: "local", label: "Local" },
  { key: "pedido", label: "Pedido" },
  { key: "vol_pedido", label: "Volume do pedido", numeric: true },
  { key: "vol_fabricar", label: "Volume a ser fabricado", numeric: true },
  { key: "vol_pronto", label: "Volume fabricado", numeric: true },
  { key: "vol_inspecionado", label: "Volume inspecionado", numeric: true },
  { key: "vol_liberado", label: "Volume em estoque para entrega", numeric: true },
  { key: "vol_transportado", label: "Volume transportado", numeric: true },
];

function json(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function secureEquals(received: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(received);
  const right = encoder.encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function serverDatabaseKey(): string | null {
  const currentKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (currentKeys) {
    try {
      const parsed = JSON.parse(currentKeys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // Em projetos legados, usa a variável abaixo.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

function rawValue(body: unknown, field: string): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>)[field];
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function comparable(value: unknown, numeric = false): string | number | null {
  if (numeric) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function changedFields(previous: RegistroRow, row: RegistroInsert): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  for (const field of TRACKED_FIELDS) {
    const before = comparable(previous[field.key as keyof RegistroRow], field.numeric);
    const after = comparable(row[field.key], field.numeric);
    if (before !== after) {
      changes[String(field.key)] = { label: field.label, before, after };
    }
  }
  return changes;
}

async function recordIntegrationHistory(
  admin: AdminClient,
  action: IntegrationAction,
  options: {
    body?: unknown;
    payload?: ControleEstoquePayload;
    registroId?: string | null;
    changes?: Record<string, FieldChange>;
    message?: string | null;
    runId?: string | null;
    receivedAt?: string;
  } = {},
): Promise<void> {
  const payload = options.payload;
  const body = options.body;
  const { error } = await admin.rpc("registrar_atualizacao_integracao", {
    p_acao: action,
    p_excel_id: payload?.excel_id ?? rawValue(body, "excel_id"),
    p_registro_id: options.registroId ?? null,
    p_pedido: payload?.pedido ?? rawValue(body, "pedido"),
    p_fornecedor: payload?.fornecedor ?? rawValue(body, "fornecedor"),
    p_fiscal: payload?.fiscal ?? rawValue(body, "fiscal"),
    p_campos_alterados: options.changes ?? {},
    p_dados: payload ? { ...payload } : {},
    p_mensagem: options.message ?? null,
    p_chave_execucao: options.runId ?? null,
    p_recebido_em: options.receivedAt ?? new Date().toISOString(),
  });
  if (error) console.error("Falha ao registrar histórico da atualização:", error.message);
}

async function findOrCreatePedido(
  admin: AdminClient,
  payload: ControleEstoquePayload,
): Promise<Pedido> {
  let query = admin.from("pedidos")
    .select("id, numero, fornecedor, local, quantidade_dormentes")
    .eq("numero", payload.pedido);

  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) throw new Error(`Falha ao localizar o pedido: ${findError.message}`);
  if (existing) return existing as Pedido;

  // A tabela pedidos permanece apenas como vínculo técnico. Nenhum valor dela
  // substitui as informações operacionais recebidas do Excel.
  const masterRow = {
    numero: payload.pedido,
    fornecedor: payload.fornecedor,
    local: payload.local,
    quantidade_dormentes: Number.isInteger(payload.vol_pedido) && payload.vol_pedido > 0
      ? payload.vol_pedido
      : null,
    ativo: true,
    created_by: null,
  };
  const { data: created, error: insertError } = await admin.from("pedidos")
    .insert(masterRow)
    .select("id, numero, fornecedor, local, quantidade_dormentes")
    .single();
  if (!insertError && created) return created as Pedido;

  // Duas execuções paralelas podem tentar criar o mesmo número. A segunda
  // recupera o registro criado pela primeira e segue normalmente.
  if (insertError?.code === "23505") {
    const { data: raced, error: racedError } = await admin.from("pedidos")
      .select("id, numero, fornecedor, local, quantidade_dormentes")
      .eq("numero", payload.pedido)
      .single();
    if (!racedError && raced) return raced as Pedido;
  }
  throw new Error(`Falha ao cadastrar o pedido: ${insertError?.message ?? "erro desconhecido"}`);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Método não permitido. Use POST." }, 405, { Allow: "POST" });
  }

  const integrationKey = Deno.env.get("POWER_AUTOMATE_INTEGRATION_KEY");
  const databaseKey = serverDatabaseKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!integrationKey || !databaseKey || !supabaseUrl) {
    console.error("Secrets obrigatórios da integração não estão configurados.");
    return json({ error: "Integração não configurada no servidor." }, 500);
  }

  const receivedKey = req.headers.get("x-integration-key") ?? "";
  if (!secureEquals(receivedKey, integrationKey)) {
    return json({ error: "Credencial de integração inválida." }, 401);
  }

  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return json({ error: "Content-Type deve ser application/json." }, 415);
  }

  const admin = createClient<Database>(supabaseUrl, databaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const receivedAt = new Date().toISOString();
  const runId = req.headers.get("x-integration-run-id");
  let body: unknown;
  try {
    try {
      body = await req.json();
    } catch {
      await recordIntegrationHistory(admin, "error", {
        message: "JSON inválido.",
        runId,
        receivedAt,
      });
      return json({ error: "JSON inválido." }, 400);
    }
    if (isBlankControleEstoqueRow(body)) {
      await recordIntegrationHistory(admin, "skipped", {
        body,
        message: "Linha sem fornecedor ou pedido.",
        runId,
        receivedAt,
      });
      return json({ ok: true, action: "skipped", reason: "Linha sem fornecedor ou pedido." });
    }
    const payload = normalizeControleEstoquePayload(body);
    const pedido = await findOrCreatePedido(admin, payload);

    const { data: previous, error: previousError } = await admin.from("registros")
      .select(
        "id, excel_id, data_ref, semana, fiscal, fornecedor, local, pedido, pedido_id, " +
          "vol_pedido, vol_fabricar, vol_pronto, vol_inspecionado, vol_liberado, " +
          "vol_transportado, updated_at",
      )
      .eq("excel_id", payload.excel_id)
      .maybeSingle();
    if (previousError) throw new Error(`Falha ao verificar o registro: ${previousError.message}`);

    const row: RegistroInsert = {
      excel_id: payload.excel_id,
      origem_integracao: "power_automate_excel",
      integrado_em: new Date().toISOString(),
      data_ref: payload.data_ref,
      semana: payload.semana,
      fiscal: payload.fiscal,
      fornecedor: payload.fornecedor,
      local: payload.local,
      pedido: payload.pedido,
      pedido_id: pedido.id,
      vol_pedido: payload.vol_pedido,
      vol_fabricar: payload.vol_fabricar,
      vol_pronto: payload.vol_pronto,
      vol_inspecionado: payload.vol_inspecionado,
      vol_liberado: payload.vol_liberado,
      vol_transportado: payload.vol_transportado,
      created_by: null,
    };
    const changes = previous ? changedFields(previous as RegistroRow, row) : {};
    const action: IntegrationAction = previous
      ? (Object.keys(changes).length ? "updated" : "unchanged")
      : "created";
    const { data: saved, error: saveError } = await admin.from("registros")
      .upsert(row, { onConflict: "excel_id" })
      .select("id, excel_id, pedido, pedido_id, updated_at")
      .single();
    if (saveError) throw new Error(`Falha ao gravar o controle de estoque: ${saveError.message}`);

    await recordIntegrationHistory(admin, action, {
      payload,
      registroId: saved.id,
      changes,
      runId,
      receivedAt,
    });

    return json({
      ok: true,
      action,
      registro: saved,
    }, action === "created" ? 201 : 200);
  } catch (error) {
    if (error instanceof PayloadError) {
      await recordIntegrationHistory(admin, "error", {
        body,
        message: error.message,
        runId,
        receivedAt,
      });
      return json({ error: error.message, field: error.field }, 400);
    }
    console.error(error);
    await recordIntegrationHistory(admin, "error", {
      body,
      message: error instanceof Error ? error.message : "Erro interno desconhecido.",
      runId,
      receivedAt,
    });
    return json({ error: "Não foi possível processar o registro." }, 500);
  }
});
