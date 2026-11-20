/* =====================================================================
   BANHO E TOSA – lógica do sistema
   (feito a partir do Agenda Pet v45: agenda, clientes, leva e traz,
    gráficos, histórico com valores e fechamento de caixa)
   ===================================================================== */
(function () {
  'use strict';

  const C = window.CONFIG || {};
  const MSG_CONFLITO = 'Infelizmente já temos um animal cadastrado neste horário.';
  const NOMES_PAPEL = { admin: 'Administrador', banho_tosa: 'Banho e Tosa', teste: 'Teste' };
  const FORMAS = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito'];
  const FORMAS_CURTAS = { Dinheiro: 'Dinheiro', Pix: 'Pix', 'Cartão de débito': 'Débito', 'Cartão de crédito': 'Crédito' };
  const PORTES = ['Pequeno', 'Médio', 'Grande'];
  const CAMPO_PORTE = { Pequeno: 'valor_pequeno', 'Médio': 'valor_medio', Grande: 'valor_grande' };
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
    'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------- estado ----------
  const estado = {
    sessao: null,
    perfil: null,
    diaAgenda: hojeISO(),
    filtro: 'ativos',
    visao: 'dia',              // 'dia' ou 'semana'
    itensSemana: [],
    buscaAtual: null,
    itensDia: [],
    ocupadosForm: [],          // horários ocupados na data do formulário
    agrupar: 'dia',
    canal: null,
    grafico: null,
    destacar: null,            // horário a destacar após conflito
    dataOriginal: null         // data do agendamento que está sendo editado
  };

  function erroConfig(msg) {
    document.body.innerHTML =
      '<div class="login"><div class="login-card"><h2>Configuração pendente</h2>' +
      `<p>${msg}</p><p>Abra o arquivo <b>config.js</b> e confira os dados do Supabase ` +
      '(Supabase › Project Settings › API).</p></div></div>';
  }
  const url = String(C.SUPABASE_URL || '').trim();
  const chave = String(C.SUPABASE_ANON_KEY || '').trim();
  if (!window.supabase) { erroConfig('Não foi possível carregar a biblioteca do Supabase. Confira se a pasta "vendor" com o arquivo supabase.js foi enviada junto com o site (veja o LEIAME) e se há internet.'); return; }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    erroConfig('SUPABASE_URL deve ser o endereço do projeto, no formato <b>https://xxxxxxxx.supabase.co</b> (não é uma chave).');
    return;
  }
  if (!chave || chave.startsWith('sb_secret_') || chave.includes('COLE-AQUI')) {
    erroConfig('SUPABASE_ANON_KEY deve ser a chave <b>publishable</b> (sb_publishable_…) ou <b>anon public</b>. ' +
      'Nunca use a chave secreta (sb_secret_… / service_role) no navegador.');
    return;
  }

  const sb = window.supabase.createClient(url, chave);
  const NOME_SISTEMA = C.NOME_SISTEMA || 'Banho e Tosa';
  const SUBTITULO = C.SUBTITULO || 'Banho e Tosa';
  $$('.nome-sistema').forEach((el) => { el.textContent = NOME_SISTEMA; });
  $$('.marca-clinica').forEach((el) => { el.textContent = SUBTITULO; });
  document.title = NOME_SISTEMA;

  /* =================================================================
     Utilidades de data, hora e texto
     ================================================================= */
  function pad(n) { return String(n).padStart(2, '0'); }
  // "Hoje" sempre pelo horário de Brasília (America/Sao_Paulo), igual ao banco de dados
  const FMT_BRASIL = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  function hojeISO() {
    try { return FMT_BRASIL.format(new Date()); }
    catch (e) { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  }
  function isoParaBR(iso) { if (!iso) return ''; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }
  function brParaISO(br) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(br || '');   // aceita 1/2/2026 enquanto a pessoa corrige
    if (!m) return null;
    const d = +m[1], mes = +m[2], a = +m[3];
    const dt = new Date(a, mes - 1, d);
    if (dt.getFullYear() !== a || dt.getMonth() !== mes - 1 || dt.getDate() !== d) return null;
    return `${a}-${pad(mes)}-${pad(d)}`;
  }
  // data anterior a hoje (ao editar, manter a data original de um agendamento antigo é permitido)
  const DATA_MAXIMA = '2100-12-31';
  function dataAlemDoLimite(iso) { return iso > DATA_MAXIMA; }
  function dataPassada(iso) { return iso < hojeISO() && iso !== estado.dataOriginal; }
  function horaValida(h) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(h || ''); }
  function hhmm(t) { return (t || '').slice(0, 5); }
  function somarDias(iso, n) { const [a, m, d] = iso.split('-').map(Number); const dt = new Date(a, m - 1, d + n); return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`; }
  function diaPorExtenso(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    const t = new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  // Endereço no formato que o Google Maps e o Waze reconhecem:
  // "Rua X, 123 - Bairro, Cidade - UF, 00000-000, Brasil"
  function enderecoParaMapa(rua, numero, bairro, cidade, cep) {
    const cid = String(cidade || '').replace(/\s*\/\s*([A-Za-z]{2})$/, ' - $1').trim();   // São Paulo/SP -> São Paulo - SP
    const c = String(cep || '').replace(/\D/g, '');
    const inicio = [rua && `${rua}, ${numero || 's/n'}`, bairro].filter(Boolean).join(' - ');
    return [inicio, cid, c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : '', 'Brasil'].filter(Boolean).join(', ');
  }
  function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
  function formatarTelefone(dig) {
    dig = soDigitos(dig).slice(0, 11);
    if (dig.length <= 2) return dig ? `(${dig}` : '';
    if (dig.length <= 6) return `(${dig.slice(0, 2)}) ${dig.slice(2)}`;
    if (dig.length <= 10) return `(${dig.slice(0, 2)}) ${dig.slice(2, 6)}-${dig.slice(6)}`;
    return `(${dig.slice(0, 2)}) ${dig.slice(2, 7)}-${dig.slice(7)}`;
  }

  // ---------------------------------------------------------------
  // Máscaras de digitação por partes: DD/MM/AAAA e HH:MM.
  // Cada parte (dia, mês, ano / hora, minuto) é editada sozinha: apagar um
  // dígito do dia e digitar outro corrige só o dia, sem empurrar o resto.
  //  - Parte cheia: o dígito digitado substitui o que está à direita do cursor.
  //  - Ao completar uma parte, o cursor pula para a próxima.
  //  - A barra (ou os dois-pontos) não é apagada sozinha: apaga o dígito ao lado.
  //  - Ao sair do campo, dia/mês/hora com 1 dígito ganham o zero (1/2/2026 -> 01/02/2026).
  // ---------------------------------------------------------------
  function mascaraPartes(el, tamanhos, sep) {
    el.removeAttribute('maxlength');          // o limite é controlado aqui (senão não dá para substituir dígito com o campo cheio)
    const n = tamanhos.length, totalDig = tamanhos.reduce((a, b) => a + b, 0);
    let anterior = el.value;
    const guardar = () => { anterior = el.value; };
    el.addEventListener('keydown', guardar);
    el.addEventListener('beforeinput', guardar);
    el.addEventListener('focus', guardar);
    // dígitos corridos (colou "15102026" ou digitou sem barras) -> 15/10/2026
    const montar = (dig) => {
      const partes = []; let i = 0;
      tamanhos.forEach((t) => { const p = dig.slice(i, i + t); i += t; if (p) partes.push(p); });
      return partes.join(sep);
    };
    const qtdSep = (s) => s.split(sep).length - 1;

    el.addEventListener('input', (e) => {
      const tipo = (e && e.inputType) || '';
      const inserindo = tipo.startsWith('insert');
      let v = el.value;
      let pos = el.selectionStart == null ? v.length : el.selectionStart;

      // 1) apagou um separador: apaga o dígito ao lado dele (a barra continua no lugar)
      if (tipo.startsWith('delete') && v.length === anterior.length - 1 && qtdSep(v) === qtdSep(anterior) - 1) {
        let i = 0;
        while (i < v.length && v[i] === anterior[i]) i++;
        const ultimo = i === anterior.length - 1;          // barra no fim ("15/"): pode apagar normalmente
        if (anterior[i] === sep && !ultimo) {
          if (tipo === 'deleteContentBackward' && i > 0 && anterior[i - 1] !== sep) { v = anterior.slice(0, i - 1) + anterior.slice(i); pos = i - 1; }
          else if (tipo !== 'deleteContentBackward' && anterior[i + 1] && anterior[i + 1] !== sep) { v = anterior.slice(0, i + 1) + anterior.slice(i + 2); pos = i + 1; }
          else { v = anterior; pos = tipo === 'deleteContentBackward' ? i : i + 1; }
        }
      }

      // 2) sem separador ainda: digitação normal do começo, ou dígitos colados
      if (!v.includes(sep)) {
        const d = soDigitos(v).slice(0, totalDig);
        if (d.length > tamanhos[0]) {
          el.value = montar(d);
          el.setSelectionRange(el.value.length, el.value.length);
          anterior = el.value;
          return;
        }
        v = d; pos = soDigitos(el.value.slice(0, pos)).length;
      }

      // 3) separa as partes e descobre em qual parte está o cursor
      let brutas = v.split(sep);
      if (brutas.length > n) brutas = brutas.slice(0, n - 1).concat(brutas.slice(n - 1).join(''));
      let seg = brutas.length - 1, off = 0, acc = 0;
      for (let k = 0; k < brutas.length; k++) {
        const fim = acc + brutas[k].length;
        if (pos <= fim) { seg = k; off = soDigitos(brutas[k].slice(0, pos - acc)).length; break; }
        acc = fim + 1;
        if (k === brutas.length - 1) { seg = k; off = soDigitos(brutas[k]).length; }
      }
      const partes = brutas.map(soDigitos);

      // 4) parte passou do tamanho: o dígito novo substitui o da direita (ou segue para a próxima parte)
      partes.forEach((p, k) => {
        const t = tamanhos[k];
        if (p.length <= t) return;
        if (k === seg && inserindo && off < p.length) {
          partes[k] = p = p.slice(0, off) + p.slice(off + 1);        // modo "substituir"
        }
        if (p.length > t) {
          if (k === seg && inserindo && off > t && k + 1 < n) {      // digitou no fim de uma parte cheia
            const sobra = p.slice(t);
            partes[k] = p.slice(0, t);
            const prox = partes[k + 1] || '';
            partes[k + 1] = (sobra + prox.slice(sobra.length)).slice(0, tamanhos[k + 1]);
            seg = k + 1; off = sobra.length;
          } else {
            partes[k] = p.slice(0, t);
            if (k === seg) off = Math.min(off, t);
          }
        }
      });

      // 5) completou a parte digitando: o cursor pula para a próxima (e cria a barra se faltar)
      if (inserindo && seg < n - 1 && off === tamanhos[seg] && partes[seg].length === tamanhos[seg]) {
        if (partes.length === seg + 1) partes.push('');
        seg += 1; off = 0;
      }

      el.value = partes.join(sep);
      let cursor = 0;
      for (let k = 0; k < seg; k++) cursor += partes[k].length + 1;
      cursor += Math.min(off, partes[seg] ? partes[seg].length : 0);
      try { el.setSelectionRange(cursor, cursor); } catch (er) { /* campo sem foco */ }
      anterior = el.value;
    });

    // ao sair do campo: completa com zero à esquerda (1/2/2026 -> 01/02/2026; 9:30 -> 09:30)
    el.addEventListener('blur', () => {
      const partes = el.value.split(sep);
      if (partes.length !== n || partes.some((p, k) => !p || p.length > tamanhos[k])) return;
      if (partes[n - 1].length !== tamanhos[n - 1]) return;
      const novo = partes.map((p, k) => p.padStart(tamanhos[k], '0')).join(sep);
      if (novo !== el.value) {
        el.value = novo;
        anterior = novo;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }
  const mascaraData = (el) => mascaraPartes(el, [2, 2, 4], '/');
  const mascaraHora = (el) => mascaraPartes(el, [2, 2], ':');

  /* =================================================================
     Avisos (toast e janela)
     ================================================================= */
  function toast(texto, tipo = '') {
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    t.textContent = texto;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), Math.max(4500, String(texto).length * 70));   // mensagem longa fica mais tempo
  }

  function janela({ titulo, texto, erro = false, extra = null, botoes = [{ rotulo: 'OK', classe: 'btn-primario' }] }) {
    return new Promise((resolve) => {
      const m = $('#modal');
      m.classList.toggle('erro', erro);
      $('#modal-titulo').textContent = titulo;
      $('#modal-texto').textContent = texto || '';
      const caixaExtra = $('#modal-extra');
      caixaExtra.innerHTML = '';
      if (extra) caixaExtra.appendChild(extra);
      const acoes = $('#modal-acoes');
      acoes.innerHTML = '';
      botoes.forEach((b, i) => {
        const el = document.createElement('button');
        el.className = `btn ${b.classe || 'btn-fantasma'}`;
        el.textContent = b.rotulo;
        el.addEventListener('click', () => {
          if (b.validar && !b.validar()) return;            // ex.: motivo do cancelamento não escolhido
          m.hidden = true; resolve(b.valor ?? i);
        });
        acoes.appendChild(el);
      });
      m.hidden = false;
      acoes.lastChild.focus();
    });
  }
  const confirmar = (titulo, texto, rotulo = 'Confirmar', classe = 'btn-primario') =>
    janela({ titulo, texto, botoes: [{ rotulo: 'Voltar', valor: false }, { rotulo, classe, valor: true }] });

  /* =================================================================
     Login e sessão
     ================================================================= */
  async function iniciar() {
    // veio do link "redefinir senha" do e-mail?
    let recuperacao = /type=recovery/.test(location.hash);
    sb.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'SIGNED_OUT') mostrarLogin();
      if (evento === 'TOKEN_REFRESHED' && sessao) estado.sessao = sessao;
      if (evento === 'PASSWORD_RECOVERY') {
        recuperacao = true;
        if (sessao && !estado.sessao) entrar(sessao).then(pedirNovaSenha); else pedirNovaSenha();
      }
    });
    const { data } = await sb.auth.getSession();
    if (data.session) { await entrar(data.session); if (recuperacao) pedirNovaSenha(); }
    else mostrarLogin();
  }

  /* -----------------------------------------------------------------
     Esqueci minha senha: envia o link por e-mail e, ao voltar pelo link,
     pede a nova senha
     ----------------------------------------------------------------- */
  $('#btn-esqueci').addEventListener('click', async () => {
    const caixa = document.createElement('div');
    caixa.className = 'motivo-cancel';
    caixa.innerHTML = `<label>E-mail do usuário<input id="r-email" type="email" autocomplete="username" maxlength="120"></label>
      <p class="erro-texto" id="r-erro" role="alert"></p>`;
    caixa.querySelector('#r-email').value = $('#login-email').value.trim();
    let email = '';
    const ok = await janela({
      titulo: 'Esqueci minha senha',
      texto: 'Digite o e-mail do seu usuário. Vamos enviar um link para você criar uma nova senha.',
      extra: caixa,
      botoes: [{ rotulo: 'Voltar', valor: false }, { rotulo: 'Enviar link', classe: 'btn-primario', valor: true, validar: () => {
        email = caixa.querySelector('#r-email').value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { caixa.querySelector('#r-erro').textContent = 'Digite um e-mail válido.'; return false; }
        return true;
      } }]
    });
    if (!ok) return;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    // mensagem igual exista ou não o e-mail (não revela quem tem cadastro)
    if (error && /rate|seconds|limit/i.test(error.message || '')) {
      return janela({ titulo: 'Aguarde um pouco', texto: 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.' });
    }
    janela({ titulo: 'Verifique seu e-mail', texto: `Se ${email} for um usuário do sistema, você vai receber em instantes um e-mail com o link para criar uma nova senha.\n\nNão chegou? Olhe a caixa de spam.` });
  });

  let pedindoSenha = false;
  async function pedirNovaSenha() {
    if (pedindoSenha) return;
    pedindoSenha = true;
    try {
      for (;;) {
        const caixa = document.createElement('div');
        caixa.className = 'motivo-cancel';
        caixa.innerHTML = `<label>Nova senha<input id="n-senha" type="password" autocomplete="new-password" minlength="8" maxlength="72"></label>
          <label>Repita a nova senha<input id="n-senha2" type="password" autocomplete="new-password" maxlength="72"></label>
          <p class="dica-transporte">Mínimo de 8 caracteres. Dica: misture letras e números.</p>
          <p class="erro-texto" id="n-erro" role="alert"></p>`;
        let senha = '';
        const ok = await janela({
          titulo: 'Criar nova senha',
          texto: 'Escolha a nova senha do seu usuário.',
          extra: caixa,
          botoes: [{ rotulo: 'Depois', valor: false }, { rotulo: 'Salvar nova senha', classe: 'btn-primario', valor: true, validar: () => {
            const a = caixa.querySelector('#n-senha').value, b = caixa.querySelector('#n-senha2').value;
            const erro = a.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.' : a !== b ? 'As duas senhas não são iguais.' : '';
            caixa.querySelector('#n-erro').textContent = erro;
            if (erro) return false;
            senha = a; return true;
          } }]
        });
        if (!ok) break;
        const { error } = await sb.auth.updateUser({ password: senha });
        if (!error) { toast('Senha alterada com sucesso.', 'ok'); break; }
        await janela({ titulo: 'Não foi possível trocar a senha', erro: true,
          texto: /different|same/i.test(error.message || '') ? 'A nova senha precisa ser diferente da anterior.'
            : /weak|short|characters/i.test(error.message || '') ? 'Senha muito fraca. Use pelo menos 8 caracteres, com letras e números.'
            : 'O link pode ter expirado. Peça um novo link em "Esqueci minha senha".' });
      }
    } finally {
      pedindoSenha = false;
      if (/type=recovery|access_token|code=/.test(location.hash + location.search)) history.replaceState(null, '', location.pathname);
    }
  }

  function mostrarLogin() {
    if (estado.canal) { sb.removeChannel(estado.canal); estado.canal = null; }
    estado.sessao = null; estado.perfil = null;
    $('#tela-app').hidden = true;
    $('#tela-login').hidden = false;
    $('#login-email').focus();
  }

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-erro').textContent = '';
    const btn = e.submitter; btn.disabled = true;
    const email = $('#login-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      btn.disabled = false;
      $('#login-erro').textContent = 'Digite o seu e-mail.';
      return;
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password: $('#login-senha').value });
    btn.disabled = false;
    if (error) { $('#login-erro').textContent = 'E-mail ou senha incorretos.'; return; }
    await entrar(data.session);
  });

  async function entrar(sessao) {
    estado.sessao = sessao;
    const { data: perfil, error } = await sb.from('perfis').select('id, nome, papel').eq('id', sessao.user.id).maybeSingle();
    if (error || !perfil) {
      await sb.auth.signOut();
      $('#login-erro').textContent = 'Usuário sem permissão. Peça ao administrador para liberar seu acesso.';
      mostrarLogin();
      return;
    }
    estado.perfil = perfil;
    const selo = $('#usuario-nome');
    selo.textContent = perfil.nome || NOMES_PAPEL[perfil.papel];
    selo.className = `selo selo-${perfil.papel}`;
    // aba Histórico só para o administrador (o banco também só entrega o histórico ao admin)
    const ehAdmin = perfil.papel === 'admin';
    $('#aba-btn-historico').hidden = !ehAdmin;
    if (!ehAdmin && !$('#aba-historico').hidden) $('[data-aba="agenda"]').click();
    if (ehAdmin) setTimeout(lembrarBackup, 1500);
    $('#tela-login').hidden = true;
    $('#tela-app').hidden = false;
    // nomes da equipe (para mostrar "finalizado por Ana")
    sb.from('perfis').select('id, nome').then(({ data }) => {
      estado.nomes = Object.fromEntries((data || []).map((p) => [p.id, p.nome]));
      if (estado.itensDia.length) desenharDia();
    });
    await carregarServicos();
    limparForm();
    irParaDia(hojeISO());
    assinarTempoReal();
  }
  const nomeDe = (id) => (id && estado.nomes && estado.nomes[id]) || '';
  const ehAdmin = () => estado.perfil?.papel === 'admin';

  $('#btn-sair').addEventListener('click', () => sb.auth.signOut());

  /* =================================================================
     Tempo real: quando o outro computador mexe, a tela atualiza sozinha
     ================================================================= */
  function assinarTempoReal() {
    if (estado.canal) sb.removeChannel(estado.canal);
    estado.canal = sb.channel('agendamentos-tempo-real')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, (payload) => {
        const reg = payload.new && payload.new.id ? payload.new : payload.old || {};
        const deOutro = reg.criado_por && reg.criado_por !== estado.sessao?.user.id;
        if (payload.eventType === 'INSERT' && deOutro) {
          toast(`${NOMES_PAPEL[reg.origem] || 'Outro usuário'} agendou ${reg.pet_nome || 'um animal'} em ${isoParaBR(reg.data)} às ${hhmm(reg.horario)}.`);
        }
        carregarDia();
        atualizarOcupadosForm();
        if (!$('#aba-graficos').hidden) carregarGraficos();
        if (!$('#aba-fechamento').hidden) carregarFechamento();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'despesas' }, () => {
        if (!$('#aba-fechamento').hidden) carregarFechamento();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fechamentos_dia' }, () => {
        carregarDia();
        if (!$('#aba-fechamento').hidden) carregarFechamento();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servicos' }, () => {
        carregarServicos().then(() => { if (!$('#aba-fechamento').hidden && fech.modo === 'precos') carregarFechamento(); });
      })
      .subscribe((status) => { $('#status-conexao').classList.toggle('on', status === 'SUBSCRIBED'); });
  }

  /* =================================================================
     Abas
     ================================================================= */
  $$('.aba').forEach((b) => b.addEventListener('click', () => {
    $$('.aba').forEach((x) => { x.classList.toggle('ativa', x === b); x.setAttribute('aria-selected', x === b); });
    $('#aba-agenda').hidden = b.dataset.aba !== 'agenda';
    $('#aba-graficos').hidden = b.dataset.aba !== 'graficos';
    $('#aba-historico').hidden = b.dataset.aba !== 'historico';
    $('#aba-passeio').hidden = b.dataset.aba !== 'passeio';
    $('#aba-fechamento').hidden = b.dataset.aba !== 'fechamento';
    if (b.dataset.aba === 'passeio') abrirPasseio();
    if (b.dataset.aba === 'graficos') carregarGraficos();
    if (b.dataset.aba === 'fechamento') carregarFechamento();
    if (b.dataset.aba === 'historico') { mostrarStatusBackup(); carregarHistorico(true); }
  }));

  /* =================================================================
     Agenda do dia
     ================================================================= */
  const campoDia = $('#agenda-data');
  mascaraData(campoDia);
  campoDia.addEventListener('change', () => {
    const iso = brParaISO(campoDia.value);
    if (iso) irParaDia(iso); else campoDia.value = isoParaBR(estado.diaAgenda);
  });
  campoDia.addEventListener('keydown', (e) => { if (e.key === 'Enter') campoDia.dispatchEvent(new Event('change')); });
  const passo = () => (estado.visao === 'semana' ? 7 : 1);
  $('#dia-anterior').addEventListener('click', () => irParaDia(somarDias(estado.diaAgenda, -passo())));
  $('#dia-seguinte').addEventListener('click', () => irParaDia(somarDias(estado.diaAgenda, passo())));
  $('#dia-hoje').addEventListener('click', () => irParaDia(hojeISO()));
  $$('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
    estado.filtro = b.dataset.filtro;
    $$('[data-filtro]').forEach((x) => x.classList.toggle('ativo', x === b));
    if (estado.visao === 'semana') desenharSemana(); else desenharDia();
  }));

  function irParaDia(iso) {
    estado.diaAgenda = iso;
    campoDia.value = isoParaBR(iso);
    $('#agenda-titulo').textContent = estado.visao === 'semana' ? tituloSemana(iso) : diaPorExtenso(iso);
    $('#ps-titulo').textContent = diaPorExtenso(iso);
    $('#ps-data').textContent = isoParaBR(iso);
    carregarDia();
  }

  // Recarrega o que estiver na tela (dia ou semana; e a busca, se estiver aberta)
  function carregarDia() {
    if (estado.buscaAtual) buscarAgenda(estado.buscaAtual);
    return estado.visao === 'semana' ? carregarSemana() : carregarDiaLista();
  }

  // ---------------------------------------------------------------
  // Visão da semana (domingo a sábado)
  // ---------------------------------------------------------------
  const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MESES_MIN = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function inicioSemana(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return somarDias(iso, -new Date(a, m - 1, d).getDay());
  }
  function tituloSemana(iso) {
    const ini = inicioSemana(iso), fim = somarDias(ini, 6);
    const [a1, m1, d1] = ini.split('-').map(Number), [a2, m2, d2] = fim.split('-').map(Number);
    if (a1 !== a2) return `Semana de ${d1} de ${MESES_MIN[m1 - 1]} de ${a1} a ${d2} de ${MESES_MIN[m2 - 1]} de ${a2}`;
    if (m1 !== m2) return `Semana de ${d1} de ${MESES_MIN[m1 - 1]} a ${d2} de ${MESES_MIN[m2 - 1]} de ${a2}`;
    return `Semana de ${d1} a ${d2} de ${MESES_MIN[m2 - 1]} de ${a2}`;
  }
  $$('[data-visao]').forEach((b) => b.addEventListener('click', () => {
    if (estado.visao === b.dataset.visao) return;
    estado.visao = b.dataset.visao;
    $$('[data-visao]').forEach((x) => { const on = x === b; x.classList.toggle('ativo', on); x.setAttribute('aria-pressed', on); });
    $('#lista-agenda').hidden = estado.visao === 'semana';
    $('#semana-grade').hidden = estado.visao !== 'semana';
    irParaDia(estado.diaAgenda);
  }));
  async function carregarSemana() {
    const ini = inicioSemana(estado.diaAgenda), fim = somarDias(ini, 6), pedido = estado.diaAgenda;
    const { data, error } = await sb.from('agendamentos').select('*')
      .gte('data', ini).lte('data', fim).order('data', { ascending: true }).order('horario', { ascending: true });
    if (pedido !== estado.diaAgenda || estado.visao !== 'semana') return;
    if (error) { toast('Não foi possível carregar a semana.', 'erro'); return; }
    estado.itensSemana = data || [];
    desenharSemana();
  }
  function desenharSemana() {
    const filtro = estado.filtro;
    const todos = estado.itensSemana || [];
    const ini = inicioSemana(estado.diaAgenda), hoje = hojeISO();
    const ativos = todos.filter((a) => a.status !== 'cancelado');
    $('#agenda-resumo').innerHTML =
      `<span><b>${ativos.length}</b> na semana</span>` +
      `<span><b>${todos.filter((a) => a.status === 'finalizado').length}</b> finalizado(s)</span>` +
      `<span><b>${todos.filter((a) => a.status === 'entregue').length}</b> entregue(s)</span>`;
    let html = '';
    for (let i = 0; i < 7; i++) {
      const dia = somarDias(ini, i);
      const [, m, d] = dia.split('-').map(Number);
      const itens = todos.filter((a) => a.data === dia && (filtro === 'ativos' ? a.status !== 'cancelado' : a.status === filtro));
      html += `<section class="sem-dia${dia === hoje ? ' sem-hoje' : ''}${i === 0 ? ' sem-dom' : ''}">
        <button class="sem-cab" data-ir-dia="${dia}" title="Abrir este dia"><span>${DIAS_SEM[i]}</span><b>${pad(d)}/${pad(m)}</b>${itens.length ? `<em>${itens.length}</em>` : ''}</button>
        <div class="sem-itens">${itens.length ? itens.map((a) => `
          <button class="sem-item st-${esc(a.status)}" data-ir-dia="${dia}" data-ir-hora="${hhmm(a.horario)}">
            <span class="sem-hora">${hhmm(a.horario)}</span>
            <span class="sem-pet">${esc(a.pet_nome)}${a.saude_obs ? ' <span class="sem-alerta" title="Alerta de saúde">!</span>' : ''}</span>
            <span class="sem-tutor">${esc(a.tutor_nome)}${a.servico ? ` · ${esc(a.servico)}` : ''}</span>
          </button>`).join('') : '<p class="sem-vazio">—</p>'}</div>
      </section>`;
    }
    $('#semana-grade').innerHTML = html;
  }
  // clicar num dia ou animal da semana abre o dia (e destaca o horário)
  $('#semana-grade').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ir-dia]');
    if (!b) return;
    estado.destacar = b.dataset.irHora || null;
    $('[data-visao="dia"]').click();
    irParaDia(b.dataset.irDia);
  });

  // ---------------------------------------------------------------
  // Busca por pet, tutor ou telefone em todas as datas
  // ---------------------------------------------------------------
  const campoBusca = $('#busca-agenda');
  let buscaTimer = null, buscaSeq = 0;
  campoBusca.addEventListener('input', () => {
    clearTimeout(buscaTimer);
    const q = campoBusca.value.trim();
    $('#busca-limpar').hidden = !q;
    if (q.length < 2) { fecharBusca(false); return; }
    buscaTimer = setTimeout(() => buscarAgenda(q), 300);
  });
  campoBusca.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharBusca(true); });
  $('#busca-limpar').addEventListener('click', () => fecharBusca(true));
  function fecharBusca(limparCampo) {
    estado.buscaAtual = null;
    if (limparCampo) { campoBusca.value = ''; $('#busca-limpar').hidden = true; }
    $('#resultado-busca').hidden = true;
    $('#resultado-busca').innerHTML = '';
    $$('.painel-agenda, .painel-passeio').forEach((el) => el.classList.remove('buscando'));
  }
  // No celular, com a aba Passeio aberta, a busca procura só os pets do Leva e traz
  const buscaNoPasseio = () => !$('#aba-passeio').hidden && window.matchMedia('(max-width: 640px)').matches;
  function htmlBuscaPasseio(lista, q, hoje) {
    const grupo = (tipo, titulo, itens, endDe, situacao) => `
      <section class="bp-grupo bp-${tipo}">
        <h4>${titulo} <small>(${itens.length})</small></h4>
        ${itens.length ? `<ul class="busca-lista">${itens.map((a) => {
          const [sit, cls] = situacao(a);
          return `<li><button class="busca-item st-${esc(a.status)}${a.data < hoje ? ' passado' : ''}" data-ir-dia="${esc(a.data)}" data-lv-focar="${tipo}:${esc(a.id)}">
            <span class="busca-data">${isoParaBR(a.data)}<small>${hhmm(a.horario)}</small></span>
            <span class="busca-info"><span class="busca-linha"><b>${esc(a.pet_nome)}</b> · tutor ${esc(a.tutor_nome)}</span>
              <span class="bp-end">${ICONE_PINO}<span>${esc(textoEnd(endDe(a)) || 'Endereço não informado')}</span></span>
              <span class="busca-tags"><span class="tag ${cls}">${sit}</span></span></span>
          </button></li>`;
        }).join('')}</ul>` : '<p class="nota">Nenhum pet encontrado neste grupo.</p>'}
      </section>`;
    const buscar = lista.filter((a) => a.busca_domicilio);
    const levar = lista.filter((a) => a.entrega_domicilio);
    return `<div class="busca-cab"><span><b>${lista.length}${lista.length === 40 ? '+' : ''}</b> pet(s) no Leva e traz para "${esc(q)}"</span>
        <button class="btn btn-fantasma btn-pequeno" id="busca-fechar">Voltar</button></div>`
      + grupo('busca', '🏠➜🐾 Buscar', buscar, endBusca, situacaoBusca)
      + grupo('entrega', '🐾➜🏠 Levar', levar, endEntrega, situacaoEntrega);
  }

  async function buscarAgenda(q) {
    // só letras, números, espaço, hífen e apóstrofo (evita quebrar a consulta)
    const texto = q.normalize('NFC').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
    const digitos = soDigitos(q);
    if (texto.length < 2 && digitos.length < 3) return;
    estado.buscaAtual = q;
    const seq = ++buscaSeq;
    const filtros = [];
    if (texto.length >= 2) filtros.push(`pet_nome.ilike.*${texto}*`, `tutor_nome.ilike.*${texto}*`);
    if (digitos.length >= 3) filtros.push(`telefone.ilike.*${digitos}*`);
    const passeio = buscaNoPasseio();
    let consulta = sb.from('agendamentos')
      .select(passeio ? '*' : 'id, data, horario, pet_nome, tutor_nome, telefone, status, origem, servico')
      .or(filtros.join(','));
    if (passeio) consulta = consulta.or('busca_domicilio.eq.true,entrega_domicilio.eq.true').neq('status', 'cancelado');
    const { data, error } = await consulta.order('data', { ascending: false }).limit(40);
    if (seq !== buscaSeq || estado.buscaAtual !== q) return;
    const caixa = $('#resultado-busca');
    (caixa.closest('.painel') || $('.painel-agenda')).classList.add('buscando');
    caixa.hidden = false;
    if (error) { caixa.innerHTML = '<p class="vazio">Não foi possível buscar agora.</p>'; return; }
    const hoje = hojeISO();
    const lista = (data || []).slice().sort((a, b) => {           // próximos primeiro, depois os passados (mais recentes antes)
      const fa = a.data >= hoje, fb = b.data >= hoje;
      if (fa !== fb) return fa ? -1 : 1;
      const k = (a.data + a.horario).localeCompare(b.data + b.horario);
      return fa ? k : -k;
    });
    if (passeio) { caixa.innerHTML = htmlBuscaPasseio(lista, q, hoje); return; }
    caixa.innerHTML = `<div class="busca-cab"><span><b>${lista.length}${lista.length === 40 ? '+' : ''}</b> resultado(s) para "${esc(q)}"</span>
        <button class="btn btn-fantasma btn-pequeno" id="busca-fechar">Voltar à agenda</button></div>`
      + (lista.length ? `<ul class="busca-lista">${lista.map((a) => `
        <li><button class="busca-item st-${esc(a.status)}${a.data < hoje ? ' passado' : ''}" data-ir-dia="${esc(a.data)}" data-ir-hora="${hhmm(a.horario)}">
          <span class="busca-data">${isoParaBR(a.data)}<small>${hhmm(a.horario)}</small></span>
          <span class="busca-info"><span class="busca-linha"><b>${esc(a.pet_nome)}</b> · tutor ${esc(a.tutor_nome)}${a.telefone ? ` · <span class="sem-quebra">${esc(formatarTelefone(a.telefone))}</span>` : ''}</span>
            <span class="busca-tags"><span class="tag tag-${esc(a.status)}">${NOMES_STATUS[a.status] || esc(a.status)}</span>${a.origem === 'teste' ? '<span class="tag tag-teste">Teste</span>' : ''}${a.servico ? `<span class="tag tag-servico">${esc(a.servico)}</span>` : ''}</span></span>
        </button></li>`).join('')}</ul>` : '<p class="vazio">Nenhum agendamento encontrado.</p>');
  }
  $('#resultado-busca').addEventListener('click', (e) => {
    if (e.target.closest('#busca-fechar')) return fecharBusca(true);
    const b = e.target.closest('[data-ir-dia]');
    if (!b) return;
    fecharBusca(true);
    if (b.dataset.lvFocar) {                                            // resultado do Leva e traz: continua no Passeio
      estado.focarLeva = b.dataset.lvFocar;
      return irParaDia(b.dataset.irDia);
    }
    estado.destacar = b.dataset.irHora;
    if (!$('#aba-passeio').hidden) $('[data-aba="agenda"]').click();
    if (estado.visao === 'semana') $('[data-visao="dia"]').click();
    irParaDia(b.dataset.irDia);
  });

  async function carregarDiaLista() {
    const dia = estado.diaAgenda;
    const [{ data, error }, fec] = await Promise.all([
      sb.from('agendamentos').select('*')
        .eq('data', dia).order('horario', { ascending: true }).order('criado_em', { ascending: true }),
      sb.from('fechamentos_dia').select('data, situacao, fechado_por_nome, fechado_em').eq('data', dia).maybeSingle()
    ]);
    if (dia !== estado.diaAgenda) return;            // usuário já trocou de dia
    if (error) { toast('Não foi possível carregar a agenda.', 'erro'); return; }
    estado.itensDia = data || [];
    estado.fechamentoDia = fec && fec.data && fec.data.situacao === 'fechado' ? fec.data : null;
    desenharDia();
  }

  const ICONE_PINO = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.6" fill="currentColor"/></svg>';
  const NOMES_STATUS = { agendado: 'Agendado', em_banho: 'Em banho', finalizado: 'Finalizado', entregue: 'Entregue', cancelado: 'Cancelado' };
  const ICONE_ALERTA = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3 2 21h20L12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5M12 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function desenharDia() {
    const todos = estado.itensDia;
    const f = estado.filtro;
    const itens = todos.filter((a) => (f === 'ativos' ? a.status !== 'cancelado' : a.status === f));
    const ativos = todos.filter((a) => a.status !== 'cancelado');
    $('#agenda-resumo').innerHTML =
      `<span><b>${ativos.length}</b> agendado(s)</span>` +
      `<span><b>${todos.filter((a) => a.status === 'em_banho').length}</b> em banho</span>` +
      `<span><b>${todos.filter((a) => a.status === 'finalizado').length}</b> finalizado(s)</span>` +
      `<span><b>${todos.filter((a) => a.status === 'entregue').length}</b> entregue(s)</span>` +
      `<span><b>${ativos.filter((a) => a.saude_obs).length}</b> com alerta de saúde</span>`;
    atualizarBotaoLeva();

    // caixa do dia fechado: só consulta (o administrador ainda pode corrigir)
    const fechado = estado.fechamentoDia;
    const admin = ehAdmin();
    const travado = !!fechado && !admin;
    $('#agenda-caixa').hidden = !fechado;
    if (fechado) {
      const quando = new Date(fechado.fechado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      $('#agenda-caixa').innerHTML = `🔒 <b>Caixa fechado</b> por ${esc(fechado.fechado_por_nome || '—')} em ${esc(quando)}. `
        + (admin ? 'Como administrador, você ainda pode corrigir: tudo fica no histórico.' : 'Este dia fica só para consulta. Para corrigir, fale com o administrador.');
    }

    const lista = $('#lista-agenda');
    if (!itens.length) {
      lista.innerHTML = '<li class="vazio">Nenhum animal nesta data com este filtro.</li>';
      return;
    }
    lista.innerHTML = itens.map((a) => {
      const semValor = a.status !== 'cancelado' && a.servico_valor == null;
      const tags = [
        a.origem === 'teste' && '<span class="tag tag-teste">Teste</span>',
        `<span class="tag tag-${a.status}">${NOMES_STATUS[a.status] || a.status}</span>`,
        a.especie && `<span class="tag">${esc(a.especie)}</span>`,
        a.pet_sexo && `<span class="tag">${esc(a.pet_sexo)}</span>`,
        a.pet_idade && `<span class="tag">${esc(a.pet_idade)}</span>`,
        a.porte && `<span class="tag">Porte ${esc(a.porte.toLowerCase())}</span>`,
        a.peso_kg && `<span class="tag">${String(a.peso_kg).replace('.', ',')} kg</span>`,
        a.raca && `<span class="tag">${esc(a.raca)}</span>`,
        a.pelagem && `<span class="tag">Pelo ${esc(a.pelagem.toLowerCase())}</span>`,
        a.servico && `<span class="tag tag-servico">${esc(a.servico)}${a.valor_total != null ? ` · ${dinheiro(a.valor_total)}` : ''}</span>`,
        (Number(a.desconto) > 0 || Number(a.acrescimo) > 0) && `<span class="tag tag-ajuste" title="${esc(a.ajuste_motivo || '')}">${Number(a.desconto) > 0 ? `desconto ${dinheiro(a.desconto)}` : ''}${Number(a.desconto) > 0 && Number(a.acrescimo) > 0 ? ' · ' : ''}${Number(a.acrescimo) > 0 ? `acréscimo ${dinheiro(a.acrescimo)}` : ''}</span>`,
        a.forma_pagamento && `<span class="tag tag-pago">💳 ${esc(FORMAS_CURTAS[a.forma_pagamento] || a.forma_pagamento)}</span>`,
        semValor && '<span class="tag tag-semvalor">Sem valor</span>',
        (a.busca_domicilio || a.entrega_domicilio) && `<span class="tag tag-transporte">${
          a.busca_domicilio && a.entrega_domicilio ? (a.entrega_outro_end ? 'Busca e entrega em endereços diferentes' : 'Busca e entrega em casa')
          : a.busca_domicilio ? 'Buscar em casa' : 'Entregar em casa'}</span>`
      ].filter(Boolean).join('');
      // endereço(s) do leva e traz, cada um com link para o mapa
      const linhaEndereco = (rotulo, rua, numero, bairro, cidade, cep, referencia) => {
        if (!rua) return '';
        const cepFmt = cep ? String(cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';
        const partes = [`${rua}, ${numero || 's/n'}`, bairro, cidade, cepFmt && `CEP ${cepFmt}`].filter(Boolean);
        const mapa = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(enderecoParaMapa(rua, numero, bairro, cidade, cep));
        // cada parte do endereço não quebra no meio (ex.: CEP 01310-100 fica inteiro)
        const textoEnd = partes.map((p) => `<span class="sem-quebra-parte">${esc(p)}</span>`).join(' – ');
        return `<div class="item-endereco">${ICONE_PINO}<span>${rotulo ? `<b>${rotulo}:</b> ` : ''}${textoEnd} · <a href="${mapa}" target="_blank" rel="noopener">Abrir no mapa</a>`
          + `${referencia ? `<br>Referência: ${esc(referencia)}` : ''}</span></div>`;
      };
      let endereco = '';
      if (a.busca_domicilio || a.entrega_domicilio) {
        if (a.entrega_outro_end) {
          endereco = linhaEndereco('Busca', a.end_rua, a.end_numero, a.end_bairro, a.end_cidade, a.end_cep, a.end_referencia)
            + linhaEndereco('Entrega', a.ent_rua, a.ent_numero, a.ent_bairro, a.ent_cidade, a.ent_cep, a.ent_referencia);
        } else {
          endereco = linhaEndereco('', a.end_rua, a.end_numero, a.end_bairro, a.end_cidade, a.end_cep, a.end_referencia);
        }
      }
      const tel = a.telefone ? ` · <span class="sem-quebra">${esc(formatarTelefone(a.telefone))}</span>` : '';
      const acoes = [];
      const bt = (acao, rotulo, classe = 'btn-fantasma') => `<button class="btn ${classe} btn-pequeno" data-acao="${acao}" data-id="${esc(a.id)}">${rotulo}</button>`;
      if (travado) {
        if (a.telefone && (a.status === 'finalizado' || a.status === 'entregue')) acoes.push(bt('avisar', 'Avisar tutor'));
      } else if (a.status === 'agendado') {
        acoes.push(bt('iniciar', 'Iniciar banho', 'btn-banho'));
        acoes.push(bt('finalizar', 'Finalizar'));
        acoes.push(bt('editar', 'Editar'));
        acoes.push(bt('cobrar', 'Valor e pagamento'));
        acoes.push(bt('cancelar', 'Cancelar'));
      } else if (a.status === 'em_banho') {
        acoes.push(bt('finalizar', 'Finalizar', 'btn-ok'));
        acoes.push(bt('cobrar', 'Valor e pagamento'));
        acoes.push(bt('reabrir', 'Voltar p/ agendado'));
      } else if (a.status === 'finalizado') {
        acoes.push(bt('entregar', 'Entregue ao tutor', 'btn-entregar'));
        if (a.telefone) acoes.push(bt('avisar', 'Avisar tutor'));
        acoes.push(bt('cobrar', 'Valor e pagamento'));
        acoes.push(bt('reabrir', 'Reabrir'));
      } else if (a.status === 'entregue') {
        acoes.push(bt('cobrar', 'Valor e pagamento'));
        acoes.push(bt('desfazer-entrega', 'Desfazer entrega'));
      } else {
        acoes.push(bt('reabrir', 'Reativar'));
      }
      if (admin) acoes.push(bt('excluir', 'Excluir'));
      const destaque = estado.destacar && hhmm(a.horario) === estado.destacar && a.status !== 'cancelado' ? ' destaque' : '';
      const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      let info = '';
      const por = (id) => (nomeDe(id) ? ` por ${esc(nomeDe(id))}` : '');
      if (a.status === 'em_banho') {
        info = `<div class="item-obs item-em-banho">🛁 Banho iniciado${a.iniciado_em ? ` às ${hora(a.iniciado_em)}` : ''}</div>`;
      } else if (a.status === 'finalizado' && a.finalizado_em) {
        info = `<div class="item-obs">Finalizado às ${hora(a.finalizado_em)}${por(a.finalizado_por)}${a.aviso_enviado_em ? ` · tutor avisado às ${hora(a.aviso_enviado_em)}` : ''} · aguardando retirada${a.forma_pagamento ? '' : ' · <b>pagamento a informar na entrega</b>'}</div>`;
      } else if (a.status === 'cancelado' && a.motivo_cancelamento) {
        info = `<div class="item-obs item-cancelado"><b>Cancelado:</b> ${esc(a.motivo_cancelamento)}</div>`;
      } else if (a.status === 'entregue') {
        info = `<div class="item-obs item-entregue">${a.finalizado_em ? `Banho finalizado às ${hora(a.finalizado_em)}${por(a.finalizado_por)} · ` : ''}<b>Entregue ao tutor${a.entregue_em ? ` às ${hora(a.entregue_em)}` : ''}</b>${por(a.entregue_por)}</div>`;
      }
      if (Number(a.desconto) > 0 || Number(a.acrescimo) > 0) {
        info += `<div class="item-obs">Valor: ${dinheiro(a.servico_valor)}${Number(a.desconto) > 0 ? ` − ${dinheiro(a.desconto)}` : ''}${Number(a.acrescimo) > 0 ? ` + ${dinheiro(a.acrescimo)}` : ''} = <b>${dinheiro(a.valor_total)}</b>${a.ajuste_motivo ? ` (${esc(a.ajuste_motivo)})` : ''}</div>`;
      }
      return `<li class="item ${a.status}${destaque}" data-hora="${hhmm(a.horario)}">
        <div class="item-hora">${hhmm(a.horario)}</div>
        <div class="item-info">
          <div class="item-nome">${esc(a.pet_nome)} <small>· tutor ${esc(a.tutor_nome)}${tel}</small></div>
          <div class="item-tags">${tags}</div>
          ${a.saude_obs ? `<div class="item-saude">${ICONE_ALERTA}<span>${esc(a.saude_obs)}</span></div>` : ''}
          ${endereco}
          ${a.observacoes ? `<div class="item-obs">Obs.: ${esc(a.observacoes)}</div>` : ''}
          ${info}
        </div>
        <div class="item-acoes">${acoes[0] || ''}${acoes.length > 1
          ? `<button class="btn btn-fantasma btn-pequeno btn-mais" data-mais aria-expanded="false">Mais ▾</button><div class="acoes-extra">${acoes.slice(1).join('')}</div>`
          : ''}</div>
      </li>`;
    }).join('');

    if (estado.destacar) {
      const el = lista.querySelector('.item.destaque');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      estado.destacar = null;
    }
  }

  // Motivo do cancelamento: lista de motivos comuns + detalhe opcional
  const MOTIVOS_CANCELAMENTO = ['Cliente desistiu', 'Cliente não compareceu', 'Remarcado para outro dia', 'Chuva / clima',
    'Pet doente ou em tratamento', 'Indisponibilidade da equipe', 'Outro'];
  async function pedirMotivo(a) {
    const caixa = document.createElement('div');
    caixa.className = 'motivo-cancel';
    caixa.innerHTML = `
      <label class="obrig"><span>Motivo do cancelamento <span class="ast" aria-hidden="true">*</span></span>
        <select id="m-motivo"><option value="">Escolha o motivo…</option>${MOTIVOS_CANCELAMENTO.map((m) => `<option>${esc(m)}</option>`).join('')}</select></label>
      <label>Detalhe (opcional)<textarea id="m-detalhe" rows="2" maxlength="400" placeholder="Ex.: vai trazer na próxima semana"></textarea></label>
      <p class="erro-texto" id="m-erro" role="alert"></p>`;
    let resposta = null;
    const ok = await janela({
      titulo: 'Cancelar agendamento',
      texto: `Cancelar o horário de ${a.pet_nome} às ${hhmm(a.horario)}? O horário fica livre.`,
      extra: caixa,
      botoes: [
        { rotulo: 'Voltar', valor: false },
        { rotulo: 'Cancelar horário', classe: 'btn-perigo', valor: true, validar: () => {
          const m = caixa.querySelector('#m-motivo').value;
          const d = caixa.querySelector('#m-detalhe').value.trim();
          if (!m) { caixa.querySelector('#m-erro').textContent = 'Escolha o motivo do cancelamento.'; caixa.querySelector('#m-motivo').focus(); return false; }
          if (m === 'Outro' && !d) { caixa.querySelector('#m-erro').textContent = 'Descreva o motivo no campo Detalhe.'; caixa.querySelector('#m-detalhe').focus(); return false; }
          resposta = (d ? `${m}: ${d}` : m).slice(0, 500);
          return true;
        } }
      ]
    });
    return ok ? resposta : null;
  }

  // ---------------------------------------------------------------
  // Leva e traz do dia: buscas e entregas em ordem, com rota no mapa
  // ---------------------------------------------------------------
  const temLeva = (a) => a.status !== 'cancelado' && (a.busca_domicilio || a.entrega_domicilio);
  function atualizarBotaoLeva() {
    const n = (estado.itensDia || []).filter(temLeva).length;
    $('#btn-leva').hidden = !n || estado.visao === 'semana';
    $('#leva-qtd').textContent = n ? `(${n})` : '';
    if (!$('#aba-passeio').hidden) montarLeva($('#passeio-leva'));
  }
  const endBusca = (a) => ({ rua: a.end_rua, numero: a.end_numero, bairro: a.end_bairro, cidade: a.end_cidade, cep: a.end_cep, ref: a.end_referencia });
  const endEntrega = (a) => (a.entrega_outro_end
    ? { rua: a.ent_rua, numero: a.ent_numero, bairro: a.ent_bairro, cidade: a.ent_cidade, cep: a.ent_cep, ref: a.ent_referencia }
    : endBusca(a));
  const textoEnd = (e) => [e.rua && `${e.rua}, ${e.numero || 's/n'}`, e.bairro, e.cidade].filter(Boolean).join(' – ');
  const consultaMapa = (e) => enderecoParaMapa(e.rua, e.numero, e.bairro, e.cidade, e.cep);

  // Navegação sempre a partir de onde o celular está (o app de GPS usa a localização atual)
  const MAX_PARADAS = 10;                         // limite do Google Maps: destino + 9 paradas
  function linkRota(enderecos) {
    if (!enderecos.length) return '';
    const lista = enderecos.slice(0, MAX_PARADAS);
    const p = new URLSearchParams({ api: '1', destination: lista[lista.length - 1], travelmode: 'driving' });
    if (lista.length > 1) p.set('waypoints', lista.slice(0, -1).join('|'));
    return 'https://www.google.com/maps/dir/?' + p.toString();
  }
  const linkGoogle = (e) => 'https://www.google.com/maps/dir/?' + new URLSearchParams({ api: '1', destination: consultaMapa(e), travelmode: 'driving' }).toString();
  const linkWaze = (e) => 'https://waze.com/ul?' + new URLSearchParams({ q: consultaMapa(e), navigate: 'yes' }).toString();

  // Ordem escolhida pelo usuário (fica salva neste aparelho, por dia)
  const chaveOrdem = (tipo) => `banhoTosa.ordem.${tipo}.${estado.diaAgenda}`;
  function lerOrdem(tipo) { try { return JSON.parse(localStorage.getItem(chaveOrdem(tipo)) || '[]'); } catch (e) { return []; } }
  function gravarOrdem(tipo, ids) { try { localStorage.setItem(chaveOrdem(tipo), JSON.stringify(ids)); } catch (e) { /* sem armazenamento: vale só enquanto a tela estiver aberta */ } }
  const ordemMemoria = {};
  function ordenar(tipo, itens) {
    const salva = ordemMemoria[chaveOrdem(tipo)] || lerOrdem(tipo);
    const pos = (a) => { const i = salva.indexOf(a.id); return i < 0 ? 1e6 : i; };
    return itens.slice().sort((x, y) => pos(x) - pos(y) || x.horario.localeCompare(y.horario));
  }
  function moverLeva(tipo, id, passo) {
    const itens = ordenar(tipo, (estado.itensDia || []).filter(temLeva).filter((a) => (tipo === 'busca' ? a.busca_domicilio : a.entrega_domicilio)));
    const ids = itens.map((a) => a.id);
    const i = ids.indexOf(id), j = i + passo;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    ordemMemoria[chaveOrdem(tipo)] = ids;
    gravarOrdem(tipo, ids);
    abrirLeva(`${tipo}:${id}`);
  }
  function ordemPorHorario(tipo) {
    delete ordemMemoria[chaveOrdem(tipo)];
    try { localStorage.removeItem(chaveOrdem(tipo)); } catch (e) { /* ok */ }
    abrirLeva();
  }

  // ---------------------------------------------------------------
  // Melhor rota planejada pelo sistema (menos km = menos combustível)
  // Endereço -> ponto no mapa: OpenStreetMap (Nominatim). Melhor ordem pelas
  // ruas reais: OSRM. Sai da clínica e volta para a clínica. Grátis, sem chave;
  // só os endereços são enviados (nunca nome de tutor, pet ou telefone).
  // ---------------------------------------------------------------
  // endereço de saída e volta das rotas (config.js: ENDERECO_LOJA)
  const CLINICA = Object.assign({ rua: 'Avenida Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo/SP', cep: '01310100' },
    C.ENDERECO_LOJA || {});
  const GEO_URL = 'https://nominatim.openstreetmap.org/search';
  const ROTA_URL = 'https://router.project-osrm.org/trip/v1/driving/';
  const AMPLO = new Set(['city', 'town', 'village', 'municipality', 'county', 'state', 'state_district', 'region', 'country']);
  const geoMemoria = {};
  let geoFila = Promise.resolve(), geoUltimo = 0;
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const chaveGeo = (e) => 'banhoTosa.geo.' + [e.rua, e.numero, e.bairro, e.cidade, soDigitos(e.cep)].map((x) => String(x || '').trim().toLowerCase()).join('|');
  function separarCidade(cidade) {
    const m = String(cidade || '').match(/^(.*?)\s*[/-]\s*([A-Za-z]{2})$/);
    return m ? [m[1].trim(), m[2].toUpperCase()] : [String(cidade || '').trim(), ''];
  }
  const ESTADOS = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
    ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
    PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
    RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
  const PHOTON_URL = 'https://photon.komoot.io/api/';
  // por que o mapa falhou (para a mensagem dizer o motivo certo)
  const falhaMapa = { rede: 0, bloqueado: false, detalhe: '' };
  document.addEventListener('securitypolicyviolation', (ev) => {
    if (!/nominatim|osrm|photon/.test(ev.blockedURI || '')) return;
    falhaMapa.bloqueado = true;
    let host = ev.blockedURI;
    try { host = new URL(ev.blockedURI).host; } catch (er) { /* fica o texto */ }
    const regra = (String(ev.originalPolicy || '').match(/connect-src[^;]*/) || [''])[0];
    const versaoRegra = /photon/.test(regra) ? 'v33' : /nominatim/.test(regra) ? 'v32' : 'antiga (sem mapas)';
    falhaMapa.detalhe = `Detalhe: bloqueou ${host} · regra do site no aparelho: ${versaoRegra}.`;
  });
  async function pegarJson(url) {
    let r;
    try { r = await fetch(url, { headers: { Accept: 'application/json' } }); } catch (er) { falhaMapa.rede++; throw er; }
    if (!r.ok) { falhaMapa.rede++; throw new Error('mapa ' + r.status); }
    return r.json();
  }
  // resultado só vale se não for a cidade inteira e se for do estado certo (há cidades com o mesmo nome em estados diferentes)
  const estadoConfere = (uf, nome, iso) => !uf || iso === 'BR-' + uf || semAcento(String(nome || '').trim()) === semAcento(ESTADOS[uf] || uf);
  // OpenStreetMap (Nominatim): uma consulta por vez e no máximo 1 por segundo (regra de uso)
  function geoPedir(params, uf) {
    const vez = geoFila.then(async () => {
      const falta = geoUltimo + 1100 - Date.now();
      if (falta > 0) await esperar(falta);
      geoUltimo = Date.now();
      const q = new URLSearchParams({ format: 'jsonv2', limit: '3', addressdetails: '1', countrycodes: 'br', 'accept-language': 'pt-BR', ...params });
      const lista = await pegarJson(`${GEO_URL}?${q}`);
      const x = (Array.isArray(lista) ? lista : []).find((r) => !AMPLO.has(r.addresstype)
        && estadoConfere(uf, r.address && r.address.state, r.address && r.address['ISO3166-2-lvl4']));
      const pos = x ? [Number(x.lon), Number(x.lat)] : null;
      return pos && pos.every(Number.isFinite) ? pos : null;
    });
    geoFila = vez.catch(() => {});
    return vez;
  }
  // reserva: Photon (também OpenStreetMap, aceita erros de digitação e acentos)
  async function photonPedir(texto, uf) {
    const q = new URLSearchParams({ q: texto, limit: '3', lat: '-23.98', lon: '-48.88' });
    const j = await pegarJson(`${PHOTON_URL}?${q}`);
    const f = ((j && j.features) || []).find((x) => {
      const pr = x.properties || {};
      return pr.countrycode === 'BR' && !AMPLO.has(pr.type) && !['city', 'county', 'state', 'country', 'district'].includes(pr.type) && estadoConfere(uf, pr.state);
    });
    const pos = f && f.geometry && f.geometry.coordinates;
    return pos && pos.length === 2 && pos.every(Number.isFinite) ? [pos[0], pos[1]] : null;
  }
  const geoAndamento = {};
  function localizar(e) {
    const k = chaveGeo(e);
    if (k in geoMemoria) return Promise.resolve(geoMemoria[k]);
    if (!geoAndamento[k]) geoAndamento[k] = localizarAgora(e, k).finally(() => { delete geoAndamento[k]; });
    return geoAndamento[k];
  }
  async function localizarAgora(e, k) {
    try { const salvo = JSON.parse(localStorage.getItem(k) || 'null'); if (salvo) return (geoMemoria[k] = salvo); } catch (er) { /* ok */ }
    const [cid0, uf0] = separarCidade(e.cidade || CLINICA.cidade);
    const cid = cid0 || 'São Paulo', uf = uf0 || 'SP', estado = ESTADOS[uf] || uf;
    const rua = String(e.rua || '').trim(), num = String(e.numero || '').trim(), cep = soDigitos(e.cep);
    const tentativas = [];
    if (rua) {
      tentativas.push(() => geoPedir({ q: `${rua}${num ? ' ' + num : ''}, ${cid}, ${estado}, Brasil` }, uf));
      tentativas.push(() => photonPedir(`${rua}${num ? ' ' + num : ''}, ${cid}, ${estado}`, uf));
      tentativas.push(() => geoPedir({ street: rua, city: cid, state: estado, country: 'Brasil' }, uf));
    }
    if (cep.length === 8) tentativas.push(() => geoPedir({ postalcode: `${cep.slice(0, 5)}-${cep.slice(5)}`, country: 'Brasil' }, uf));
    if (e.bairro) tentativas.push(() => photonPedir(`${e.bairro}, ${cid}, ${estado}`, uf));
    let pos = null, erros = 0, feitas = 0;
    for (const t of tentativas) {
      try { pos = await t(); } catch (er) { erros++; }
      feitas++;
      if (pos) break;
      if (erros >= 2 && erros === feitas) break;                       // os dois serviços sem resposta: desiste logo
    }
    if (!pos && erros === feitas) throw new Error('sem conexão com o mapa');   // nada respondeu: não guarda
    geoMemoria[k] = pos;                                               // não achado: tenta de novo só na próxima abertura
    if (pos) try { localStorage.setItem(k, JSON.stringify(pos)); } catch (er) { /* ok */ }
    return pos;
  }
  // melhor ordem pelas ruas (pontos[0] = clínica, ida e volta)
  async function ordemPelasRuas(pontos) {
    const coords = pontos.map(([lo, la]) => `${lo.toFixed(6)},${la.toFixed(6)}`).join(';');
    const r = await fetch(`${ROTA_URL}${coords}?roundtrip=true&source=first&overview=false&steps=false`);
    if (!r.ok) throw new Error('rota ' + r.status);
    const j = await r.json();
    if (j.code !== 'Ok' || !Array.isArray(j.waypoints) || j.waypoints.length !== pontos.length || (j.trips || []).length !== 1) throw new Error('rota');
    return j.waypoints.map((w, i) => [w.waypoint_index, i]).sort((x, y) => x[0] - y[0]).map(([, i]) => i).filter((i) => i !== 0);
  }
  // reserva, se o serviço de ruas não responder: vizinho mais próximo + 2-opt em linha reta
  function ordemLinhaReta(pontos) {
    const d = ([lo1, la1], [lo2, la2]) => {
      const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.sqrt(a));
    };
    const resta = pontos.map((_, i) => i).slice(1), volta = [0];
    while (resta.length) {
      const ult = pontos[volta[volta.length - 1]];
      let m = 0; resta.forEach((i, k) => { if (d(ult, pontos[i]) < d(ult, pontos[resta[m]])) m = k; });
      volta.push(resta.splice(m, 1)[0]);
    }
    volta.push(0);
    for (let melhorou = true; melhorou;) {
      melhorou = false;
      for (let i = 1; i < volta.length - 2; i++) for (let k = i + 1; k < volta.length - 1; k++) {
        const [a, b, c, e] = [volta[i - 1], volta[i], volta[k], volta[k + 1]].map((x) => pontos[x]);
        if (d(a, c) + d(b, e) < d(a, b) + d(c, e) - 1e-9) { volta.splice(i, k - i + 1, ...volta.slice(i, k + 1).reverse()); melhorou = true; }
      }
    }
    return volta.slice(1, -1);
  }

  const chavePlano = (tipo) => `banhoTosa.plano.${tipo}.${estado.diaAgenda}`;
  const planoMemoria = {}, planejando = {}, tentouAuto = new Set();
  function lerPlano(tipo) {
    const k = chavePlano(tipo);
    if (k in planoMemoria) return planoMemoria[k];
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }
  function gravarPlano(tipo, plano) {
    planoMemoria[chavePlano(tipo)] = plano;
    try { localStorage.setItem(chavePlano(tipo), JSON.stringify(plano)); } catch (e) { /* vale enquanto a tela estiver aberta */ }
  }
  const pendenteLeva = (tipo) => (a) => (tipo === 'busca' ? a.status === 'agendado' : a.status !== 'entregue');
  const itensDoTipo = (tipo) => (estado.itensDia || []).filter(temLeva)
    .filter((a) => (tipo === 'busca' ? a.busca_domicilio : a.entrega_domicilio))
    .sort((x, y) => x.horario.localeCompare(y.horario));
  // 'sem' (sem plano), 'ok' (seguindo o plano), 'mudou' (motorista mudou), 'velho' (entrou pet novo), 'carregando'
  function situacaoPlano(tipo, lista) {
    if (planejando[chavePlano(tipo)]) return 'carregando';
    const p = lerPlano(tipo);
    if (!p) return 'sem';
    const pend = lista.filter(pendenteLeva(tipo)).map((a) => a.id);
    if (pend.some((id) => !p.ids.includes(id))) return 'velho';
    const noPlano = p.ids.filter((id) => pend.includes(id));
    return lista.map((a) => a.id).filter((id) => pend.includes(id)).join() === noPlano.join() ? 'ok' : 'mudou';
  }
  function redesenharLeva() {
    if (!$('#aba-passeio').hidden) montarLeva($('#passeio-leva'));
    else if (!$('#painel-leva').hidden) montarLeva($('#leva-corpo'));
  }
  async function planejarRota(tipo, auto) {
    const k = chavePlano(tipo), dia = estado.diaAgenda;
    if (planejando[k]) return;
    const itens = itensDoTipo(tipo), endDe = tipo === 'busca' ? endBusca : endEntrega;
    const pend = itens.filter(pendenteLeva(tipo));
    if (pend.length < 2) { if (!auto) toast('É preciso ter pelo menos 2 paradas para planejar a rota.', 'erro'); return; }
    planejando[k] = true; redesenharLeva();
    try {
      falhaMapa.rede = 0;
      const tentar = (e) => localizar(e).catch(() => null);
      const clinica = await tentar(CLINICA);
      if (!clinica && falhaMapa.rede >= 2) throw new Error('sem conexão com o mapa');
      const pos = [];
      for (const a of pend) pos.push(await tentar(endDe(a)));
      const achados = pend.filter((a, i) => pos[i]), pts = pos.filter(Boolean);
      if (!achados.length) throw new Error('nenhum endereço achado');
      const origem = clinica || [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
      let ordem = [1];
      if (achados.length > 1) {
        const pontos = [origem, ...pts];
        try { ordem = await ordemPelasRuas(pontos); } catch (e) { ordem = ordemLinhaReta(pontos); }
      }
      if (estado.diaAgenda !== dia) return;                            // trocou de dia no meio: descarta
      const ids = ordem.map((i) => achados[i - 1].id);
      const naoLocal = pend.filter((a) => !ids.includes(a.id)).map((a) => a.id);
      const final = [...ids, ...naoLocal, ...itens.filter((a) => !pend.includes(a)).map((a) => a.id)];
      gravarPlano(tipo, { ids: final, naoLocal });
      ordemMemoria[chaveOrdem(tipo)] = final;
      gravarOrdem(tipo, final);
      if (!auto) toast('Melhor rota planejada.', 'ok');
      if (naoLocal.length) toast(`${naoLocal.length} endereço(s) não foram achados no mapa e ficaram no fim da lista. Confira a ordem deles.`, 'erro');
    } catch (e) {
      if (!auto) {
        toast(falhaMapa.bloqueado
          ? `O site bloqueou o acesso ao mapa. Feche e abra o app de novo; se continuar, mande um print desta mensagem. ${falhaMapa.detalhe}`
          : falhaMapa.rede
            ? 'Não consegui falar com o serviço de mapas (sem internet ou serviço fora do ar). Tente de novo em instantes.'
            : 'O mapa não encontrou os endereços destes pets. Confira rua, número e cidade no cadastro.', 'erro');
      }
    } finally {
      delete planejando[k];
      redesenharLeva();
    }
  }
  // planeja sozinho quando ainda não há plano (ou entrou pet novo) e o motorista não mexeu na ordem
  function planejarSozinho(tipo) {
    const lista = itensDoTipo(tipo), pend = lista.filter(pendenteLeva(tipo));
    if (pend.length < 2) return;
    const sit = situacaoPlano(tipo, lista);
    if (sit !== 'sem' && sit !== 'velho') return;
    const p = lerPlano(tipo), salva = ordemMemoria[chaveOrdem(tipo)] || lerOrdem(tipo);
    if (!p && salva.length) return;                                    // já tinha ordem própria do motorista
    if (p) {                                                           // pet novo: só replaneja se ele seguia o plano
      const ordenados = ordenar(tipo, lista).map((a) => a.id).filter((id) => p.ids.includes(id) && pend.some((a) => a.id === id));
      if (ordenados.join() !== p.ids.filter((id) => ordenados.includes(id)).join()) return;
    }
    const assinatura = `${chavePlano(tipo)}|${pend.map((a) => a.id).sort().join()}`;
    if (tentouAuto.has(assinatura)) return;
    tentouAuto.add(assinatura);
    planejarRota(tipo, true);
  }
  function voltarAoPlano(tipo) {
    const p = lerPlano(tipo);
    if (!p) return;
    ordemMemoria[chaveOrdem(tipo)] = p.ids.slice();
    gravarOrdem(tipo, p.ids);
    abrirLeva();
  }
  function avisoPlano(tipo, lista) {
    if (lista.filter(pendenteLeva(tipo)).length < 2) return '';
    const sit = situacaoPlano(tipo, lista);
    if (sit === 'carregando') return '<div class="lv-plano lv-plano-carregando" role="status"><span class="lv-giro" aria-hidden="true"></span> Planejando a melhor rota…</div>';
    if (sit === 'ok') return `<div class="lv-plano lv-plano-ok"><span><b>⭐ Rota recomendada</b> · a ordem mais econômica, planejada pelo sistema (sai e volta para a clínica). Se precisar, mude com ▲▼.</span>
        <button class="link-btn" data-planejar="${tipo}">↻ Replanejar</button></div>`;
    if (sit === 'mudou') return `<div class="lv-plano lv-plano-mudou"><span><b>✋ Ordem alterada por você.</b> A melhor rota é a recomendada pelo sistema.</span>
        <button class="btn btn-pequeno btn-plano" data-voltar-plano="${tipo}">⭐ Voltar para a rota recomendada</button></div>`;
    if (sit === 'velho') return `<div class="lv-plano lv-plano-mudou"><span><b>🆕 Entrou pet novo</b> depois do planejamento.</span>
        <button class="btn btn-pequeno btn-plano" data-planejar="${tipo}">✨ Replanejar melhor rota</button></div>`;
    return `<div class="lv-plano"><button class="btn btn-pequeno btn-plano" data-planejar="${tipo}">✨ Planejar melhor rota</button></div>`;
  }

  const situacaoBusca = (a) => (a.status === 'agendado' ? ['A buscar', 'lv-pendente'] : ['Já está na loja', 'lv-ok']);
  const situacaoEntrega = (a) => (a.status === 'entregue' ? ['Entregue ✓', 'lv-ok'] : a.status === 'finalizado' ? ['Pronto para entregar', 'lv-pronto']
    : a.status === 'em_banho' ? ['No banho', 'lv-banho'] : ['Aguardando banho', 'lv-pendente']);
  function cartaoLeva(tipo, a, e, [sit, cls], n, total, naoAchado) {
    const tel = a.telefone ? `<a class="lv-tel sem-quebra" href="tel:+55${soDigitos(a.telefone)}">📞 ${esc(formatarTelefone(a.telefone))}</a>` : '';
    return `<li class="lv-item" data-lv="${tipo}:${esc(a.id)}">
      <div class="lv-ordem">
        <button class="lv-seta" data-mover="${tipo}" data-id="${esc(a.id)}" data-passo="-1" aria-label="Subir ${esc(a.pet_nome)}"${n === 1 ? ' disabled' : ''}>▲</button>
        <span class="lv-num">${n}º</span>
        <button class="lv-seta" data-mover="${tipo}" data-id="${esc(a.id)}" data-passo="1" aria-label="Descer ${esc(a.pet_nome)}"${n === total ? ' disabled' : ''}>▼</button>
      </div>
      <div class="lv-info">
        <div><span class="lv-hora">${hhmm(a.horario)}</span> <b>${esc(a.pet_nome)}</b> · tutor ${esc(a.tutor_nome)} <span class="tag ${cls}">${sit}</span></div>
        <div class="lv-end">${ICONE_PINO}<span>${esc(textoEnd(e))}${e.ref ? `<br><i>Ref.: ${esc(e.ref)}</i>` : ''}</span></div>
        ${naoAchado ? '<div class="lv-naoachado">📍 Endereço não achado no mapa: confira a posição deste pet na rota.</div>' : ''}
        <div class="lv-acoes">${tel}
          <a class="lv-nav lv-google" target="_blank" rel="noopener" href="${linkGoogle(e)}">Google Maps</a>
          <a class="lv-nav lv-waze" target="_blank" rel="noopener" href="${linkWaze(e)}">Waze</a>
        </div>
      </div></li>`;
  }
  function secaoLeva(tipo, itens, endDe, situacao, prontos, titulo, classeRota, rotuloRota) {
    const lista = ordenar(tipo, itens);
    const paradas = lista.filter(prontos).map((a) => consultaMapa(endDe(a)));
    // buscas: depois de pegar os pets o GPS termina na clínica; entregas: termina no último endereço
    const volta = tipo === 'busca';
    const cabem = volta ? MAX_PARADAS - 1 : MAX_PARADAS;
    const rota = linkRota(volta && paradas.length ? [...paradas.slice(0, cabem), consultaMapa(CLINICA)] : paradas);
    const salva = !!(ordemMemoria[chaveOrdem(tipo)] || lerOrdem(tipo).length);
    const naoAchados = (lerPlano(tipo) || {}).naoLocal || [];
    return `<section class="lv-secao">
      <div class="lv-secao-cab"><h4>${titulo} <small>(${lista.length})</small></h4>
        ${rota ? `<a class="btn ${classeRota} btn-pequeno" target="_blank" rel="noopener" href="${rota}">${rotuloRota} (${Math.min(paradas.length, cabem)})</a>` : ''}</div>
      ${avisoPlano(tipo, lista)}
      ${lista.length ? `<ol class="lv-lista">${lista.map((a, i) => cartaoLeva(tipo, a, endDe(a), situacao(a), i + 1, lista.length, naoAchados.includes(a.id) && pendenteLeva(tipo)(a))).join('')}</ol>` : '<p class="nota">Nenhuma hoje.</p>'}
      ${paradas.length > cabem ? `<p class="nota lv-aviso">O Google Maps aceita até ${MAX_PARADAS} paradas por rota: a rota leva as ${cabem} primeiras da lista${volta ? ' e termina na clínica' : ''}.</p>` : ''}
      ${salva && lista.length > 1 ? `<button class="link-btn lv-restaurar" data-restaurar="${tipo}">Voltar para a ordem por horário</button>` : ''}
    </section>`;
  }
  // monta as listas de busca/entrega dentro de um painel (janela no PC ou aba Passeio no celular)
  function montarLeva(alvo, focar) {
    const itens = (estado.itensDia || []).filter(temLeva);
    const buscas = itens.filter((a) => a.busca_domicilio);
    const entregas = itens.filter((a) => a.entrega_domicilio);
    const resumo = `${buscas.length} busca(s) e ${entregas.length} entrega(s)`;
    $('#leva-sub').textContent = `${diaPorExtenso(estado.diaAgenda)} · ${resumo}`;
    $('#ps-resumo').textContent = itens.length ? `Leva e traz: ${resumo}` : '';
    alvo.innerHTML = !itens.length && alvo.id === 'passeio-leva'
      ? '<p class="vazio">Nenhuma busca ou entrega em casa neste dia.</p>'
      : secaoLeva('busca', buscas, endBusca, situacaoBusca, (a) => a.status === 'agendado', '🏠➜🐾 Buscar em casa', 'btn-primario', 'Rota das buscas → clínica')
        + secaoLeva('entrega', entregas, endEntrega, situacaoEntrega, (a) => a.status === 'finalizado', '🐾➜🏠 Entregar em casa', 'btn-entregar', 'Rota das entregas prontas')
        + `<p class="nota lv-dica">O sistema planeja sozinho a melhor rota (menos quilômetros e menos combustível), saindo e voltando para a clínica.
           Se precisar, mude a ordem com ▲▼; as rotas seguem essa ordem e saem de onde o celular estiver (a ordem fica salva neste aparelho).
           Na rota entram as buscas ainda não feitas e as entregas com banho finalizado. Em cada pet, "Google Maps" ou "Waze" abre a navegação só até aquele endereço.</p>`;
    if (itens.length) { planejarSozinho('busca'); planejarSozinho('entrega'); }
    if (typeof focar !== 'string' && estado.focarLeva && alvo.id === 'passeio-leva' && itens.some((a) => estado.focarLeva.endsWith(':' + a.id))) {
      focar = estado.focarLeva; estado.focarLeva = null;
    }
    if (typeof focar === 'string') {
      const [tipo, id] = focar.split(':');
      const el = [...alvo.querySelectorAll('.lv-item')].find((li) => li.dataset.lv === `${tipo}:${id}`);
      if (el) { el.classList.add('lv-movido'); el.scrollIntoView({ block: 'nearest' }); }
    }
  }
  function abrirLeva(focar) {
    if (!$('#aba-passeio').hidden) return montarLeva($('#passeio-leva'), focar);
    montarLeva($('#leva-corpo'), focar);
    $('#painel-leva').hidden = false;
  }
  ['#leva-corpo', '#passeio-leva'].forEach((sel) => $(sel).addEventListener('click', (e) => {
    const m = e.target.closest('[data-mover]');
    if (m) return moverLeva(m.dataset.mover, m.dataset.id, Number(m.dataset.passo));
    const r = e.target.closest('[data-restaurar]');
    if (r) return ordemPorHorario(r.dataset.restaurar);
    const pl = e.target.closest('[data-planejar]');
    if (pl) return planejarRota(pl.dataset.planejar, false);
    const vp = e.target.closest('[data-voltar-plano]');
    if (vp) return voltarAoPlano(vp.dataset.voltarPlano);
  }));

  // ---------------------------------------------------------------
  // Aba Passeio (celular): busca + leva e traz do dia
  // ---------------------------------------------------------------
  const ehCelular = window.matchMedia('(max-width: 640px)');
  function posicionarBusca() {
    const busca = $('.busca-agenda'), resultado = $('#resultado-busca');
    if (ehCelular.matches) {
      $('#passeio-busca-slot').append(busca, resultado);
      $('#busca-agenda').placeholder = 'Leva e traz: pet, tutor ou celular';
    } else {
      const painel = $('.painel-agenda');
      $('#busca-agenda').placeholder = 'Buscar pet, tutor ou telefone';
      painel.insertBefore(busca, painel.firstChild);
      painel.appendChild(resultado);
      if (!$('#aba-passeio').hidden) $('[data-aba="agenda"]').click();   // Passeio é só do celular
    }
  }
  try { ehCelular.addEventListener('change', posicionarBusca); } catch (e) { /* navegador antigo */ }
  posicionarBusca();
  function abrirPasseio() {
    if (estado.visao === 'semana') $('[data-visao="dia"]').click();      // o passeio é sempre de um dia
    $('#ps-titulo').textContent = diaPorExtenso(estado.diaAgenda);
    $('#ps-data').textContent = isoParaBR(estado.diaAgenda);
    montarLeva($('#passeio-leva'));
    carregarDia();                                                       // garante dados atualizados
  }
  $('#ps-anterior').addEventListener('click', () => irParaDia(somarDias(estado.diaAgenda, -1)));
  $('#ps-seguinte').addEventListener('click', () => irParaDia(somarDias(estado.diaAgenda, 1)));
  $('#ps-hoje').addEventListener('click', () => irParaDia(hojeISO()));
  $('#btn-leva').addEventListener('click', () => abrirLeva());
  $('#leva-fechar').addEventListener('click', () => { $('#painel-leva').hidden = true; });
  $('#painel-leva').addEventListener('click', (e) => { if (e.target.id === 'painel-leva') $('#painel-leva').hidden = true; });

  // ações da lista
  $('#lista-agenda').addEventListener('click', async (e) => {
    // celular: botão "Mais" abre/fecha as ações secundárias do cartão
    const mais = e.target.closest('[data-mais]');
    if (mais) {
      const li = mais.closest('.item');
      const aberto = li.classList.toggle('mais-aberto');
      mais.setAttribute('aria-expanded', aberto);
      mais.textContent = aberto ? 'Menos ▴' : 'Mais ▾';
      return;
    }
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const a = estado.itensDia.find((x) => x.id === b.dataset.id);
    if (!a) return;
    const acao = b.dataset.acao;

    return executarAcao(acao, a);
  });

  // Mensagem do banco quando é uma regra nossa (ex.: "O caixa do dia ... já foi fechado")
  function erroBanco(error, padrao) {
    const msg = (error && error.message) || '';
    if (error && (error.code === 'P0001' || error.code === '42501') && msg) return msg;
    return padrao;
  }

  // Ações de um agendamento (usadas na agenda e no fechamento de caixa)
  async function executarAcao(acao, a) {
    if (acao === 'editar') return preencherForm(a);

    if (acao === 'iniciar') {
      const { error } = await sb.from('agendamentos').update({ status: 'em_banho' }).eq('id', a.id);
      if (error) return toast(erroBanco(error, 'Não foi possível iniciar o banho.'), 'erro');
      toast(`${a.pet_nome} está no banho.`, 'ok');
      return carregarDia();
    }

    if (acao === 'finalizar') {
      let mudancas = {};
      if (!a.servico || a.servico_valor == null) {
        // sem serviço ou sem valor: pede antes de finalizar (o valor é obrigatório)
        const r = await janelaCobranca(a, 'finalizar');
        if (!r) return;
        mudancas = r;
      } else {
        const ok = await confirmar('Finalizar banho', `Confirmar que o banho de ${a.pet_nome} terminou?\nValor: ${dinheiro(a.valor_total)}` +
          (a.telefone ? '\nO tutor será avisado pelo WhatsApp.' : '\nNão há telefone cadastrado para avisar o tutor.'), 'Finalizar', 'btn-ok');
        if (!ok) return;
      }
      const { error } = await sb.from('agendamentos').update({ ...mudancas, status: 'finalizado' }).eq('id', a.id);
      if (error) return toast(erroBanco(error, 'Não foi possível finalizar.'), 'erro');
      toast(`${a.pet_nome} finalizado.`, 'ok');
      if (a.telefone) avisarTutor({ ...a, ...mudancas, status: 'finalizado' });
      return carregarDia();
    }

    if (acao === 'avisar') return avisarTutor(a);

    if (acao === 'entregar') {
      const r = await janelaCobranca(a, 'entregar');
      if (!r) return;
      const { error } = await sb.from('agendamentos').update({ ...r, status: 'entregue' }).eq('id', a.id);
      if (error) return toast(erroBanco(error, 'Não foi possível registrar a entrega.'), 'erro');
      toast(`${a.pet_nome} entregue ao tutor · ${r.forma_pagamento}.`, 'ok');
      return recarregarTudo();
    }

    if (acao === 'cobrar') {
      const r = await janelaCobranca(a, 'editar');
      if (!r) return;
      const { error } = await sb.from('agendamentos').update(r).eq('id', a.id);
      if (error) return toast(erroBanco(error, 'Não foi possível salvar o valor.'), 'erro');
      toast('Valor e pagamento salvos.', 'ok');
      return recarregarTudo();
    }

    if (acao === 'desfazer-entrega') {
      const ok = await confirmar('Desfazer entrega', `${a.pet_nome} volta para "Finalizado" (aguardando retirada).`, 'Desfazer', 'btn-primario');
      if (!ok) return;
      const { error } = await sb.from('agendamentos').update({ status: 'finalizado' }).eq('id', a.id);
      if (error) return toast(erroBanco(error, 'Não foi possível desfazer a entrega.'), 'erro');
      return recarregarTudo();
    }

    if (acao === 'cancelar') {
      const motivo = await pedirMotivo(a);
      if (motivo === null) return;
      const { error } = await sb.from('agendamentos').update({ status: 'cancelado', motivo_cancelamento: motivo }).eq('id', a.id);
      if (error) return toast(erroBanco(error, 'Não foi possível cancelar.'), 'erro');
      toast('Agendamento cancelado.');
      return recarregarTudo();
    }

    if (acao === 'reabrir') {
      const { error } = await sb.from('agendamentos').update({ status: 'agendado' }).eq('id', a.id);
      if (error) {
        if (error.code === '23505') return conflito(a.data, hhmm(a.horario));
        return toast(erroBanco(error, 'Não foi possível reabrir.'), 'erro');
      }
      return recarregarTudo();
    }

    if (acao === 'excluir') {
      const ok = await confirmar('Excluir definitivamente', `Excluir o registro de ${a.pet_nome}? Ele também sai dos gráficos e do caixa. Esta ação não pode ser desfeita.`, 'Excluir', 'btn-perigo');
      if (!ok) return;
      const { error } = await sb.from('agendamentos').delete().eq('id', a.id);
      if (error) return toast(erroBanco(error, 'Não foi possível excluir.'), 'erro');
      toast('Registro excluído.');
      return recarregarTudo();
    }
  }
  function recarregarTudo() {
    carregarDia();
    if (!$('#aba-fechamento').hidden) carregarFechamento();
  }

  /* =================================================================
     Valor e pagamento (janela): serviço, valor da tabela, desconto,
     acréscimo e forma de pagamento.
       modo 'finalizar' -> valor obrigatório
       modo 'entregar'  -> valor e forma de pagamento obrigatórios
       modo 'editar'    -> só corrige
     ================================================================= */
  function janelaCobranca(a, modo) {
    const caixa = document.createElement('div');
    caixa.className = 'motivo-cancel cobranca';
    const nomes = nomesServicos();
    const ehPadrao = a.servico && nomes.includes(a.servico);
    const v2 = (n) => (n == null || n === '' ? '' : Number(n).toFixed(2).replace('.', ','));
    caixa.innerHTML = `
      <div class="cb-linha">
        <label class="obrig"><span>Serviço <span class="ast" aria-hidden="true">*</span></span>
          <select id="cb-servico"><option value="">Escolha…</option>${nomes.map((n) => `<option${n === a.servico ? ' selected' : ''}>${esc(n)}</option>`).join('')}
            <option value="Outro"${a.servico && !ehPadrao ? ' selected' : ''}>Outro</option></select></label>
        <label>Porte<select id="cb-porte"><option value="">—</option>${PORTES.map((p) => `<option${p === a.porte ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
      </div>
      <label id="cb-outro-ctl" hidden>Qual serviço?<input id="cb-outro" maxlength="120" value="${a.servico && !ehPadrao ? esc(a.servico) : ''}"></label>
      <label class="obrig"><span>Valor do serviço (R$) <span class="ast" aria-hidden="true">*</span></span>
        <span class="valor-wrap"><span class="valor-prefixo" aria-hidden="true">R$</span><input id="cb-valor" inputmode="decimal" maxlength="9" placeholder="0,00" value="${v2(a.servico_valor)}"></span>
        <small class="dica-valor" id="cb-dica"></small></label>
      <div class="cb-linha">
        <label>Desconto (R$)<span class="valor-wrap"><span class="valor-prefixo" aria-hidden="true">R$</span><input id="cb-desconto" inputmode="decimal" maxlength="9" placeholder="0,00" value="${Number(a.desconto) > 0 ? v2(a.desconto) : ''}"></span></label>
        <label>Acréscimo (R$)<span class="valor-wrap"><span class="valor-prefixo" aria-hidden="true">R$</span><input id="cb-acrescimo" inputmode="decimal" maxlength="9" placeholder="0,00" value="${Number(a.acrescimo) > 0 ? v2(a.acrescimo) : ''}"></span></label>
      </div>
      <label id="cb-motivo-ctl">Motivo do desconto/acréscimo<input id="cb-motivo" maxlength="200" placeholder="Ex.: cliente fiel, pelo muito embolado" value="${esc(a.ajuste_motivo || '')}"></label>
      <div class="cb-total">Total a cobrar: <b id="cb-total">—</b></div>
      <div class="campo"><span class="rotulo">Forma de pagamento${modo === 'entregar' ? ' <span class="ast" aria-hidden="true">*</span>' : ''}</span>
        <div class="opcoes opcoes-pagamento" id="cb-formas">${FORMAS.map((fp) => `<label class="opcao"><input type="radio" name="cb-forma" value="${esc(fp)}"${fp === a.forma_pagamento ? ' checked' : ''}> ${esc(FORMAS_CURTAS[fp])}</label>`).join('')}
          ${modo !== 'entregar' ? `<label class="opcao"><input type="radio" name="cb-forma" value=""${!a.forma_pagamento ? ' checked' : ''}> Ainda não pago</label>` : ''}</div></div>
      <p class="erro-texto" id="cb-erro" role="alert"></p>`;
    const q = (s) => caixa.querySelector(s);
    const campos = ['#cb-valor', '#cb-desconto', '#cb-acrescimo'].map(q);
    campos.forEach(mascaraDinheiro);
    let ultimoTabela = precoTabela(a.servico, a.porte);
    const servicoAtual = () => (q('#cb-servico').value === 'Outro' ? nomeProprio(q('#cb-outro').value) : q('#cb-servico').value);
    function atualizar() {
      q('#cb-outro-ctl').hidden = q('#cb-servico').value !== 'Outro';
      const tab = precoTabela(servicoAtual(), q('#cb-porte').value);
      q('#cb-dica').textContent = textoDicaPreco(servicoAtual(), q('#cb-porte').value, lerDinheiro(q('#cb-valor')));
      const v = lerDinheiro(q('#cb-valor')), d = lerDinheiro(q('#cb-desconto')) || 0, ac = lerDinheiro(q('#cb-acrescimo')) || 0;
      q('#cb-total').textContent = v == null || Number.isNaN(v) ? '—' : dinheiro(v - (d || 0) + (ac || 0));
      return tab;
    }
    // trocou serviço ou porte: valor vazio ou igual ao da tabela anterior -> preço novo da tabela
    const repreco = () => {
      const tab = precoTabela(servicoAtual(), q('#cb-porte').value);
      const v = lerDinheiro(q('#cb-valor'));
      if (tab != null && (v == null || (ultimoTabela != null && v === ultimoTabela))) q('#cb-valor').value = v2(tab);
      ultimoTabela = tab;
      atualizar();
    };
    q('#cb-servico').addEventListener('change', () => { repreco(); if (q('#cb-servico').value === 'Outro') q('#cb-outro').focus(); });
    q('#cb-porte').addEventListener('change', repreco);
    caixa.addEventListener('input', atualizar);
    if (a.servico_valor == null) repreco(); else atualizar();

    let resultado = null;
    const titulos = { finalizar: 'Finalizar banho', entregar: 'Entregue ao tutor', editar: 'Valor e pagamento' };
    const textos = {
      finalizar: `Para finalizar ${a.pet_nome}, informe o serviço e o valor.`,
      entregar: `${a.pet_nome} foi retirado(a) por ${a.tutor_nome}? Confira o valor e escolha a forma de pagamento.`,
      editar: `${a.pet_nome} · ${isoParaBR(a.data)} às ${hhmm(a.horario)}`
    };
    const rotulos = { finalizar: 'Finalizar', entregar: 'Confirmar entrega', editar: 'Salvar' };
    const classes = { finalizar: 'btn-ok', entregar: 'btn-entregar', editar: 'btn-primario' };
    return janela({
      titulo: titulos[modo], texto: textos[modo], extra: caixa,
      botoes: [{ rotulo: 'Voltar', valor: false }, { rotulo: rotulos[modo], classe: classes[modo], valor: true, validar: () => {
        const erro = (msg, el) => { q('#cb-erro').textContent = msg; if (el) { el.classList.add('invalido'); el.focus(); } return false; };
        caixa.querySelectorAll('.invalido').forEach((el) => el.classList.remove('invalido'));
        const servico = servicoAtual();
        const valor = lerDinheiro(q('#cb-valor')), desconto = lerDinheiro(q('#cb-desconto')), acrescimo = lerDinheiro(q('#cb-acrescimo'));
        const motivo = q('#cb-motivo').value.trim();
        const forma = (caixa.querySelector('input[name="cb-forma"]:checked') || {}).value || null;
        const precisaValor = modo !== 'editar' || ['finalizado', 'entregue'].includes(a.status);
        if (!servico) return erro('Escolha o serviço.', q('#cb-servico').value === 'Outro' ? q('#cb-outro') : q('#cb-servico'));
        if (Number.isNaN(valor) || (valor != null && (valor < 0 || valor > 99999))) return erro('Valor inválido (use, por exemplo, 85,50).', q('#cb-valor'));
        if (precisaValor && valor == null) return erro('Informe o valor do serviço.', q('#cb-valor'));
        if ([desconto, acrescimo].some((x) => Number.isNaN(x) || (x != null && (x < 0 || x > 99999)))) return erro('Desconto ou acréscimo inválido.');
        if ((desconto || acrescimo) && valor == null) return erro('Informe o valor antes do desconto ou acréscimo.', q('#cb-valor'));
        if ((desconto || acrescimo) && !motivo) return erro('Escreva o motivo do desconto ou acréscimo.', q('#cb-motivo'));
        if (valor != null && valor - (desconto || 0) + (acrescimo || 0) < 0) return erro('O desconto não pode ser maior que o valor.', q('#cb-desconto'));
        if (modo === 'entregar' && !forma) return erro('Escolha a forma de pagamento.');
        resultado = {
          servico, porte: q('#cb-porte').value || null, servico_valor: valor,
          desconto: desconto || 0, acrescimo: acrescimo || 0,
          ajuste_motivo: desconto || acrescimo ? motivo.slice(0, 200) : null,
          forma_pagamento: forma
        };
        return true;
      } }]
    }).then((ok) => (ok ? resultado : null));
  }

  /* =================================================================
     Aviso de pet pronto (WhatsApp)
     ================================================================= */
  // Ajusta o texto pelo sexo do animal: "do(a)", "ele(a)", "pronto(a)"...
  //   Macho -> do, ele, pronto      Fêmea -> da, ela, pronta
  //   Sem sexo cadastrado -> mantém "do(a)", "ele(a)"...
  function generoTexto(txt, sexo) {
    if (sexo !== 'Macho' && sexo !== 'Fêmea') return txt;
    return txt.replace(/(\p{L}+)\(a\)/gu, (_, palavra) =>
      sexo === 'Macho' ? palavra : palavra.replace(/[oe]$/, 'a').replace(/[OE]$/, 'A'));
  }
  function textoAviso(a) {
    const texto = (C.MENSAGEM_PRONTO || '')
      .replaceAll('{tutor}', (a.tutor_nome || '').split(' ')[0])
      .replaceAll('{pet}', a.pet_nome || '')
      .replaceAll('{empresa}', C.NOME_EMPRESA_MENSAGEM || '');
    return generoTexto(texto, a.pet_sexo);
  }

  // Trava contra disparo repetido: pergunta antes de reenviar e ignora clique duplo
  const INTERVALO_AVISO_MIN = Number(C.AVISO_INTERVALO_MIN) || 10;
  const avisando = new Set();
  async function avisarTutor(a) {
    if (avisando.has(a.id)) return;
    if (a.aviso_enviado_em) {
      const min = (Date.now() - new Date(a.aviso_enviado_em).getTime()) / 60000;
      if (min < INTERVALO_AVISO_MIN) {
        const hora = new Date(a.aviso_enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if (C.WHATSAPP_AUTOMATICO) {
          return janela({ titulo: 'Tutor já avisado', texto: `O tutor de ${a.pet_nome} foi avisado às ${hora}. Para evitar mensagens repetidas, aguarde ${INTERVALO_AVISO_MIN} minutos para reenviar.` });
        }
        const ok = await confirmar('Tutor já avisado', `O tutor de ${a.pet_nome} já foi avisado às ${hora}. Enviar de novo?`, 'Enviar de novo', 'btn-ok');
        if (!ok) return;
      }
    }
    avisando.add(a.id);
    try { await enviarAviso(a); } finally { avisando.delete(a.id); }
  }
  async function enviarAviso(a) {
    if (C.WHATSAPP_AUTOMATICO) {
      const { data, error } = await sb.functions.invoke('notificar-whatsapp', { body: { id: a.id } });
      if (!error && data && data.ok) { toast(`Aviso enviado para o tutor de ${a.pet_nome}.`, 'ok'); carregarDia(); return; }
      if (error && error.context && error.context.status === 429) {
        toast('Este tutor já foi avisado há poucos minutos. Aguarde para reenviar.', 'erro');
        return;
      }
      toast('Envio automático falhou. Use o WhatsApp Web.', 'erro');
    }
    const numero = `${C.DDI || '55'}${soDigitos(a.telefone)}`;
    const link = `https://wa.me/${numero}?text=${encodeURIComponent(textoAviso(a))}`;
    const abrir = await janela({
      titulo: 'Avisar o tutor',
      texto: `Mensagem para ${formatarTelefone(a.telefone)}:\n\n${textoAviso(a)}`,
      botoes: [{ rotulo: 'Agora não', valor: false }, { rotulo: 'Abrir WhatsApp', classe: 'btn-ok', valor: true }]
    });
    if (!abrir) return;
    window.open(link, '_blank', 'noopener');
    await sb.from('agendamentos').update({ aviso_enviado_em: new Date().toISOString() }).eq('id', a.id);
    carregarDia();
  }

  /* =================================================================
     Formulário de agendamento
     ================================================================= */
  const f = {
    id: $('#f-id'), data: $('#f-data'), horario: $('#f-horario'), tutor: $('#f-tutor'), telefone: $('#f-telefone'),
    pet: $('#f-pet'), idade: $('#f-idade'), saude: $('#f-saude'), peso: $('#f-peso'), raca: $('#f-raca'), obs: $('#f-obs'),
    busca: $('#f-busca'), entrega: $('#f-entrega'), cep: $('#f-cep'), rua: $('#f-rua'), numero: $('#f-numero'),
    bairro: $('#f-bairro'), cidade: $('#f-cidade'), referencia: $('#f-referencia'),
    outroEnd: $('#f-outro-end'), entCep: $('#f-ent-cep'), entRua: $('#f-ent-rua'), entNumero: $('#f-ent-numero'),
    entBairro: $('#f-ent-bairro'), entCidade: $('#f-ent-cidade'), entReferencia: $('#f-ent-referencia')
  };

  // ---------------------------------------------------------------
  // Serviço + valor em R$ (tabela de preços por serviço e porte)
  // A lista e os preços vêm do banco (aba Fechamento > Preços).
  // Sem conexão com a tabela, usa SERVICOS do config.js (sem preço).
  // ---------------------------------------------------------------
  estado.servicos = [];
  async function carregarServicos() {
    const { data, error } = await sb.from('servicos').select('*').order('ordem').order('nome');
    if (!error) estado.servicos = data || [];
    montarServicos();
  }
  const servicosAtivos = () => estado.servicos.filter((s) => s.ativo);
  function nomesServicos() {
    const doBanco = servicosAtivos().map((s) => s.nome);
    if (doBanco.length) return doBanco;
    return Array.isArray(C.SERVICOS) && C.SERVICOS.length ? C.SERVICOS
      : ['Banho', 'Tosa', 'Banho + Tosa', 'Tosa higiênica', 'Banho + Tosa higiênica', 'Hidratação'];
  }
  // preço da tabela para o serviço + porte (null = sem preço)
  function precoTabela(servico, porte) {
    const s = estado.servicos.find((x) => x.nome === servico);
    if (!s || !porte || !CAMPO_PORTE[porte]) return null;
    const v = s[CAMPO_PORTE[porte]];
    return v == null ? null : Number(v);
  }
  function textoDicaPreco(servico, porte, valorAtual) {
    if (!servico || servico === 'Outro') return servico === 'Outro' ? 'Serviço fora da tabela: digite o valor.' : '';
    const s = estado.servicos.find((x) => x.nome === servico);
    if (!s) return 'Serviço fora da tabela: digite o valor.';
    if (!porte) return [s.valor_pequeno, s.valor_medio, s.valor_grande].some((v) => v != null) ? 'Escolha o porte para preencher o valor pela tabela.' : 'Sem preço na tabela: digite o valor.';
    const tab = precoTabela(servico, porte);
    if (tab == null) return `Sem preço na tabela para porte ${porte.toLowerCase()}: digite o valor.`;
    if (valorAtual != null && !Number.isNaN(valorAtual) && valorAtual !== tab) return `Valor diferente da tabela (${dinheiro(tab)} para porte ${porte.toLowerCase()}).`;
    return `Valor da tabela para porte ${porte.toLowerCase()}.`;
  }
  // dinheiro: só números e vírgula (ex.: 85,50)
  function mascaraDinheiro(el) {
    el.addEventListener('input', () => {
      let v = el.value.replace(/\./g, ',').replace(/[^\d,]/g, '');
      const i = v.indexOf(',');
      if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/,/g, '').slice(0, 2);
      el.value = v;
    });
  }
  function lerDinheiro(el) {
    const t = String(el.value || '').trim();
    if (!t) return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }
  const dinheiro = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const v2 = (n) => (n == null || n === '' ? '' : Number(n).toFixed(2).replace('.', ','));

  f.servicoOutro = $('#f-servico-outro');
  f.valor = $('#f-valor');
  f.desconto = $('#f-desconto');
  f.acrescimo = $('#f-acrescimo');
  f.ajusteMotivo = $('#f-ajuste-motivo');
  [f.valor, f.desconto, f.acrescimo].forEach(mascaraDinheiro);
  const lerValor = () => lerDinheiro(f.valor);
  const servicoMarcado = () => radio('f-servico');
  const servicoEscolhido = () => (servicoMarcado() === 'Outro' ? nomeProprio(f.servicoOutro.value) : servicoMarcado()) || null;
  let ultimoPrecoTabela = null;

  function montarServicos() {
    const marcado = servicoMarcado();
    const lista = nomesServicos().concat('Outro');
    $('#opcoes-servico').innerHTML = lista.map((sv) =>
      `<label class="opcao"><input type="radio" name="f-servico" value="${esc(sv)}"${sv === marcado ? ' checked' : ''}> ${esc(sv)}</label>`).join('');
    // serviço antigo que saiu da tabela continua aparecendo como "Outro"
    if (marcado && !lista.includes(marcado)) { marcarRadio('f-servico', 'Outro'); f.servicoOutro.value = marcado; }
    mostrarServicoOutro();
    atualizarValorDica();
  }
  function mostrarServicoOutro() {
    const outro = servicoMarcado() === 'Outro';
    $('#ctl-servico-outro').hidden = !outro;
    if (!outro) f.servicoOutro.classList.remove('invalido');
  }
  // trocou serviço ou porte: valor vazio ou igual ao preço anterior da tabela -> põe o preço novo
  function aplicarPrecoTabela() {
    const tab = precoTabela(servicoEscolhido(), radio('f-porte'));
    const atual = lerValor();
    if (tab != null && (atual == null || (ultimoPrecoTabela != null && atual === ultimoPrecoTabela))) {
      f.valor.value = v2(tab);
      f.valor.classList.remove('invalido');
    }
    ultimoPrecoTabela = tab;
    atualizarValorDica();
  }
  function atualizarValorDica() {
    const valor = lerValor();
    $('#valor-dica').textContent = textoDicaPreco(servicoEscolhido(), radio('f-porte'), valor);
    const d = lerDinheiro(f.desconto) || 0, ac = lerDinheiro(f.acrescimo) || 0;
    const temAjuste = d > 0 || ac > 0;
    $('#valor-total').hidden = !temAjuste || valor == null || Number.isNaN(valor);
    if (temAjuste && valor != null && !Number.isNaN(valor)) $('#valor-total').innerHTML = `Total a cobrar: <b>${dinheiro(valor - d + ac)}</b>`;
  }
  $('#opcoes-servico').addEventListener('change', () => {
    mostrarServicoOutro();
    if (servicoMarcado() === 'Outro') f.servicoOutro.focus();
    aplicarPrecoTabela();
  });
  f.servicoOutro.addEventListener('input', atualizarValorDica);
  $$('input[name="f-porte"]').forEach((r) => r.addEventListener('change', aplicarPrecoTabela));
  [f.valor, f.desconto, f.acrescimo].forEach((el) => el.addEventListener('input', atualizarValorDica));
  $('#f-pagamento-grupo').innerHTML = FORMAS.map((fp) =>
    `<label class="opcao"><input type="radio" name="f-pagamento" value="${esc(fp)}"> ${esc(FORMAS_CURTAS[fp])}</label>`).join('')
    + '<label class="opcao"><input type="radio" name="f-pagamento" value="" checked> Ainda não pago</label>';

  // ---------------------------------------------------------------
  // Leva e traz: endereço aparece quando a empresa busca e/ou entrega
  // ---------------------------------------------------------------
  const temTransporte = () => f.busca.checked || f.entrega.checked;
  // "Entregar em outro endereço" só faz sentido quando a empresa busca E entrega
  const temOutroEnd = () => f.busca.checked && f.entrega.checked && f.outroEnd.checked;
  function mostrarEndereco() {
    const ativo = temTransporte();
    $('#bloco-endereco').hidden = !ativo;
    $('#ctl-outro-end').hidden = !(f.busca.checked && f.entrega.checked);
    $('#bloco-endereco-entrega').hidden = !temOutroEnd();
    $('#tit-end-busca').textContent = temOutroEnd() ? 'Endereço de busca'
      : f.busca.checked && f.entrega.checked ? 'Endereço de busca e entrega'
      : f.busca.checked ? 'Endereço de busca' : 'Endereço de entrega';
    $('#dica-transporte').textContent =
      temOutroEnd() ? 'A empresa busca o pet em um endereço e entrega em outro (o tutor não estará no local da busca).'
      : f.busca.checked && f.entrega.checked ? 'A empresa busca e entrega o pet no mesmo endereço. Se o tutor não estiver em casa na volta, marque "Entregar em outro endereço".'
      : f.busca.checked ? 'A empresa busca o pet em casa; o tutor retira na loja.'
      : f.entrega.checked ? 'O tutor traz o pet; a empresa entrega em casa.'
      : 'Sem marcar nenhuma opção: o tutor traz e busca o pet.';
  }
  [f.busca, f.entrega].forEach((c) => c.addEventListener('change', () => {
    mostrarEndereco();
    if (temTransporte() && !f.cep.value && !f.rua.value) f.cep.focus();
  }));
  f.outroEnd.addEventListener('change', () => {
    mostrarEndereco();
    if (temOutroEnd() && !f.entCep.value && !f.entRua.value) f.entCep.focus();
  });

  // campo corrigido: tira o vermelho assim que a pessoa digita
  $('#form-agendamento').addEventListener('input', (e) => {
    if (e.target.matches('input, textarea') && e.target.value.trim()) e.target.classList.remove('invalido');
  });

  // CEP: máscara 00000-000 e busca automática no ViaCEP (serve para os dois endereços)
  function ligarCep(c) {
    const status = (txt, tipo = '') => { c.status.textContent = txt; c.status.className = `cep-status ${tipo}`; };
    let consultado = '', controle = null;
    async function buscar(cep) {
      if (cep === consultado) return;
      consultado = cep;
      if (controle) controle.abort();
      controle = new AbortController();
      status('Buscando endereço…');
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controle.signal });
        const d = await r.json();
        if (soDigitos(c.cep.value) !== cep) return;               // a pessoa já mudou o CEP
        if (!r.ok || d.erro) { status('CEP não encontrado. Preencha o endereço manualmente.', 'erro'); c.rua.focus(); return; }
        if (d.logradouro) c.rua.value = d.logradouro;
        if (d.bairro) c.bairro.value = d.bairro;
        if (d.localidade) c.cidade.value = d.uf ? `${d.localidade}/${d.uf}` : d.localidade;
        c.rua.classList.remove('invalido');
        status(d.logradouro ? 'Endereço encontrado. Confira e informe o número.' : 'CEP geral da cidade: digite a rua.', 'ok');
        (d.logradouro ? c.numero : c.rua).focus();
      } catch (e) {
        if (e.name === 'AbortError') return;
        consultado = '';
        status('Não foi possível consultar o CEP agora. Preencha manualmente.', 'erro');
      }
    }
    c.cep.addEventListener('input', () => {
      const d = soDigitos(c.cep.value).slice(0, 8);
      c.cep.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
      c.cep.classList.remove('invalido');
      if (d.length === 8) buscar(d);
      else { consultado = ''; status(''); }
    });
    // limpar(): esquece o CEP consultado; ao editar, marca o CEP atual como já consultado
    return { limpar() { consultado = ''; status(''); }, carregado() { consultado = soDigitos(c.cep.value); status(''); } };
  }
  const cepBusca = ligarCep({ cep: f.cep, rua: f.rua, numero: f.numero, bairro: f.bairro, cidade: f.cidade, status: $('#cep-status') });
  const cepEntrega = ligarCep({ cep: f.entCep, rua: f.entRua, numero: f.entNumero, bairro: f.entBairro, cidade: f.entCidade, status: $('#cep-status-ent') });
  mascaraData(f.data);
  mascaraHora(f.horario);
  f.telefone.addEventListener('input', () => { f.telefone.value = formatarTelefone(f.telefone.value); });
  f.idade.addEventListener('input', () => { f.idade.value = soDigitos(f.idade.value).slice(0, 2); });
  const fIdadeUn = $('#f-idade-un');
  function textoIdade() {
    const n = parseInt(f.idade.value, 10);
    if (!n && n !== 0) return null;
    if (fIdadeUn.value === 'meses') return n === 1 ? '1 mês' : `${n} meses`;
    return n === 1 ? '1 ano' : `${n} anos`;
  }
  function lerIdade(txt) {
    const m = /(\d{1,2})\s*(m)?/i.exec(txt || '');
    f.idade.value = m ? m[1] : '';
    fIdadeUn.value = m && m[2] ? 'meses' : 'anos';
  }
  f.peso.addEventListener('input', () => { f.peso.value = f.peso.value.replace(/[^\d,.]/g, '').replace('.', ','); });
  // ---------------------------------------------------------------
  // Calendário próprio: mostra só os dias do mês (1 a 28/29/30/31),
  // semana de domingo a sábado, "hoje" pelo horário de Brasília.
  // ---------------------------------------------------------------
  const MESES_CAL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const SEMANA = [['dom.', 'domingo'], ['seg.', 'segunda-feira'], ['ter.', 'terça-feira'], ['qua.', 'quarta-feira'], ['qui.', 'quinta-feira'], ['sex.', 'sexta-feira'], ['sáb.', 'sábado']];
  const cal = $('#calendario');
  const btnCal = $('#btn-calendario');
  const ANO_MAX = Number(DATA_MAXIMA.slice(0, 4));
  let calMes = null;                         // { a: ano, m: mês 1-12 }

  const diasNoMes = (a, m) => new Date(a, m, 0).getDate();          // conta anos bissextos
  const isoDe = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;
  function minimoCal() {
    const hoje = hojeISO();
    return estado.dataOriginal && estado.dataOriginal < hoje ? estado.dataOriginal : hoje;
  }

  function desenharCal(focarDia) {
    const { a, m } = calMes;
    const min = minimoCal(), hoje = hojeISO(), escolhido = brParaISO(f.data.value);
    const [minA, minM] = min.split('-').map(Number);
    const total = diasNoMes(a, m);
    const inicio = new Date(a, m - 1, 1).getDay();                  // 0 = domingo
    const podeVoltar = a > minA || (a === minA && m > minM);
    const podeAvancar = a < ANO_MAX || m < 12;

    const opMes = MESES_CAL.map((nome, i) => {
      const fora = (a === minA && i + 1 < minM);
      return `<option value="${i + 1}"${i + 1 === m ? ' selected' : ''}${fora ? ' disabled' : ''}>${nome}</option>`;
    }).join('');
    let opAno = '';
    for (let y = minA; y <= ANO_MAX; y++) opAno += `<option value="${y}"${y === a ? ' selected' : ''}>${y}</option>`;

    let dias = '';
    for (let i = 0; i < inicio; i++) dias += '<span class="cal-vazio" aria-hidden="true"></span>';
    for (let d = 1; d <= total; d++) {
      const iso = isoDe(a, m, d);
      const bloqueado = iso < min || iso > DATA_MAXIMA;
      const dom = (inicio + d - 1) % 7 === 0;
      const cls = ['cal-dia', dom && 'cal-dom', iso === hoje && 'cal-hoje', iso === escolhido && 'cal-escolhido'].filter(Boolean).join(' ');
      const nomeDia = SEMANA[(inicio + d - 1) % 7][1];
      dias += `<button type="button" class="${cls}" data-iso="${iso}"${bloqueado ? ' disabled' : ''} tabindex="-1"
        aria-label="${nomeDia}, ${d} de ${MESES_CAL[m - 1]} de ${a}${iso === hoje ? ' (hoje)' : ''}"${iso === escolhido ? ' aria-pressed="true"' : ''}>${d}</button>`;
    }

    cal.innerHTML = `
      <div class="cal-topo">
        <button type="button" class="cal-nav" data-nav="-1" aria-label="Mês anterior"${podeVoltar ? '' : ' disabled'}>&#8249;</button>
        <select class="cal-mes" aria-label="Mês">${opMes}</select>
        <select class="cal-ano" aria-label="Ano">${opAno}</select>
        <button type="button" class="cal-nav" data-nav="1" aria-label="Próximo mês"${podeAvancar ? '' : ' disabled'}>&#8250;</button>
      </div>
      <div class="cal-semana" aria-hidden="true">${SEMANA.map(([l], i) => `<span${i === 0 ? ' class="cal-dom"' : ''}>${l}</span>`).join('')}</div>
      <div class="cal-grade">${dias}</div>
      <div class="cal-rodape"><button type="button" class="cal-hoje-btn">Hoje</button><button type="button" class="cal-fechar">Fechar</button></div>`;

    // dia que recebe o foco do teclado
    const alvo = cal.querySelector(`.cal-dia[data-iso="${focarDia}"]:not([disabled])`)
      || cal.querySelector('.cal-escolhido:not([disabled])') || cal.querySelector('.cal-hoje:not([disabled])')
      || cal.querySelector('.cal-dia:not([disabled])');
    if (alvo) { alvo.tabIndex = 0; if (focarDia !== undefined) alvo.focus(); }
  }

  function irMes(a, m, focarDia) {
    if (m < 1) { m = 12; a--; } else if (m > 12) { m = 1; a++; }
    const [minA, minM] = minimoCal().split('-').map(Number);
    if (a < minA || (a === minA && m < minM)) { a = minA; m = minM; }
    if (a > ANO_MAX) { a = ANO_MAX; m = 12; }
    calMes = { a, m };
    desenharCal(focarDia);
  }

  function abrirCal() {
    const atual = brParaISO(f.data.value);
    const min = minimoCal();
    const base = atual && atual >= min && atual <= DATA_MAXIMA ? atual : hojeISO();
    const [a, m] = base.split('-').map(Number);
    cal.hidden = false;                      // primeiro aparece, depois recebe o foco
    btnCal.setAttribute('aria-expanded', 'true');
    irMes(a, m, base);
  }
  function fecharCal(voltarFoco) {
    if (cal.hidden) return;
    cal.hidden = true;
    btnCal.setAttribute('aria-expanded', 'false');
    if (voltarFoco) btnCal.focus();
  }
  function escolherDia(iso) {
    f.data.value = isoParaBR(iso);
    f.data.classList.remove('invalido');
    f.data.dispatchEvent(new Event('input', { bubbles: true }));   // mesmo caminho de quando a pessoa digita
    fecharCal(false);
    f.horario.focus();
  }

  btnCal.addEventListener('click', (e) => { e.preventDefault(); cal.hidden ? abrirCal() : fecharCal(false); });
  cal.addEventListener('click', (e) => {
    const dia = e.target.closest('.cal-dia');
    if (dia && !dia.disabled) return escolherDia(dia.dataset.iso);
    const nav = e.target.closest('.cal-nav');
    if (nav && !nav.disabled) return irMes(calMes.a, calMes.m + Number(nav.dataset.nav));
    if (e.target.closest('.cal-hoje-btn')) return escolherDia(hojeISO());
    if (e.target.closest('.cal-fechar')) return fecharCal(true);
  });
  cal.addEventListener('change', (e) => {
    if (e.target.matches('.cal-mes')) irMes(calMes.a, Number(e.target.value));
    if (e.target.matches('.cal-ano')) irMes(Number(e.target.value), calMes.m);
  });
  cal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); return fecharCal(true); }
    const dia = e.target.closest('.cal-dia');
    if (!dia) return;
    const passos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!passos) return;
    e.preventDefault();
    const [a, m, d] = dia.dataset.iso.split('-').map(Number);
    const novo = new Date(a, m - 1, d + passos);
    const iso = isoDe(novo.getFullYear(), novo.getMonth() + 1, novo.getDate());
    if (iso < minimoCal() || iso > DATA_MAXIMA) return;
    if (novo.getMonth() + 1 !== m || novo.getFullYear() !== a) irMes(novo.getFullYear(), novo.getMonth() + 1, iso);
    else { dia.tabIndex = -1; const prox = cal.querySelector(`.cal-dia[data-iso="${iso}"]`); prox.tabIndex = 0; prox.focus(); }
  });
  document.addEventListener('mousedown', (e) => {
    if (!cal.hidden && !cal.contains(e.target) && !btnCal.contains(e.target)) fecharCal(false);
  });

  f.data.addEventListener('input', () => {
    if (brParaISO(f.data.value)) atualizarOcupadosForm();   // só atualiza as sugestões; a agenda muda apenas após salvar
    else desenharSugestoes();
  });
  f.horario.addEventListener('input', desenharSugestoes);
  $('#btn-limpar').addEventListener('click', limparForm);
  $('#btn-cancelar-edicao').addEventListener('click', limparForm);

  /* ---------- Raça: sugestões conforme a espécie ---------- */
  const listaRacas = $('#lista-racas');
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const racasDa = (especie) => {
    const lista = (window.RACAS && window.RACAS[especie]) || [];
    const [primeira, ...resto] = lista;          // SRD fica sempre no topo
    return primeira ? [primeira, ...resto.slice().sort((x, y) => x.localeCompare(y, 'pt-BR'))] : [];
  };
  let racaAtiva = -1;

  function fecharRacas() {
    listaRacas.hidden = true; listaRacas.innerHTML = ''; racaAtiva = -1;
    f.raca.setAttribute('aria-expanded', 'false');
  }
  function abrirRacas() {
    const especie = radio('f-especie');
    const todas = racasDa(especie);
    if (!todas.length) { fecharRacas(); return; }
    const q = semAcento(f.raca.value.trim());
    // primeiro as que COMEÇAM com o texto; depois as que têm uma palavra começando com ele
    const comeca = todas.filter((r) => semAcento(r).startsWith(q));
    const palavra = q ? todas.filter((r) => !semAcento(r).startsWith(q) && semAcento(r).split(/[\s(\-]+/).some((p) => p.startsWith(q))) : [];
    const itens = comeca.concat(palavra);
    const realce = (r) => {
      if (!q) return esc(r);
      const i = semAcento(r).indexOf(q);
      return i < 0 ? esc(r) : esc(r.slice(0, i)) + '<b>' + esc(r.slice(i, i + q.length)) + '</b>' + esc(r.slice(i + q.length));
    };
    listaRacas.innerHTML = itens.length
      ? itens.map((r, i) => `<li role="option" id="raca-op-${i}" data-raca="${esc(r)}">${realce(r)}</li>`).join('')
      : '<li class="sem-resultado">Nenhuma raça encontrada. Pode digitar o nome mesmo assim.</li>';
    racaAtiva = -1;
    listaRacas.hidden = false;
    f.raca.setAttribute('aria-expanded', 'true');
  }
  function escolherRaca(nome) { f.raca.value = nome; fecharRacas(); }
  function moverRaca(passo) {
    const ops = listaRacas.querySelectorAll('li[data-raca]');
    if (!ops.length) return;
    racaAtiva = (racaAtiva + passo + ops.length) % ops.length;
    ops.forEach((li, i) => li.classList.toggle('ativa', i === racaAtiva));
    ops[racaAtiva].scrollIntoView({ block: 'nearest' });
    f.raca.setAttribute('aria-activedescendant', ops[racaAtiva].id);
  }
  f.raca.addEventListener('focus', abrirRacas);
  f.raca.addEventListener('click', abrirRacas);
  f.raca.addEventListener('input', abrirRacas);
  f.raca.addEventListener('keydown', (e) => {
    if (listaRacas.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); moverRaca(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moverRaca(-1); }
    else if (e.key === 'Enter') {
      const op = listaRacas.querySelectorAll('li[data-raca]')[racaAtiva];
      if (op) { e.preventDefault(); escolherRaca(op.dataset.raca); }
    } else if (e.key === 'Escape') fecharRacas();
  });
  listaRacas.addEventListener('mousedown', (e) => {   // mousedown: antes do input perder o foco
    const li = e.target.closest('li[data-raca]');
    if (li) { e.preventDefault(); escolherRaca(li.dataset.raca); }
  });
  f.raca.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== f.raca) fecharRacas(); }, 120));
  // Nomes com a letra inicial maiúscula: "ana souza" -> "Ana Souza", "THOR" -> "Thor".
  // "da, de, do, das, dos, e" ficam minúsculos no meio do nome (Maria da Silva).
  const LIGACOES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von']);
  function nomeProprio(txt) {
    const limpo = String(txt || '').replace(/\s+/g, ' ').trim();
    if (!limpo) return '';
    return limpo.split(' ').map((palavra, i) => {
      const tudoMaiusculo = palavra === palavra.toLocaleUpperCase('pt-BR') && /\p{L}{2,}/u.test(palavra);
      let p = tudoMaiusculo ? palavra.toLocaleLowerCase('pt-BR') : palavra;
      if (i > 0 && LIGACOES.has(p.toLocaleLowerCase('pt-BR'))) return p.toLocaleLowerCase('pt-BR');
      // maiúscula no começo e depois de hífen ou apóstrofo (Maria-Clara, D'Ávila)
      return p.replace(/(^|[-'’])(\p{L})/gu, (m, sep, letra) => sep + letra.toLocaleUpperCase('pt-BR'));
    }).join(' ');
  }
  [f.tutor, f.pet].forEach((campo) => campo.addEventListener('blur', () => { campo.value = nomeProprio(campo.value); }));
  // Nomes: só letras (com acento), espaço, hífen e apóstrofo. Tutor até 100, animal até 50.
  const FORA_DE_NOME = /[^A-Za-zÀ-ÖØ-öø-ÿ' ’-]/g;
  const NOME_OK = /^[A-Za-zÀ-ÖØ-öø-ÿ' ’-]+$/;
  const TEM_LETRA = /[A-Za-zÀ-ÖØ-öø-ÿ]/;
  const nomeValido = (txt, max) => { const t = txt.trim(); return t.length > 0 && t.length <= max && NOME_OK.test(t) && TEM_LETRA.test(t); };
  [[f.tutor, 100], [f.pet, 50]].forEach(([campo, max]) => campo.addEventListener('input', () => {
    const limpo = campo.value.replace(FORA_DE_NOME, '').slice(0, max);
    if (limpo !== campo.value) {
      const pos = Math.max(0, (campo.selectionStart || limpo.length) - (campo.value.length - limpo.length));
      campo.value = limpo;
      try { campo.setSelectionRange(pos, pos); } catch (e) { /* ok */ }
      if (Date.now() - (estado.avisoNome || 0) > 4000) { estado.avisoNome = Date.now(); toast('No nome use só letras (sem números ou símbolos).'); }
    }
  }));

  // Raça só pode ser usada depois de escolher a espécie (Canino ou Felino)
  function travarRaca() {
    const especie = radio('f-especie');
    f.raca.disabled = !especie;
    f.raca.placeholder = !especie ? 'Escolha a espécie'
      : especie === 'Canino' ? 'Digite a raça do cão' : 'Digite a raça do gato';
    if (!especie) fecharRacas();
  }
  $$('input[name="f-especie"]').forEach((r) => r.addEventListener('change', () => {
    // trocou de espécie: apaga a raça se ela for da outra espécie (ex.: "Shih Tzu" em Felino)
    const atual = radio('f-especie');
    const outra = atual === 'Canino' ? 'Felino' : 'Canino';
    const v = semAcento(f.raca.value.trim());
    if (v && racasDa(outra).some((x) => semAcento(x) === v) && !racasDa(atual).some((x) => semAcento(x) === v)) f.raca.value = '';
    travarRaca();
    if (document.activeElement === f.raca) abrirRacas();
  }));

  const radio = (nome) => (document.querySelector(`input[name="${nome}"]:checked`) || {}).value || null;
  const marcarRadio = (nome, valor) => $$(`input[name="${nome}"]`).forEach((r) => { r.checked = r.value === valor; });

  function limparForm() {
    $('#form-agendamento').reset();
    estado.editando = null;
    f.id.value = '';
    soltarCliente();
    fecharClientes();
    estado.dataOriginal = null;
    const dia = estado.diaAgenda || hojeISO();
    f.data.value = isoParaBR(dia < hojeISO() ? hojeISO() : dia);
    $('#form-titulo').textContent = 'Novo agendamento';
    $('#btn-salvar').textContent = 'Salvar agendamento';
    $('#btn-cancelar-edicao').hidden = true;
    $('#form-erro').textContent = '';
    $$('#form-agendamento .invalido').forEach((el) => el.classList.remove('invalido'));
    $('.opcionais').open = false;
    $('.ajuste').open = false;
    ultimoPrecoTabela = null;
    fecharRacas();
    travarRaca();
    fecharCal(false);
    cepBusca.limpar();
    cepEntrega.limpar();
    mostrarServicoOutro();
    atualizarValorDica();
    mostrarEndereco();
    atualizarOcupadosForm();
  }

  function preencherForm(a) {
    limparForm();
    estado.editando = a;
    f.id.value = a.id;
    estado.dataOriginal = a.data;
    f.data.value = isoParaBR(a.data);
    f.horario.value = hhmm(a.horario);
    f.tutor.value = a.tutor_nome || '';
    f.telefone.value = formatarTelefone(a.telefone || '');
    f.pet.value = a.pet_nome || '';
    fPetId.value = a.pet_id || '';
    lerIdade(a.pet_idade);
    f.saude.value = a.saude_obs || '';
    f.peso.value = a.peso_kg ? String(a.peso_kg).replace('.', ',') : '';
    f.raca.value = a.raca || '';
    f.obs.value = a.observacoes || '';
    f.busca.checked = !!a.busca_domicilio;
    f.entrega.checked = !!a.entrega_domicilio;
    f.cep.value = a.end_cep ? a.end_cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';
    f.rua.value = a.end_rua || '';
    f.numero.value = a.end_numero || '';
    f.bairro.value = a.end_bairro || '';
    f.cidade.value = a.end_cidade || '';
    f.referencia.value = a.end_referencia || '';
    f.outroEnd.checked = !!a.entrega_outro_end;
    f.entCep.value = a.ent_cep ? a.ent_cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';
    f.entRua.value = a.ent_rua || '';
    f.entNumero.value = a.ent_numero || '';
    f.entBairro.value = a.ent_bairro || '';
    f.entCidade.value = a.ent_cidade || '';
    f.entReferencia.value = a.ent_referencia || '';
    cepBusca.carregado();
    cepEntrega.carregado();
    marcarServico(a.servico);
    f.valor.value = v2(a.servico_valor);
    f.desconto.value = Number(a.desconto) > 0 ? v2(a.desconto) : '';
    f.acrescimo.value = Number(a.acrescimo) > 0 ? v2(a.acrescimo) : '';
    f.ajusteMotivo.value = a.ajuste_motivo || '';
    if (Number(a.desconto) > 0 || Number(a.acrescimo) > 0) $('.ajuste').open = true;
    marcarRadio('f-pagamento', a.forma_pagamento || '');
    mostrarServicoOutro();
    mostrarEndereco();
    marcarRadio('f-especie', a.especie);
    travarRaca();
    marcarRadio('f-sexo', a.pet_sexo);
    marcarRadio('f-porte', a.porte);
    marcarRadio('f-pelagem', a.pelagem);
    ultimoPrecoTabela = precoTabela(a.servico, a.porte);
    atualizarValorDica();
    if (a.peso_kg || a.raca || a.pelagem || a.observacoes) $('.opcionais').open = true;
    $('#form-titulo').textContent = `Editando: ${a.pet_nome}`;
    $('#btn-salvar').textContent = 'Salvar alterações';
    $('#btn-cancelar-edicao').hidden = false;
    atualizarOcupadosForm();
    f.horario.focus();
  }
  // marca o serviço no formulário (serviço fora da lista vira "Outro" com o nome escrito)
  function marcarServico(nome) {
    if (!nome) { marcarRadio('f-servico', null); f.servicoOutro.value = ''; return; }
    const padrao = nomesServicos().includes(nome);
    marcarRadio('f-servico', padrao ? nome : 'Outro');
    f.servicoOutro.value = padrao ? '' : nome;
  }

  // ---------------------------------------------------------------
  // Cliente cadastrado: busca por celular, tutor ou pet e preenche o formulário.
  // A loja só escolhe data, horário, serviço e valor.
  // ---------------------------------------------------------------
  const clienteInput = $('#f-cliente'), clienteLista = $('#cliente-lista'), fichaPet = $('#ficha-pet'), fPetId = $('#f-pet-id');
  let clienteSeq = 0, clienteTimer = null, clienteResultados = [], clienteAtivo = -1;
  estado.cliente = null;
  const normNome = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  // data de nascimento -> idade para o formulário (meses até 1 ano)
  function idadeDe(nasc) {
    if (!nasc) return null;
    const [a, m, d] = nasc.split('-').map(Number);
    const [ha, hm, hd] = hojeISO().split('-').map(Number);
    let meses = (ha - a) * 12 + (hm - m) - (hd < d ? 1 : 0);
    if (meses < 0) meses = 0;
    return meses < 12 ? { n: meses, un: 'meses' } : { n: Math.floor(meses / 12), un: 'anos' };
  }
  const textoIdadeDe = (nasc) => { const i = idadeDe(nasc); return !i ? '' : i.un === 'meses' ? (i.n === 1 ? '1 mês' : `${i.n} meses`) : (i.n === 1 ? '1 ano' : `${i.n} anos`); };

  function fecharClientes() { clienteLista.hidden = true; clienteInput.setAttribute('aria-expanded', 'false'); clienteAtivo = -1; }
  function desenharClientes(msg) {
    clienteLista.innerHTML = msg ? `<li class="cl-vazio">${msg}</li>`
      : clienteResultados.map((r, i) => `<li role="option" id="cl-${i}" data-i="${i}" class="cl-item${i === clienteAtivo ? ' ativo' : ''}" aria-selected="${i === clienteAtivo}">
          <span class="cl-pet">${r.pet_id ? `🐾 <b>${esc(r.pet_nome)}</b>${r.especie ? ` · ${esc(r.especie)}` : ''}${r.raca ? ` · ${esc(r.raca)}` : ''}` : '<i>sem pet cadastrado</i>'}
            ${r.tem_saude ? '<span class="tag tag-saude">⚠️ saúde</span>' : ''}</span>
          <span class="cl-tutor">${esc(r.tutor_nome)} · <span class="sem-quebra">${esc(formatarTelefone(r.telefone))}</span></span>
        </li>`).join('');
    clienteLista.hidden = false;
    clienteInput.setAttribute('aria-expanded', 'true');
  }
  async function buscarClientes(q) {
    const seq = ++clienteSeq;
    const { data, error } = await sb.rpc('buscar_clientes', { q });
    if (seq !== clienteSeq || clienteInput.value.trim() !== q) return;
    if (error) {
      clienteResultados = [];
      return desenharClientes(error.code === 'PGRST202' || /buscar_clientes/.test(error.message || '')
        ? 'A busca de clientes não está no banco. Rode o supabase/schema.sql no Supabase.'
        : 'Não foi possível buscar agora. Verifique a conexão.');
    }
    clienteResultados = data || [];
    clienteAtivo = clienteResultados.length ? 0 : -1;
    desenharClientes(clienteResultados.length ? '' : 'Nenhum cliente encontrado. Preencha abaixo: o cadastro é criado sozinho ao salvar (com o celular).');
  }
  clienteInput.addEventListener('input', () => {
    clearTimeout(clienteTimer);
    const q = clienteInput.value.trim();
    if (q.replace(/\D/g, '').length < 4 && q.length < 2) { clienteSeq++; return fecharClientes(); }
    clienteTimer = setTimeout(() => buscarClientes(q), 250);
  });
  clienteInput.addEventListener('keydown', (e) => {
    if (clienteLista.hidden || !clienteResultados.length) { if (e.key === 'Enter') e.preventDefault(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      clienteAtivo = (clienteAtivo + (e.key === 'ArrowDown' ? 1 : -1) + clienteResultados.length) % clienteResultados.length;
      desenharClientes();
      clienteInput.setAttribute('aria-activedescendant', `cl-${clienteAtivo}`);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (clienteAtivo >= 0) escolherCliente(clienteResultados[clienteAtivo]);
    } else if (e.key === 'Escape') fecharClientes();
  });
  clienteLista.addEventListener('mousedown', (e) => e.preventDefault());   // não perde o foco antes do clique
  clienteLista.addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) escolherCliente(clienteResultados[Number(li.dataset.i)]);
  });
  clienteInput.addEventListener('blur', () => setTimeout(fecharClientes, 150));

  function preencherEnderecoCliente() {
    const c = estado.cliente;
    if (!c || !c.end_rua || f.rua.value.trim() || !temTransporte()) return;
    f.cep.value = c.end_cep ? c.end_cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';
    f.rua.value = c.end_rua || ''; f.numero.value = c.end_numero || '';
    f.bairro.value = c.end_bairro || ''; f.cidade.value = c.end_cidade || ''; f.referencia.value = c.end_referencia || '';
    cepBusca.carregado();
  }
  [f.busca, f.entrega].forEach((c) => c.addEventListener('change', preencherEnderecoCliente));

  function escolherCliente(r) {
    if (!r) return;
    estado.cliente = r;
    fecharClientes();
    clienteInput.value = '';
    f.tutor.value = r.tutor_nome || '';
    f.telefone.value = formatarTelefone(r.telefone || '');
    if (r.pet_id) {
      fPetId.value = r.pet_id;
      f.pet.value = r.pet_nome || '';
      marcarRadio('f-especie', r.especie);
      travarRaca();
      marcarRadio('f-sexo', r.sexo);
      const i = idadeDe(r.nascimento);
      f.idade.value = i ? String(i.n) : '';
      fIdadeUn.value = i ? i.un : 'anos';
      f.saude.value = r.tem_saude ? (r.saude_obs || '') : '';
      marcarRadio('f-porte', r.porte);
      aplicarPrecoTabela();
      f.peso.value = r.peso_kg ? String(Number(r.peso_kg)).replace('.', ',') : '';
      f.raca.value = r.raca || '';
      marcarRadio('f-pelagem', r.pelagem);
      f.obs.value = r.observacoes || '';
      if (r.peso_kg || r.raca || r.pelagem || r.observacoes) $('.opcionais').open = true;
    } else {
      fPetId.value = '';
    }
    $$('#form-agendamento .invalido').forEach((el) => el.classList.remove('invalido'));
    preencherEnderecoCliente();
    desenharFicha();
    if (r.pet_id) carregarHistoricoPet(r.pet_id);
    (r.pet_id ? (f.horario.value ? f.data : f.horario) : f.pet).focus();
  }

  function desenharFicha(historico, agendados) {
    const r = estado.cliente;
    if (!r) { fichaPet.hidden = true; fichaPet.innerHTML = ''; return; }
    const idade = textoIdadeDe(r.nascimento);
    const ultimo = historico && historico[0];
    const ultimoTxt = ultimo && ultimo.servico
      ? `${esc(ultimo.servico)}${ultimo.valor_total != null ? ' · ' + dinheiro(ultimo.valor_total) : ''}` : '';
    fichaPet.innerHTML = `
      <div class="ficha-cab">
        <span>${r.pet_id ? `🐾 <b>${esc(r.pet_nome)}</b>${r.especie ? ' · ' + esc(r.especie) : ''}${idade ? ' · ' + idade : ''}` : `👤 <b>${esc(r.tutor_nome)}</b>`}
          <small>tutor ${esc(r.tutor_nome)}</small></span>
        <button type="button" class="link-btn" id="ficha-trocar">Trocar cliente</button>
      </div>
      ${r.tem_saude ? `<div class="ficha-saude">⚠️ <b>Saúde:</b> ${esc(r.saude_obs || 'tem alergia ou problema de saúde (sem detalhes)')}</div>` : ''}
      ${r.observacoes ? `<div class="ficha-obs">📝 ${esc(r.observacoes)}</div>` : ''}
      ${r.pet_id && agendados && agendados.length ? `<div class="ficha-hist ficha-agendados"><span class="ficha-hist-tit">Agendados</span><ul>${agendados.map((h) => {
          const quando = h.data === hojeISO() ? 'hoje' : h.data === somarDias(hojeISO(), 1) ? 'amanhã' : '';
          return `<li><span class="sem-quebra">${isoParaBR(h.data)}</span> às ${hhmm(h.horario)}${quando ? ` <span class="tag tag-quando">${quando}</span>` : ''} · ${esc(h.servico || 'sem serviço informado')}${h.servico_valor != null ? ` · <b class="sem-quebra">R$ ${Number(h.servico_valor).toFixed(2).replace('.', ',')}</b>` : ''}${h.status === 'em_banho' ? ' <span class="tag tag-em_banho">Em banho</span>' : ''}</li>`;
        }).join('')}</ul></div>` : ''}
      ${r.pet_id ? `<div class="ficha-hist">${historico === undefined ? '<span class="nota">Carregando últimos atendimentos…</span>'
        : !historico.length ? `<span class="nota">${agendados && agendados.length ? 'Nenhum atendimento finalizado ainda.' : 'Primeiro atendimento deste pet.'}</span>`
        : `<span class="ficha-hist-tit">Últimos atendimentos</span><ul>${historico.map((h) => `<li><span class="sem-quebra">${isoParaBR(h.data)}</span> · ${esc(h.servico || 'sem serviço informado')}${h.valor_total != null ? ` · <b class="sem-quebra">${dinheiro(h.valor_total)}</b>` : ''}</li>`).join('')}</ul>
           ${ultimo ? `<button type="button" class="btn btn-pequeno btn-repetir" id="ficha-repetir">↻ Repetir último${ultimoTxt ? `: ${ultimoTxt}` : ''}</button>` : ''}`}</div>` : ''}`;
    fichaPet.hidden = false;
    estado.ultimoAtendimento = ultimo || null;
  }
  // Agendados = ainda vão acontecer (agendado / em banho). Últimos atendimentos = só os finalizados ou entregues.
  async function carregarHistoricoPet(petId) {
    const campos = 'data, horario, servico, servico_valor, valor_total, status, busca_domicilio, entrega_domicilio, entrega_outro_end, end_cep, end_rua, end_numero, end_bairro, end_cidade, end_referencia, ent_cep, ent_rua, ent_numero, ent_bairro, ent_cidade, ent_referencia';
    const [feitos, futuros] = await Promise.all([
      sb.from('agendamentos').select(campos).eq('pet_id', petId).in('status', ['finalizado', 'entregue'])
        .order('data', { ascending: false }).order('horario', { ascending: false }).limit(3),
      sb.from('agendamentos').select('data, horario, servico, servico_valor, status').eq('pet_id', petId).in('status', ['agendado', 'em_banho'])
        .order('data', { ascending: true }).order('horario', { ascending: true }).limit(5)
    ]);
    if (!estado.cliente || estado.cliente.pet_id !== petId) return;
    desenharFicha(feitos.error ? [] : (feitos.data || []), futuros.error ? [] : (futuros.data || []));
  }
  // "Repetir último": mesmo serviço, valor e leva e traz do último atendimento
  function repetirUltimo() {
    const u = estado.ultimoAtendimento;
    if (!u) return;
    marcarServico(u.servico);
    // preço de hoje da tabela; se o serviço não tiver preço, repete o último valor
    const tab = precoTabela(u.servico, radio('f-porte'));
    f.valor.value = v2(tab != null ? tab : u.servico_valor);
    ultimoPrecoTabela = tab;
    mostrarServicoOutro();
    atualizarValorDica();
    f.busca.checked = !!u.busca_domicilio;
    f.entrega.checked = !!u.entrega_domicilio;
    f.outroEnd.checked = !!u.entrega_outro_end;
    if (u.end_rua) {
      f.cep.value = u.end_cep ? u.end_cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';
      f.rua.value = u.end_rua; f.numero.value = u.end_numero || ''; f.bairro.value = u.end_bairro || '';
      f.cidade.value = u.end_cidade || ''; f.referencia.value = u.end_referencia || '';
      cepBusca.carregado();
    }
    if (u.ent_rua) {
      f.entCep.value = u.ent_cep ? u.ent_cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';
      f.entRua.value = u.ent_rua; f.entNumero.value = u.ent_numero || ''; f.entBairro.value = u.ent_bairro || '';
      f.entCidade.value = u.ent_cidade || ''; f.entReferencia.value = u.ent_referencia || '';
      cepEntrega.carregado();
    }
    mostrarEndereco();
    preencherEnderecoCliente();
    toast('Serviço, valor (pela tabela de hoje) e leva e traz do último atendimento preenchidos. Agora escolha data e horário.', 'ok');
    (f.data.value ? f.horario : f.data).focus();
  }
  function soltarCliente() {
    estado.cliente = null;
    estado.ultimoAtendimento = null;
    fPetId.value = '';
    desenharFicha();
  }
  fichaPet.addEventListener('click', (e) => {
    if (e.target.closest('#ficha-trocar')) { soltarCliente(); clienteInput.focus(); return; }
    if (e.target.closest('#ficha-repetir')) return repetirUltimo();
  });
  // o pet escolhido só vale se o nome e o celular continuarem os mesmos
  function petIdValido() {
    const c = estado.cliente;
    if (!fPetId.value) return null;
    if (c && (normNome(f.pet.value) !== normNome(c.pet_nome) || soDigitos(f.telefone.value) !== soDigitos(c.telefone))) return null;
    return fPetId.value;
  }

  // horários já ocupados na data do formulário (para as sugestões)
  async function atualizarOcupadosForm() {
    const iso = brParaISO(f.data.value);
    if (!iso) { estado.ocupadosForm = []; desenharSugestoes(); return; }
    const { data } = await sb.from('agendamentos').select('id, horario').eq('data', iso).neq('status', 'cancelado');
    if (brParaISO(f.data.value) !== iso) return;
    estado.ocupadosForm = (data || []).filter((x) => x.id !== f.id.value).map((x) => hhmm(x.horario));
    desenharSugestoes();
  }

  function gradeHorarios() {
    const [hi, mi] = (C.HORARIO_INICIO || '07:00').split(':').map(Number);
    const [hf, mf] = (C.HORARIO_FIM || '19:00').split(':').map(Number);
    const passo = Math.max(5, C.INTERVALO_MIN || 30);
    const out = [];
    for (let t = hi * 60 + mi; t <= hf * 60 + mf; t += passo) out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
    return out;
  }

  function desenharSugestoes() {
    const box = $('#sugestoes');
    const isoForm = brParaISO(f.data.value);
    if (!isoForm) {
      box.innerHTML = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(f.data.value)
        ? '<span class="aviso-ocupado">Data inexistente. Confira o dia e o mês (ex.: abril tem 30 dias; 29/02 só existe em ano bissexto).</span>' : '';
      return;
    }
    if (dataAlemDoLimite(isoForm)) {
      box.innerHTML = '<span class="aviso-ocupado">A data máxima para agendamento é 31/12/2100.</span>';
      return;
    }
    if (dataPassada(isoForm)) {
      box.innerHTML = '<span class="aviso-ocupado">Esta data já passou. Só é possível agendar a partir de hoje (' + isoParaBR(hojeISO()) + ').</span>';
      return;
    }
    const ocup = new Set(estado.ocupadosForm);
    const atual = f.horario.value;
    const aviso = horaValida(atual) && ocup.has(atual)
      ? `<span class="aviso-ocupado">${esc(atual)} já está ocupado nesta data.</span>` : '';
    box.innerHTML = '<span class="rotulo">Horários (riscados = ocupados):</span>' +
      gradeHorarios().map((h) => ocup.has(h)
        ? `<button type="button" class="hora ocupada" disabled title="Ocupado">${h}</button>`
        : `<button type="button" class="hora" data-hora="${h}">${h}</button>`).join('') + aviso;
  }
  $('#sugestoes').addEventListener('click', (e) => {
    const b = e.target.closest('.hora[data-hora]');
    if (!b) return;
    f.horario.value = b.dataset.hora;
    f.horario.classList.remove('invalido');
    desenharSugestoes();
  });

  function validar() {
    const erros = [];
    const marca = (el, ok) => { el.classList.toggle('invalido', !ok); return ok; };
    const dataISO = brParaISO(f.data.value);
    if (!marca(f.data, !!dataISO)) erros.push('Data inválida (use DD/MM/AAAA).');
    else if (dataAlemDoLimite(dataISO)) {
      marca(f.data, false);
      erros.push('A data máxima para agendamento é 31/12/2100.');
    } else if (dataPassada(dataISO)) {
      marca(f.data, false);
      erros.push('Não é possível agendar em uma data que já passou. Escolha hoje ou uma data futura.');
    }
    if (!marca(f.horario, horaValida(f.horario.value))) erros.push('Horário inválido (use HH:MM).');
    const idadeN = parseInt(f.idade.value, 10);
    if (!marca(f.idade, !idadeN || (fIdadeUn.value === 'meses' ? idadeN <= 420 : idadeN <= 35))) erros.push('Idade inválida: um pet não passa de 35 anos.');
    if (!marca(f.tutor, nomeValido(f.tutor.value, 100))) erros.push(f.tutor.value.trim() ? 'Nome do tutor: só letras, até 100.' : 'Informe o nome do tutor.');
    if (!marca(f.pet, nomeValido(f.pet.value, 50))) erros.push(f.pet.value.trim() ? 'Nome do animal: só letras, até 50.' : 'Informe o nome do animal.');
    const tel = soDigitos(f.telefone.value);
    if (!marca(f.telefone, !tel || tel.length >= 10)) erros.push('Telefone incompleto.');
    if (temTransporte()) {
      const cep = soDigitos(f.cep.value);
      if (!marca(f.cep, !cep || cep.length === 8)) erros.push('CEP incompleto.');
      if (!marca(f.rua, f.rua.value.trim().length > 0)) erros.push('Informe a rua para a busca/entrega.');
      if (!marca(f.numero, f.numero.value.trim().length > 0)) erros.push('Informe o número da casa para a busca/entrega.');
    }
    if (servicoMarcado() === 'Outro' && !marca(f.servicoOutro, f.servicoOutro.value.trim().length > 0)) erros.push('Escreva qual é o serviço.');
    const valor = lerValor();
    if (!marca(f.valor, valor === null || (valor >= 0 && valor <= 99999))) erros.push('Valor inválido (use, por exemplo, 85,50).');
    const desconto = lerDinheiro(f.desconto), acrescimo = lerDinheiro(f.acrescimo);
    const ajusteOk = (x) => x === null || (x >= 0 && x <= 99999);
    if (!marca(f.desconto, ajusteOk(desconto))) erros.push('Desconto inválido.');
    if (!marca(f.acrescimo, ajusteOk(acrescimo))) erros.push('Acréscimo inválido.');
    if ((desconto || acrescimo) && valor === null) { marca(f.valor, false); erros.push('Informe o valor antes do desconto ou acréscimo.'); }
    if ((desconto || acrescimo) && !marca(f.ajusteMotivo, f.ajusteMotivo.value.trim().length > 0)) erros.push('Escreva o motivo do desconto ou acréscimo.');
    if (valor !== null && desconto && valor - desconto + (acrescimo || 0) < 0) { marca(f.desconto, false); erros.push('O desconto não pode ser maior que o valor.'); }
    if (erros.length && (desconto || acrescimo)) $('.ajuste').open = true;
    // atendimento já finalizado: serviço e valor continuam obrigatórios
    const ed = estado.editando;
    if (ed && ['finalizado', 'entregue'].includes(ed.status)) {
      if (!servicoEscolhido()) erros.push('Este atendimento já foi finalizado: escolha o serviço.');
      if (!marca(f.valor, valor !== null && !Number.isNaN(valor))) erros.push('Este atendimento já foi finalizado: informe o valor.');
    }
    if (temOutroEnd()) {
      const cep = soDigitos(f.entCep.value);
      if (!marca(f.entCep, !cep || cep.length === 8)) erros.push('CEP de entrega incompleto.');
      if (!marca(f.entRua, f.entRua.value.trim().length > 0)) erros.push('Informe a rua do endereço de entrega.');
      if (!marca(f.entNumero, f.entNumero.value.trim().length > 0)) erros.push('Informe o número do endereço de entrega.');
    }
    const peso = f.peso.value ? Number(f.peso.value.replace(',', '.')) : null;
    if (!marca(f.peso, peso === null || (peso > 0 && peso < 999))) erros.push('Peso inválido.');
    return { erros, peso };
  }

  $('#form-agendamento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { erros, peso } = validar();
    $('#form-erro').textContent = erros.join(' ');
    if (erros.length) return;

    const registro = {
      data: brParaISO(f.data.value),
      horario: f.horario.value,
      tutor_nome: nomeProprio(f.tutor.value),
      telefone: soDigitos(f.telefone.value) || null,
      pet_nome: nomeProprio(f.pet.value),
      pet_idade: textoIdade(),
      especie: radio('f-especie'),
      pet_sexo: radio('f-sexo'),
      saude_obs: f.saude.value.trim() || null,
      porte: radio('f-porte'),
      peso_kg: peso,
      raca: f.raca.value.trim() || null,
      pelagem: radio('f-pelagem'),
      observacoes: f.obs.value.trim() || null,
      // leva e traz (sem busca/entrega, o endereço não é guardado)
      busca_domicilio: f.busca.checked,
      entrega_domicilio: f.entrega.checked,
      end_cep: temTransporte() ? (soDigitos(f.cep.value) || null) : null,
      end_rua: temTransporte() ? (nomeProprio(f.rua.value) || null) : null,
      end_numero: temTransporte() ? (f.numero.value.trim() || null) : null,
      end_bairro: temTransporte() ? (nomeProprio(f.bairro.value) || null) : null,
      end_cidade: temTransporte() ? (f.cidade.value.trim() || null) : null,
      end_referencia: temTransporte() ? (f.referencia.value.trim() || null) : null,
      // entrega em outro endereço
      entrega_outro_end: temOutroEnd(),
      ent_cep: temOutroEnd() ? (soDigitos(f.entCep.value) || null) : null,
      ent_rua: temOutroEnd() ? (nomeProprio(f.entRua.value) || null) : null,
      ent_numero: temOutroEnd() ? (f.entNumero.value.trim() || null) : null,
      ent_bairro: temOutroEnd() ? (nomeProprio(f.entBairro.value) || null) : null,
      ent_cidade: temOutroEnd() ? (f.entCidade.value.trim() || null) : null,
      ent_referencia: temOutroEnd() ? (f.entReferencia.value.trim() || null) : null,
      // serviço e valor (o valor é obrigatório só para finalizar)
      servico: servicoEscolhido(),
      servico_valor: servicoEscolhido() ? lerValor() : null,
      desconto: servicoEscolhido() && lerValor() !== null ? (lerDinheiro(f.desconto) || 0) : 0,
      acrescimo: servicoEscolhido() && lerValor() !== null ? (lerDinheiro(f.acrescimo) || 0) : 0,
      ajuste_motivo: null,
      forma_pagamento: radio('f-pagamento') || null
    };
    if (registro.desconto || registro.acrescimo) registro.ajuste_motivo = f.ajusteMotivo.value.trim().slice(0, 200);
    // ligação com o cadastro do pet (só se o banco já tiver o cadastro de clientes)
    if (estado.temClientes !== false) registro.pet_id = petIdValido();

    const btn = $('#btn-salvar');
    btn.disabled = true;
    const editando = !!f.id.value;
    const gravar = () => (editando
      ? sb.from('agendamentos').update(registro).eq('id', f.id.value)
      : sb.from('agendamentos').insert(registro));
    let { error } = await gravar();
    // banco ainda sem o cadastro de clientes (atualização v5 não rodada): salva sem a ligação com o pet
    if (error && 'pet_id' in registro && /pet_id/.test(`${error.message || ''} ${error.details || ''}`)) {
      estado.temClientes = false;
      delete registro.pet_id;
      ({ error } = await gravar());
    }
    btn.disabled = false;

    if (error) {
      // 23505 = o banco recusou porque outro animal já ocupa a data/horário
      if (error.code === '23505') return conflito(registro.data, registro.horario);
      if (error.code === 'P0001' && /caixa|serviço e o valor/i.test(error.message || '')) {
        $('#form-erro').textContent = error.message;
        return;
      }
      if ((error.message || '').includes('data que já passou')) {
        f.data.classList.add('invalido');
        $('#form-erro').textContent = 'Não é possível agendar em uma data que já passou. Escolha hoje ou uma data futura.';
        return;
      }
      if ((error.message || '').includes('31/12/2100')) {
        f.data.classList.add('invalido');
        $('#form-erro').textContent = 'A data máxima para agendamento é 31/12/2100.';
        return;
      }
      if (/Idade inválida/.test(error.message || '')) {
        f.idade.classList.add('invalido');
        $('#form-erro').textContent = 'Idade inválida: um pet não passa de 35 anos.';
        return;
      }
      if (error.code === '23514') {
        $('#form-erro').textContent = /nome_tutor|nome_pet/.test(error.message || '')
          ? 'Nomes só com letras: tutor até 100 e animal até 50.'
          : 'Algum campo passou do limite (tutor até 100 letras, animal até 50, textos até 500, telefone só números, CEP com 8 dígitos). Confira e tente de novo.';
        return;
      }
      $('#form-erro').textContent = 'Não foi possível salvar. Verifique a conexão e tente novamente.';
      return;
    }
    toast(editando ? 'Agendamento atualizado.' : `${registro.pet_nome} agendado para ${isoParaBR(registro.data)} às ${registro.horario}.`, 'ok');
    const dia = registro.data;
    limparForm();
    irParaDia(dia);
  });

  // Conflito: mensagem + recarrega a lista mostrando o animal que o outro usuário cadastrou
  async function conflito(dataISO, hora) {
    estado.destacar = hora;
    estado.filtro = 'ativos';
    $$('[data-filtro]').forEach((x) => x.classList.toggle('ativo', x.dataset.filtro === 'ativos'));
    irParaDia(dataISO);
    atualizarOcupadosForm();
    f.horario.classList.add('invalido');
    await janela({ titulo: 'Horário indisponível', texto: MSG_CONFLITO, erro: true });
    f.horario.focus();
  }

  /* =================================================================
     Gráficos de entradas (somente leitura) – colunas clusterizadas
     Três visões: Registrados × finalizados | Por serviço | Faturamento (R$)
     ================================================================= */
  const gMes = $('#g-mes'), gAno = $('#g-ano');
  (function montarSeletores() {
    const [anoHoje, mesHoje] = hojeISO().split('-').map(Number);
    gMes.innerHTML = MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    gMes.value = String(mesHoje);
    const anos = [];
    for (let a = anoHoje + 1; a >= anoHoje - 5; a--) anos.push(a);
    gAno.innerHTML = anos.map((a) => `<option value="${a}">${a}</option>`).join('');
    gAno.value = String(anoHoje);
  })();
  gMes.addEventListener('change', carregarGraficos);
  gAno.addEventListener('change', carregarGraficos);
  $$('[data-agrupar]').forEach((b) => b.addEventListener('click', () => {
    estado.agrupar = b.dataset.agrupar;
    $$('[data-agrupar]').forEach((x) => x.classList.toggle('ativo', x === b));
    carregarGraficos();
  }));
  estado.gmodo = 'status';
  $$('[data-gmodo]').forEach((b) => b.addEventListener('click', () => {
    estado.gmodo = b.dataset.gmodo;
    $$('[data-gmodo]').forEach((x) => { const on = x === b; x.classList.toggle('ativo', on); x.setAttribute('aria-pressed', on); });
    carregarGraficos();
  }));

  // Biblioteca dos gráficos só é baixada na primeira vez que a aba Gráficos é aberta
  let chartPronto = null;
  function carregarChartJs() {
    if (window.Chart) return Promise.resolve();
    if (!chartPronto) {
      chartPronto = new Promise((ok, falha) => {
        const sc = document.createElement('script');
        sc.src = 'vendor/chart.umd.js';                       // biblioteca guardada no próprio projeto (pasta vendor)
        sc.onload = ok;
        sc.onerror = () => { chartPronto = null; falha(new Error('chart.js')); };
        document.head.appendChild(sc);
      });
    }
    return chartPronto;
  }

  // cores: Registrados (claro) × Finalizados (escuro) e uma cor fixa por serviço (sempre na mesma ordem)
  const COR_REG = '#93B2EE', COR_FIN = '#2457C5', COR_VALOR = '#0D6E78';
  const CORES_SERVICO = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
  const MAX_SERVICOS_GRAF = 8;
  const moedaCurta = (n) => 'R$ ' + Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

  async function carregarGraficos() {
    try { await carregarChartJs(); } catch (e) { toast('Não foi possível carregar os gráficos. Verifique a internet.', 'erro'); return; }
    const g = estado.agrupar, modo = estado.gmodo;
    $('#ctl-mes').hidden = g !== 'dia';
    $('#ctl-ano').hidden = g === 'ano';
    const ano = Number(gAno.value), mes = Number(gMes.value);

    let inicio, fim, rotulos;
    if (g === 'dia') {
      const dias = new Date(ano, mes, 0).getDate();
      inicio = `${ano}-${pad(mes)}-01`; fim = `${ano}-${pad(mes)}-${pad(dias)}`;
      rotulos = Array.from({ length: dias }, (_, i) => pad(i + 1));
    } else if (g === 'mes') {
      inicio = `${ano}-01-01`; fim = `${ano}-12-31`;
      rotulos = Array.from({ length: 12 }, (_, i) => pad(i + 1));
    } else {
      inicio = '2000-01-01'; fim = '2100-12-31'; rotulos = null;
    }
    const pedido = `${g}|${modo}|${ano}|${mes}`;
    estado.graficoPedido = pedido;
    const { data, error } = await sb.rpc('contagem_entradas', { p_inicio: inicio, p_fim: fim, p_agrupar: g });
    if (estado.graficoPedido !== pedido) return;
    if (error) { toast('Não foi possível carregar os gráficos.', 'erro'); return; }
    const linhas = (data || []).map((r) => ({ k: String(r.chave), servico: r.servico, reg: Number(r.registrados), fin: Number(r.finalizados), fat: Number(r.faturado) }));
    if (!rotulos) {
      const anos = [...new Set(linhas.map((l) => l.k))].sort();
      rotulos = anos.length ? anos : [hojeISO().slice(0, 4)];
    }
    const nomeRotulo = (r) => (g === 'mes' ? MESES[Number(r) - 1].slice(0, 3) : r);

    // totais por período
    const zero = () => Object.fromEntries(rotulos.map((r) => [r, 0]));
    const tot = { reg: zero(), fin: zero(), fat: zero() };
    linhas.forEach((l) => { if (l.k in tot.reg) { tot.reg[l.k] += l.reg; tot.fin[l.k] += l.fin; tot.fat[l.k] += l.fat; } });

    // serviços na ordem da tabela de preços; os demais depois; acima de 8 vira "Outros"
    const ordemTabela = estado.servicos.map((s) => s.nome);
    const nomesNoPeriodo = [...new Set(linhas.map((l) => l.servico))].sort((x, y) => {
      const ix = ordemTabela.indexOf(x), iy = ordemTabela.indexOf(y);
      if (x === 'Sem serviço') return 1; if (y === 'Sem serviço') return -1;
      return (ix < 0 ? 999 : ix) - (iy < 0 ? 999 : iy) || x.localeCompare(y, 'pt-BR');
    });
    let servicos = nomesNoPeriodo;
    if (servicos.length > MAX_SERVICOS_GRAF) servicos = servicos.slice(0, MAX_SERVICOS_GRAF - 1).concat('Outros');
    const grupoDe = (nome) => (servicos.includes(nome) ? nome : 'Outros');
    const porServico = Object.fromEntries(servicos.map((s) => [s, zero()]));
    linhas.forEach((l) => { if (l.k in tot.reg) porServico[grupoDe(l.servico)][l.k] += l.reg; });

    let datasets, legenda;
    const barra = { borderRadius: 4, borderSkipped: 'start', categoryPercentage: 0.82, barPercentage: 0.92 };
    if (modo === 'servico') {
      datasets = servicos.map((s, i) => ({ label: s, data: rotulos.map((r) => porServico[s][r]), backgroundColor: CORES_SERVICO[i % CORES_SERVICO.length], ...barra }));
      legenda = servicos.map((s, i) => [s, CORES_SERVICO[i % CORES_SERVICO.length]]);
    } else if (modo === 'valor') {
      datasets = [{ label: 'Faturamento', data: rotulos.map((r) => tot.fat[r]), backgroundColor: COR_VALOR, ...barra }];
      legenda = [];
    } else {
      datasets = [
        { label: 'Registrados', data: rotulos.map((r) => tot.reg[r]), backgroundColor: COR_REG, ...barra },
        { label: 'Finalizados', data: rotulos.map((r) => tot.fin[r]), backgroundColor: COR_FIN, ...barra }
      ];
      legenda = [['Registrados', COR_REG], ['Finalizados', COR_FIN]];
    }

    const titulo = (g === 'dia' ? `${MESES[mes - 1]} de ${ano}` : g === 'mes' ? `Ano de ${ano}` : 'Todos os anos')
      + (modo === 'valor' ? ' · faturamento' : modo === 'servico' ? ' · animais por serviço' : '');
    const celular = window.matchMedia('(max-width: 640px)').matches;
    $('#graf-legenda').innerHTML = legenda.map(([nome, cor]) =>
      `<span class="leg-item"><span class="leg-cor leg-cor-lisa" style="background:${cor}"></span>${esc(nome)}</span>`).join('')
      + `<span class="leg-dica">${modo === 'servico' ? 'Cada coluna é um serviço (animais registrados, sem os cancelados).'
        : modo === 'valor' ? 'Soma do valor final (com descontos e acréscimos) dos atendimentos finalizados ou entregues.'
          : 'Registrados = todos os animais do período, menos os cancelados. Finalizados = finalizados ou entregues.'}</span>`;
    if (estado.grafico) estado.grafico.destroy();
    estado.grafico = new window.Chart($('#grafico'), {
      type: 'bar',
      data: { labels: rotulos.map(nomeRotulo), datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: celular ? { left: 0, right: 4 } : 8 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          title: { display: true, text: titulo, color: '#1C2733', font: { size: celular ? 14 : 15, weight: '700' } },
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.dataset.label}: ${modo === 'valor' ? dinheiro(c.parsed.y) : c.parsed.y}`,
              footer: (itens) => {
                const i = itens[0]?.dataIndex;
                if (i === undefined) return '';
                const r = rotulos[i];
                return `${tot.reg[r]} registrados · ${tot.fin[r]} finalizados · ${dinheiro(tot.fat[r])}`;
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#EEF1F4' }, border: { display: false },
               ticks: modo === 'valor' ? { callback: (v) => moedaCurta(v), color: '#4A5866' } : { precision: 0, color: '#4A5866', font: { size: celular ? 13 : 12 } },
               title: { display: !celular, text: modo === 'valor' ? 'Reais' : 'Animais', color: '#4A5866' } },
          x: { grid: { display: false }, border: { color: '#DCE2E8' },
               ticks: (celular && g === 'dia')
                 ? { color: '#4A5866', maxRotation: 0, minRotation: 0, autoSkip: false, font: { size: 13, weight: '600' },
                     callback(valor, i) { const d = i + 1; return (d === 1 || d % 5 === 0) ? this.getLabelForValue(valor) : ''; } }
                 : { color: '#4A5866', maxRotation: 0, minRotation: 0, autoSkip: true, autoSkipPadding: celular ? 10 : 4, font: { size: celular ? 13 : 12, weight: celular ? '600' : 'normal' } } }
        }
      }
    });

    // cartões de totais
    const soma = (o) => Object.values(o).reduce((s, n) => s + n, 0);
    const reg = soma(tot.reg), fin = soma(tot.fin), fat = soma(tot.fat);
    $('#graf-cartoes').innerHTML = `
      <div class="cartao banho"><span>Registrados</span><b>${reg}</b></div>
      <div class="cartao banho"><span>Finalizados</span><b>${fin}</b></div>
      <div class="cartao valor"><span>Faturamento</span><b>${dinheiro(fat)}</b></div>
      <div class="cartao valor"><span>Ticket médio</span><b>${fin ? dinheiro(fat / fin) : '—'}</b></div>`;

    estado.tabGraf = { g, ano, mes, rotulos, tot, servicos, porServico, modo, nomeRotulo };
    desenharTabelaGraf();
  }

  const DIAS_CURTOS = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
  function desenharTabelaGraf() {
    const t = estado.tabGraf;
    if (!t) return;
    const { g, ano, mes, rotulos, tot, servicos, porServico, modo } = t;
    const mostrarZeros = $('#g-zeros').checked;
    $('#ctl-zeros').hidden = g === 'ano';
    $('#g-zeros-txt').textContent = g === 'mes' ? 'Mostrar meses sem movimento' : 'Mostrar dias sem movimento';
    const num = (n) => (n ? String(n) : '<span class="zero">–</span>');
    const hoje = hojeISO();
    const rotuloLinha = (r) => {
      if (g === 'dia') {
        const d = Number(r), iso = `${ano}-${pad(mes)}-${r}`;
        const sem = new Date(ano, mes - 1, d).getDay();
        return `<span class="dia-n">${r}</span><span class="dia-sem${sem === 0 ? ' dom' : ''}">${DIAS_CURTOS[sem]}</span>${iso === hoje ? '<span class="tag-hoje">hoje</span>' : ''}`;
      }
      if (g === 'mes') return MESES[Number(r) - 1];
      return r;
    };
    const barraFin = (fin, reg) => {
      if (!reg || !fin) return `<span class="fin"><span class="fin-n">${num(fin)}</span><span class="fin-vaga"></span></span>`;
      const pct = Math.round((fin / reg) * 100);
      return `<span class="fin"><span class="fin-n">${num(fin)}</span><span class="fin-barra" title="${pct}% finalizados"><i style="width:${pct}%"></i></span></span>`;
    };
    const soma = (o) => Object.values(o).reduce((s, n) => s + n, 0);
    const linhas = rotulos.filter((r) => mostrarZeros || g === 'ano' || tot.reg[r] > 0);
    const nomePeriodo = g === 'dia' ? 'Dia' : g === 'mes' ? 'Mês' : 'Ano';
    const classeHoje = (r) => (g === 'dia' && `${ano}-${pad(mes)}-${r}` === hoje ? ' class="linha-hoje"' : '');
    let cab, corpo, rodape, colunas;
    if (modo === 'servico') {
      colunas = servicos.length + 2;
      cab = `<tr><th class="col-periodo">${nomePeriodo}</th>${servicos.map((s, i) => `<th><span class="cor-serv" style="background:${CORES_SERVICO[i % CORES_SERVICO.length]}"></span>${esc(s)}</th>`).join('')}<th class="col-total">Total</th></tr>`;
      corpo = linhas.map((r) => `<tr${classeHoje(r)}><td class="col-periodo">${rotuloLinha(r)}</td>${servicos.map((s) => `<td>${num(porServico[s][r])}</td>`).join('')}<td class="col-total"><b>${num(tot.reg[r])}</b></td></tr>`).join('');
      rodape = `<tr><td class="col-periodo">Total</td>${servicos.map((s) => `<td>${soma(porServico[s])}</td>`).join('')}<td class="col-total">${soma(tot.reg)}</td></tr>`;
    } else {
      colunas = 5;
      cab = `<tr><th class="col-periodo">${nomePeriodo}</th><th>Registrados</th><th>Finalizados</th><th>Faturamento</th><th class="col-total">Ticket médio</th></tr>`;
      corpo = linhas.map((r) => `<tr${classeHoje(r)}><td class="col-periodo">${rotuloLinha(r)}</td><td>${num(tot.reg[r])}</td><td>${barraFin(tot.fin[r], tot.reg[r])}</td>
        <td>${tot.fat[r] ? dinheiro(tot.fat[r]) : num(0)}</td><td class="col-total">${tot.fin[r] ? dinheiro(tot.fat[r] / tot.fin[r]) : num(0)}</td></tr>`).join('');
      const fin = soma(tot.fin), fat = soma(tot.fat);
      rodape = `<tr><td class="col-periodo">Total</td><td>${soma(tot.reg)}</td><td>${barraFin(fin, soma(tot.reg))}</td><td>${dinheiro(fat)}</td><td class="col-total">${fin ? dinheiro(fat / fin) : '—'}</td></tr>`;
    }
    if (!linhas.length) corpo = `<tr class="vazio"><td colspan="${colunas}">Nenhum animal registrado neste período.</td></tr>`;
    const ocultos = rotulos.length - linhas.length;
    const aviso = (!mostrarZeros && g !== 'ano' && ocultos > 0 && linhas.length)
      ? `<caption class="tab-legenda">${ocultos} ${g === 'mes' ? (ocultos === 1 ? 'mês' : 'meses') : (ocultos === 1 ? 'dia' : 'dias')} sem movimento ${ocultos === 1 ? 'oculto' : 'ocultos'}</caption>` : '';
    $('#graf-tabela').innerHTML = `${aviso}<thead>${cab}</thead><tbody>${corpo}</tbody><tfoot>${rodape}</tfoot>`;

    // Celular: cada período vira um cartão (sem arrastar a tabela para o lado)
    const cartao = (titulo, r, extra = '') => {
      const reg = r ? tot.reg[r] : soma(tot.reg), fin = r ? tot.fin[r] : soma(tot.fin), fat = r ? tot.fat[r] : soma(tot.fat);
      const detalhe = modo === 'servico'
        ? servicos.map((s, i) => [s, i, r ? porServico[s][r] : soma(porServico[s])]).filter(([, , n]) => n > 0)
          .map(([s, i, n]) => `<div class="gl-emp" style="border-left-color:${CORES_SERVICO[i % CORES_SERVICO.length]}"><span class="gl-nome">${esc(s)}</span><span class="gl-num"><b>${n}</b></span></div>`).join('')
        : `<div class="gl-emp c-banho"><span class="gl-nome">Finalizados</span><span class="gl-num gl-fin"><b>${fin}</b>${reg ? `<span class="fin-barra"><i style="width:${Math.round((fin / reg) * 100)}%"></i></span>` : ''}</span></div>
           <div class="gl-emp c-valor"><span class="gl-nome">Faturamento</span><span class="gl-num"><b>${dinheiro(fat)}</b></span></div>`;
      return `<div class="gl-item${extra}"><div class="gl-topo"><span class="gl-titulo">${titulo}</span><span class="gl-total">${reg} ${reg === 1 ? 'animal' : 'animais'}</span></div>${detalhe}</div>`;
    };
    $('#graf-lista').innerHTML = linhas.length
      ? linhas.map((r) => cartao(rotuloLinha(r), r, g === 'dia' && `${ano}-${pad(mes)}-${r}` === hoje ? ' gl-hoje' : '')).join('') + cartao('Total do período', null, ' gl-soma')
        + (aviso ? `<p class="gl-aviso">${aviso.replace(/<[^>]+>/g, '')}</p>` : '')
      : '<p class="gl-vazio">Nenhum animal registrado neste período.</p>';
  }
  $('#g-zeros').addEventListener('change', desenharTabelaGraf);
  try {
    window.matchMedia('(max-width: 640px)').addEventListener('change', () => {
      if (!$('#aba-graficos').hidden) carregarGraficos();
    });
  } catch (e) { /* navegador antigo: segue sem redesenhar */ }

  /* =================================================================
     Histórico de alterações (só administrador) – com os valores em R$
     ================================================================= */
  const ROTULOS_CAMPOS = {
    data: 'Data', horario: 'Horário', tutor_nome: 'Tutor', telefone: 'Telefone', pet_nome: 'Animal', pet_idade: 'Idade',
    especie: 'Espécie', pet_sexo: 'Sexo', saude_obs: 'Alergias / saúde', porte: 'Porte', peso_kg: 'Peso (kg)', raca: 'Raça',
    pelagem: 'Pelo', iniciado_em: 'Início do banho', observacoes: 'Observações', servico: 'Serviço', servico_valor: 'Valor do serviço',
    desconto: 'Desconto', acrescimo: 'Acréscimo', ajuste_motivo: 'Motivo do desconto/acréscimo', forma_pagamento: 'Forma de pagamento',
    motivo_cancelamento: 'Motivo do cancelamento',
    busca_domicilio: 'Buscar em casa', entrega_domicilio: 'Entregar em casa', entrega_outro_end: 'Entregar em outro endereço',
    end_cep: 'CEP (busca)', end_rua: 'Rua (busca)', end_numero: 'Número (busca)', end_bairro: 'Bairro (busca)', end_cidade: 'Cidade (busca)', end_referencia: 'Referência (busca)',
    ent_cep: 'CEP (entrega)', ent_rua: 'Rua (entrega)', ent_numero: 'Número (entrega)', ent_bairro: 'Bairro (entrega)', ent_cidade: 'Cidade (entrega)', ent_referencia: 'Referência (entrega)',
    // despesas e tabela de preços
    tipo: 'Tipo', descricao: 'Descrição', valor: 'Valor', nome: 'Nome do serviço', ordem: 'Ordem', ativo: 'Ativo',
    valor_pequeno: 'Preço porte pequeno', valor_medio: 'Preço porte médio', valor_grande: 'Preço porte grande'
  };
  const CAMPOS_DINHEIRO = new Set(['servico_valor', 'desconto', 'acrescimo', 'valor', 'valor_pequeno', 'valor_medio', 'valor_grande']);
  const NOMES_ACAO = {
    criado: 'Criado', alterado: 'Alterado', finalizado: 'Finalizado', entregue: 'Entregue', cancelado: 'Cancelado',
    'banho iniciado': 'Banho iniciado', reativado: 'Reativado', reaberto: 'Reaberto', 'entrega desfeita': 'Entrega desfeita', 'tutor avisado': 'Tutor avisado', excluido: 'Excluído',
    'despesa lançada': 'Despesa lançada', 'despesa alterada': 'Despesa alterada', 'despesa excluída': 'Despesa excluída',
    'serviço criado': 'Serviço criado', 'preço alterado': 'Preço alterado', 'serviço removido': 'Serviço removido',
    'dia fechado': 'Dia fechado', 'dia reaberto': 'Dia reaberto'
  };
  function valorLegivel(campo, v) {
    if (v === null || v === undefined || v === '') return '(vazio)';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (campo === 'telefone') return formatarTelefone(String(v));
    if (campo === 'data') return isoParaBR(String(v));
    if (campo === 'horario') return hhmm(String(v));
    if (CAMPOS_DINHEIRO.has(campo)) return dinheiro(v);
    if (campo === 'peso_kg') return String(v).replace('.', ',');
    if (campo.endsWith('_cep')) return String(v).replace(/^(\d{5})(\d{3})$/, '$1-$2');
    return String(v);
  }
  const hist = { pagina: 0, por: 50, buscaTimer: null };
  ['#h-periodo', '#h-acao'].forEach((sel) => $(sel).addEventListener('change', () => carregarHistorico(true)));
  $('#h-busca').addEventListener('input', () => { clearTimeout(hist.buscaTimer); hist.buscaTimer = setTimeout(() => carregarHistorico(true), 350); });
  $('#h-mais').addEventListener('click', () => carregarHistorico(false));

  async function carregarHistorico(doZero) {
    if (!ehAdmin()) return;
    if (doZero) { hist.pagina = 0; $('#hist-lista').innerHTML = '<p class="vazio">Carregando…</p>'; }
    let q = sb.from('historico').select('*').order('em', { ascending: false });
    const dias = Number($('#h-periodo').value);
    if (dias) q = q.gte('em', new Date(`${somarDias(hojeISO(), -(dias - 1))}T00:00:00-03:00`).toISOString());
    const acao = $('#h-acao').value;
    if (acao === 'reativado') q = q.in('acao', ['reativado', 'reaberto', 'entrega desfeita']);
    else if (acao === 'valor') q = q.eq('mudou_valor', true);
    else if (acao === 'apos') q = q.eq('apos_fechamento', true);
    else if (acao.startsWith('tipo:')) q = q.eq('tipo', acao.slice(5));
    else if (acao) q = q.eq('acao', acao);
    const termo = $('#h-busca').value.normalize('NFC').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').trim();
    if (termo.length >= 2) q = q.or(`pet_nome.ilike.*${termo}*,tutor_nome.ilike.*${termo}*,descricao.ilike.*${termo}*`);
    const de = hist.pagina * hist.por;
    const { data, error } = await q.range(de, de + hist.por - 1);
    if (error) { $('#hist-lista').innerHTML = '<p class="vazio">Não foi possível carregar o histórico.</p>'; return; }
    const linhas = data || [];
    if (doZero) $('#hist-lista').innerHTML = '';
    if (doZero && !linhas.length) { $('#hist-lista').innerHTML = '<p class="vazio">Nenhum registro neste período.</p>'; $('#h-mais').hidden = true; return; }
    $('#hist-lista').insertAdjacentHTML('beforeend', linhas.map(htmlHistorico).join(''));
    hist.pagina++;
    $('#h-mais').hidden = linhas.length < hist.por;
  }
  // "Banho · R$ 70,00 − R$ 10,00 = R$ 60,00 · Pix"
  function textoValoresHist(h) {
    if (h.tipo === 'agendamento') {
      if (h.valor_servico == null && !h.servico) return '';
      const partes = [h.servico || 'sem serviço'];
      if (h.valor_servico != null) {
        let conta = dinheiro(h.valor_servico);
        if (Number(h.desconto) > 0) conta += ` − ${dinheiro(h.desconto)}`;
        if (Number(h.acrescimo) > 0) conta += ` + ${dinheiro(h.acrescimo)}`;
        if (Number(h.desconto) > 0 || Number(h.acrescimo) > 0) conta += ` = ${dinheiro(h.valor_total)}`;
        partes.push(conta);
      } else partes.push('sem valor');
      if (h.forma_pagamento) partes.push(h.forma_pagamento);
      return partes.join(' · ');
    }
    if (h.tipo === 'despesa') return `${dinheiro(h.valor_total)}${h.forma_pagamento ? ' · ' + h.forma_pagamento : ''}`;
    if (h.tipo === 'caixa' && h.valor_total != null) return `Faturamento do dia: ${dinheiro(h.valor_total)}`;
    return '';
  }
  function htmlHistorico(h) {
    const quando = new Date(h.em);
    const dataTxt = quando.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const horaTxt = quando.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    const mud = h.mudancas && typeof h.mudancas === 'object'
      ? Object.entries(h.mudancas).map(([c, v]) => {
          const nq = c === 'telefone' || c.endsWith('_cep') || c === 'data' || c === 'horario' || CAMPOS_DINHEIRO.has(c) ? ' sem-quebra' : '';
          return `<li${CAMPOS_DINHEIRO.has(c) || c === 'forma_pagamento' ? ' class="h-mud-valor"' : ''}><b>${esc(ROTULOS_CAMPOS[c] || c)}:</b> <span class="h-de${nq}">${esc(valorLegivel(c, v && v.de))}</span> → <span class="h-para${nq}">${esc(valorLegivel(c, v && v.para))}</span></li>`;
        }).join('')
      : '';
    const acaoCls = String(h.acao || '').normalize('NFD').replace(/[^a-z]/g, '');
    let alvo;
    if (h.tipo === 'despesa') alvo = `<b>${esc(h.descricao || 'Despesa')}</b>${h.data_agendada ? ` · caixa de ${isoParaBR(h.data_agendada)}` : ''}`;
    else if (h.tipo === 'caixa') alvo = `<b>Caixa de ${isoParaBR(h.data_agendada)}</b>${h.descricao ? ` · ${esc(h.descricao)}` : ''}`;
    else if (h.tipo === 'preco') alvo = `<b>Tabela de preços: ${esc(h.descricao || '')}</b>`;
    else alvo = `<b>${esc(h.pet_nome || '—')}</b> · tutor ${esc(h.tutor_nome || '—')}${h.data_agendada ? ` · agendamento de ${isoParaBR(h.data_agendada)}${h.horario ? ` às ${hhmm(h.horario)}` : ''}` : ''}`;
    const valores = textoValoresHist(h);
    return `<article class="hist-item${h.apos_fechamento ? ' hist-apos' : ''}">
      <div class="hist-quando"><b>${esc(horaTxt)}</b><small>${esc(dataTxt)}</small></div>
      <div class="hist-corpo">
        <div class="hist-linha"><span class="tag h-acao h-${esc(acaoCls)}">${esc(NOMES_ACAO[h.acao] || h.acao)}</span>
          <span class="tag tag-${esc(h.usuario_papel || '')}">${esc(h.usuario_nome || 'Sistema')}</span>
          ${h.apos_fechamento ? '<span class="tag h-apos" title="Mudança feita num dia com o caixa já fechado">🔒 após o fechamento</span>' : ''}</div>
        <div class="hist-alvo">${alvo}</div>
        ${valores ? `<div class="hist-valor">💲 ${esc(valores)}</div>` : ''}
        ${mud ? `<ul class="hist-mud">${mud}</ul>` : ''}
      </div>
    </article>`;
  }

  /* =================================================================
     Backup: exportar planilha (CSV que abre no Excel) – só administrador
     ================================================================= */
  const CHAVE_BACKUP = 'banhoTosa.ultimoBackup';
  const lerUltimoBackup = () => { try { return localStorage.getItem(CHAVE_BACKUP); } catch (e) { return null; } };
  function mostrarStatusBackup() {
    const ult = lerUltimoBackup();
    const el = $('#backup-status');
    if (!ult) { el.innerHTML = '<b class="bk-alerta">Nenhum backup feito neste computador ainda.</b> Recomendado: 1 vez por semana.'; return; }
    const dias = Math.floor((Date.now() - new Date(ult).getTime()) / 86400000);
    el.innerHTML = dias >= 7
      ? `<b class="bk-alerta">Último backup há ${dias} dias (${new Date(ult).toLocaleDateString('pt-BR')}).</b> Faça o backup semanal.`
      : `Último backup em ${new Date(ult).toLocaleDateString('pt-BR')} ${dias === 0 ? '(hoje)' : `(há ${dias} dia${dias > 1 ? 's' : ''})`}. Recomendado: 1 vez por semana.`;
  }
  function lembrarBackup() {
    const ult = lerUltimoBackup();
    if (!ult || Date.now() - new Date(ult).getTime() >= 7 * 86400000) toast('Lembrete: faça o backup semanal na aba Histórico.');
  }
  // célula de planilha: aspas escapadas e sem "fórmulas" (proteção contra injeção em planilha)
  function celula(v) {
    let t = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }
  function baixarPlanilha(nome, cabecalho, linhas) {
    const csv = '﻿' + [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function buscarTudo(tabela, filtro, ordem) {
    let todas = [], de = 0;
    for (;;) {
      let q = sb.from(tabela).select('*');
      q = filtro ? filtro(q) : q;
      const { data, error } = await q.order(ordem, { ascending: true }).range(de, de + 999);
      if (error) throw error;
      todas = todas.concat(data || []);
      if (!data || data.length < 1000) return todas;
      de += 1000;
    }
  }
  const dataHoraBR = (t) => (t ? new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
  const simNao = (b) => (b ? 'Sim' : 'Não');
  const enderecoTexto = (rua, num, bairro, cidade, cep) => (rua ? [`${rua}, ${num || 's/n'}`, bairro, cidade, cep && String(cep).replace(/^(\d{5})(\d{3})$/, '$1-$2')].filter(Boolean).join(' – ') : '');
  const nomeArquivo = (txt) => semAcento(NOME_SISTEMA).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '_' + txt;

  $('#bk-exportar').addEventListener('click', async () => {
    const btn = $('#bk-exportar'); btn.disabled = true; const rotulo = btn.textContent; btn.textContent = 'Gerando…';
    try {
      const per = $('#bk-periodo').value, hoje = hojeISO(), [a, m] = hoje.split('-').map(Number);
      let ini = null, fim = null, sufixo = 'completo';
      if (per === 'mes') { ini = `${a}-${pad(m)}-01`; fim = `${a}-${pad(m)}-${pad(new Date(a, m, 0).getDate())}`; sufixo = `${a}-${pad(m)}`; }
      if (per === 'mes-anterior') { const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1; ini = `${pa}-${pad(pm)}-01`; fim = `${pa}-${pad(pm)}-${pad(new Date(pa, pm, 0).getDate())}`; sufixo = `${pa}-${pad(pm)}`; }
      if (per === 'ano') { ini = `${a}-01-01`; fim = `${a}-12-31`; sufixo = String(a); }
      const regs = await buscarTudo('agendamentos', ini ? (q) => q.gte('data', ini).lte('data', fim) : null, 'data');
      regs.sort((x, y) => (x.data + x.horario).localeCompare(y.data + y.horario));
      const cab = ['Data', 'Horário', 'Status', 'Animal', 'Espécie', 'Sexo', 'Idade', 'Raça', 'Porte', 'Peso (kg)', 'Pelo',
        'Alergias / saúde', 'Observações', 'Tutor', 'Telefone', 'Serviço', 'Valor do serviço (R$)', 'Desconto (R$)', 'Acréscimo (R$)',
        'Motivo do desconto/acréscimo', 'Valor final (R$)', 'Forma de pagamento', 'Buscar em casa', 'Entregar em casa',
        'Endereço de busca', 'Referência (busca)', 'Endereço de entrega', 'Referência (entrega)', 'Motivo do cancelamento',
        'Criado por', 'Criado em', 'Finalizado por', 'Finalizado em', 'Entregue em', 'Cancelado em', 'Usuário de teste'];
      const linhas = regs.map((r) => [
        isoParaBR(r.data), hhmm(r.horario), NOMES_STATUS[r.status] || r.status, r.pet_nome, r.especie, r.pet_sexo,
        r.pet_idade, r.raca, r.porte, r.peso_kg != null ? String(r.peso_kg).replace('.', ',') : '', r.pelagem, r.saude_obs, r.observacoes,
        r.tutor_nome, r.telefone ? formatarTelefone(r.telefone) : '', r.servico, v2(r.servico_valor), v2(r.desconto), v2(r.acrescimo),
        r.ajuste_motivo, v2(r.valor_total), r.forma_pagamento,
        simNao(r.busca_domicilio), simNao(r.entrega_domicilio),
        enderecoTexto(r.end_rua, r.end_numero, r.end_bairro, r.end_cidade, r.end_cep), r.end_referencia,
        r.entrega_outro_end ? enderecoTexto(r.ent_rua, r.ent_numero, r.ent_bairro, r.ent_cidade, r.ent_cep) : (r.entrega_domicilio ? enderecoTexto(r.end_rua, r.end_numero, r.end_bairro, r.end_cidade, r.end_cep) : ''),
        r.entrega_outro_end ? r.ent_referencia : '', r.motivo_cancelamento,
        nomeDe(r.criado_por), dataHoraBR(r.criado_em), nomeDe(r.finalizado_por), dataHoraBR(r.finalizado_em), dataHoraBR(r.entregue_em), dataHoraBR(r.cancelado_em),
        r.origem === 'teste' ? 'Sim' : ''
      ]);
      baixarPlanilha(nomeArquivo(`agendamentos_${sufixo}_${hoje}.csv`), cab, linhas);
      if (per === 'tudo') { try { localStorage.setItem(CHAVE_BACKUP, new Date().toISOString()); } catch (e) { /* sem armazenamento */ } }
      mostrarStatusBackup();
      toast(`Planilha gerada com ${regs.length} agendamento(s).`, 'ok');
    } catch (e) {
      toast('Não foi possível gerar a planilha.', 'erro');
    } finally { btn.disabled = false; btn.textContent = rotulo; }
  });
  $('#bk-historico').addEventListener('click', async () => {
    const btn = $('#bk-historico'); btn.disabled = true;
    try {
      const regs = await buscarTudo('historico', null, 'em');
      const tipos = { agendamento: 'Agendamento', despesa: 'Despesa', preco: 'Tabela de preços', caixa: 'Caixa' };
      const linhas = regs.map((h) => [dataHoraBR(h.em), tipos[h.tipo] || h.tipo, NOMES_ACAO[h.acao] || h.acao, h.usuario_nome, NOMES_PAPEL[h.usuario_papel] || h.usuario_papel,
        h.pet_nome, h.tutor_nome, h.data_agendada ? isoParaBR(h.data_agendada) : '', h.horario ? hhmm(h.horario) : '', h.descricao,
        h.servico, v2(h.valor_servico), v2(h.desconto), v2(h.acrescimo), v2(h.valor_total), h.forma_pagamento,
        simNao(h.apos_fechamento),
        h.mudancas ? Object.entries(h.mudancas).map(([c, v]) => `${ROTULOS_CAMPOS[c] || c}: ${valorLegivel(c, v && v.de)} → ${valorLegivel(c, v && v.para)}`).join(' | ') : '']);
      baixarPlanilha(nomeArquivo(`historico_${hojeISO()}.csv`), ['Quando', 'Tipo', 'Ação', 'Usuário', 'Papel', 'Animal', 'Tutor', 'Data', 'Horário', 'Descrição',
        'Serviço', 'Valor do serviço (R$)', 'Desconto (R$)', 'Acréscimo (R$)', 'Valor final (R$)', 'Forma de pagamento', 'Após o fechamento', 'Alterações'], linhas);
      toast(`Histórico exportado (${regs.length} registro(s)).`, 'ok');
    } catch (e) {
      toast('Não foi possível exportar o histórico.', 'erro');
    } finally { btn.disabled = false; }
  });

  /* =================================================================
     FECHAMENTO DE CAIXA: dia, mês e tabela de preços
     - Faturado = atendimentos Finalizados ou Entregues, pela data do agendamento.
     - Fechar o dia grava quem fechou, quando e os totais (o banco confere
       as pendências). Dia fechado não muda, salvo pelo administrador.
     ================================================================= */
  const fech = { modo: 'dia', dia: hojeISO(), dados: null, seq: 0 };
  const fcData = $('#fc-data'), fcMes = $('#fc-mes'), fcAno = $('#fc-ano');
  mascaraData(fcData);
  (function montarSeletoresCaixa() {
    const [anoHoje, mesHoje] = hojeISO().split('-').map(Number);
    fcMes.innerHTML = MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    fcMes.value = String(mesHoje);
    let anos = '';
    for (let a = anoHoje; a >= anoHoje - 5; a--) anos += `<option value="${a}">${a}</option>`;
    fcAno.innerHTML = anos;
    fcAno.value = String(anoHoje);
  })();
  function irParaDiaCaixa(iso) { fech.dia = iso; carregarFechamento(); }
  fcData.addEventListener('change', () => { const iso = brParaISO(fcData.value); if (iso) irParaDiaCaixa(iso); else fcData.value = isoParaBR(fech.dia); });
  fcData.addEventListener('keydown', (e) => { if (e.key === 'Enter') fcData.dispatchEvent(new Event('change')); });
  $('#fc-anterior').addEventListener('click', () => irParaDiaCaixa(somarDias(fech.dia, -1)));
  $('#fc-seguinte').addEventListener('click', () => irParaDiaCaixa(somarDias(fech.dia, 1)));
  $('#fc-hoje').addEventListener('click', () => irParaDiaCaixa(hojeISO()));
  fcMes.addEventListener('change', carregarFechamento);
  fcAno.addEventListener('change', carregarFechamento);
  function mudarModoCaixa(modo) {
    fech.modo = modo;
    $$('[data-fmodo]').forEach((x) => { const on = x.dataset.fmodo === modo; x.classList.toggle('ativo', on); x.setAttribute('aria-pressed', on); });
    carregarFechamento();
  }
  $$('[data-fmodo]').forEach((b) => b.addEventListener('click', () => mudarModoCaixa(b.dataset.fmodo)));

  const papelAtual = () => estado.perfil?.papel;
  const somenteMeus = (lista) => (papelAtual() === 'teste' ? lista : lista.filter((x) => x.origem !== 'teste'));
  const n2 = (x) => Number(x || 0);
  const quandoBR = (t) => new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');

  async function carregarFechamento() {
    if (!estado.perfil) return;
    const seq = ++fech.seq;
    $('#fc-nav-dia').hidden = fech.modo !== 'dia';
    $('#fc-nav-mes').hidden = fech.modo !== 'mes';
    const corpo = $('#fc-corpo');
    if (fech.modo === 'precos') return desenharPrecos();
    if (fech.modo === 'dia') {
      const d = fech.dia;
      fcData.value = isoParaBR(d);
      $('#fc-titulo-dia').textContent = diaPorExtenso(d);
      const [res, ag, desp, fec] = await Promise.all([
        sb.rpc('resumo_caixa', { p_inicio: d, p_fim: d }),
        sb.from('agendamentos').select('*').eq('data', d).order('horario'),
        sb.from('despesas').select('*').eq('data', d).order('criado_em'),
        sb.from('fechamentos_dia').select('*').eq('data', d).maybeSingle()
      ]);
      if (seq !== fech.seq) return;
      if (res.error || ag.error || desp.error) { corpo.innerHTML = '<p class="vazio">Não foi possível carregar o caixa. Verifique a conexão.</p>'; return; }
      fech.dados = { dia: d, r: res.data, itens: somenteMeus(ag.data || []), despesas: somenteMeus(desp.data || []), fechamento: fec.data || null };
      desenharCaixaDia();
    } else {
      const ano = Number(fcAno.value), mes = Number(fcMes.value);
      const ini = `${ano}-${pad(mes)}-01`, fim = `${ano}-${pad(mes)}-${pad(new Date(ano, mes, 0).getDate())}`;
      const pa = mes === 1 ? ano - 1 : ano, pm = mes === 1 ? 12 : mes - 1;
      const iniAnt = `${pa}-${pad(pm)}-01`, fimAnt = `${pa}-${pad(pm)}-${pad(new Date(pa, pm, 0).getDate())}`;
      const [res, ant, fecs] = await Promise.all([
        sb.rpc('resumo_caixa', { p_inicio: ini, p_fim: fim }),
        sb.rpc('resumo_caixa', { p_inicio: iniAnt, p_fim: fimAnt }),
        sb.from('fechamentos_dia').select('data, situacao, fechado_por_nome, fechado_em, resumo').gte('data', ini).lte('data', fim)
      ]);
      if (seq !== fech.seq) return;
      if (res.error || ant.error) { corpo.innerHTML = '<p class="vazio">Não foi possível carregar o mês. Verifique a conexão.</p>'; return; }
      fech.dados = { ano, mes, ini, fim, r: res.data, ant: ant.data, mesAnt: pm, anoAnt: pa,
        fecs: Object.fromEntries((fecs.data || []).map((x) => [x.data, x])) };
      desenharCaixaMes();
    }
  }

  // ---------- blocos reaproveitados no dia e no mês ----------
  function blocoFormas(r) {
    const formas = r.por_forma || [];
    const linhas = formas.map((x) => `<tr><td>${esc(x.forma)}</td><td>${x.qtd}</td><td>${dinheiro(x.valor)}</td></tr>`).join('');
    return `<section class="fc-bloco"><h3>Formas de pagamento</h3>
      <table class="tabela fc-tab"><thead><tr><th>Forma</th><th>Qtd.</th><th>Valor</th></tr></thead><tbody>${linhas}</tbody>
        <tfoot><tr><td>Total</td><td>${formas.reduce((s, x) => s + x.qtd, 0)}</td><td>${dinheiro(r.liquido)}</td></tr></tfoot></table>
      <div class="fc-gaveta"><span>💵 Dinheiro que deve estar na gaveta</span><b>${dinheiro(r.dinheiro_em_caixa)}</b>
        <small>Entradas em dinheiro ${dinheiro(r.entradas_dinheiro)} − despesas pagas em dinheiro ${dinheiro(r.despesas_dinheiro)} − sangrias ${dinheiro(r.sangrias)} (sem o troco inicial)</small></div>
    </section>`;
  }
  function blocoServicos(r) {
    const lista = r.por_servico || [];
    return `<section class="fc-bloco"><h3>Por serviço</h3>${lista.length
      ? `<table class="tabela fc-tab"><thead><tr><th>Serviço</th><th>Qtd.</th><th>Valor</th></tr></thead><tbody>${lista.map((x) =>
          `<tr><td>${esc(x.servico)}</td><td>${x.qtd}</td><td>${dinheiro(x.valor)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="nota">Nenhum atendimento finalizado.</p>'}</section>`;
  }
  function blocoValores(r) {
    return `<section class="fc-bloco"><h3>Valores</h3>
      <dl class="fc-conta">
        <dt>Serviços pela tabela/valor</dt><dd>${dinheiro(r.bruto)}</dd>
        <dt>− Descontos</dt><dd class="neg">${dinheiro(r.descontos)}</dd>
        <dt>+ Acréscimos</dt><dd>${dinheiro(r.acrescimos)}</dd>
        <dt class="soma">= Faturamento</dt><dd class="soma">${dinheiro(r.liquido)}</dd>
        <dt>− Despesas</dt><dd class="neg">${dinheiro(r.despesas)}</dd>
        <dt class="soma">= Resultado</dt><dd class="soma">${dinheiro(r.resultado)}</dd>
        <dt>Sangrias (retiradas da gaveta)</dt><dd>${dinheiro(r.sangrias)}</dd>
      </dl></section>`;
  }
  function cartoesCaixa(r, comp) {
    const c = (rotulo, valor, chave, classe = '') => `<div class="cartao ${classe}"><span>${rotulo}</span><b>${valor}</b>${comp ? comp(chave) : ''}</div>`;
    return `<div class="cartoes fc-cartoes">
      ${c('Faturamento', dinheiro(r.liquido), 'liquido', 'valor')}
      ${c('Atendimentos', r.atendimentos, 'atendimentos', 'banho')}
      ${c('Ticket médio', dinheiro(r.ticket_medio), 'ticket_medio', 'banho')}
      ${c('Despesas', dinheiro(r.despesas), 'despesas', 'gasto')}
      ${c('Resultado', dinheiro(r.resultado), 'resultado', 'valor')}
    </div>`;
  }
  const cabImpressao = (titulo) => `<div class="so-impressao"><h1>${esc(NOME_SISTEMA)} · ${esc(SUBTITULO)}</h1><p>${esc(titulo)} · impresso em ${esc(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))} por ${esc(estado.perfil?.nome || '')}</p></div>`;

  // ---------- DIA ----------
  function pendenciasDia() {
    const { itens } = fech.dados;
    return {
      abertos: itens.filter((a) => a.status === 'agendado' || a.status === 'em_banho'),
      semValor: itens.filter((a) => ['finalizado', 'entregue'].includes(a.status) && a.servico_valor == null),
      semForma: itens.filter((a) => ['finalizado', 'entregue'].includes(a.status) && !a.forma_pagamento)
    };
  }
  function desenharCaixaDia() {
    const { dia, r, itens, despesas, fechamento } = fech.dados;
    const fechado = fechamento && fechamento.situacao === 'fechado';
    const admin = ehAdmin();
    const podeFechar = ['admin', 'banho_tosa'].includes(papelAtual());
    const podeMexer = !fechado || admin;
    const futuro = dia > hojeISO();
    const p = pendenciasDia();
    const totalPend = p.abertos.length + p.semValor.length + p.semForma.length;

    // situação do caixa
    let status;
    if (fechado) {
      const s = fechamento.resumo || {};
      const mudou = ['liquido', 'atendimentos', 'despesas', 'sangrias'].some((k) => n2(s[k]) !== n2(r[k]));
      status = `<div class="fc-status fc-fechado"><div><b>🔒 Dia fechado</b> por ${esc(fechamento.fechado_por_nome || '—')} em ${esc(quandoBR(fechamento.fechado_em))}.
          ${fechamento.dinheiro_contado != null ? `<br>Dinheiro contado na gaveta: ${dinheiro(fechamento.dinheiro_contado)} · ${n2(fechamento.diferenca_caixa) === 0 ? 'conferiu ✓' : `diferença de <b>${dinheiro(fechamento.diferenca_caixa)}</b>`}` : ''}
          ${fechamento.observacao ? `<br>Obs.: ${esc(fechamento.observacao)}` : ''}
          ${mudou ? `<br><span class="fc-mudou">⚠️ Os valores mudaram depois do fechamento (correção do administrador). No fechamento: ${dinheiro(s.liquido)} · agora: ${dinheiro(r.liquido)}. Reabra e feche de novo para atualizar.</span>` : ''}</div>
        ${admin ? '<button class="btn btn-fantasma btn-pequeno nao-imprimir" id="fc-reabrir">🔓 Reabrir dia</button>' : ''}</div>`;
    } else if (fechamento && fechamento.situacao === 'reaberto') {
      status = `<div class="fc-status fc-reaberto"><div><b>🔓 Dia reaberto</b> por ${esc(fechamento.reaberto_por_nome || '—')} em ${esc(quandoBR(fechamento.reaberto_em))}.
        Motivo: ${esc(fechamento.motivo_reabertura || '—')}. Corrija o que precisar e feche o dia de novo.</div></div>`;
    } else if (futuro) {
      status = '<div class="fc-status"><div><b>Dia futuro.</b> O caixa só pode ser fechado a partir do próprio dia.</div></div>';
    } else {
      status = `<div class="fc-status fc-aberto"><div><b>🟢 Caixa aberto.</b> ${totalPend ? `Resolva as ${totalPend} pendência(s) abaixo e feche o dia.` : 'Tudo certo para fechar o dia.'}</div></div>`;
    }

    // pendências
    const linhaPend = (a, txt, botao) => `<li><span><b>${hhmm(a.horario)} ${esc(a.pet_nome)}</b> · ${esc(txt)}</span>${podeMexer ? botao : ''}</li>`;
    const pend = totalPend ? `<section class="fc-bloco fc-pend"><h3>⚠️ Pendências antes de fechar</h3><ul>
        ${p.abertos.map((a) => linhaPend(a, `${NOMES_STATUS[a.status]}: finalize ou cancele`, `<button class="btn btn-fantasma btn-pequeno" data-fc-ir="${esc(a.id)}">Ver na agenda</button>`)).join('')}
        ${p.semValor.map((a) => linhaPend(a, 'sem valor', `<button class="btn btn-primario btn-pequeno" data-fc-acao="cobrar" data-id="${esc(a.id)}">Informar valor</button>`)).join('')}
        ${p.semForma.map((a) => linhaPend(a, `${NOMES_STATUS[a.status]} sem forma de pagamento`, a.status === 'finalizado'
          ? `<button class="btn btn-entregar btn-pequeno" data-fc-acao="entregar" data-id="${esc(a.id)}">Entregar e receber</button>`
          : `<button class="btn btn-primario btn-pequeno" data-fc-acao="cobrar" data-id="${esc(a.id)}">Informar pagamento</button>`)).join('')}
      </ul></section>` : '';

    // cancelados com o motivo
    const cancelados = itens.filter((a) => a.status === 'cancelado');
    const blocoCanc = `<section class="fc-bloco"><h3>Cancelados <small>(${cancelados.length})</small></h3>${cancelados.length
      ? `<ul class="fc-lista">${cancelados.map((a) => `<li><b>${hhmm(a.horario)} ${esc(a.pet_nome)}</b> · ${esc(a.motivo_cancelamento || 'sem motivo')}</li>`).join('')}</ul>`
      : '<p class="nota">Nenhum cancelamento.</p>'}</section>`;

    // despesas e sangrias
    const formDesp = podeMexer && !futuro && papelAtual() ? `<form id="fc-form-desp" class="fc-form-desp nao-imprimir" novalidate>
        <div class="fc-form-linha">
          <label>Tipo<select id="fd-tipo"><option>Despesa</option><option>Sangria</option></select></label>
          <label class="fd-desc">Descrição<input id="fd-desc" maxlength="200" placeholder="Ex.: shampoo, toalhas, gasolina do leva e traz"></label>
        </div>
        <div class="fc-form-linha">
          <label>Valor<span class="valor-wrap"><span class="valor-prefixo" aria-hidden="true">R$</span><input id="fd-valor" inputmode="decimal" maxlength="9" placeholder="0,00"></span></label>
          <label>Pago com<select id="fd-forma">${FORMAS.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>
          <button type="submit" class="btn btn-primario fd-add">Lançar</button>
        </div>
        <p class="erro-texto" id="fd-erro" role="alert"></p></form>` : '';
    const blocoDesp = `<section class="fc-bloco"><h3>Despesas e sangrias</h3>${despesas.length
      ? `<ul class="fc-lista fc-desp">${despesas.map((d) => `<li><span><span class="tag ${d.tipo === 'Sangria' ? 'tag-sangria' : 'tag-despesa'}">${esc(d.tipo)}</span>
          ${esc(d.descricao)} · <b>${dinheiro(d.valor)}</b> · ${esc(FORMAS_CURTAS[d.forma_pagamento] || d.forma_pagamento)}<small> · ${esc(d.criado_por_nome || '')}</small></span>
          ${podeMexer ? `<button class="link-btn nao-imprimir" data-fc-apagar="${esc(d.id)}" aria-label="Excluir ${esc(d.descricao)}">Excluir</button>` : ''}</li>`).join('')}</ul>`
      : '<p class="nota">Nenhuma despesa lançada.</p>'}${formDesp}</section>`;

    // atendimentos do dia
    const ativos = itens.filter((a) => a.status !== 'cancelado');
    const tabAtend = `<section class="fc-bloco fc-largo"><h3>Atendimentos do dia <small>(${ativos.length})</small></h3>${ativos.length ? `
      <div class="tabela-rolagem"><table class="tabela fc-tab fc-atend"><thead><tr><th>Hora</th><th>Animal</th><th>Serviço</th><th>Valor</th><th>Desc.</th><th>Acrés.</th><th>Total</th><th>Pagamento</th><th>Situação</th><th class="nao-imprimir"></th></tr></thead>
      <tbody>${ativos.map((a) => `<tr><td>${hhmm(a.horario)}</td><td><b>${esc(a.pet_nome)}</b><small> ${esc(a.tutor_nome)}</small></td><td>${esc(a.servico || '—')}${a.porte ? `<small> ${esc(a.porte)}</small>` : ''}</td>
        <td>${dinheiro(a.servico_valor)}</td><td>${n2(a.desconto) ? dinheiro(a.desconto) : '–'}</td><td>${n2(a.acrescimo) ? dinheiro(a.acrescimo) : '–'}</td>
        <td><b>${dinheiro(a.valor_total)}</b></td><td>${esc(a.forma_pagamento ? FORMAS_CURTAS[a.forma_pagamento] : '—')}</td>
        <td><span class="tag tag-${esc(a.status)}">${NOMES_STATUS[a.status]}</span></td>
        <td class="nao-imprimir">${podeMexer ? `<button class="link-btn" data-fc-acao="cobrar" data-id="${esc(a.id)}">Valor</button>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="6">Faturamento (finalizados e entregues)</td><td>${dinheiro(r.liquido)}</td><td colspan="3"></td></tr></tfoot></table></div>`
      : '<p class="nota">Nenhum atendimento neste dia.</p>'}</section>`;

    const botaoFechar = !fechado && !futuro && podeFechar
      ? `<button class="btn btn-ok${totalPend ? ' fc-bloqueado' : ''}" id="fc-fechar">🔒 Fechar o dia</button>` : '';
    $('#fc-corpo').innerHTML = cabImpressao(`Fechamento do dia ${isoParaBR(dia)}`) + status + cartoesCaixa(r) + pend
      + `<div class="fc-grade">${blocoFormas(r)}${blocoValores(r)}${blocoServicos(r)}${blocoDesp}${blocoCanc}</div>`
      + tabAtend
      + `<div class="fc-acoes nao-imprimir">${botaoFechar}
          <button class="btn btn-fantasma" id="fc-imprimir">🖨️ Imprimir / salvar PDF</button>
          <button class="btn btn-fantasma" id="fc-planilha">⬇️ Planilha do dia</button></div>`;
    const formD = $('#fc-form-desp');
    if (formD) {
      mascaraDinheiro($('#fd-valor'));
      $('#fd-tipo').addEventListener('change', () => {
        const sangria = $('#fd-tipo').value === 'Sangria';
        $('#fd-forma').value = 'Dinheiro'; $('#fd-forma').disabled = sangria;
        $('#fd-desc').placeholder = sangria ? 'Ex.: retirada para depósito' : 'Ex.: shampoo, toalhas, gasolina do leva e traz';
      });
      formD.addEventListener('submit', lancarDespesa);
    }
  }

  async function lancarDespesa(e) {
    e.preventDefault();
    const erro = $('#fd-erro');
    const desc = $('#fd-desc').value.trim(), valor = lerDinheiro($('#fd-valor')), tipo = $('#fd-tipo').value;
    $('#fd-desc').classList.toggle('invalido', !desc);
    $('#fd-valor').classList.toggle('invalido', !(valor > 0));
    if (!desc) { erro.textContent = 'Escreva a descrição.'; return; }
    if (!(valor > 0) || valor > 99999) { erro.textContent = 'Informe o valor (ex.: 25,90).'; return; }
    const btn = e.submitter || $('.fd-add'); btn.disabled = true;
    const { error } = await sb.from('despesas').insert({ data: fech.dados.dia, tipo, descricao: desc, valor,
      forma_pagamento: tipo === 'Sangria' ? 'Dinheiro' : $('#fd-forma').value });
    btn.disabled = false;
    if (error) { erro.textContent = erroBanco(error, 'Não foi possível lançar. Verifique a conexão.'); return; }
    toast(`${tipo} lançada: ${dinheiro(valor)}.`, 'ok');
    carregarFechamento();
  }

  async function fecharDia() {
    const { dia, r } = fech.dados;
    const p = pendenciasDia();
    const totalPend = p.abertos.length + p.semValor.length + p.semForma.length;
    if (totalPend) {
      return janela({ titulo: 'Ainda não dá para fechar', erro: true,
        texto: [p.abertos.length && `${p.abertos.length} pet(s) agendado(s) ou em banho: finalize ou cancele.`,
          p.semValor.length && `${p.semValor.length} atendimento(s) sem valor.`,
          p.semForma.length && `${p.semForma.length} atendimento(s) sem forma de pagamento.`].filter(Boolean).join('\n') + '\n\nAs pendências estão listadas na tela, cada uma com o botão para resolver.' });
    }
    const caixa = document.createElement('div');
    caixa.className = 'motivo-cancel';
    caixa.innerHTML = `<dl class="fc-conta fc-conta-modal">
        <dt>Atendimentos</dt><dd>${r.atendimentos}</dd>
        <dt>Faturamento</dt><dd>${dinheiro(r.liquido)}</dd>
        <dt>Despesas</dt><dd>${dinheiro(r.despesas)}</dd>
        <dt class="soma">Resultado</dt><dd class="soma">${dinheiro(r.resultado)}</dd>
        <dt>Dinheiro esperado na gaveta</dt><dd>${dinheiro(r.dinheiro_em_caixa)}</dd></dl>
      <label>Dinheiro contado na gaveta (opcional, sem o troco inicial)<span class="valor-wrap"><span class="valor-prefixo" aria-hidden="true">R$</span><input id="fx-contado" inputmode="decimal" maxlength="10" placeholder="0,00"></span></label>
      <label>Observação (opcional)<textarea id="fx-obs" rows="2" maxlength="500" placeholder="Ex.: troco de R$ 100 guardado no cofre"></textarea></label>
      <p class="erro-texto" id="fx-erro" role="alert"></p>`;
    mascaraDinheiro(caixa.querySelector('#fx-contado'));
    let contado = null, obs = '';
    const ok = await janela({ titulo: `Fechar o dia ${isoParaBR(dia)}`,
      texto: 'Confira os totais. Depois de fechado, ninguém muda os valores deste dia (só o administrador, e tudo fica no histórico).',
      extra: caixa,
      botoes: [{ rotulo: 'Voltar', valor: false }, { rotulo: '🔒 Fechar o dia', classe: 'btn-ok', valor: true, validar: () => {
        contado = lerDinheiro(caixa.querySelector('#fx-contado'));
        if (Number.isNaN(contado)) { caixa.querySelector('#fx-erro').textContent = 'Valor contado inválido.'; return false; }
        obs = caixa.querySelector('#fx-obs').value.trim();
        return true;
      } }] });
    if (!ok) return;
    const { error } = await sb.rpc('fechar_dia', { p_data: dia, p_dinheiro_contado: contado, p_observacao: obs || null });
    if (error) return janela({ titulo: 'Não foi possível fechar', erro: true, texto: erroBanco(error, 'Verifique a conexão e tente de novo.') });
    toast(`Caixa de ${isoParaBR(dia)} fechado.`, 'ok');
    carregarFechamento();
    carregarDia();
  }

  async function reabrirDia() {
    const { dia } = fech.dados;
    const caixa = document.createElement('div');
    caixa.className = 'motivo-cancel';
    caixa.innerHTML = `<label class="obrig"><span>Motivo da reabertura <span class="ast" aria-hidden="true">*</span></span>
      <textarea id="rx-motivo" rows="2" maxlength="500" placeholder="Ex.: corrigir o valor da tosa do Thor"></textarea></label><p class="erro-texto" id="rx-erro" role="alert"></p>`;
    let motivo = '';
    const ok = await janela({ titulo: `Reabrir o dia ${isoParaBR(dia)}`,
      texto: 'Com o dia reaberto, a equipe volta a poder mudar os valores. Feche de novo quando terminar.', extra: caixa,
      botoes: [{ rotulo: 'Voltar', valor: false }, { rotulo: 'Reabrir dia', classe: 'btn-perigo', valor: true, validar: () => {
        motivo = caixa.querySelector('#rx-motivo').value.trim();
        if (motivo.length < 3) { caixa.querySelector('#rx-erro').textContent = 'Escreva o motivo.'; return false; }
        return true;
      } }] });
    if (!ok) return;
    const { error } = await sb.rpc('reabrir_dia', { p_data: dia, p_motivo: motivo });
    if (error) return toast(erroBanco(error, 'Não foi possível reabrir o dia.'), 'erro');
    toast('Dia reaberto (registrado no histórico).', 'ok');
    carregarFechamento();
    carregarDia();
  }

  function planilhaDia() {
    const { dia, r, itens, despesas, fechamento } = fech.dados;
    const cab = ['Data', 'Horário', 'Situação', 'Animal', 'Tutor', 'Serviço', 'Porte', 'Valor do serviço (R$)', 'Desconto (R$)', 'Acréscimo (R$)',
      'Motivo do desconto/acréscimo', 'Valor final (R$)', 'Forma de pagamento', 'Finalizado por', 'Entregue por', 'Motivo do cancelamento'];
    const linhas = itens.map((a) => [isoParaBR(a.data), hhmm(a.horario), NOMES_STATUS[a.status], a.pet_nome, a.tutor_nome, a.servico, a.porte,
      v2(a.servico_valor), v2(a.desconto), v2(a.acrescimo), a.ajuste_motivo, v2(a.valor_total), a.forma_pagamento,
      nomeDe(a.finalizado_por), nomeDe(a.entregue_por), a.motivo_cancelamento]);
    linhas.push([], ['DESPESAS E SANGRIAS'], ['Tipo', 'Descrição', 'Valor (R$)', 'Pago com', 'Lançado por']);
    despesas.forEach((d) => linhas.push([d.tipo, d.descricao, v2(d.valor), d.forma_pagamento, d.criado_por_nome]));
    linhas.push([], ['RESUMO'],
      ['Atendimentos', r.atendimentos], ['Serviços (R$)', v2(r.bruto)], ['Descontos (R$)', v2(r.descontos)], ['Acréscimos (R$)', v2(r.acrescimos)],
      ['Faturamento (R$)', v2(r.liquido)], ['Ticket médio (R$)', v2(r.ticket_medio)], ['Despesas (R$)', v2(r.despesas)], ['Resultado (R$)', v2(r.resultado)],
      ['Sangrias (R$)', v2(r.sangrias)], ['Dinheiro esperado na gaveta (R$)', v2(r.dinheiro_em_caixa)], ['Cancelados', r.cancelados]);
    (r.por_forma || []).forEach((x) => linhas.push([`Pagamento: ${x.forma}`, x.qtd, v2(x.valor)]));
    linhas.push(['Situação do caixa', fechamento && fechamento.situacao === 'fechado' ? `Fechado por ${fechamento.fechado_por_nome} em ${quandoBR(fechamento.fechado_em)}` : 'Aberto']);
    baixarPlanilha(nomeArquivo(`caixa_${dia}.csv`), cab, linhas);
  }

  // ---------- MÊS ----------
  function desenharCaixaMes() {
    const { ano, mes, r, ant, fecs, mesAnt, anoAnt } = fech.dados;
    const nomeAnt = `${MESES[mesAnt - 1].toLowerCase()}${anoAnt !== ano ? ` de ${anoAnt}` : ''}`;
    const comp = (chave) => {
      const a = n2(r[chave]), b = n2(ant[chave]);
      if (!b) return `<small class="fc-comp">sem dados em ${esc(nomeAnt)}</small>`;
      const pct = Math.round(((a - b) / Math.abs(b)) * 100);
      const bom = chave === 'despesas' ? pct <= 0 : pct >= 0;
      return `<small class="fc-comp ${pct === 0 ? '' : bom ? 'sobe' : 'desce'}">${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct)}% vs. ${esc(nomeAnt)}</small>`;
    };
    const hoje = hojeISO();
    const dias = (r.dias || []);
    const comMov = dias.filter((d) => d.agendados > 0 || d.despesas > 0);
    const fechados = comMov.filter((d) => fecs[d.data] && fecs[d.data].situacao === 'fechado');
    const pendentes = comMov.filter((d) => d.data <= hoje && !(fecs[d.data] && fecs[d.data].situacao === 'fechado'));
    const situacao = (d) => {
      const f = fecs[d.data];
      if (f && f.situacao === 'fechado') return `<span class="tag tag-finalizado">🔒 ${esc(f.fechado_por_nome || 'fechado')}</span>`;
      if (f && f.situacao === 'reaberto') return '<span class="tag tag-agendado">reaberto</span>';
      if (d.data > hoje) return d.agendados ? '<span class="tag">futuro</span>' : '';
      return d.agendados || d.despesas ? '<span class="tag tag-agendado">aberto</span>' : '';
    };
    const linhas = dias.filter((d) => d.agendados || d.despesas || d.cancelados).map((d) => {
      const [, , dd] = d.data.split('-').map(Number);
      const sem = new Date(ano, mes - 1, dd).getDay();
      return `<tr data-fc-dia="${esc(d.data)}" class="fc-linha-dia${d.data === hoje ? ' linha-hoje' : ''}" tabindex="0">
        <td class="col-periodo"><span class="dia-n">${pad(dd)}</span><span class="dia-sem${sem === 0 ? ' dom' : ''}">${DIAS_CURTOS[sem]}</span></td>
        <td>${d.atendimentos}</td><td>${dinheiro(d.liquido)}</td><td>${d.despesas ? dinheiro(d.despesas) : '–'}</td>
        <td><b>${dinheiro(d.liquido - d.despesas)}</b></td><td>${d.cancelados || '–'}</td><td>${situacao(d)}</td></tr>`;
    }).join('');
    const compLinha = (rotulo, chave, fmt) => `<tr><td>${rotulo}</td><td>${fmt(r[chave])}</td><td>${fmt(ant[chave])}</td><td>${comp(chave).replace(/<\/?small[^>]*>/g, '')}</td></tr>`;
    const din = (x) => dinheiro(x), int = (x) => String(n2(x));
    $('#fc-corpo').innerHTML = cabImpressao(`Fechamento do mês: ${MESES[mes - 1]} de ${ano}`)
      + `<div class="fc-status ${pendentes.length ? 'fc-reaberto' : 'fc-aberto'}"><div><b>${MESES[mes - 1]} de ${ano}:</b> ${fechados.length} de ${comMov.length} dia(s) com movimento fechados.
          ${pendentes.length ? `Falta fechar: ${pendentes.map((d) => isoParaBR(d.data).slice(0, 5)).join(', ')}.` : ''}</div></div>`
      + cartoesCaixa(r, comp)
      + `<div class="fc-grade">${blocoFormas(r)}${blocoValores(r)}${blocoServicos(r)}
         <section class="fc-bloco"><h3>Comparação com ${esc(nomeAnt)}</h3>
           <table class="tabela fc-tab"><thead><tr><th></th><th>${esc(MESES[mes - 1])}</th><th>${esc(MESES[mesAnt - 1])}</th><th>Variação</th></tr></thead><tbody>
           ${compLinha('Faturamento', 'liquido', din)}${compLinha('Atendimentos', 'atendimentos', int)}${compLinha('Ticket médio', 'ticket_medio', din)}
           ${compLinha('Despesas', 'despesas', din)}${compLinha('Resultado', 'resultado', din)}${compLinha('Cancelados', 'cancelados', int)}</tbody></table></section></div>`
      + `<section class="fc-bloco fc-largo"><h3>Dias do mês</h3>${linhas ? `<p class="nota nao-imprimir">Toque num dia para ver o fechamento dele.</p>
          <div class="tabela-rolagem"><table class="tabela fc-tab fc-dias"><thead><tr><th class="col-periodo">Dia</th><th>Atend.</th><th>Faturamento</th><th>Despesas</th><th>Resultado</th><th>Canc.</th><th>Caixa</th></tr></thead>
          <tbody>${linhas}</tbody><tfoot><tr><td>Total</td><td>${r.atendimentos}</td><td>${dinheiro(r.liquido)}</td><td>${dinheiro(r.despesas)}</td><td>${dinheiro(r.resultado)}</td><td>${r.cancelados}</td><td></td></tr></tfoot></table></div>`
        : '<p class="nota">Nenhum movimento neste mês.</p>'}</section>`
      + `<div class="fc-acoes nao-imprimir"><button class="btn btn-fantasma" id="fc-imprimir">🖨️ Imprimir / salvar PDF</button>
          <button class="btn btn-fantasma" id="fc-planilha">⬇️ Planilha do mês</button></div>`;
  }
  function planilhaMes() {
    const { ano, mes, r, ant, fecs } = fech.dados;
    const cab = ['Data', 'Atendimentos', 'Faturamento (R$)', 'Despesas (R$)', 'Resultado (R$)', 'Cancelados', 'Caixa'];
    const linhas = (r.dias || []).map((d) => [isoParaBR(d.data), d.atendimentos, v2(d.liquido), v2(d.despesas), v2(d.liquido - d.despesas), d.cancelados,
      fecs[d.data] && fecs[d.data].situacao === 'fechado' ? `Fechado por ${fecs[d.data].fechado_por_nome}` : (fecs[d.data] ? 'Reaberto' : '')]);
    linhas.push(['TOTAL', r.atendimentos, v2(r.liquido), v2(r.despesas), v2(r.resultado), r.cancelados], [],
      ['RESUMO', 'Este mês', 'Mês anterior'],
      ['Serviços (R$)', v2(r.bruto), v2(ant.bruto)], ['Descontos (R$)', v2(r.descontos), v2(ant.descontos)], ['Acréscimos (R$)', v2(r.acrescimos), v2(ant.acrescimos)],
      ['Faturamento (R$)', v2(r.liquido), v2(ant.liquido)], ['Atendimentos', r.atendimentos, ant.atendimentos], ['Ticket médio (R$)', v2(r.ticket_medio), v2(ant.ticket_medio)],
      ['Despesas (R$)', v2(r.despesas), v2(ant.despesas)], ['Resultado (R$)', v2(r.resultado), v2(ant.resultado)], ['Sangrias (R$)', v2(r.sangrias), v2(ant.sangrias)], []);
    (r.por_forma || []).forEach((x) => linhas.push([`Pagamento: ${x.forma}`, x.qtd, v2(x.valor)]));
    (r.por_servico || []).forEach((x) => linhas.push([`Serviço: ${x.servico}`, x.qtd, v2(x.valor)]));
    baixarPlanilha(nomeArquivo(`caixa_${ano}-${pad(mes)}.csv`), cab, linhas);
  }

  // cliques dentro do fechamento
  $('#fc-corpo').addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('#fc-fechar')) return fecharDia();
    if (t.closest('#fc-reabrir')) return reabrirDia();
    if (t.closest('#fc-imprimir')) return window.print();
    if (t.closest('#fc-planilha')) return fech.modo === 'mes' ? planilhaMes() : planilhaDia();
    const ac = t.closest('[data-fc-acao]');
    if (ac) {
      const a = fech.dados.itens.find((x) => x.id === ac.dataset.id);
      if (a) return executarAcao(ac.dataset.fcAcao, a);
    }
    const ir = t.closest('[data-fc-ir]');
    if (ir) {
      const a = fech.dados.itens.find((x) => x.id === ir.dataset.fcIr);
      if (!a) return;
      estado.destacar = hhmm(a.horario);
      $('[data-aba="agenda"]').click();
      if (estado.visao === 'semana') $('[data-visao="dia"]').click();
      return irParaDia(a.data);
    }
    const ap = t.closest('[data-fc-apagar]');
    if (ap) {
      const d = fech.dados.despesas.find((x) => x.id === ap.dataset.fcApagar);
      if (!d || !(await confirmar('Excluir lançamento', `Excluir "${d.descricao}" (${dinheiro(d.valor)})? Fica registrado no histórico.`, 'Excluir', 'btn-perigo'))) return;
      const { error } = await sb.from('despesas').delete().eq('id', d.id);
      if (error) return toast(erroBanco(error, 'Não foi possível excluir.'), 'erro');
      toast('Lançamento excluído.');
      return carregarFechamento();
    }
    const dia = t.closest('[data-fc-dia]');
    if (dia) { fech.dia = dia.dataset.fcDia; return mudarModoCaixa('dia'); }
  });
  $('#fc-corpo').addEventListener('keydown', (e) => {
    const dia = e.target.closest('[data-fc-dia]');
    if (dia && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fech.dia = dia.dataset.fcDia; mudarModoCaixa('dia'); }
  });

  // ---------- TABELA DE PREÇOS ----------
  function desenharPrecos() {
    const admin = ehAdmin();
    const lista = estado.servicos;
    const celulaPreco = (s, campo) => (admin
      ? `<span class="valor-wrap"><span class="valor-prefixo" aria-hidden="true">R$</span><input class="pr-valor" data-campo="${campo}" inputmode="decimal" maxlength="9" placeholder="—" value="${v2(s[campo])}" aria-label="${esc(s.nome)}: ${campo.replace('valor_', 'porte ')}"></span>`
      : dinheiro(s[campo]));
    $('#fc-corpo').innerHTML = cabImpressao('Tabela de preços')
      + `<p class="nota">Ao escolher o serviço e o porte no agendamento, o valor é preenchido sozinho por esta tabela (e pode ser mudado na hora).
          ${admin ? 'Só o administrador muda a tabela; cada mudança fica no histórico.' : 'Só o administrador muda a tabela.'}</p>
        <div class="tabela-rolagem"><table class="tabela fc-tab tab-precos"><thead><tr><th>Serviço</th><th>Pequeno</th><th>Médio</th><th>Grande</th><th>Em uso</th></tr></thead>
        <tbody>${lista.map((s) => `<tr data-pr-id="${esc(s.id)}"${s.ativo ? '' : ' class="pr-inativo"'}><td><b>${esc(s.nome)}</b></td>
          <td>${celulaPreco(s, 'valor_pequeno')}</td><td>${celulaPreco(s, 'valor_medio')}</td><td>${celulaPreco(s, 'valor_grande')}</td>
          <td>${admin ? `<input type="checkbox" class="pr-ativo" ${s.ativo ? 'checked' : ''} aria-label="${esc(s.nome)} em uso">` : (s.ativo ? 'Sim' : 'Não')}</td></tr>`).join('')
          || '<tr class="vazio"><td colspan="5">Nenhum serviço cadastrado.</td></tr>'}</tbody></table></div>`
      + (admin ? `<div class="fc-acoes nao-imprimir"><button class="btn btn-primario" id="pr-salvar">Salvar preços</button><button class="btn btn-fantasma" id="fc-imprimir">🖨️ Imprimir</button></div>
        <section class="fc-bloco nao-imprimir"><h3>Novo serviço</h3><form id="pr-novo" class="fc-form-desp" novalidate>
          <div class="fc-form-linha"><label class="fd-desc">Nome<input id="pn-nome" maxlength="60" placeholder="Ex.: Banho medicamentoso"></label></div>
          <div class="fc-form-linha">${PORTES.map((p) => `<label>${p}<span class="valor-wrap"><span class="valor-prefixo" aria-hidden="true">R$</span><input id="pn-${CAMPO_PORTE[p]}" inputmode="decimal" maxlength="9" placeholder="—"></span></label>`).join('')}
          <button type="submit" class="btn btn-primario fd-add">Adicionar</button></div>
          <p class="erro-texto" id="pn-erro" role="alert"></p></form></section>`
        : '<div class="fc-acoes nao-imprimir"><button class="btn btn-fantasma" id="fc-imprimir">🖨️ Imprimir</button></div>');
    if (!admin) return;
    $$('#fc-corpo .pr-valor, #pr-novo input[inputmode="decimal"]').forEach(mascaraDinheiro);
    $('#pr-salvar').addEventListener('click', salvarPrecos);
    $('#pr-novo').addEventListener('submit', novoServico);
  }
  async function salvarPrecos() {
    const mudancas = [];
    let invalido = false;
    $$('#fc-corpo tr[data-pr-id]').forEach((tr) => {
      const s = estado.servicos.find((x) => x.id === tr.dataset.prId);
      if (!s) return;
      const novo = { ativo: tr.querySelector('.pr-ativo').checked };
      tr.querySelectorAll('.pr-valor').forEach((inp) => {
        const v = lerDinheiro(inp);
        inp.classList.toggle('invalido', Number.isNaN(v) || (v != null && v > 99999));
        if (Number.isNaN(v) || (v != null && v > 99999)) invalido = true;
        novo[inp.dataset.campo] = v;
      });
      const mudou = Object.keys(novo).some((k) => (k === 'ativo' ? novo[k] !== s[k] : (novo[k] ?? null) !== (s[k] == null ? null : Number(s[k]))));
      if (mudou) mudancas.push([s.id, novo]);
    });
    if (invalido) return toast('Há preço inválido (use, por exemplo, 60,00).', 'erro');
    if (!mudancas.length) return toast('Nenhum preço mudou.');
    const btn = $('#pr-salvar'); btn.disabled = true;
    const resultados = await Promise.all(mudancas.map(([id, dados]) => sb.from('servicos').update(dados).eq('id', id)));
    btn.disabled = false;
    if (resultados.some((x) => x.error)) toast('Alguns preços não foram salvos. Verifique a conexão.', 'erro');
    else toast(`Tabela de preços salva (${mudancas.length} serviço(s)).`, 'ok');
    await carregarServicos();
    desenharPrecos();
  }
  async function novoServico(e) {
    e.preventDefault();
    const nome = nomeProprio($('#pn-nome').value).slice(0, 60);
    const erro = $('#pn-erro');
    if (!nome) { erro.textContent = 'Escreva o nome do serviço.'; $('#pn-nome').classList.add('invalido'); return; }
    if (nome === 'Outro' || estado.servicos.some((s) => semAcento(s.nome) === semAcento(nome))) { erro.textContent = 'Já existe um serviço com esse nome.'; return; }
    const dados = { nome, ordem: Math.max(0, ...estado.servicos.map((s) => s.ordem || 0)) + 1 };
    for (const p of PORTES) {
      const v = lerDinheiro($(`#pn-${CAMPO_PORTE[p]}`));
      if (Number.isNaN(v) || (v != null && v > 99999)) { erro.textContent = `Preço do porte ${p.toLowerCase()} inválido.`; return; }
      dados[CAMPO_PORTE[p]] = v;
    }
    const { error } = await sb.from('servicos').insert(dados);
    if (error) { erro.textContent = error.code === '23505' ? 'Já existe um serviço com esse nome.' : 'Não foi possível salvar.'; return; }
    toast(`Serviço "${nome}" adicionado.`, 'ok');
    await carregarServicos();
    desenharPrecos();
  }

  iniciar();
})();
