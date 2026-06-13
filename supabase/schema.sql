-- Bolão da Família · Copa 2026
-- Execute no editor SQL do Supabase (Dashboard > SQL Editor)
-- Rode este arquivo apenas se precisar criar o banco do zero.

create table if not exists public.kv (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);

-- Habilitar RLS
alter table public.kv enable row level security;

-- Políticas públicas (acesso controlado pelo código da aplicação)
create policy "kv_public_select" on public.kv
  for select using (true);

create policy "kv_public_insert" on public.kv
  for insert with check (true);

create policy "kv_public_update" on public.kv
  for update using (true) with check (true);

create policy "kv_public_delete" on public.kv
  for delete using (true);

-- Índice para buscas por prefixo (store.list)
create index if not exists kv_key_prefix_idx on public.kv (key text_pattern_ops);

-- ------------------------------------------------------------
-- Estrutura dos valores (JSON armazenado em "value"):
--
-- Chave "pred:{player_id}"  →  palpite de um jogador
-- {
--   "id": "p_tia-sonia",
--   "name": "Tia Sônia",
--   "scores": {
--     "g1": { "h": 2, "a": 0 },
--     "g2": { "h": 3, "a": 1 },
--     "g3": { "h": 0, "a": 1 }
--   },
--   "classified": ["BRA", "MAR"],           -- 2 times que vão avançar
--   "brazilGoals": 7,                       -- total de gols do Brasil
--   "scorers": {
--     "g1": ["Vinícius Jr.", "Rodrygo"],    -- array de até 3 goleadores por jogo
--     "g2": ["Endrick"],
--     "g3": []
--   },
--   "updatedAt": 1718308800000
-- }
--
-- Chave "results"  →  resultados oficiais (organizador)
-- {
--   "g1": { "h": 2, "a": 0 },
--   "g2": { "h": 3, "a": 1 },
--   "g3": { "h": 0, "a": 1 },
--   "classified": ["BRA", "MAR"],           -- 2 classificados oficiais
--   "brazilGoals": 5,                       -- total de gols oficial
--   "scorers": {
--     "g1": ["Vinícius Jr.", "Rodrygo"],    -- lista de goleadores por jogo
--     "g2": ["Endrick"],
--     "g3": []
--   }
-- }
-- ------------------------------------------------------------
