# Banho e Tosa – agenda, caixa e fechamento

Sistema só do **Banho e Tosa**, feito a partir do Agenda Pet v45. Tem **outro banco (Supabase)** e **outro site (Vercel)**:
o Agenda Pet continua funcionando como está, sem nenhuma mudança.

> Nome e logo são **provisórios** ("Banho e Tosa" com uma patinha). Quando tiver a logo e o nome definitivos,
> é só trocar os arquivos da pasta `icones` (mesmos nomes e tamanhos) e o `NOME_SISTEMA`/`SUBTITULO` no `config.js`.

---

## O que o sistema faz

**Igual ao Agenda Pet**
- Agenda com atualização em tempo real nos outros aparelhos.
- **Trava de horário no banco**: um único pet por data e horário (cancelados não contam).
- Mesmos campos, máscaras, calendário, raças, alerta de saúde em vermelho, sugestão de horários livres.
- Etapas: Agendado → Em banho → Finalizado (avisa o tutor no WhatsApp) → Entregue. Cancelar pede o motivo. Tudo pode ser desfeito.
- Clientes cadastrados (busca por celular, tutor ou pet), ficha do pet e **↻ Repetir último**.
- Leva e traz, rota otimizada e aba **Passeio** no celular.
- Visão Dia | Semana, busca geral, backup em planilha, "Esqueci minha senha".

**Nomes**: tutor até 100 letras e animal até 50, só letras (com acento), espaço, hífen e apóstrofo. Números e símbolos
não entram nem digitando nem colando, e o banco também recusa.

**Data e horário**: dá para corrigir só o dia, só o mês ou só o ano (e só a hora ou o minuto) sem apagar tudo.
Com a parte cheia, o número digitado substitui o que está à direita do cursor; ao completar uma parte, o cursor pula
para a próxima; ao sair do campo, "1/2/2026" vira "01/02/2026".

**Saiu**: a Área do tutor (`/cadastro`) e tudo do Pet Shop.

**Novo**
1. **Tabela de preços (serviço × porte)**: ao escolher o serviço e o porte, o valor aparece sozinho (dá para mudar na hora).
   O porte agora fica junto com Espécie e Sexo, porque define o preço.
2. **Valor obrigatório para finalizar** e **forma de pagamento obrigatória para entregar** (Dinheiro, Pix, Débito, Crédito).
   Se faltar, o sistema abre a janela **Valor e pagamento** na hora. Isso é garantido pelo banco, não só pela tela.
3. **Desconto e acréscimo** em cada atendimento, sempre com o motivo. O total a cobrar aparece na hora.
4. **Aba Caixa / Fechamento**
   - **Dia**: faturamento, atendimentos, ticket médio, despesas e resultado; totais por forma de pagamento e por serviço;
     **dinheiro que deve estar na gaveta**; cancelados com o motivo; lista dos atendimentos;
     lançamento de **despesas** (shampoo, produtos…) e **sangrias** (dinheiro retirado da gaveta).
   - **Pendências**: pets ainda agendados/em banho, atendimentos sem valor ou sem forma de pagamento, cada um com o botão para resolver.
   - **🔒 Fechar o dia**: confere as pendências, pede (opcional) o dinheiro contado na gaveta e grava quem fechou, quando e os totais.
   - **Dia fechado não muda** (nem agendar, nem valores, nem despesas). Só o **administrador** pode corrigir ou **reabrir** o dia (com motivo),
     e tudo fica no histórico marcado **🔒 após o fechamento**. Se o administrador corrigir sem reabrir, a tela avisa que os valores mudaram.
   - **Mês**: soma dos dias, comparação com o mês anterior (▲▼ %), dias fechados e os que faltam fechar.
   - **Imprimir / salvar PDF** e **planilha** do dia e do mês.
   - **Tabela de preços**: o administrador edita; as funcionárias só veem.
