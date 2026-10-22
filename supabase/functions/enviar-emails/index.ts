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
  const { data, error } = await sb.rpc("reservar_emails_v3", { p_limite: 20 });
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
  return json({ enviados, falhas });
});

// Resumo diário: um e-mail por escrevente com os processos que pedem atenção.
async function resumoDiario(sb: ReturnType<typeof createClient>, json: (o: unknown, s?: number) => Response) {
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

// Backup semanal: CSV completo enviado ao Oficial.
async function backupSemanal(sb: ReturnType<typeof createClient>, json: (o: unknown, s?: number) => Response) {
  const [pr, fs, ad, pf, ex, pz] = await Promise.all([
    sb.from("processos").select("*").order("protocolo"),
    sb.from("fases").select("id,nome"),
    sb.from("advogados").select("id,nome"),
    sb.from("perfis").select("id,nome,email,papel,aprovado"),
    sb.from("pessoas_externas").select("id,nome"),
    sb.from("prazos").select("processo_id,tipo,descricao,vence_em").eq("situacao", "aberto"),
  ]);
  if (pr.error) return json({ erro: pr.error.message }, 500);
  const fase = new Map((fs.data ?? []).map((f: any) => [f.id, f.nome]));
  const adv = new Map((ad.data ?? []).map((a: any) => [a.id, a.nome]));
  const perf = new Map((pf.data ?? []).map((u: any) => [u.id, u.nome]));
  const ext = new Map((ex.data ?? []).map((u: any) => [u.id, u.nome]));
  const prazos = new Map<number, string[]>();
  for (const z of (pz.data ?? []) as any[]) {
    const l = prazos.get(z.processo_id) ?? [];
    l.push(`${z.tipo}${z.descricao ? " - " + z.descricao : ""}: ${fmtYMD(z.vence_em)}`);
    prazos.set(z.processo_id, l);
  }
  const cel = (v: unknown) => {
    let t = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const cab = ["Protocolo", "Requerente", "E-mail", "E-mails adicionais", "Imóvel", "Referência", "Matrícula", "Tipo", "Data da prenotação", "Advogado", "Fase", "Responsável", "Prazos em aberto", "Na fase desde", "Criado em"];
  const linhas = ((pr.data ?? []) as any[]).map((p) => [
    p.protocolo, p.requerente_nome, p.requerente_email, (p.emails_extra ?? []).join(" | "), p.imovel, p.referencia, p.matricula, p.tipo_usucapiao,
    p.data_prenotacao ? fmtYMD(p.data_prenotacao) : "", adv.get(p.advogado_id) ?? "", fase.get(p.fase_id) ?? "",
    perf.get(p.responsavel_id) ?? ext.get(p.responsavel_externo_id) ?? "", (prazos.get(p.id) ?? []).join(" | "),
    fmtBR(p.fase_desde), fmtBR(p.criado_em),
  ].map(cel).join(";"));
  const csv = "\ufeff" + cab.map(cel).join(";") + "\r\n" + linhas.join("\r\n");
  const bytes = new TextEncoder().encode(csv);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const oficiais = ((pf.data ?? []) as any[]).filter((u) => u.papel === "oficial" && u.aprovado);
  let enviados = 0;
  for (const o of oficiais) {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: [o.email], subject: `Backup semanal da Central de Usucapiões (${hoje})`,
        text: `Segue em anexo a planilha com os ${linhas.length} processos cadastrados. Ela contém dados pessoais: guarde em local seguro e apague este e-mail quando não precisar mais.`,
        attachments: [{ filename: `usucapioes-${hoje}.csv`, content: btoa(bin) }],
      }),
    });
    if (resp.ok) enviados++;
  }
  return json({ backup: true, processos: linhas.length, enviados });
}
