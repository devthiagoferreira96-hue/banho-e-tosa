// =====================================================================
// BANHO E TOSA – Service worker (deixa o site instalável como app)
// Sempre busca a versão mais nova na internet; a cópia guardada só é usada
// se o celular estiver sem conexão. Dados do Supabase nunca são guardados.
// =====================================================================
const CACHE = 'banho-tosa-v4';
const ARQUIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'racas.js', 'config.js', 'registrar-app.js', 'vendor/supabase.js',
  'manifest.webmanifest', 'icones/icone-192.png', 'icones/icone-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((nomes) =>
    Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // só arquivos do próprio site; Supabase, fontes e bibliotecas passam direto
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // a página principal sempre vem inteira da internet (com as regras de segurança atuais do vercel.json);
  // sem isso o navegador pode reaproveitar a cópia antiga junto com as regras antigas
  // os demais arquivos (app.js, config.js...) sempre conferem com o servidor se mudaram
  // (o Safari do iPhone guardava cópias antigas, ex.: config.js sem o WhatsApp da loja)
  const daRede = req.mode === 'navigate'
    ? fetch(req.url, { cache: 'reload', credentials: 'same-origin' }).then((r) => (r.redirected ? fetch(req) : r))
    : fetch(req, { cache: 'no-cache' });
  e.respondWith(
    daRede
      .then((resp) => {
        if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
