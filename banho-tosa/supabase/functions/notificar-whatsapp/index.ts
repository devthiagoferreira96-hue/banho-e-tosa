// =====================================================================
// BANHO E TOSA – Edge Function (a mesma do Agenda Pet) "notificar-whatsapp"
// Envia a mensagem de "pet pronto" para o tutor quando o banho é finalizado.
// O nome do tutor, o nome do pet, o sexo e o WhatsApp vêm do banco de dados.
//
// Funciona com dois provedores (escolha um nos "Secrets" do Supabase):
//   WHATSAPP_PROVEDOR = "meta"  -> WhatsApp Cloud API oficial da Meta (sem mensalidade)
//       META_TOKEN, META_PHONE_NUMBER_ID
//       META_TEMPLATE_MACHO  (ex.: pet_pronto_macho)  -> "do Thor... ele está pronto"
//       META_TEMPLATE_FEMEA  (ex.: pet_pronto_femea)  -> "da Mel... ela está pronta"
//       META_TEMPLATE        (ex.: pet_pronto)        -> texto neutro, se o sexo não foi informado
//       Os 3 modelos têm 2 variáveis: {{1}} = nome do tutor, {{2}} = nome do pet
//       META_IDIOMA (padrão pt_BR), META_VERSAO (padrão v23.0)
//   WHATSAPP_PROVEDOR = "zapi"  -> Z-API
//       ZAPI_INSTANCIA, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN
// Comuns: DDI (padrão 55), NOME_EMPRESA, MENSAGEM_PRONTO (só para Z-API),
//         AVISO_INTERVALO_MIN (padrão 10: tempo mínimo entre dois avisos do mesmo agendamento)
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
// "do(a)", "ele(a)", "pronto(a)" -> do/ele/pronto (Macho) ou da/ela/pronta (Fêmea)
const generoTexto = (txt: string, sexo: string | null) =>
  sexo !== 'Macho' && sexo !== 'Fêmea' ? txt
    : txt.replace(/(\p{L}+)\(a\)/gu, (_m: string, p: string) =>
        sexo === 'Macho' ? p : p.replace(/[oe]$/, 'a').replace(/[OE]$/, 'A'));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { id } = await req.json();
    if (!id) return json({ ok: false, erro: 'id ausente' }, 400);

    // Usa o login de quem chamou: as regras de acesso (RLS) continuam valendo.
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
    });

    const { data: ag, error } = await sb.from('agendamentos')
      .select('id, tutor_nome, pet_nome, pet_sexo, telefone, status, aviso_enviado_em').eq('id', id).maybeSingle();
    if (error || !ag) return json({ ok: false, erro: 'agendamento não encontrado' }, 404);
    if (ag.status !== 'finalizado' && ag.status !== 'entregue') return json({ ok: false, erro: 'agendamento ainda não finalizado' }, 400);
    if (!ag.telefone) return json({ ok: false, erro: 'sem telefone' }, 400);

    // Trava contra disparo repetido: no máximo 1 aviso a cada AVISO_INTERVALO_MIN minutos (padrão 10)
    const intervaloMin = Number(Deno.env.get('AVISO_INTERVALO_MIN') ?? '10');
    if (ag.aviso_enviado_em) {
      const passouMin = (Date.now() - new Date(ag.aviso_enviado_em).getTime()) / 60000;
      if (passouMin < intervaloMin) {
        return json({ ok: false, repetido: true, erro: `aviso já enviado há ${Math.max(1, Math.round(passouMin))} min` }, 429);
      }
    }

    const ddi = Deno.env.get('DDI') ?? '55';
    const numero = `${ddi}${String(ag.telefone).replace(/\D/g, '')}`;
    const tutor = String(ag.tutor_nome).split(' ')[0];
    const empresa = Deno.env.get('NOME_EMPRESA') ?? '';
    const provedor = (Deno.env.get('WHATSAPP_PROVEDOR') ?? '').toLowerCase();

    let resp: Response;
    if (provedor === 'zapi') {
      const modelo = Deno.env.get('MENSAGEM_PRONTO') ??
        'Olá, {tutor}! O banho do(a) {pet} foi finalizado e ele(a) já está pronto(a) para ser retirado(a). Obrigado pela confiança! – {empresa}';
      const mensagem = generoTexto(
        modelo.replaceAll('{tutor}', tutor).replaceAll('{pet}', ag.pet_nome).replaceAll('{empresa}', empresa),
        ag.pet_sexo);
      resp = await fetch(
        `https://api.z-api.io/instances/${Deno.env.get('ZAPI_INSTANCIA')}/token/${Deno.env.get('ZAPI_TOKEN')}/send-text`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Client-Token': Deno.env.get('ZAPI_CLIENT_TOKEN') ?? '' },
          body: JSON.stringify({ phone: numero, message: mensagem })
        }
      );
    } else if (provedor === 'meta') {
      // modelo aprovado conforme o sexo do animal
      const neutro = Deno.env.get('META_TEMPLATE') ?? 'pet_pronto';
      const nomeModelo =
        ag.pet_sexo === 'Macho' ? (Deno.env.get('META_TEMPLATE_MACHO') ?? neutro)
        : ag.pet_sexo === 'Fêmea' ? (Deno.env.get('META_TEMPLATE_FEMEA') ?? neutro)
        : neutro;
      const versao = Deno.env.get('META_VERSAO') ?? 'v23.0';
      resp = await fetch(`https://graph.facebook.com/${versao}/${Deno.env.get('META_PHONE_NUMBER_ID')}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('META_TOKEN')}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: numero,
          type: 'template',
          template: {
            name: nomeModelo,
            language: { code: Deno.env.get('META_IDIOMA') ?? 'pt_BR' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: tutor }, { type: 'text', text: ag.pet_nome }] }]
          }
        })
      });
    } else {
      return json({ ok: false, erro: 'WHATSAPP_PROVEDOR não configurado' }, 500);
    }

    if (!resp.ok) return json({ ok: false, erro: `provedor respondeu ${resp.status}`, detalhe: await resp.text() }, 502);

    await sb.from('agendamentos').update({ aviso_enviado_em: new Date().toISOString() }).eq('id', id);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, erro: String(e) }, 500);
  }
});
