// Envia por e-mail (Resend) cada mudança de fase ou de prazo ao requerente.
// É acionada a cada minuto pelo agendador do banco (pg_cron) e processa a fila emails_enviados.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = (Deno.env.get("SITE_URL") ?? "https://central-usucapioes.vercel.app").replace(/\/$/, "");
// Enquanto o domínio do cartório não estiver verificado no Resend, o remetente de teste só envia ao dono da conta Resend.
const FROM = Deno.env.get("EMAIL_FROM") ?? "Registro de Imóveis de Itararé <onboarding@resend.dev>";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const MAX_TENTATIVAS = 3;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fmtYMD = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};
const fmtBR = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

type Linha = {
  email_id: number; destinatario: string; tentativas: number; copia: boolean; lembrete: boolean; protocolo: string; requerente_nome: string;
  tipo: string | null; fase_id: number | null; fase_nome: string | null; descricao: string | null;
  mensagem: string | null; prazo_edital: string | null; em: string | null;
};

function montar(r: Linha) {
  const copia = !!r.copia;
  const primeiro = copia ? "" : (r.requerente_nome ?? "").trim().split(/\s+/)[0] || "";
  const ehPrazo = r.tipo === "prazo";
  const ehNota = r.tipo === "nota";
  const lembrete = !!r.lembrete;
  const titulo = lembrete ? "Seu pedido aguarda providências"
    : ehPrazo ? "Prazo atualizado"
    : ehNota ? "Observação do cartório"
    : (r.fase_nome ?? "Atualização do pedido");
  const link = `${SITE}/?p=${encodeURIComponent(r.protocolo)}`;
  const assunto = `${copia ? "Cópia · " : ""}Usucapião ${r.protocolo}: ${ehPrazo ? "prazo atualizado" : titulo.toLowerCase()}`.slice(0, 120);
  const quando = r.lembrete || !r.em ? fmtBR(new Date().toISOString()) : fmtBR(r.em);
  const dias = lembrete && r.em ? Math.max(1, Math.floor((Date.now() - new Date(r.em).getTime()) / 86400000)) : 0;
  const desc = lembrete
    ? `O seu pedido está parado há ${dias} dias aguardando providências suas. ${r.descricao ?? ""}`.trim()
    : (ehPrazo || ehNota ? "" : (r.descricao ?? ""));
  const prazo = !ehPrazo && !ehNota && !lembrete && r.prazo_edital ? `O prazo do edital termina em ${fmtYMD(r.prazo_edital)}.` : "";
  const rotulo = lembrete ? "Lembrete" : ehPrazo ? "Atualização" : ehNota ? "Observação" : "Nova etapa";

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#EDF0EA;font-family:Arial,Helvetica,sans-serif;color:#13261F">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EDF0EA"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0F3B2D;color:#F2F7F3;padding:18px 24px;font-size:18px;font-weight:bold">Registro de Imóveis de Itararé</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:16px">Olá${primeiro ? ", " + esc(primeiro) : ""}!</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${copia ? `Cópia do andamento do pedido de usucapião extrajudicial de <b>${esc(r.requerente_nome)}</b> (protocolo <b>${esc(r.protocolo)}</b>), enviada por você constar como representante.` : `${lembrete ? "Lembrete sobre" : "O andamento d"}${lembrete ? " o" : "o"} seu pedido de usucapião extrajudicial (protocolo <b>${esc(r.protocolo)}</b>)${lembrete ? "." : " foi atualizado."}`}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F7F3;border-left:4px solid #A8751F;border-radius:6px"><tr><td style="padding:12px 16px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#66786F">${rotulo}</div>
<div style="font-size:18px;font-weight:bold;margin:2px 0">${esc(titulo)}</div>
<div style="font-size:12px;color:#465850">${esc(quando)}</div></td></tr></table>
${desc ? `<p style="margin:16px 0 0;font-size:15px;line-height:1.5">${esc(desc)}</p>` : ""}
${r.mensagem ? `<div style="margin:16px 0 0;padding:10px 14px;border-left:3px solid #D5DCD3;background:#F5F7F3;font-size:15px;line-height:1.5"><div style="font-size:12px;color:#66786F;margin-bottom:4px">Mensagem do cartório</div>${esc(r.mensagem)}</div>` : ""}
${prazo ? `<p style="margin:16px 0 0;font-size:15px"><b>${esc(prazo)}</b></p>` : ""}
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#0F3B2D;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">${copia ? "Acompanhar o pedido" : "Acompanhar meu pedido"}</a></p>
<p style="margin:0;font-size:12px;color:#66786F;line-height:1.5">Você recebe um e-mail a cada mudança de etapa. Se o botão não abrir, copie este endereço no navegador:<br>${esc(link)}</p>
</td></tr></table></td></tr></table></body></html>`;

  const texto = [
    `Olá${primeiro ? ", " + primeiro : ""}!`,
    copia
      ? `Cópia do andamento do pedido de usucapião extrajudicial de ${r.requerente_nome} (protocolo ${r.protocolo}).`
      : lembrete ? `Lembrete sobre o seu pedido de usucapião extrajudicial (protocolo ${r.protocolo}).`
      : `O andamento do seu pedido de usucapião extrajudicial (protocolo ${r.protocolo}) foi atualizado.`,
    `${rotulo}: ${titulo} (${quando})`,
    desc, r.mensagem ? `Mensagem do cartório: ${r.mensagem}` : "", prazo,
    `Acompanhe o pedido: ${link}`,
  ].filter(Boolean).join("\n\n");

  return { assunto, html, texto };
}

Deno.serve(async (req) => {
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

  // Sem a chave do Resend, os e-mails ficam na fila até ela ser configurada.
  if (!RESEND_KEY) return json({ ignorado: "RESEND_API_KEY ainda não configurada" });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const corpo = await req.json().catch(() => ({}));
  if (corpo?.modo === "resumo") return await resumoDiario(sb, json);
  if (corpo?.modo === "backup") return await backupSemanal(sb, json);
  const acessos = await enviarAcessos(sb);
  if (corpo?.modo === "acesso") return json({ acessos });
  const { data, error } = await sb.rpc("reservar_emails_v4", { p_limite: 20 });
  if (error) return json({ erro: error.message }, 500);

  let enviados = 0, falhas = 0;
  for (const r of (data ?? []) as Linha[]) {
    const { assunto, html, texto } = montar(r);
    let erroEnvio: string | null = null;
    let resendId: string | null = null;
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [r.destinatario], subject: assunto, html, text: texto }),
      });
      if (!resp.ok) erroEnvio = `Resend ${resp.status}: ${(await resp.text()).slice(0, 300)}`;
      else resendId = (await resp.json().catch(() => null))?.id ?? null;
    } catch (e) {
      erroEnvio = `Falha de rede: ${String((e as Error).message ?? e).slice(0, 200)}`;
    }
    if (!erroEnvio) {
      enviados++;
      await sb.from("emails_enviados").update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null, resend_id: resendId }).eq("id", r.email_id);
    } else {
      falhas++;
      await sb.from("emails_enviados").update({
        status: r.tentativas >= MAX_TENTATIVAS ? "falhou" : "pendente", erro: erroEnvio,
      }).eq("id", r.email_id);
    }
  }
  return json({ enviados, falhas, acessos });
});

// Link de acesso do advogado (válido 30 minutos), pedido na página pública com o e-mail cadastrado.
async function enviarAcessos(sb: ReturnType<typeof createClient>) {
  const { data, error } = await sb.rpc("reservar_acessos");
  if (error || !data) return 0;
  let n = 0;
  for (const a of data as { email: string; nome: string; token: string }[]) {
    const link = `${SITE}/?adv=${encodeURIComponent(a.token)}`;
    const primeiro = (a.nome ?? "").trim().split(/\s+/)[0] || "";
    const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#EDF0EA;font-family:Arial,Helvetica,sans-serif;color:#13261F"><table role="presentation" width="100%" style="background:#EDF0EA"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="560" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#0F3B2D;color:#F2F7F3;padding:18px 24px;font-size:18px;font-weight:bold">Registro de Imóveis de Itararé</td></tr><tr><td style="padding:24px"><p style="margin:0 0 12px;font-size:16px">Olá${primeiro ? ", " + esc(primeiro) : ""}!</p><p style="margin:0 0 16px;font-size:15px;line-height:1.5">Use o botão abaixo para ver o andamento de todos os seus processos de usucapião. O link vale por 30 minutos.</p><p style="margin:24px 0"><a href="${esc(link)}" style="background:#0F3B2D;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">Ver meus processos</a></p><p style="margin:0;font-size:12px;color:#66786F;line-height:1.5">Se você não pediu este acesso, ignore esta mensagem. Não encaminhe este e-mail: quem tiver o link vê a lista.</p></td></tr></table></td></tr></table></body></html>`;
    const texto = `Olá${primeiro ? ", " + primeiro : ""}!\n\nUse o link para ver o andamento de todos os seus processos (vale 30 minutos):\n${link}\n\nSe você não pediu, ignore. Não encaminhe este e-mail.`;
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [a.email], subject: "Seu acesso aos processos de usucapião", html, text: texto }),
      });
      if (resp.ok) n++;
    } catch { /* tenta de novo no próximo pedido do advogado */ }
  }
  return n;
}

