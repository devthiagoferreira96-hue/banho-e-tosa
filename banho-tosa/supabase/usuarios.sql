-- =====================================================================
-- BANHO E TOSA – Ligar os usuários aos papéis
-- Antes: crie os usuários em Authentication > Users > Add user > Create new user
--        (marque "Auto Confirm User"). Depois troque os e-mails e os nomes
--        abaixo e rode este arquivo no SQL Editor (New query > Run).
-- Pode rodar de novo (atualiza nome e papel).
--
--   admin      = dono (tudo, inclusive reabrir dia fechado, tabela de preços e histórico)
--   banho_tosa = as duas pessoas do dia a dia (agendam, finalizam, recebem e fecham o dia)
--   teste      = opcional, para treinar (os cadastros não entram nos números)
-- O nome aparece no topo, no histórico e em "finalizado por".
-- =====================================================================
insert into public.perfis (id, nome, papel)
select id, 'Administrador', 'admin' from auth.users where email = 'TROQUE-dono@exemplo.com'
on conflict (id) do update set nome = excluded.nome, papel = excluded.papel;

insert into public.perfis (id, nome, papel)
select id, 'Pessoa 1', 'banho_tosa' from auth.users where email = 'TROQUE-pessoa1@exemplo.com'
on conflict (id) do update set nome = excluded.nome, papel = excluded.papel;

insert into public.perfis (id, nome, papel)
select id, 'Pessoa 2', 'banho_tosa' from auth.users where email = 'TROQUE-pessoa2@exemplo.com'
on conflict (id) do update set nome = excluded.nome, papel = excluded.papel;

-- (opcional) usuário de testes: tire os dois "--" do começo das 3 linhas abaixo
-- insert into public.perfis (id, nome, papel)
-- select id, 'Teste', 'teste' from auth.users where email = 'TROQUE-teste@exemplo.com'
-- on conflict (id) do update set nome = excluded.nome, papel = excluded.papel;

-- Conferência: deve listar os usuários com seus papéis
select p.nome, p.papel, u.email
from public.perfis p join auth.users u on u.id = p.id
order by p.papel, p.nome;
