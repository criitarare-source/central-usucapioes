-- REGISTRO: já aplicado automaticamente no projeto (sem as linhas de limpeza `delete`). Não precisa rodar.
-- O advogado informa o e-mail cadastrado e recebe um link (válido por 30 minutos) para ver todos os seus processos.
-- Sem digitar código. Quem só sabe o e-mail não consegue ver nada: o link só chega na caixa de entrada dele.

create table if not exists public.advogado_acessos (
  id bigserial primary key,
  advogado_id bigint not null references public.advogados(id) on delete cascade,
  token_hash text not null,
  token_envio text,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null
);
alter table public.advogado_acessos enable row level security;
revoke all on public.advogado_acessos from anon, authenticated;
create index if not exists advogado_acessos_hash on public.advogado_acessos (token_hash);

-- 1) Pedir o link (responde sempre igual, exista o e-mail ou não)
create or replace function public.solicitar_acesso_advogado(p_email text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_ip text; v_chave text; v_n int; v_total int; v_adv public.advogados; v_tok text;
  v_mail text := lower(trim(coalesce(p_email, '')));
begin
  v_ip := trim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1));
  if v_ip = '' then v_ip := 'desconhecido'; end if;
  v_chave := 'acc:' || v_ip;
  delete from public.consulta_tentativas where em < now() - interval '1 hour';
  delete from public.advogado_acessos where criado_em < now() - interval '1 day';
  select count(*) into v_n from public.consulta_tentativas where chave = v_chave and em > now() - interval '10 minutes';
  select count(*) into v_total from public.consulta_tentativas where chave like 'acc:%' and em > now() - interval '10 minutes';
  if v_n >= 4 or v_total >= 60 then raise exception 'Muitas consultas. Aguarde um minuto e tente de novo.'; end if;
  insert into public.consulta_tentativas (chave) values (v_chave);

  if v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_mail) > 200 then return true; end if;
  select * into v_adv from public.advogados where lower(email) = v_mail and ativo limit 1;
  if not found then return true; end if;
  if exists (select 1 from public.advogado_acessos where advogado_id = v_adv.id and criado_em > now() - interval '60 seconds') then return true; end if;
  if (select count(*) from public.advogado_acessos where advogado_id = v_adv.id and criado_em > now() - interval '1 hour') >= 5 then return true; end if;

  v_tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.advogado_acessos (advogado_id, token_hash, token_envio, expira_em)
  values (v_adv.id, encode(sha256(convert_to(v_tok, 'utf8')), 'hex'), v_tok, now() + interval '30 minutes');
  return true;
end $$;
revoke all on function public.solicitar_acesso_advogado(text) from public;
grant execute on function public.solicitar_acesso_advogado(text) to anon, authenticated;

-- 2) Abrir a lista com o link recebido
create or replace function public.consulta_advogado_link(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ip text; v_chave text; v_n int; v_total int; v_adv public.advogados; v_ac public.advogado_acessos;
  v_tok text := lower(regexp_replace(coalesce(p_token, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  v_ip := trim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1));
  if v_ip = '' then v_ip := 'desconhecido'; end if;
  v_chave := 'accv:' || v_ip;
  delete from public.consulta_tentativas where em < now() - interval '1 hour';
  select count(*) into v_n from public.consulta_tentativas where chave = v_chave and em > now() - interval '1 minute';
  select count(*) into v_total from public.consulta_tentativas where chave like 'accv:%' and em > now() - interval '1 minute';
  if v_n >= 8 or v_total >= 100 then raise exception 'Muitas consultas. Aguarde um minuto e tente de novo.'; end if;
  insert into public.consulta_tentativas (chave) values (v_chave);

  if char_length(v_tok) <> 64 then return null; end if;
  select * into v_ac from public.advogado_acessos
   where token_hash = encode(sha256(convert_to(v_tok, 'utf8')), 'hex') and expira_em > now();
  if not found then return null; end if;
  select * into v_adv from public.advogados where id = v_ac.advogado_id and ativo;
  if not found then return null; end if;

  return jsonb_build_object(
    'nome', v_adv.nome,
    'processos', (
      select coalesce(jsonb_agg(private.dados_publicos(p) || jsonb_build_object('referencia', p.referencia) order by p.protocolo), '[]'::jsonb)
      from public.processos p where p.advogado_id = v_adv.id
    )
  );
end $$;
revoke all on function public.consulta_advogado_link(text) from public;
grant execute on function public.consulta_advogado_link(text) to anon, authenticated;

-- 3) Fila de envio (só a função de e-mails usa)
create or replace function public.reservar_acessos() returns table(email text, nome text, token text)
language sql security definer set search_path = '' as $$
  with s as (
    select id, advogado_id, token_envio as tok from public.advogado_acessos where token_envio is not null and expira_em > now() for update
  ), u as (
    update public.advogado_acessos a set token_envio = null from s where a.id = s.id returning s.advogado_id, s.tok
  )
  select v.email, v.nome, u.tok from u join public.advogados v on v.id = u.advogado_id where v.email is not null;
$$;
revoke all on function public.reservar_acessos() from public, anon, authenticated;
grant execute on function public.reservar_acessos() to service_role;
