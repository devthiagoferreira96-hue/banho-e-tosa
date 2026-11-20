-- =====================================================================
-- BANHO E TOSA – Conferência do banco (só LÊ, não muda nada)
-- Rode no SQL Editor. Todas as linhas devem aparecer "OK".
-- Se alguma aparecer "FALTA", rode o supabase/schema.sql de novo.
-- =====================================================================
with c(item, ok) as (values
  ('Tabelas principais',             to_regclass('public.agendamentos') is not null and to_regclass('public.tutores') is not null and to_regclass('public.pets') is not null),
  ('Tabela de preços',               to_regclass('public.servicos') is not null),
  ('Caixa: despesas e fechamentos',  to_regclass('public.despesas') is not null and to_regclass('public.fechamentos_dia') is not null),
  ('Histórico com valores',          exists (select 1 from information_schema.columns where table_schema='public' and table_name='historico' and column_name='valor_total')),
  ('RLS ligado em todas as tabelas', not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity)),
  ('Trava de horário',               exists (select 1 from pg_indexes where indexname = 'agendamentos_horario_unico')),
  ('Trava do caixa fechado',         exists (select 1 from pg_trigger where tgname = 'trg_agendamento_0_caixa')),
  ('Gatilho do histórico',           exists (select 1 from pg_trigger where tgname = 'trg_agendamento_historico')),
  ('Fechar / reabrir dia',           to_regproc('public.fechar_dia') is not null and to_regproc('public.reabrir_dia') is not null),
  ('Resumo do caixa e gráficos',     to_regproc('public.resumo_caixa') is not null and to_regproc('public.contagem_entradas') is not null),
  ('Tempo real (agendamentos)',      exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='agendamentos')),
  ('Usuários com papel',             (select count(*) from public.perfis) >= 1)
)
select item, case when ok then 'OK' else 'FALTA' end as situacao from c;
