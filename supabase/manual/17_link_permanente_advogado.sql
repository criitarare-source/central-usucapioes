-- Link pessoal e permanente (sem prazo) para o advogado ver todos os processos dele.
-- Enviado por e-mail quando o advogado é cadastrado com e-mail ou quando o e-mail é incluído/trocado.
-- Para anular um link: "Enviar link" de novo (gera outro e o anterior deixa de funcionar) ou desativar o advogado.

create table if not exists public.advogado_links (
  advogado_id bigint primary key references public.advogados(id) on delete cascade,
  token_hash text not null,
  token_envio text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
alter table public.advogado_links enable row level security;
revoke all on public.advogado_links from anon, authenticated;

create or replace function private.gerar_link(p_adv bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tok text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.advogado_links (advogado_id, token_hash, token_envio, criado_em, enviado_em)
  values (p_adv, encode(sha256(convert_to(v_tok, 'utf8')), 'hex'), v_tok, now(), null)
  on conflict (advogado_id) do update
    set token_hash = excluded.token_hash, token_envio = excluded.token_envio, criado_em = now(), enviado_em = null;
end $$;

create or replace function private.advogado_link_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and new.ativo and (tg_op = 'INSERT' or new.email is distinct from old.email) then
    perform private.gerar_link(new.id);
  end if;
  return new;
end $$;
drop trigger if exists advogados_link on public.advogados;
create trigger advogados_link after insert or update of email on public.advogados
  for each row execute function private.advogado_link_trg();

-- Só a função de e-mails (service_role) usa estas duas
create or replace function public.reservar_links() returns table(advogado_id bigint, email text, nome text, token text)
language sql security definer set search_path = '' as $$
  with s as (
    select l.advogado_id, l.token_envio as tok from public.advogado_links l
      join public.advogados v on v.id = l.advogado_id and v.ativo and v.email is not null
     where l.token_envio is not null for update of l
  ), u as (
    update public.advogado_links a set token_envio = null, enviado_em = now() from s where a.advogado_id = s.advogado_id
    returning s.advogado_id, s.tok
  )
  select u.advogado_id, v.email, v.nome, u.tok from u join public.advogados v on v.id = u.advogado_id;
$$;
create or replace function public.rearmar_link(p_adv bigint) returns void
language sql security definer set search_path = '' as $$ select private.gerar_link(p_adv); $$;
revoke all on function public.reservar_links() from public, anon, authenticated;
revoke all on function public.rearmar_link(bigint) from public, anon, authenticated;

-- Oficial: enviar (ou reenviar, gerando link novo) para um advogado
create or replace function public.enviar_link_advogado(p_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_oficial() then raise exception 'Só o Oficial pode enviar o link de acesso.'; end if;
  if not exists (select 1 from public.advogados where id = p_id and ativo and email is not null) then
    raise exception 'O advogado precisa estar ativo e ter e-mail cadastrado.';
  end if;
  perform private.gerar_link(p_id);
  return true;
end $$;
revoke all on function public.enviar_link_advogado(bigint) from public, anon;
grant execute on function public.enviar_link_advogado(bigint) to authenticated;

-- Oficial: situação do envio de cada advogado
create or replace function public.status_links() returns table(advogado_id bigint, enviado_em timestamptz, na_fila boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_oficial() then raise exception 'Só o Oficial.'; end if;
  return query select l.advogado_id, l.enviado_em, l.token_envio is not null from public.advogado_links l;
end $$;
revoke all on function public.status_links() from public, anon;
grant execute on function public.status_links() to authenticated;

-- Consulta com o link permanente (?acesso=...)
create or replace function public.consulta_advogado_perm(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ip text; v_chave text; v_n int; v_total int; v_adv public.advogados;
  v_tok text := lower(regexp_replace(coalesce(p_token, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  v_ip := trim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1));
  if v_ip = '' then v_ip := 'desconhecido'; end if;
  v_chave := 'perm:' || v_ip;
  select count(*) into v_n from public.consulta_tentativas where chave = v_chave and em > now() - interval '1 minute';
  select count(*) into v_total from public.consulta_tentativas where chave like 'perm:%' and em > now() - interval '1 minute';
  if v_n >= 20 or v_total >= 200 then raise exception 'Muitas consultas. Aguarde um minuto e tente de novo.'; end if;
  insert into public.consulta_tentativas (chave) values (v_chave);
  if char_length(v_tok) <> 64 then return null; end if;
  select v.* into v_adv from public.advogado_links l join public.advogados v on v.id = l.advogado_id
   where l.token_hash = encode(sha256(convert_to(v_tok, 'utf8')), 'hex') and v.ativo;
  if not found then return null; end if;
  return jsonb_build_object(
    'nome', v_adv.nome,
    'processos', (
      select coalesce(jsonb_agg(private.dados_publicos(p) || jsonb_build_object('referencia', p.referencia, 'requerente', p.requerente_nome) order by p.protocolo), '[]'::jsonb)
      from public.processos p where p.advogado_id = v_adv.id
    )
  );
end $$;
revoke all on function public.consulta_advogado_perm(text) from public;
grant execute on function public.consulta_advogado_perm(text) to anon, authenticated;

-- Correção de privacidade: quem só informa o e-mail do advogado vê o nome PARCIAL do requerente
do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.consulta_advogado_email(text)'::regprocedure);
  d2 := replace(d, $a$'requerente', p.requerente_nome$a$, $a$'requerente', private.nome_parcial(p.requerente_nome)$a$);
  if d2 = d then raise exception 'Trecho não encontrado'; end if;
  execute d2;
end $$;
