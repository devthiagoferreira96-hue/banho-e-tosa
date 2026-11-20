// Registra o app instalável (service worker).
// Fica em arquivo separado porque as regras de segurança do site (vercel.json) não permitem código solto na página.
// Não funciona abrindo o arquivo direto do computador, só pelo site.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
