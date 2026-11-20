-- =====================================================================
-- BANHO E TOSA – Banco de dados completo (Supabase / PostgreSQL)
--
-- Projeto NOVO e separado do Agenda Pet. Rode este arquivo inteiro uma vez:
--   Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar de novo sem problema (não apaga nenhum dado).
--
-- O que tem aqui:
--   1. Usuários e papéis (admin, banho_tosa, teste)
--   2. Tabela de preços (serviço x porte)
--   3. Clientes (tutores e pets)
--   4. Agendamentos (com valor, desconto, acréscimo e forma de pagamento)
--   5. Caixa: despesas/sangrias e fechamento do dia
--   6. Histórico (ninguém altera nem apaga; guarda os valores em R$)
--   7. Regras automáticas (gatilhos), travas e cálculos
--   8. Regras de acesso (RLS), tempo real e segurança
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- 1. USUÁRIOS E PAPÉIS
--    admin      = dono (tudo, inclusive reabrir dia fechado e excluir)
--    banho_tosa = as duas pessoas que trabalham no dia a dia
--    teste      = usuário de testes (os cadastros dele não entram nos números)
-- =====================================================================
do $$ begin
  create type public.papel_usuario as enum ('admin', 'banho_tosa', 'teste');
exception when duplicate_object then null; end $$;

create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null check (length(trim(nome)) between 1 and 60),
  papel      public.papel_usuario not null,
  criado_em  timestamptz not null default now()
);

-- Papel do usuário logado (usado nas regras de acesso)
create or replace function public.meu_papel()
returns public.papel_usuario
language sql stable security definer set search_path = public
as $$ select papel from public.perfis where id = auth.uid() $$;

-- É da equipe? (tem perfil cadastrado)
create or replace function public.eh_equipe()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.perfis where id = auth.uid()) $$;

-- Data de hoje no horário de Brasília (o servidor do Supabase usa UTC)
create or replace function public.hoje_brasil()
returns date language sql stable set search_path = public
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Telefone só com números, sem o 55 do Brasil: "(15) 99887-6655" -> "15998876655"
create or replace function public.normalizar_tel(t text)
returns text language sql immutable set search_path = public
as $$
  select case
    when d is null or length(d) < 10 then null
    when length(d) in (12, 13) and d like '55%' then substr(d, 3)
    when length(d) in (10, 11) then d
    else null end
  from (select nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '') as d) x
$$;

-- "3 anos" / "8 meses" -> data de nascimento aproximada (idade irreal fica sem data)
create or replace function public.idade_para_nascimento(txt text)
returns date language sql stable set search_path = public
as $$
  select case
    when m is null then null
    when txt ~* 'm[eê]s|meses' then
      case when m[1]::int <= 420 then (public.hoje_brasil() - make_interval(months => m[1]::int))::date end
    else
      case when m[1]::int <= 35 then (public.hoje_brasil() - make_interval(years => m[1]::int))::date end
    end
  from (select regexp_match(coalesce(txt, ''), '(\d{1,3})') as m) x
$$;

-- Idade possível: no máximo 35 anos (ou 420 meses)
create or replace function public.idade_possivel(txt text)
returns boolean language sql immutable set search_path = public
as $$
  select txt is null
      or coalesce((regexp_match(txt, '(\d{1,3})'))[1]::int, 0) <= case when txt ~* 'm[eê]s|meses' then 420 else 35 end
$$;

