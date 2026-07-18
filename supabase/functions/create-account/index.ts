// Edge Function: create-account - cria contas dos cinco perfis.
// A service role permanece somente no servidor.
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const FULL_ROLES = ["editor", "coordenador", "analista", "admin"];
const VALID_ROLES = ["editor", "coordenador", "analista", "fiscal", "fornecedor"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Não autenticado." }, 401);

    const { data: caller, error: callerErr } = await admin.from("profiles")
      .select("role, nome").eq("id", userData.user.id).maybeSingle();
    if (callerErr) return json({ error: "Falha ao ler o perfil do solicitante: " + callerErr.message }, 500);
    if (!caller || !FULL_ROLES.includes(caller.role)) {
      return json({ error: "Apenas Editor, Coordenador ou Analista podem criar contas." }, 403);
    }

    const { email, password, role, nome, fornecedor, fiscal } = await req.json();
    if (!email || !password) return json({ error: "Informe e-mail e senha." }, 400);
    if (String(password).length < 6) return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);
    if (!VALID_ROLES.includes(role)) return json({ error: "Perfil inválido." }, 400);
    if (role === "fornecedor" && !fornecedor) return json({ error: "Informe o nome do fornecedor." }, 400);
    if (role === "fiscal" && !fiscal) return json({ error: "Vincule a conta a um Fiscal/Inspetor." }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createErr) return json({ error: createErr.message }, 400);

    const profile = {
      id: created.user.id,
      role,
      nome: nome || (role === "fornecedor" ? fornecedor : role === "fiscal" ? fiscal : email),
      fornecedor: role === "fornecedor" ? fornecedor : null,
      fiscal: role === "fiscal" ? fiscal : null,
    };
    const { error: profileErr } = await admin.from("profiles").insert(profile);
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "Erro ao criar o perfil: " + profileErr.message }, 400);
    }

    // Nunca registra a senha. O log guarda apenas identidade e perfil criados.
    await admin.from("audit_logs").insert({
      actor_id: userData.user.id,
      actor_email: userData.user.email,
      actor_role: caller.role === "admin" ? "editor" : caller.role,
      actor_name: caller.nome,
      action: "INSERT",
      entity: "contas",
      record_id: created.user.id,
      new_data: { email, role, nome: profile.nome, fornecedor: profile.fornecedor, fiscal: profile.fiscal },
      summary: "Conta criada",
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      user_agent: req.headers.get("user-agent"),
    });

    return json({ ok: true, id: created.user.id });
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});
