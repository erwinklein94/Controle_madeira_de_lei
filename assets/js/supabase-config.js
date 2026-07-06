/* =====================================================================
   Supabase — cliente do projeto.
   As chaves abaixo são PÚBLICAS (anon): podem ficar no front-end, pois o
   acesso real aos dados é controlado por RLS no banco.
   ===================================================================== */
(function (global) {
  "use strict";

  var SUPABASE_URL = "https://rgafzmmnpjlrxfjkabsl.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnYWZ6bW1ucGpscnhmamthYnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNDgxNjksImV4cCI6MjA5ODkyNDE2OX0.Bbfo1pKIfW8RPUiX5T_Q3qnBDW2rT65hfwuG0v1oYVI";

  if (!global.supabase || !global.supabase.createClient) {
    console.error("supabase-js não carregou (verifique a conexão/CDN).");
    return;
  }

  global.sbClient = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})(window);