5. **Gráficos** (colunas lado a lado, por dia, mês ou ano): **Registrados × finalizados**, **Por serviço** e **Faturamento (R$)**.
6. **Histórico** com os **valores em R$** de cada registro e as mudanças de valor ("R$ 50,00 → R$ 60,00"),
   além de despesas, tabela de preços e fechamento/reabertura do caixa. Filtros "💲 Mudanças de valor" e "🔒 Após o fechamento".

**Usuários**

| Usuário | Pode |
|---|---|
| Administrador (dono) | Tudo: excluir, mudar preços, ver histórico, corrigir e reabrir dia fechado |
| Banho e Tosa (as 2 pessoas) | Agendar, editar, finalizar, receber, lançar despesas e **fechar o dia** |
| Teste (opcional) | Treinar; os cadastros dele não entram nos números |

Cada pessoa tem o próprio login: o nome dela aparece em "finalizado por", no fechamento e no histórico.

**Como o caixa conta**: entra no faturamento o atendimento **Finalizado ou Entregue**, pela **data do agendamento**,
com o valor final (valor − desconto + acréscimo). O "dinheiro na gaveta" é: pagamentos em dinheiro − despesas pagas em
dinheiro − sangrias (sem o troco inicial).

---

## Instalação (cerca de 30 minutos)

### Atualização para a v3 (correção da data)
Só arquivos do site, sem mudança no banco: copie os arquivos novos e publique (`git add .`, `git commit`, `git push`).

### Atualização da v1 para a v2 (quem já instalou)
Rode uma vez `supabase/atualizacao_v2_nomes.sql` no SQL Editor e publique os arquivos novos (`git add .`, `git commit`, `git push`).
A primeira tabela que aparece lista nomes antigos com número ou símbolo (se houver): corrija pela agenda em **Editar**.

### 1. Projeto novo no Supabase
1. Entre em https://supabase.com > **New project**. Nome: `banho-e-tosa`. Região **South America (São Paulo)**. Guarde a senha do banco.
2. Abra **SQL Editor > New query**, cole **todo** o `supabase/schema.sql` e clique em **Run**.
   No fim aparece a lista das tabelas com `rls_ligado = true`.

### 2. Usuários
1. **Authentication > Users > Add user > Create new user**: crie 3 usuários (e-mail e senha), marcando **Auto Confirm User**:
   o seu (administrador) e um para cada pessoa do Banho e Tosa.
2. Abra `supabase/usuarios.sql`, troque os e-mails e os nomes (ex.: "Ana", "Bia") e rode no SQL Editor.
   A última consulta deve listar os 3 usuários com os papéis.
3. **Authentication > Sign In / Providers**: desligue **Allow new users to sign up** (ninguém cria conta sozinho).
4. Rode `supabase/verificar_banco.sql`: todas as linhas devem aparecer **OK**.

### 3. Tabela de preços
Entre no sistema como administrador > aba **Caixa / Fechamento** > **Tabela de preços**. Preencha os valores por porte e
clique em **Salvar preços**. Dá para adicionar serviços novos e tirar de uso os que não fizer mais.

### 4. Bibliotecas (pasta `vendor`)
- `chart.umd.js` (gráficos) **já vem no zip**.
- `supabase.js`: **copie** o arquivo `vendor/supabase.js` da pasta do Agenda Pet para a pasta `vendor` deste projeto
  (é a mesma versão, 2.45.4). Ou baixe no PowerShell, dentro da pasta do projeto:

```powershell
curl.exe -L -o vendor\supabase.js https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js
Get-Item vendor\*.js | Select-Object Name, Length
```
Os dois arquivos precisam ter mais de 100 000 de tamanho.

### 5. config.js
1. Copie `config.exemplo.js` com o nome **`config.js`**.
2. No Supabase do **projeto novo**: **Project Settings > API** (ou **Data API**). Cole a **Project URL** em `SUPABASE_URL`
   e a chave **publishable** (`sb_publishable_…`) ou **anon public** em `SUPABASE_ANON_KEY`.
3. Confira o endereço da loja (`ENDERECO_LOJA`, usado nas rotas) e a mensagem do WhatsApp.
- **Nunca** coloque a chave secreta (`sb_secret_…` / service_role), senha ou token no `config.js`.