// Resumo diário: um e-mail por escrevente com os processos que pedem atenção.
async function resumoDiario(sb: ReturnType<typeof createClient>, json: (o: unknown, s?: number) => Response) {
  const { data: liberado } = await sb.rpc("liberar_execucao", { p_nome: "resumo", p_horas: 20 });
  if (!liberado) return json({ resumo: false, ignorado: "já executado nas últimas 20 horas" });
  const { data, error } = await sb.rpc("resumo_diario");
  if (error) return json({ erro: error.message }, 500);
  type Item = { protocolo: string; nome: string; fase: string; motivo: string; sem_responsavel: boolean };
  let enviados = 0, falhas = 0;
  for (const u of (data ?? []) as { resp_nome: string; resp_email: string; itens: Item[] }[]) {
    const linhas = u.itens.map((i) =>
      `<tr><td style="padding:8px 10px;border-bottom:1px solid #E3E8E1;font-size:14px"><b>${esc(i.protocolo)}</b> · ${esc(i.nome)}<br><span style="color:#66786F;font-size:12px">${esc(i.fase)}${i.sem_responsavel ? " · sem escrevente responsável" : ""}</span></td><td style="padding:8px 10px;border-bottom:1px solid #E3E8E1;font-size:13px;color:#8A4B0F">${esc(i.motivo)}</td></tr>`).join("");
    const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#EDF0EA;font-family:Arial,Helvetica,sans-serif;color:#13261F"><table role="presentation" width="100%" style="background:#EDF0EA"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#0F3B2D;color:#F2F7F3;padding:18px 24px;font-size:18px;font-weight:bold">Central de Usucapiões · resumo do dia</td></tr><tr><td style="padding:24px"><p style="margin:0 0 12px;font-size:15px">Bom dia, ${esc(u.resp_nome.split(" ")[0])}. Estes processos pedem atenção:</p><table role="presentation" width="100%" style="border-collapse:collapse">${linhas}</table><p style="margin:20px 0 0"><a href="${esc(SITE)}/painel" style="background:#0F3B2D;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;display:inline-block">Abrir o painel</a></p><p style="margin:16px 0 0;font-size:12px;color:#66786F">Para parar de receber, desative o resumo diário em “Minha conta”, no painel.</p></td></tr></table></td></tr></table></body></html>`;
    const texto = `Bom dia, ${u.resp_nome}. Processos que pedem atenção:\n\n` + u.itens.map((i) => `- ${i.protocolo} (${i.nome}): ${i.motivo}`).join("\n") + `\n\n${SITE}/painel`;
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [u.resp_email], subject: `Resumo do dia: ${u.itens.length} ${u.itens.length === 1 ? "processo pede" : "processos pedem"} atenção`, html, text: texto }),
      });
      if (resp.ok) enviados++; else falhas++;
    } catch { falhas++; }
  }
  return json({ resumo: true, enviados, falhas });
}

