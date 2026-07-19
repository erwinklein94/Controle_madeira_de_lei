# Migrations do Supabase

Esta pasta é a fonte versionada das alterações estruturais do banco a partir de 19/07/2026.

- Cada mudança nova deve entrar em um arquivo SQL com prefixo de data/hora.
- O mesmo arquivo deve ser aplicado ao projeto Supabase como uma migration.
- Scripts soltos na pasta `supabase/` são históricos e não devem receber novas alterações estruturais.
- Antes de publicar, valide constraints, RLS, funções, índices e os advisors do Supabase.