### 6. Publicar na Vercel (projeto novo)
1. Crie um repositório novo no GitHub (ex.: `banho-e-tosa`) com os arquivos desta pasta e o `config.js`
   (o mesmo cuidado de hoje: só a chave publishable, que pode ficar no navegador).
2. Na Vercel: **Add New > Project**, escolha o repositório novo e clique em **Deploy** (sem configurações extras).
   O endereço fica algo como `banho-e-tosa-xxx.vercel.app`.
3. No Supabase: **Authentication > URL Configuration**: coloque esse endereço em **Site URL** e em **Redirect URLs**
   (para o "Esqueci minha senha" funcionar).

### 7. Aviso de "pet pronto" pelo WhatsApp (opcional)
- **Padrão** (`WHATSAPP_AUTOMATICO: false`): ao finalizar, abre o WhatsApp com a mensagem pronta. Sem custo.
- **Automático**: é a mesma função do Agenda Pet. No Supabase **do projeto novo**: Edge Functions > Deploy a new function >
  Via Editor > nome `notificar-whatsapp` > cole `supabase/functions/notificar-whatsapp/index.ts` > Deploy.
  Em **Edge Functions > Secrets**, crie os mesmos secrets do Agenda Pet (`WHATSAPP_PROVEDOR`, `META_TOKEN`, …).
  Atenção: o número de WhatsApp da API só pode estar ligado a **um** app da Meta; se for usar o mesmo número nos dois sistemas,
  use o mesmo token e o mesmo Phone number ID nos dois projetos. Depois ponha `WHATSAPP_AUTOMATICO: true` no `config.js`.

### 8. Testar (10 minutos)
1. Entre com uma das funcionárias. Agende um pet com porte **Médio** e serviço **Banho**: o valor aparece sozinho.
2. Tente salvar outro pet no mesmo horário: aparece "horário indisponível".
3. **Finalizar** → **Entregue ao tutor** (escolha a forma de pagamento).
4. Aba **Caixa**: lance uma despesa e clique em **🔒 Fechar o dia**.
5. Volte à agenda: o dia aparece "🔒 Caixa fechado" e só dá para consultar.
6. Entre como administrador: **Histórico** mostra tudo com os valores; no **Caixa**, **🔓 Reabrir dia** pede o motivo.

---

## LGPD (dados pessoais)
- O sistema guarda nome, celular, endereço e dados de saúde dos pets. Só a equipe logada vê; visitante sem login não acessa
  nada (regras do próprio banco, em todas as tabelas). Só o administrador vê o histórico e exclui registros.
- Se um cliente pedir para apagar os dados: rode `supabase/lgpd_apagar_cliente.sql` no SQL Editor com o celular dele.
  Os atendimentos continuam no caixa e nos gráficos, mas sem nome, telefone, endereço nem saúde.
- Planilhas exportadas têm dados pessoais: guarde em local seguro e apague cópias que não precisar mais.

## Versão dos arquivos (cache do celular)
No `index.html` os arquivos são chamados com a versão (`app.js?v=1`). A cada versão nova esse número muda, para o celular
baixar os arquivos novos.

## Arquivos
```
index.html                      telas
styles.css                      visual (mesmas cores do Agenda Pet)
app.js                          funcionamento (agenda, valores, caixa, gráficos, histórico)
config.exemplo.js               modelo do config.js (copie e preencha)
racas.js                        lista de raças
manifest.webmanifest, sw.js,
registrar-app.js, icones/       app instalável (logo provisória)
vendor/                         bibliotecas (chart.umd.js incluído; copie o supabase.js)
vercel.json                     regras de segurança do site
supabase/schema.sql             banco completo: tabelas, travas, histórico, caixa, RLS e segurança
supabase/usuarios.sql           liga os usuários aos papéis
supabase/verificar_banco.sql    conferência (só lê)
supabase/lgpd_apagar_cliente.sql apaga os dados pessoais de um cliente
supabase/functions/notificar-whatsapp/index.ts   aviso automático (opcional)
```
