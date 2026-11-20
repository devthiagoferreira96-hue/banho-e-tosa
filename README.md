# 🐾 Banho e Tosa — agenda, leva e traz e caixa

Sistema web para um banho e tosa: agenda em tempo real, rota de leva e traz pelo Google Maps, cobrança e fechamento de caixa do dia. Foi feito para uso real por uma equipe pequena, no computador do balcão e no celular de quem faz as entregas.

> Projeto de portfólio. Nome, endereço, telefone e logo são fictícios.

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | HTML, CSS e **JavaScript puro** (sem framework) |
| Banco e login | **Supabase** (PostgreSQL, Auth, Realtime, RLS) |
| Notificação | Edge Function em **TypeScript** (Deno) para avisar o tutor no WhatsApp |
| App | **PWA** (instala no celular, funciona com cache via Service Worker) |
| Gráficos | Chart.js |
| Deploy | Vercel |

## Funcionalidades

**Agenda**
- Atualização em **tempo real** entre os aparelhos (Supabase Realtime).
- **Trava de horário no banco**: só um pet por data e horário. Se duas pessoas salvam ao mesmo tempo, o banco aceita a primeira e a tela da outra recarrega mostrando quem ocupou.
- Etapas **Agendado → Em banho → Finalizado → Entregue**, com cancelamento pedindo o motivo. Tudo pode ser desfeito.
- Sugestão de horários livres, visão **Dia | Semana**, busca geral por pet, tutor ou telefone.
- Cadastro de clientes, ficha do pet, alerta de saúde/alergia em destaque e botão **↻ Repetir último**.
- Validação de nomes, datas e horários na tela **e no banco**.

**Leva e traz**
- Endereço de busca e de entrega, com CEP preenchendo rua, bairro e cidade (ViaCEP).
- **Rota com várias paradas no Google Maps**, saindo da localização do celular, e atalho para o Waze.
- Aba **Passeio** no celular, com a ordem das paradas salva por dia.

**Caixa e fechamento**
- Tabela de preços por **serviço × porte**, desconto e acréscimo com motivo.
- Valor obrigatório para finalizar e forma de pagamento obrigatória para entregar (garantido pelo banco).
- Despesas, sangrias, dinheiro esperado na gaveta, pendências do dia.
- **Fechar o dia**: dia fechado não muda; só o administrador reabre, com motivo, e tudo vai para o histórico.
- Resumo do mês com comparação ao mês anterior, impressão/PDF e planilha.
- Gráficos de atendimentos, serviços e faturamento.

**Segurança e LGPD**
- Login individual, papéis (administrador × equipe) e **Row Level Security** em todas as tabelas.
- **Histórico imutável** de tudo o que foi criado, alterado ou cancelado (quem, quando, antes → depois).
- Script para apagar os dados de um cliente a pedido (LGPD).

## Como rodar

1. Crie um projeto no [Supabase](https://supabase.com) e rode `banho-tosa/supabase/schema.sql` no SQL Editor (depois `usuarios.sql` para criar os logins).
2. Copie `banho-tosa/config.exemplo.js` para `banho-tosa/config.js` e preencha a URL e a chave *publishable* do projeto.
3. Sirva a pasta `banho-tosa/` (ex.: `npx serve banho-tosa`) ou publique na Vercel.

O passo a passo completo, incluindo o aviso automático pelo WhatsApp, está em [`banho-tosa/LEIAME.md`](banho-tosa/LEIAME.md).

## Estrutura

```
banho-tosa/
  index.html, styles.css, app.js   interface e regras da tela
  racas.js                         lista de raças
  sw.js, manifest.webmanifest      PWA
  supabase/schema.sql              tabelas, travas, RLS, triggers e histórico
  supabase/functions/              Edge Function do WhatsApp
```
