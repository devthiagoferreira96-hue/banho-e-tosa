// =====================================================================
// BANHO E TOSA – configurações
// 1. Copie este arquivo com o nome config.js (na mesma pasta).
// 2. Preencha os dados do SEU projeto novo do Supabase.
// O config.js NÃO vai no zip e NÃO deve ir para o GitHub se tiver dados reais.
// Nunca coloque aqui senha, token do WhatsApp ou a chave secreta (sb_secret_ / service_role).
// =====================================================================
window.CONFIG = {
  // Supabase > Project Settings > API (ou Data API)
  SUPABASE_URL: 'https://COLE-AQUI.supabase.co',
  SUPABASE_ANON_KEY: 'COLE-AQUI-a-chave-publishable-ou-anon',
  WHATSAPP_LOJA: '1199999-9999',

  // Nome e subtítulo que aparecem no topo e no login (logo provisória na pasta icones)
  NOME_SISTEMA: 'Banho e Tosa',
  SUBTITULO: 'Banho e Tosa',

  // Horários sugeridos no formulário
  HORARIO_INICIO: '07:00',
  HORARIO_FIM: '19:00',
  INTERVALO_MIN: 30,

  // Endereço de saída e volta das rotas do leva e traz
  ENDERECO_LOJA: { rua: 'Avenida Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo/SP', cep: '01310100' },

  // Aviso de "pet pronto" pelo WhatsApp
  WHATSAPP_AUTOMATICO: false,     // true = envia sozinho pela função notificar-whatsapp (veja o LEIAME)
  DDI: '55',
  NOME_EMPRESA_MENSAGEM: 'Banho e Tosa',
  MENSAGEM_PRONTO: 'Olá, {tutor}! O banho do(a) {pet} foi finalizado e ele(a) já está pronto(a) para ser retirado(a). Obrigado pela confiança! – {empresa}',
  AVISO_INTERVALO_MIN: 10
};