-- Sem acento e minúsculo, para a busca achar "Joao" e "João"
create or replace function public.sem_acento(t text)
returns text language sql immutable set search_path = public
as $$ select translate(lower(coalesce(t, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn') $$;

-- =====================================================================
-- 2. TABELA DE PREÇOS (serviço x porte)
--    O valor é preenchido sozinho no agendamento e pode ser editado.
--    Só o administrador muda a tabela (fica no histórico).
-- =====================================================================
create table if not exists public.servicos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null unique check (length(trim(nome)) between 1 and 60),
  ordem          int  not null default 0,
  ativo          boolean not null default true,
  valor_pequeno  numeric(8,2) check (valor_pequeno is null or valor_pequeno between 0 and 99999),
  valor_medio    numeric(8,2) check (valor_medio   is null or valor_medio   between 0 and 99999),
  valor_grande   numeric(8,2) check (valor_grande  is null or valor_grande  between 0 and 99999),
  atualizado_em  timestamptz not null default now()
);

-- serviços iniciais (sem preço: o administrador preenche na aba Fechamento > Preços)
insert into public.servicos (nome, ordem) values
  ('Banho', 1), ('Tosa', 2), ('Banho + Tosa', 3), ('Tosa higiênica', 4),
  ('Banho + Tosa higiênica', 5), ('Hidratação', 6)
on conflict (nome) do nothing;

-- =====================================================================
-- 3. CLIENTES (tutores e pets) – cadastrados sozinhos pelo agendamento
-- =====================================================================
create table if not exists public.tutores (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  telefone        text not null unique check (telefone ~ '^[0-9]{10,11}$'),
  end_cep         text check (end_cep is null or end_cep ~ '^[0-9]{8}$'),
  end_rua         text check (end_rua is null or length(end_rua) <= 120),
  end_numero      text check (end_numero is null or length(end_numero) <= 20),
  end_bairro      text check (end_bairro is null or length(end_bairro) <= 120),
  end_cidade      text check (end_cidade is null or length(end_cidade) <= 120),
  end_referencia  text check (end_referencia is null or length(end_referencia) <= 500),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.pets (
  id              uuid primary key default gen_random_uuid(),
  tutor_id        uuid not null references public.tutores(id) on delete cascade,
  nome            text not null,
  especie         text check (especie in ('Canino', 'Felino')),
  sexo            text check (sexo in ('Macho', 'Fêmea')),
  nascimento      date check (nascimento is null or nascimento > date '1980-01-01'),
  porte           text check (porte in ('Pequeno', 'Médio', 'Grande')),
  raca            text check (raca is null or length(raca) <= 120),
  pelagem         text check (pelagem in ('Curto', 'Longo')),
  peso_kg         numeric(5,2) check (peso_kg is null or (peso_kg > 0 and peso_kg < 999)),
  tem_saude       boolean,                           -- alergias ou problemas de saúde? (null = não informado)
  saude_obs       text check (saude_obs is null or length(saude_obs) <= 500),
  observacoes     text check (observacoes is null or length(observacoes) <= 500),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists pets_tutor_idx on public.pets (tutor_id);

-- =====================================================================
-- 4. AGENDAMENTOS
-- =====================================================================
create table if not exists public.agendamentos (
  id               uuid primary key default gen_random_uuid(),
  data             date not null,
  horario          time(0) not null,
  tutor_nome       text not null,
  telefone         text check (telefone is null or telefone ~ '^[0-9]{10,13}$'),
  pet_nome         text not null,
  pet_idade        text check (pet_idade is null or length(pet_idade) <= 20),
  especie          text check (especie in ('Canino', 'Felino')),
  pet_sexo         text check (pet_sexo in ('Macho', 'Fêmea')),
  saude_obs        text check (saude_obs is null or length(saude_obs) <= 500),
  porte            text check (porte in ('Pequeno', 'Médio', 'Grande')),
  peso_kg          numeric(5,2) check (peso_kg is null or (peso_kg > 0 and peso_kg < 999)),
  raca             text check (raca is null or length(raca) <= 120),
  pelagem          text check (pelagem in ('Curto', 'Longo')),
  observacoes      text check (observacoes is null or length(observacoes) <= 500),

  -- serviço e dinheiro
  servico          text check (servico is null or length(servico) <= 120),
  servico_valor    numeric(8,2) check (servico_valor is null or servico_valor between 0 and 99999),  -- valor do serviço (tabela, editável)
  desconto         numeric(8,2) not null default 0 check (desconto  between 0 and 99999),
  acrescimo        numeric(8,2) not null default 0 check (acrescimo between 0 and 99999),
  ajuste_motivo    text check (ajuste_motivo is null or length(ajuste_motivo) <= 200),
  valor_total      numeric(8,2) generated always as
                     (case when servico_valor is null then null else servico_valor - desconto + acrescimo end) stored,
  forma_pagamento  text check (forma_pagamento in ('Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito')),

  -- etapas
  status           text not null default 'agendado'
                   check (status in ('agendado', 'em_banho', 'finalizado', 'entregue', 'cancelado')),
  motivo_cancelamento text check (motivo_cancelamento is null or length(motivo_cancelamento) <= 500),

  -- leva e traz
  busca_domicilio   boolean not null default false,
  entrega_domicilio boolean not null default false,
  end_cep        text check (end_cep is null or end_cep ~ '^[0-9]{8}$'),
  end_rua        text check (end_rua is null or length(end_rua) <= 120),
  end_numero     text check (end_numero is null or length(end_numero) <= 20),
  end_bairro     text check (end_bairro is null or length(end_bairro) <= 120),
  end_cidade     text check (end_cidade is null or length(end_cidade) <= 120),
  end_referencia text check (end_referencia is null or length(end_referencia) <= 500),
  entrega_outro_end boolean not null default false,
  ent_cep        text check (ent_cep is null or ent_cep ~ '^[0-9]{8}$'),
  ent_rua        text check (ent_rua is null or length(ent_rua) <= 120),
  ent_numero     text check (ent_numero is null or length(ent_numero) <= 20),
  ent_bairro     text check (ent_bairro is null or length(ent_bairro) <= 120),
  ent_cidade     text check (ent_cidade is null or length(ent_cidade) <= 120),
  ent_referencia text check (ent_referencia is null or length(ent_referencia) <= 500),

  -- ligação com o cadastro de clientes (preenchida pelo banco)
  tutor_id         uuid references public.tutores(id) on delete set null,
  pet_id           uuid references public.pets(id) on delete set null,

  -- controle (preenchido pelo banco; ninguém troca pela tela)
  origem           public.papel_usuario not null,
  criado_por       uuid references auth.users(id) on delete set null,
  criado_em        timestamptz not null default now(),
  iniciado_em      timestamptz,
  finalizado_em    timestamptz,
  finalizado_por   uuid references auth.users(id) on delete set null,
  entregue_em      timestamptz,
  entregue_por     uuid references auth.users(id) on delete set null,
  cancelado_em     timestamptz,
  cancelado_por    uuid references auth.users(id) on delete set null,
  aviso_enviado_em timestamptz,

  -- regras entre campos
  constraint agendamentos_endereco_check check (
    not (busca_domicilio or entrega_domicilio)
    or (length(trim(coalesce(end_rua, ''))) > 0 and length(trim(coalesce(end_numero, ''))) > 0)),
  constraint agendamentos_endereco_entrega_check check (
    not entrega_outro_end
    or (length(trim(coalesce(ent_rua, ''))) > 0 and length(trim(coalesce(ent_numero, ''))) > 0)),
  -- desconto/acréscimo só com valor informado, sempre com o motivo, e o total nunca fica negativo
  constraint agendamentos_ajuste_check check (
    (desconto = 0 and acrescimo = 0)
    or (servico_valor is not null and length(trim(coalesce(ajuste_motivo, ''))) > 0)),
  constraint agendamentos_total_check check (
    servico_valor is null or servico_valor - desconto + acrescimo >= 0)
);

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

-- A TRAVA: um único animal por data + horário (cancelados não contam).
-- Se dois aparelhos salvarem o mesmo horário ao mesmo tempo, o banco
-- aceita o primeiro e recusa o segundo com o erro 23505.
create unique index if not exists agendamentos_horario_unico
  on public.agendamentos (data, horario)
  where status <> 'cancelado';
create index if not exists agendamentos_data_idx  on public.agendamentos (data);
create index if not exists agendamentos_pet_idx   on public.agendamentos (pet_id);
create index if not exists agendamentos_tutor_idx on public.agendamentos (tutor_id);

-- =====================================================================
-- 5. CAIXA: despesas/sangrias e fechamento do dia
-- =====================================================================
-- Saídas do caixa no dia: Despesa (shampoo, produtos...) ou Sangria (dinheiro retirado da gaveta)
create table if not exists public.despesas (
  id               uuid primary key default gen_random_uuid(),
  data             date not null,
  tipo             text not null default 'Despesa' check (tipo in ('Despesa', 'Sangria')),
  descricao        text not null check (length(trim(descricao)) between 1 and 200),
  valor            numeric(8,2) not null check (valor > 0 and valor <= 99999),
  forma_pagamento  text not null default 'Dinheiro'
                   check (forma_pagamento in ('Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito')),
  origem           public.papel_usuario not null,
  criado_por       uuid references auth.users(id) on delete set null,
  criado_por_nome  text,
  criado_em        timestamptz not null default now(),
  constraint despesas_sangria_dinheiro check (tipo <> 'Sangria' or forma_pagamento = 'Dinheiro')
);
create index if not exists despesas_data_idx on public.despesas (data);

-- Fechamento do dia: quem fechou, quando e os totais daquele momento (não muda depois)
create table if not exists public.fechamentos_dia (
  data               date primary key,
  situacao           text not null check (situacao in ('fechado', 'reaberto')),
  fechado_em         timestamptz not null,
  fechado_por        uuid references auth.users(id) on delete set null,
  fechado_por_nome   text,
  resumo             jsonb not null,                  -- totais no momento do fechamento
  dinheiro_contado   numeric(10,2),                   -- opcional: dinheiro contado na gaveta
  diferenca_caixa    numeric(10,2),                   -- contado - esperado
  observacao         text check (observacao is null or length(observacao) <= 500),
  reaberto_em        timestamptz,
  reaberto_por_nome  text,
  motivo_reabertura  text check (motivo_reabertura is null or length(motivo_reabertura) <= 500)
);

-- O dia está fechado?
create or replace function public.dia_fechado(d date)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.fechamentos_dia where data = d and situacao = 'fechado') $$;

-- =====================================================================
-- 6. HISTÓRICO (só o administrador vê; ninguém altera nem apaga)
--    Guarda cada ação com quem fez, quando, o que mudou (antes -> depois)
--    e os valores em R$ do atendimento naquele momento.
-- =====================================================================
create table if not exists public.historico (
  id               bigserial primary key,
  em               timestamptz not null default now(),
  tipo             text not null default 'agendamento'
                   check (tipo in ('agendamento', 'despesa', 'preco', 'caixa')),
  agendamento_id   uuid,                 -- sem vínculo: o histórico fica mesmo se o registro for excluído
  acao             text not null,
  usuario_id       uuid,
  usuario_nome     text,
  usuario_papel    text,
  pet_nome         text,
  tutor_nome       text,
  data_agendada    date,
  horario          time(0),
  descricao        text,                 -- despesa, serviço da tabela de preços ou fechamento
  servico          text,
  valor_servico    numeric(10,2),
  desconto         numeric(10,2),
  acrescimo        numeric(10,2),
  valor_total      numeric(10,2),
  forma_pagamento  text,
  mudou_valor      boolean not null default false,   -- mudou serviço, valor, desconto, acréscimo ou pagamento
  apos_fechamento  boolean not null default false,   -- mexeu num dia que já estava fechado (só o admin consegue)
  mudancas         jsonb                              -- { "campo": { "de": ..., "para": ... } }
);
create index if not exists historico_em_idx    on public.historico (em desc);
create index if not exists historico_agend_idx on public.historico (agendamento_id);

-- =====================================================================
-- 7. REGRAS AUTOMÁTICAS (gatilhos)
-- =====================================================================

-- ---------- 7.1 Trava do caixa: dia fechado não muda (só o administrador) ----------
-- Roda antes das outras regras (o nome começa com "0").
create or replace function public.agendamento_trava_caixa()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if public.meu_papel() = 'admin' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op <> 'INSERT' and public.dia_fechado(old.data) then
    -- registrar o aviso ao tutor continua permitido
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'aviso_enviado_em' - 'valor_total') = (to_jsonb(old) - 'aviso_enviado_em' - 'valor_total') then
      return new;
    end if;
    raise exception 'O caixa do dia % já foi fechado. Para mudar, peça ao administrador.', to_char(old.data, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  if tg_op <> 'DELETE' and public.dia_fechado(new.data) then
    raise exception 'O caixa do dia % já foi fechado. Para mudar, peça ao administrador.', to_char(new.data, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists trg_agendamento_0_caixa on public.agendamentos;
create trigger trg_agendamento_0_caixa
  before insert or update or delete on public.agendamentos
  for each row execute function public.agendamento_trava_caixa();

-- ---------- 7.2 Novo agendamento: origem, datas e etapa preenchidas pelo banco ----------
create or replace function public.agendamento_antes_inserir()
returns trigger language plpgsql security definer set search_path = public
as $$
declare p public.papel_usuario;
begin
  p := public.meu_papel();
  if p is null then
    raise exception 'Usuário sem perfil cadastrado' using errcode = '42501';
  end if;
  if new.data < public.hoje_brasil() then
    raise exception 'Não é possível agendar em uma data que já passou' using errcode = 'P0001';
  end if;
  if new.data > date '2100-12-31' then
    raise exception 'A data máxima para agendamento é 31/12/2100' using errcode = 'P0001';
  end if;
  new.origem              := p;
  new.criado_por          := auth.uid();
  new.criado_em           := now();
  new.status              := 'agendado';
  new.iniciado_em         := null;
  new.finalizado_em       := null;
  new.finalizado_por      := null;
  new.entregue_em         := null;
  new.entregue_por        := null;
  new.aviso_enviado_em    := null;
  new.cancelado_em        := null;
  new.cancelado_por       := null;
  new.motivo_cancelamento := null;
  return new;
end $$;
drop trigger if exists trg_agendamento_inserir on public.agendamentos;
create trigger trg_agendamento_inserir
  before insert on public.agendamentos
  for each row execute function public.agendamento_antes_inserir();

-- ---------- 7.3 Alteração: etapas, horários de cada etapa e valor obrigatório ----------
create or replace function public.agendamento_antes_alterar()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.data <> old.data and new.data < public.hoje_brasil() then
    raise exception 'Não é possível agendar em uma data que já passou' using errcode = 'P0001';
  end if;
  if new.data > date '2100-12-31' then
    raise exception 'A data máxima para agendamento é 31/12/2100' using errcode = 'P0001';
  end if;
  -- finalizar e entregar só com serviço e valor informados
  if new.status in ('finalizado', 'entregue')
     and (new.servico is null or length(trim(new.servico)) = 0 or new.servico_valor is null) then
    raise exception 'Informe o serviço e o valor antes de finalizar.' using errcode = 'P0001';
  end if;

  -- campos de controle não podem ser trocados
  new.origem     := old.origem;
  new.criado_por := old.criado_por;
  new.criado_em  := old.criado_em;

  -- banho iniciado: guarda a hora em que o pet entrou no banho
  if new.status = 'em_banho' and old.status is distinct from 'em_banho' then
    new.iniciado_em := now();
  elsif new.status = 'agendado' then
    new.iniciado_em := null;
  else
    new.iniciado_em := old.iniciado_em;
  end if;

  -- banho terminado: "finalizado" e "entregue" guardam a hora em que o banho acabou
  if new.status in ('finalizado', 'entregue') then
    if old.status in ('finalizado', 'entregue') and old.finalizado_em is not null then
      new.finalizado_em  := old.finalizado_em;
      new.finalizado_por := old.finalizado_por;
    else
      new.finalizado_em  := now();
      new.finalizado_por := auth.uid();
    end if;
  else
    new.finalizado_em  := null;
    new.finalizado_por := null;
  end if;

  -- cancelamento: guarda quando e quem; ao reativar, limpa o motivo
  if new.status = 'cancelado' then
    if old.status = 'cancelado' then
      new.cancelado_em  := old.cancelado_em;
      new.cancelado_por := old.cancelado_por;
    else
      new.cancelado_em  := now();
      new.cancelado_por := auth.uid();
    end if;
  else
    new.cancelado_em  := null;
    new.cancelado_por := null;
    new.motivo_cancelamento := null;
  end if;

  -- aviso ao tutor: a hora do último aviso só anda para frente
  if old.aviso_enviado_em is not null
     and (new.aviso_enviado_em is null or new.aviso_enviado_em < old.aviso_enviado_em) then
    new.aviso_enviado_em := old.aviso_enviado_em;
  end if;

  -- pet retirado pelo tutor
  if new.status = 'entregue' then
    if old.status = 'entregue' then
      new.entregue_em  := old.entregue_em;
      new.entregue_por := old.entregue_por;
    else
      new.entregue_em  := now();
      new.entregue_por := auth.uid();
    end if;
  else
    new.entregue_em  := null;
    new.entregue_por := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_agendamento_alterar on public.agendamentos;
create trigger trg_agendamento_alterar
  before update on public.agendamentos
  for each row execute function public.agendamento_antes_alterar();

-- ---------- 7.4 Idade: no máximo 35 anos ----------
create or replace function public.agendamento_conferir_idade()
returns trigger language plpgsql set search_path = public
as $$
begin
  if (tg_op = 'INSERT' or new.pet_idade is distinct from old.pet_idade) and not public.idade_possivel(new.pet_idade) then
    raise exception 'Idade inválida: um pet não pode ter mais de 35 anos.' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_agendamento_idade on public.agendamentos;
create trigger trg_agendamento_idade before insert or update on public.agendamentos
  for each row execute function public.agendamento_conferir_idade();

-- ---------- 7.5 Agendamento ligado ao tutor e ao pet (automático) ----------
-- Com telefone: acha (ou cria) o tutor; acha o pet pelo nome (ou cria).
-- A ficha do pet fica atualizada com o que foi informado no agendamento.
create or replace function public.agendamento_vincular_cliente()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  tel text := public.normalizar_tel(new.telefone);
  t uuid; p uuid;
begin
  if tg_op = 'UPDATE' and
     (new.telefone, new.tutor_nome, new.pet_nome, new.pet_id, new.especie, new.pet_sexo, new.pet_idade, new.porte,
      new.peso_kg, new.raca, new.pelagem, new.saude_obs, new.observacoes, new.end_rua)
     is not distinct from
     (old.telefone, old.tutor_nome, old.pet_nome, old.pet_id, old.especie, old.pet_sexo, old.pet_idade, old.porte,
      old.peso_kg, old.raca, old.pelagem, old.saude_obs, old.observacoes, old.end_rua) then
    return new;                                         -- só mudou etapa/horário/valor: nada a fazer
  end if;
  if tel is null then
    new.tutor_id := null; new.pet_id := null;
    return new;
  end if;

  select id into t from public.tutores where telefone = tel;
  if t is null then
    insert into public.tutores (nome, telefone) values (left(trim(new.tutor_nome), 100), tel)
    returning id into t;
  end if;
  -- endereço da busca vira o endereço do tutor quando ele ainda não tem
  if new.busca_domicilio and new.end_rua is not null then
    update public.tutores set end_cep = new.end_cep, end_rua = new.end_rua, end_numero = new.end_numero,
           end_bairro = new.end_bairro, end_cidade = new.end_cidade, end_referencia = new.end_referencia
     where id = t and end_rua is null;
  end if;
  new.tutor_id := t;

  if new.pet_id is not null then
    select id into p from public.pets where id = new.pet_id and tutor_id = t;
  end if;
  if p is null then
    select id into p from public.pets
     where tutor_id = t and lower(trim(nome)) = lower(trim(new.pet_nome))
     order by ativo desc, criado_em limit 1;
  end if;
  if p is null then
    insert into public.pets (tutor_id, nome, especie, sexo, nascimento, porte, raca, pelagem, peso_kg,
                             tem_saude, saude_obs, observacoes)
    values (t, left(trim(new.pet_nome), 50), new.especie, new.pet_sexo, public.idade_para_nascimento(new.pet_idade),
            new.porte, new.raca, new.pelagem, new.peso_kg,
            case when new.saude_obs is not null then true end, new.saude_obs, new.observacoes)
    returning id into p;
  else
    update public.pets set
      especie     = coalesce(new.especie, especie),
      sexo        = coalesce(new.pet_sexo, sexo),
      nascimento  = coalesce(nascimento, public.idade_para_nascimento(new.pet_idade)),
      porte       = coalesce(new.porte, porte),
      raca        = coalesce(new.raca, raca),
      pelagem     = coalesce(new.pelagem, pelagem),
      peso_kg     = coalesce(new.peso_kg, peso_kg),
      tem_saude   = case when new.saude_obs is not null then true else tem_saude end,
      saude_obs   = coalesce(new.saude_obs, saude_obs),
      observacoes = coalesce(new.observacoes, observacoes),
      ativo       = true
     where id = p;
  end if;
  new.pet_id := p;
  return new;
end $$;
drop trigger if exists trg_agendamento_cliente on public.agendamentos;
create trigger trg_agendamento_cliente before insert or update on public.agendamentos
  for each row execute function public.agendamento_vincular_cliente();

-- ---------- 7.6 Tutores e pets: datas de atualização e dono fixo ----------
create or replace function public.tutor_antes_salvar()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' then new.criado_em := old.criado_em; end if;
  return new;
end $$;
drop trigger if exists trg_tutor_salvar on public.tutores;
create trigger trg_tutor_salvar before insert or update on public.tutores
  for each row execute function public.tutor_antes_salvar();

create or replace function public.pet_antes_salvar()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.atualizado_em := now();
  if new.nascimento is not null and new.nascimento < public.hoje_brasil() - interval '35 years' then
    raise exception 'Idade inválida: um pet não pode ter mais de 35 anos.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
    new.tutor_id  := old.tutor_id;                      -- pet não muda de dono
  end if;
  return new;
end $$;
drop trigger if exists trg_pet_salvar on public.pets;
create trigger trg_pet_salvar before insert or update on public.pets
  for each row execute function public.pet_antes_salvar();

-- ---------- 7.7 Histórico dos agendamentos (com os valores em R$) ----------
create or replace function public.registrar_historico()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_acao text;
  v_mud  jsonb := '{}'::jsonb;
  v_reg  public.agendamentos;
  v_nome text;
  v_papel text;
  k text;
  ignorar text[] := array['id','criado_em','criado_por','origem','iniciado_em','finalizado_em','finalizado_por',
                          'entregue_em','entregue_por','cancelado_em','cancelado_por','aviso_enviado_em','status',
                          'tutor_id','pet_id','valor_total'];
  campos_valor text[] := array['servico','servico_valor','desconto','acrescimo','ajuste_motivo','forma_pagamento'];
begin
  select nome, papel::text into v_nome, v_papel from public.perfis where id = auth.uid();

  if tg_op = 'INSERT' then
    v_acao := 'criado'; v_reg := new;
  elsif tg_op = 'DELETE' then
    v_acao := 'excluido'; v_reg := old;
  else
    v_reg := new;
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if not (k = any(ignorar)) and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        v_mud := v_mud || jsonb_build_object(k, jsonb_build_object('de', to_jsonb(old) -> k, 'para', to_jsonb(new) -> k));
      end if;
    end loop;

    if new.status is distinct from old.status then
      v_acao := case
        when new.status = 'em_banho'   then 'banho iniciado'
        when new.status = 'finalizado' and old.status = 'entregue' then 'entrega desfeita'
        when new.status = 'finalizado' then 'finalizado'
        when new.status = 'entregue'   then 'entregue'
        when new.status = 'cancelado'  then 'cancelado'
        when old.status = 'cancelado'  then 'reativado'
        else 'reaberto' end;
    elsif v_mud <> '{}'::jsonb then
      v_acao := 'alterado';
    elsif new.aviso_enviado_em is distinct from old.aviso_enviado_em then
      v_acao := 'tutor avisado';
    else
      return null;                               -- nada relevante mudou
    end if;
  end if;

  insert into public.historico (tipo, agendamento_id, acao, usuario_id, usuario_nome, usuario_papel,
                                pet_nome, tutor_nome, data_agendada, horario,
                                servico, valor_servico, desconto, acrescimo, valor_total, forma_pagamento,
                                mudou_valor, apos_fechamento, mudancas)
  values ('agendamento', v_reg.id, v_acao, auth.uid(), v_nome, v_papel,
          v_reg.pet_nome, v_reg.tutor_nome, v_reg.data, v_reg.horario,
          v_reg.servico, v_reg.servico_valor, v_reg.desconto, v_reg.acrescimo,
          case when v_reg.servico_valor is null then null else v_reg.servico_valor - v_reg.desconto + v_reg.acrescimo end,
          v_reg.forma_pagamento,
          v_mud ?| campos_valor,
          public.dia_fechado(v_reg.data) or (tg_op = 'UPDATE' and public.dia_fechado(old.data)),
          case when v_mud = '{}'::jsonb then null else v_mud end);
  return null;
end $$;
drop trigger if exists trg_agendamento_historico on public.agendamentos;
create trigger trg_agendamento_historico
  after insert or update or delete on public.agendamentos
  for each row execute function public.registrar_historico();

-- ---------- 7.8 Despesas: trava do caixa, dados automáticos e histórico ----------
create or replace function public.despesa_trava_caixa()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if public.meu_papel() = 'admin' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if (tg_op <> 'INSERT' and public.dia_fechado(old.data)) or (tg_op <> 'DELETE' and public.dia_fechado(new.data)) then
    raise exception 'O caixa deste dia já foi fechado. Para mudar, peça ao administrador.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists trg_despesa_0_caixa on public.despesas;
create trigger trg_despesa_0_caixa
  before insert or update or delete on public.despesas
  for each row execute function public.despesa_trava_caixa();

create or replace function public.despesa_antes_salvar()
returns trigger language plpgsql security definer set search_path = public
as $$
declare p public.papel_usuario;
begin
  if tg_op = 'INSERT' then
    p := public.meu_papel();
    if p is null then raise exception 'Usuário sem perfil cadastrado' using errcode = '42501'; end if;
    new.origem          := p;
    new.criado_por      := auth.uid();
    new.criado_por_nome := (select nome from public.perfis where id = auth.uid());
    new.criado_em       := now();
  else
    new.origem          := old.origem;
    new.criado_por      := old.criado_por;
    new.criado_por_nome := old.criado_por_nome;
    new.criado_em       := old.criado_em;
  end if;
  if new.data > public.hoje_brasil() then
    raise exception 'Despesa só pode ser lançada em hoje ou em dias anteriores.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_despesa_salvar on public.despesas;
create trigger trg_despesa_salvar
  before insert or update on public.despesas
  for each row execute function public.despesa_antes_salvar();

create or replace function public.registrar_historico_despesa()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_reg public.despesas;
  v_mud jsonb := '{}'::jsonb;
  v_nome text; v_papel text; k text;
begin
  select nome, papel::text into v_nome, v_papel from public.perfis where id = auth.uid();
  v_reg := case when tg_op = 'DELETE' then old else new end;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if k not in ('id', 'origem', 'criado_por', 'criado_por_nome', 'criado_em')
         and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        v_mud := v_mud || jsonb_build_object(k, jsonb_build_object('de', to_jsonb(old) -> k, 'para', to_jsonb(new) -> k));
      end if;
    end loop;
    if v_mud = '{}'::jsonb then return null; end if;
  end if;
  insert into public.historico (tipo, acao, usuario_id, usuario_nome, usuario_papel, data_agendada,
                                descricao, valor_total, forma_pagamento, mudou_valor, apos_fechamento, mudancas)
  values ('despesa',
          case tg_op when 'INSERT' then 'despesa lançada' when 'UPDATE' then 'despesa alterada' else 'despesa excluída' end,
          auth.uid(), v_nome, v_papel, v_reg.data,
          v_reg.tipo || ': ' || v_reg.descricao, v_reg.valor, v_reg.forma_pagamento,
          true, public.dia_fechado(v_reg.data),
          case when v_mud = '{}'::jsonb then null else v_mud end);
  return null;
end $$;
drop trigger if exists trg_despesa_historico on public.despesas;
create trigger trg_despesa_historico
  after insert or update or delete on public.despesas
  for each row execute function public.registrar_historico_despesa();

-- ---------- 7.9 Tabela de preços: data de atualização e histórico ----------
create or replace function public.servico_antes_salvar()
returns trigger language plpgsql set search_path = public
as $$ begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists trg_servico_salvar on public.servicos;
create trigger trg_servico_salvar before insert or update on public.servicos
  for each row execute function public.servico_antes_salvar();

create or replace function public.registrar_historico_servico()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_reg public.servicos;
  v_mud jsonb := '{}'::jsonb;
  v_nome text; v_papel text; k text;
begin
  if auth.uid() is null then return null; end if;    -- carga inicial pelo SQL Editor: não registra
  select nome, papel::text into v_nome, v_papel from public.perfis where id = auth.uid();
  v_reg := case when tg_op = 'DELETE' then old else new end;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if k not in ('id', 'atualizado_em') and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        v_mud := v_mud || jsonb_build_object(k, jsonb_build_object('de', to_jsonb(old) -> k, 'para', to_jsonb(new) -> k));
      end if;
    end loop;
    if v_mud = '{}'::jsonb then return null; end if;
  end if;
  insert into public.historico (tipo, acao, usuario_id, usuario_nome, usuario_papel, descricao, mudou_valor, mudancas)
  values ('preco',
          case tg_op when 'INSERT' then 'serviço criado' when 'UPDATE' then 'preço alterado' else 'serviço removido' end,
          auth.uid(), v_nome, v_papel, v_reg.nome, true,
          case when v_mud = '{}'::jsonb then null else v_mud end);
  return null;
end $$;
drop trigger if exists trg_servico_historico on public.servicos;
create trigger trg_servico_historico
  after insert or update or delete on public.servicos
  for each row execute function public.registrar_historico_servico();

-- =====================================================================
-- 8. CÁLCULOS (feitos no banco; devolvem só os totais)
-- =====================================================================

-- ---------- 8.1 Busca de clientes (celular, tutor ou pet) ----------
create or replace function public.buscar_clientes(q text)
returns table (tutor_id uuid, tutor_nome text, telefone text,
               end_cep text, end_rua text, end_numero text, end_bairro text, end_cidade text, end_referencia text,
               pet_id uuid, pet_nome text, especie text, sexo text, nascimento date, porte text, raca text,
               pelagem text, peso_kg numeric, tem_saude boolean, saude_obs text, observacoes text)
language sql stable set search_path = public
as $$
  with termo as (
    select public.sem_acento(trim(left(coalesce(q, ''), 60))) as txt,
           regexp_replace(coalesce(q, ''), '\D', '', 'g') as dig
  )
  select t.id, t.nome, t.telefone,
         t.end_cep, t.end_rua, t.end_numero, t.end_bairro, t.end_cidade, t.end_referencia,
         p.id, p.nome, p.especie, p.sexo, p.nascimento, p.porte, p.raca,
         p.pelagem, p.peso_kg, p.tem_saude, p.saude_obs, p.observacoes
  from public.tutores t
  left join public.pets p on p.tutor_id = t.id and p.ativo
  cross join termo
  where length(termo.txt) >= 2 and (
        (length(termo.dig) >= 4 and t.telefone like '%' || termo.dig || '%')
     or (length(termo.dig) < 4 and (public.sem_acento(t.nome) like '%' || termo.txt || '%'
                                     or public.sem_acento(p.nome) like '%' || termo.txt || '%')))
  order by t.nome, p.nome
  limit 20
$$;

-- ---------- 8.2 Gráficos de entradas: por período e por serviço ----------
-- Cancelados não entram. Cadastros do usuário Teste só aparecem para ele mesmo.
create or replace function public.contagem_entradas(p_inicio date, p_fim date, p_agrupar text)
returns table (chave text, servico text, registrados bigint, finalizados bigint, faturado numeric)
language sql stable set search_path = public
as $$
  select case p_agrupar when 'ano' then to_char(a.data, 'YYYY')
                        when 'mes' then to_char(a.data, 'MM')
                        else to_char(a.data, 'DD') end                     as chave,
         coalesce(a.servico, 'Sem serviço')                                as servico,
         count(*)                                                          as registrados,
         count(*) filter (where a.status in ('finalizado', 'entregue'))    as finalizados,
         coalesce(sum(a.valor_total) filter (where a.status in ('finalizado', 'entregue')), 0) as faturado
  from public.agendamentos a
  where a.data between p_inicio and p_fim
    and a.status <> 'cancelado'
    and (a.origem <> 'teste' or public.meu_papel() = 'teste')
  group by 1, 2
  order by 1, 2
$$;

-- ---------- 8.3 Resumo do caixa de um período (dia ou mês) ----------
-- Conta como faturado o atendimento Finalizado ou Entregue, pela data do agendamento.
create or replace function public.resumo_caixa(p_inicio date, p_fim date)
returns jsonb language sql stable set search_path = public
as $$
  with base as (
    select * from public.agendamentos a
    where a.data between p_inicio and p_fim
      and (a.origem <> 'teste' or public.meu_papel() = 'teste')
  ),
  conc as (select * from base where status in ('finalizado', 'entregue')),
  desp as (
    select * from public.despesas d
    where d.data between p_inicio and p_fim
      and (d.origem <> 'teste' or public.meu_papel() = 'teste')
  ),
  formas as (
    select f.forma, f.ordem, count(c.id) as qtd, coalesce(sum(c.valor_total), 0) as valor
    from (values ('Dinheiro', 1), ('Pix', 2), ('Cartão de débito', 3), ('Cartão de crédito', 4)) as f(forma, ordem)
    left join conc c on c.forma_pagamento = f.forma
    group by f.forma, f.ordem
  ),
  servs as (
    select coalesce(servico, 'Sem serviço') as servico, count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from conc group by 1
  ),
  tot as (
    select
      (select count(*) from conc)                                              as atendimentos,
      (select coalesce(sum(servico_valor), 0) from conc)                       as bruto,
      (select coalesce(sum(desconto), 0) from conc)                            as descontos,
      (select coalesce(sum(acrescimo), 0) from conc)                           as acrescimos,
      (select coalesce(sum(valor_total), 0) from conc)                         as liquido,
      (select count(*) from conc where servico_valor is null)                  as sem_valor,
      (select count(*) from conc where forma_pagamento is null)                as sem_forma,
      (select count(*) from base where status in ('agendado', 'em_banho'))     as em_aberto,
      (select count(*) from base where status = 'finalizado')                  as aguardando_retirada,
      (select count(*) from base where status = 'cancelado')                   as cancelados,
      (select coalesce(sum(valor), 0) from desp where tipo = 'Despesa')        as despesas,
      (select coalesce(sum(valor), 0) from desp where tipo = 'Despesa' and forma_pagamento = 'Dinheiro') as despesas_dinheiro,
      (select coalesce(sum(valor), 0) from desp where tipo = 'Sangria')        as sangrias,
      (select coalesce(sum(valor_total), 0) from conc where forma_pagamento = 'Dinheiro') as entradas_dinheiro
  )
  select jsonb_build_object(
    'inicio', p_inicio, 'fim', p_fim,
    'atendimentos', t.atendimentos,
    'bruto', t.bruto, 'descontos', t.descontos, 'acrescimos', t.acrescimos, 'liquido', t.liquido,
    'ticket_medio', case when t.atendimentos > 0 then round(t.liquido / t.atendimentos, 2) else 0 end,
    'sem_valor', t.sem_valor, 'sem_forma', t.sem_forma,
    'em_aberto', t.em_aberto, 'aguardando_retirada', t.aguardando_retirada, 'cancelados', t.cancelados,
    'despesas', t.despesas, 'despesas_dinheiro', t.despesas_dinheiro, 'sangrias', t.sangrias,
    'entradas_dinheiro', t.entradas_dinheiro,
    'dinheiro_em_caixa', t.entradas_dinheiro - t.despesas_dinheiro - t.sangrias,
    'resultado', t.liquido - t.despesas,
    'por_forma', (select jsonb_agg(jsonb_build_object('forma', forma, 'qtd', qtd, 'valor', valor) order by ordem) from formas),
    'por_servico', coalesce((select jsonb_agg(jsonb_build_object('servico', servico, 'qtd', qtd, 'valor', valor)
                                              order by valor desc, servico) from servs), '[]'::jsonb),
    'dias', case when p_fim - p_inicio between 1 and 62 then (
      select jsonb_agg(jsonb_build_object(
               'data', d.dia,
               'atendimentos', (select count(*) from conc c where c.data = d.dia),
               'liquido',      (select coalesce(sum(c.valor_total), 0) from conc c where c.data = d.dia),
               'despesas',     (select coalesce(sum(x.valor), 0) from desp x where x.data = d.dia and x.tipo = 'Despesa'),
               'agendados',    (select count(*) from base b where b.data = d.dia and b.status <> 'cancelado'),
               'cancelados',   (select count(*) from base b where b.data = d.dia and b.status = 'cancelado'))
             order by d.dia)
      from (select g::date as dia from generate_series(p_inicio::timestamp, p_fim::timestamp, interval '1 day') g) d
    ) end
  )
  from tot t
$$;

-- ---------- 8.4 Fechar o dia (as duas pessoas da equipe e o administrador) ----------
create or replace function public.fechar_dia(p_data date, p_dinheiro_contado numeric default null, p_observacao text default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_papel public.papel_usuario := public.meu_papel();
  v_nome  text;
  r       jsonb;
begin
  if v_papel is null or v_papel not in ('admin', 'banho_tosa') then
    raise exception 'Sem permissão para fechar o caixa.' using errcode = '42501';
  end if;
  if p_data is null or p_data > public.hoje_brasil() then
    raise exception 'Só é possível fechar o dia de hoje ou dias anteriores.' using errcode = 'P0001';
  end if;
  if public.dia_fechado(p_data) then
    raise exception 'Este dia já está fechado.' using errcode = 'P0001';
  end if;
  if p_dinheiro_contado is not null and (p_dinheiro_contado < 0 or p_dinheiro_contado > 999999) then
    raise exception 'Valor contado no caixa inválido.' using errcode = 'P0001';
  end if;

  r := public.resumo_caixa(p_data, p_data);
  if (r ->> 'em_aberto')::int > 0 then
    raise exception 'Ainda há % pet(s) agendado(s) ou em banho neste dia. Finalize ou cancele antes de fechar.', r ->> 'em_aberto'
      using errcode = 'P0001';
  end if;
  if (r ->> 'sem_valor')::int > 0 then
    raise exception 'Há % atendimento(s) sem valor. Informe o valor antes de fechar.', r ->> 'sem_valor' using errcode = 'P0001';
  end if;
  if (r ->> 'sem_forma')::int > 0 then
    raise exception 'Há % atendimento(s) sem forma de pagamento. Informe antes de fechar.', r ->> 'sem_forma' using errcode = 'P0001';
  end if;

  select nome into v_nome from public.perfis where id = auth.uid();
  insert into public.fechamentos_dia (data, situacao, fechado_em, fechado_por, fechado_por_nome, resumo,
                                      dinheiro_contado, diferenca_caixa, observacao)
  values (p_data, 'fechado', now(), auth.uid(), v_nome, r - 'dias',
          p_dinheiro_contado,
          case when p_dinheiro_contado is null then null else p_dinheiro_contado - (r ->> 'dinheiro_em_caixa')::numeric end,
          nullif(left(trim(coalesce(p_observacao, '')), 500), ''))
  on conflict (data) do update set
    situacao = 'fechado', fechado_em = excluded.fechado_em, fechado_por = excluded.fechado_por,
    fechado_por_nome = excluded.fechado_por_nome, resumo = excluded.resumo,
    dinheiro_contado = excluded.dinheiro_contado, diferenca_caixa = excluded.diferenca_caixa,
    observacao = excluded.observacao;

  insert into public.historico (tipo, acao, usuario_id, usuario_nome, usuario_papel, data_agendada, descricao,
                                valor_total, mudou_valor, mudancas)
  values ('caixa', 'dia fechado', auth.uid(), v_nome, v_papel::text, p_data,
          format('%s atendimento(s) · despesas R$ %s%s', r ->> 'atendimentos',
                 replace(to_char((r ->> 'despesas')::numeric, 'FM999999990.00'), '.', ','),
                 case when p_dinheiro_contado is null then ''
                      else format(' · dinheiro contado R$ %s (esperado R$ %s)',
                                  replace(to_char(p_dinheiro_contado, 'FM999999990.00'), '.', ','),
                                  replace(to_char((r ->> 'dinheiro_em_caixa')::numeric, 'FM999999990.00'), '.', ',')) end),
          (r ->> 'liquido')::numeric, true, null);
  return r - 'dias';
end $$;

-- ---------- 8.5 Reabrir um dia fechado (só o administrador, com motivo) ----------
create or replace function public.reabrir_dia(p_data date, p_motivo text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_nome text;
begin
  if public.meu_papel() is distinct from 'admin' then
    raise exception 'Só o administrador pode reabrir um dia fechado.' using errcode = '42501';
  end if;
  if not public.dia_fechado(p_data) then
    raise exception 'Este dia não está fechado.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo da reabertura.' using errcode = 'P0001';
  end if;
  select nome into v_nome from public.perfis where id = auth.uid();
  update public.fechamentos_dia
     set situacao = 'reaberto', reaberto_em = now(), reaberto_por_nome = v_nome,
         motivo_reabertura = left(trim(p_motivo), 500)
   where data = p_data;
  insert into public.historico (tipo, acao, usuario_id, usuario_nome, usuario_papel, data_agendada, descricao, mudou_valor)
  values ('caixa', 'dia reaberto', auth.uid(), v_nome, 'admin', p_data, 'Motivo: ' || left(trim(p_motivo), 500), true);
end $$;

-- =====================================================================
-- 9. REGRAS DE ACESSO (Row Level Security)
--    - A equipe (admin, banho_tosa, teste) vê e cria agendamentos, clientes e despesas.
--    - Só o administrador exclui agendamentos e clientes, muda a tabela de preços,
--      vê o histórico e reabre dia fechado.
--    - Perfis só são criados pelo SQL Editor (arquivo usuarios.sql).
--    - Visitante sem login não vê nada.
-- =====================================================================
alter table public.perfis          enable row level security;
alter table public.servicos        enable row level security;
alter table public.tutores         enable row level security;
alter table public.pets            enable row level security;
alter table public.agendamentos    enable row level security;
alter table public.despesas        enable row level security;
alter table public.fechamentos_dia enable row level security;
alter table public.historico       enable row level security;

-- perfis
drop policy if exists perfis_ver on public.perfis;
create policy perfis_ver on public.perfis for select to authenticated using ((select public.eh_equipe()));

-- tabela de preços
drop policy if exists servicos_ver     on public.servicos;
drop policy if exists servicos_criar   on public.servicos;
drop policy if exists servicos_alterar on public.servicos;
drop policy if exists servicos_excluir on public.servicos;
create policy servicos_ver     on public.servicos for select to authenticated using ((select public.eh_equipe()));
create policy servicos_criar   on public.servicos for insert to authenticated with check ((select public.meu_papel()) = 'admin');
create policy servicos_alterar on public.servicos for update to authenticated
  using ((select public.meu_papel()) = 'admin') with check ((select public.meu_papel()) = 'admin');
create policy servicos_excluir on public.servicos for delete to authenticated using ((select public.meu_papel()) = 'admin');

-- tutores e pets
drop policy if exists tutores_ver     on public.tutores;
drop policy if exists tutores_criar   on public.tutores;
drop policy if exists tutores_alterar on public.tutores;
drop policy if exists tutores_excluir on public.tutores;
create policy tutores_ver     on public.tutores for select to authenticated using ((select public.eh_equipe()));
create policy tutores_criar   on public.tutores for insert to authenticated with check ((select public.eh_equipe()));
create policy tutores_alterar on public.tutores for update to authenticated
  using ((select public.eh_equipe())) with check ((select public.eh_equipe()));
create policy tutores_excluir on public.tutores for delete to authenticated using ((select public.meu_papel()) = 'admin');

drop policy if exists pets_ver     on public.pets;
drop policy if exists pets_criar   on public.pets;
drop policy if exists pets_alterar on public.pets;
drop policy if exists pets_excluir on public.pets;
create policy pets_ver     on public.pets for select to authenticated using ((select public.eh_equipe()));
create policy pets_criar   on public.pets for insert to authenticated with check ((select public.eh_equipe()));
create policy pets_alterar on public.pets for update to authenticated
  using ((select public.eh_equipe())) with check ((select public.eh_equipe()));
create policy pets_excluir on public.pets for delete to authenticated using ((select public.meu_papel()) = 'admin');

-- agendamentos
drop policy if exists agend_ver     on public.agendamentos;
drop policy if exists agend_criar   on public.agendamentos;
drop policy if exists agend_alterar on public.agendamentos;
drop policy if exists agend_excluir on public.agendamentos;
create policy agend_ver     on public.agendamentos for select to authenticated using ((select public.eh_equipe()));
create policy agend_criar   on public.agendamentos for insert to authenticated with check ((select public.eh_equipe()));
create policy agend_alterar on public.agendamentos for update to authenticated
  using ((select public.eh_equipe())) with check ((select public.eh_equipe()));
create policy agend_excluir on public.agendamentos for delete to authenticated using ((select public.meu_papel()) = 'admin');

-- despesas (a equipe lança e corrige no dia aberto; a trava do caixa protege o dia fechado)
drop policy if exists despesas_ver     on public.despesas;
drop policy if exists despesas_criar   on public.despesas;
drop policy if exists despesas_alterar on public.despesas;
drop policy if exists despesas_excluir on public.despesas;
create policy despesas_ver     on public.despesas for select to authenticated using ((select public.eh_equipe()));
create policy despesas_criar   on public.despesas for insert to authenticated with check ((select public.eh_equipe()));
create policy despesas_alterar on public.despesas for update to authenticated
  using ((select public.eh_equipe())) with check ((select public.eh_equipe()));
create policy despesas_excluir on public.despesas for delete to authenticated using ((select public.eh_equipe()));

-- fechamentos: a equipe vê; gravar só pelas funções fechar_dia / reabrir_dia
drop policy if exists fechamentos_ver on public.fechamentos_dia;
create policy fechamentos_ver on public.fechamentos_dia for select to authenticated using ((select public.eh_equipe()));
revoke insert, update, delete on public.fechamentos_dia from anon, authenticated;

-- histórico: só o administrador vê; ninguém grava, altera ou apaga pelo sistema
drop policy if exists historico_admin_ver on public.historico;
create policy historico_admin_ver on public.historico for select to authenticated
  using ((select public.meu_papel()) = 'admin');
revoke insert, update, delete on public.historico from anon, authenticated;
revoke usage on sequence public.historico_id_seq from anon, authenticated;

-- perfis: ninguém cria ou muda pelo site
revoke insert, update, delete on public.perfis from anon, authenticated;

-- visitante sem login não toca em nenhuma tabela
revoke all on public.perfis, public.servicos, public.tutores, public.pets, public.agendamentos,
              public.despesas, public.fechamentos_dia, public.historico from anon;

-- =====================================================================
-- 10. TEMPO REAL: as telas atualizam sozinhas nos outros aparelhos
-- =====================================================================
do $$ begin alter publication supabase_realtime add table public.agendamentos;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.despesas;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.fechamentos_dia;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.servicos;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- =====================================================================
-- 11. SEGURANÇA (mesmo padrão do Agenda Pet v6 / Security Advisor)
-- =====================================================================
-- 11.1 search_path fixo em todas as funções do schema public (ignora as de extensões)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public', f.assinatura);
  end loop;
end $$;

-- 11.2 Funções de gatilho com SECURITY DEFINER: ninguém chama pela internet
--      (os gatilhos continuam funcionando, o banco os executa sozinho)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype)
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
  end loop;
end $$;

-- 11.3 Funções usadas pelo site: só para quem está logado
do $$
declare f text;
begin
  foreach f in array array[
    'public.meu_papel()', 'public.eh_equipe()', 'public.dia_fechado(date)',
    'public.buscar_clientes(text)', 'public.contagem_entradas(date, date, text)',
    'public.resumo_caixa(date, date)', 'public.fechar_dia(date, numeric, text)', 'public.reabrir_dia(date, text)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- =====================================================================
-- 12. CONFERÊNCIA: deve mostrar as tabelas com "RLS ligado = true"
-- =====================================================================
select c.relname as tabela, c.relrowsecurity as rls_ligado
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;
