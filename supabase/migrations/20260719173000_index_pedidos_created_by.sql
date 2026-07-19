-- Índice da chave estrangeira usada para autoria e exclusão de contas.
create index if not exists pedidos_created_by_idx on public.pedidos(created_by);
