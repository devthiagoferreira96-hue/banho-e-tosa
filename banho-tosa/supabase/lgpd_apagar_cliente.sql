-- =====================================================================
-- BANHO E TOSA – LGPD: apagar os dados pessoais de um cliente a pedido dele
-- Rode no SQL Editor (só o dono do projeto tem acesso a ele).
-- 1. Troque o celular abaixo (só números, com DDD).
-- 2. Rode. Os atendimentos continuam nos números do caixa e dos gráficos,
--    mas sem nome, telefone, endereço nem dados de saúde.
-- Não dá para desfazer.
-- =====================================================================
begin;
set local session_replication_role = replica;   -- não dispara as travas nem o histórico durante a limpeza

create temp table alvo on commit drop as
  select '15999999999'::text as tel;            -- <<< TROQUE AQUI

update public.agendamentos a set
  tutor_nome = 'Cliente removido (LGPD)', telefone = null, pet_nome = 'Pet removido',
  saude_obs = null, observacoes = null, raca = null,
  end_cep = null, end_rua = null, end_numero = null, end_bairro = null, end_cidade = null, end_referencia = null,
  ent_cep = null, ent_rua = null, ent_numero = null, ent_bairro = null, ent_cidade = null, ent_referencia = null,
  busca_domicilio = false, entrega_domicilio = false, entrega_outro_end = false,
  tutor_id = null, pet_id = null
where public.normalizar_tel(a.telefone) = (select tel from alvo)
   or a.tutor_id in (select id from public.tutores where telefone = (select tel from alvo));

update public.historico h set tutor_nome = 'Cliente removido (LGPD)', pet_nome = 'Pet removido', mudancas = null
where h.agendamento_id in (select id from public.agendamentos where tutor_nome = 'Cliente removido (LGPD)');

delete from public.tutores where telefone = (select tel from alvo);   -- apaga também os pets dele

select count(*) as agendamentos_anonimizados from public.agendamentos where tutor_nome = 'Cliente removido (LGPD)';
commit;