// Backup semanal: planilha CSV completa enviada SÓ ao e-mail do cartório (BACKUP_EMAIL ou e-mail do Oficial).
// Roda no máximo 1 vez a cada 100 horas, mesmo se chamado de fora.
async function backupSemanal(sb: ReturnType<typeof createClient>, json: (o: unknown, s?: number) => Response) {
  const { data: liberado } = await sb.rpc("liberar_execucao", { p_nome: "backup", p_horas: 100 });
  if (!liberado) return json({ backup: false, ignorado: "já enviado nesta semana" });
  const reabrir = () => sb.from("execucoes_agendadas").update({ ultima: "2000-01-01T00:00:00Z" }).eq("nome", "backup");
  try {
    let dest = Deno.env.get("BACKUP_EMAIL") ?? "";
    if (!dest) {
      const { data: of } = await sb.from("perfis").select("email").eq("papel", "oficial").limit(1).maybeSingle();
      dest = of?.email ?? "";
    }
    if (!dest) { await reabrir(); return json({ backup: false, erro: "sem e-mail de destino" }, 500); }
    const [pr, fa, ad, pe, ex, pz] = await Promise.all([
      sb.from("processos").select("*").order("protocolo").range(0, 4999),
      sb.from("fases").select("id,nome"),
      sb.from("advogados").select("id,nome"),
      sb.from("perfis").select("id,nome"),
      sb.from("pessoas_externas").select("id,nome"),
      sb.from("prazos").select("processo_id,tipo,descricao,vence_em").eq("situacao", "aberto").order("vence_em"),
    ]);
    if (pr.error) throw new Error(pr.error.message);
    const nome = (l: { id: number | string; nome: string }[] | null, id: unknown) => (l ?? []).find((x) => x.id === id)?.nome ?? "";
    const cel = (v: unknown) => {
      let t = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return '"' + t.replace(/"/g, '""') + '"';
    };
    const fmt = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");
    const tipoPz: Record<string, string> = { intimacao: "Intimação", edital: "Edital", exigencia: "Exigência", outro: "Prazo" };
    const cab = ["Protocolo", "Requerente", "E-mail", "E-mails adicionais", "Imóvel", "Referência", "Matrícula", "Tipo de usucapião", "Data da prenotação", "Advogado", "Fase", "Responsável", "Prazos em aberto", "Na fase desde", "Criado em", "Notas internas"];
    const linhas = (pr.data ?? []).map((p: Record<string, any>) => [
      p.protocolo, p.requerente_nome, p.requerente_email, (p.emails_extra ?? []).join(" | "), p.imovel, p.referencia, p.matricula, p.tipo_usucapiao,
      fmt(p.data_prenotacao), nome(ad.data, p.advogado_id), nome(fa.data, p.fase_id),
      p.responsavel_id ? nome(pe.data, p.responsavel_id) : p.responsavel_externo_id ? nome(ex.data, p.responsavel_externo_id) : "",
      (pz.data ?? []).filter((z: any) => z.processo_id === p.id).map((z: any) => `${tipoPz[z.tipo] ?? "Prazo"}${z.descricao ? " - " + z.descricao : ""}: ${fmt(z.vence_em)}`).join(" | "),
      fmt(p.fase_desde), fmt(p.criado_em), p.notas_internas,
    ].map(cel).join(";"));
    const csv = "\uFEFF" + cab.map(cel).join(";") + "\r\n" + linhas.join("\r\n");
    const bytes = new TextEncoder().encode(csv);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: [dest], subject: `Backup semanal da Central de Usucapiões (${linhas.length} processos)`,
        text: `Segue em anexo a planilha completa dos processos em ${fmt(hoje)} (${linhas.length} processos).\n\nO arquivo contém dados pessoais (LGPD): guarde em local protegido, não encaminhe e apague e-mails antigos que não precisar manter.`,
        attachments: [{ filename: `usucapioes-${hoje}.csv`, content: btoa(bin) }],
      }),
    });
    if (!resp.ok) { await reabrir(); return json({ backup: false, erro: `Resend ${resp.status}` }, 500); }
    return json({ backup: true, processos: linhas.length });
  } catch (e) {
    await reabrir();
    return json({ backup: false, erro: String((e as Error).message ?? e) }, 500);
  }
}
