// =====================================================================
// Edge Function: create-account — admin cria contas (admin/fornecedor).
// Deploy: Dashboard -> Edge Functions -> Deploy new function
//         Nome: create-account  ->  cole este arquivo  ->  Deploy
// A SUPABASE_SERVICE_ROLE_KEY é injetada automaticamente no ambiente;
// nunca vai para o navegador.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Quem chama precisa estar logado e ser admin.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Não autenticado." }, 401);

    const { data: profile, error: profErr } = await admin
      .from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (profErr) {
      return json({ error: "Falha ao ler o perfil do solicitante: " + profErr.message }, 500);
    }
    if (!profile || profile.role !== "admin") {
      return json({
        error: "Apenas administradores podem criar contas. (id " + userData.user.id +
          ", perfil " + (profile ? profile.role : "não encontrado") + ")",
      }, 403);
    }

    const { email, password, role, nome, fornecedor } = await req.json();
    if (!email || !password) return json({ error: "Informe e-mail e senha." }, 400);
    if (String(password).length < 6) return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);
    if (role !== "admin" && role !== "fornecedor") return json({ error: "Papel inválido." }, 400);
    if (role === "fornecedor" && !fornecedor) return json({ error: "Informe o nome do fornecedor." }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) return json({ error: createErr.message }, 400);

    const { error: profErr } = await admin.from("profiles").insert({
      id: created.user.id,
      role,
      nome: nome || (role === "fornecedor" ? fornecedor : email),
      fornecedor: role === "fornecedor" ? fornecedor : null,
    });
    if (profErr) {
      // Desfaz a conta para não deixar usuário órfão sem perfil.
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "Erro ao criar o perfil: " + profErr.message }, 400);
    }

    return json({ ok: true, id: created.user.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
