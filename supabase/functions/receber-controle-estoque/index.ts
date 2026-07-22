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
          pedido: string;
          pedido_id: string;
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
type AdminClient = ReturnType<typeof createClient<Database>>;

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

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

async function findOrCreatePedido(
  admin: AdminClient,
  payload: ControleEstoquePayload,
): Promise<Pedido> {
  let query = admin.from("pedidos")
    .select("id, numero, fornecedor, local, quantidade_dormentes");
  query = payload.pedido_id
    ? query.eq("id", payload.pedido_id)
    : query.eq("numero", payload.pedido);

  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) throw new Error(`Falha ao localizar o pedido: ${findError.message}`);
  if (existing) return existing as Pedido;

  if (payload.pedido_id) {
    throw new PayloadError("pedido_id", "O pedido_id informado não existe no Supabase.");
  }

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

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "JSON inválido." }, 400);
    }
    if (isBlankControleEstoqueRow(body)) {
      return json({ ok: true, action: "skipped", reason: "Linha sem fornecedor ou pedido." });
    }
    const payload = normalizeControleEstoquePayload(body);
    const admin = createClient<Database>(supabaseUrl, databaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const pedido = await findOrCreatePedido(admin, payload);

    const { data: previous, error: previousError } = await admin.from("registros")
      .select("id")
      .eq("excel_id", payload.excel_id)
      .maybeSingle();
    if (previousError) throw new Error(`Falha ao verificar o registro: ${previousError.message}`);

    const row = {
      excel_id: payload.excel_id,
      origem_integracao: "power_automate_excel",
      integrado_em: new Date().toISOString(),
      data_ref: payload.data_ref,
      semana: payload.semana,
      fiscal: payload.fiscal,
      fornecedor: pedido.fornecedor ?? payload.fornecedor,
      local: pedido.local ?? payload.local,
      pedido: pedido.numero,
      pedido_id: pedido.id,
      vol_pedido: pedido.quantidade_dormentes ?? payload.vol_pedido,
      vol_fabricar: payload.vol_fabricar,
      vol_pronto: payload.vol_pronto,
      vol_inspecionado: payload.vol_inspecionado,
      vol_liberado: payload.vol_liberado,
      vol_transportado: payload.vol_transportado,
      created_by: null,
    };
    const { data: saved, error: saveError } = await admin.from("registros")
      .upsert(row, { onConflict: "excel_id" })
      .select("id, excel_id, pedido, pedido_id, updated_at")
      .single();
    if (saveError) throw new Error(`Falha ao gravar o controle de estoque: ${saveError.message}`);

    return json({
      ok: true,
      action: previous ? "updated" : "created",
      registro: saved,
    }, previous ? 200 : 201);
  } catch (error) {
    if (error instanceof PayloadError) {
      return json({ error: error.message, field: error.field }, 400);
    }
    console.error(error);
    return json({ error: "Não foi possível processar o registro." }, 500);
  }
});
