-- =====================================================================
-- BANHO E TOSA – atualização v2: limite e formato dos nomes
--   Nome do tutor: até 100 letras.  Nome do animal: até 50 letras.
--   Só letras (com acento), espaço, hífen e apóstrofo (ex.: Maria-Clara, D'Ávila).
-- Rode UMA vez em: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar de novo sem problema. (Quem instalar do zero já recebe isso pelo schema.sql.)
--
-- Se der erro "is violated by some row", algum cadastro antigo tem número ou
-- símbolo no nome: rode só a consulta do PASSO 1, corrija esses nomes pela
-- agenda (Editar) e rode este arquivo de novo.
-- =====================================================================

-- PASSO 1 (conferência): nomes que não seguem a regra nova
select 'agendamento' as onde, data, horario, tutor_nome, pet_nome
from public.agendamentos
where tutor_nome !~ '^[A-Za-zÀ-ÖØ-öø-ÿ'' ’-]+$' or length(trim(tutor_nome)) > 100
   or pet_nome   !~ '^[A-Za-zÀ-ÖØ-öø-ÿ'' ’-]+$' or length(trim(pet_nome)) > 50;

-- PASSO 2: as regras novas
-- ---------------------------------------------------------------------
-- Nomes: tutor até 100 letras e animal até 50 letras.
-- Só letras (com acento), espaço, hífen e apóstrofo (ex.: Maria-Clara, D'Ávila).
-- ---------------------------------------------------------------------
create or replace function public.nome_valido(t text, maximo int)
returns boolean language sql immutable set search_path = public
as $$
  select t is not null
     and length(trim(t)) between 1 and maximo
     and t ~ '^[A-Za-zÀ-ÖØ-öø-ÿ'' ’-]+$'
     and t ~ '[A-Za-zÀ-ÖØ-öø-ÿ]'
$$;
alter table public.agendamentos drop constraint if exists agendamentos_tutor_nome_check;
alter table public.agendamentos drop constraint if exists agendamentos_pet_nome_check;
alter table public.tutores      drop constraint if exists tutores_nome_check;
alter table public.pets         drop constraint if exists pets_nome_check;
alter table public.agendamentos drop constraint if exists nome_tutor_valido;
alter table public.agendamentos drop constraint if exists nome_pet_valido;
alter table public.tutores      drop constraint if exists nome_tutor_valido;
alter table public.pets         drop constraint if exists nome_pet_valido;
-- Se já houver nome antigo fora da regra, a regra vale para tudo o que for novo ou
-- editado (o nome antigo é corrigido quando o agendamento for editado).
do $$
declare r record;
begin
  for r in select * from (values
    ('agendamentos', 'nome_tutor_valido', 'public.nome_valido(tutor_nome, 100)'),
    ('agendamentos', 'nome_pet_valido',   'public.nome_valido(pet_nome, 50)'),
    ('tutores',      'nome_tutor_valido', 'public.nome_valido(nome, 100)'),
    ('pets',         'nome_pet_valido',   'public.nome_valido(nome, 50)')) as t(tabela, nome, regra)
  loop
    begin
      execute format('alter table public.%I add constraint %I check (%s)', r.tabela, r.nome, r.regra);
    exception when check_violation then
      execute format('alter table public.%I add constraint %I check (%s) not valid', r.tabela, r.nome, r.regra);
      raise notice 'Tabela %: há nomes antigos fora da regra (veja a lista do PASSO 1).', r.tabela;
    end;
  end loop;
end $$;
select 'Atualização v2 aplicada' as resultado;
