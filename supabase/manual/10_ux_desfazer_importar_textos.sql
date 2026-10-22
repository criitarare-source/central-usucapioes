-- REGISTRO do que foi aplicado automaticamente (partes 1 a 3). A parte 4 (desfazer) está em 11_desfazer_movimento.sql
-- porque o conector bloqueia funções que apagam dados; rode aquele arquivo no SQL Editor.

-- 1) Textos em linguagem simples por fase (aparecem na consulta pública)
alter table public.fases add column if not exists significado text;
alter table public.fases add column if not exists acao text;
update public.fases set significado = v.s, acao = v.a from (values
 (1, 'O cartório recebeu o seu pedido e deu a ele um número de protocolo.', 'Nada por enquanto. Guarde o número do protocolo.'),
 (2, 'O cartório confere se os documentos e a planta estão completos e corretos.', 'Nada por enquanto. Se faltar algo, o cartório avisará.'),
 (3, 'Falta algum documento ou informação para o pedido andar. O processo fica parado até você resolver.', 'Leia a mensagem do cartório abaixo e entregue o que foi pedido dentro do prazo indicado.'),
 (4, 'O cartório avisa os vizinhos (confrontantes) e quem consta como dono na matrícula, para que possam se manifestar.', 'Nada por enquanto. Se algum confrontante não for encontrado, o cartório pode pedir ajuda.'),
 (5, 'Um edital foi publicado para que qualquer interessado possa se manifestar dentro de um prazo.', 'Aguarde o fim do prazo mostrado abaixo. Não é preciso comparecer.'),
 (6, 'O cartório pergunta à União, ao Estado e ao Município se têm interesse no imóvel.', 'Nada por enquanto. Esses órgãos têm prazo próprio para responder.'),
 (7, 'O pedido foi aprovado e o cartório está registrando a usucapião na matrícula do imóvel.', 'Aguarde o aviso de conclusão. Pode ser preciso pagar emolumentos finais, se o cartório informar.'),
 (8, 'A usucapião foi reconhecida e está registrada na matrícula.', 'Procure o cartório para retirar a certidão da matrícula atualizada.'),
 (9, 'O procedimento não pode continuar pela via extrajudicial (fora do cartório).', 'Procure o cartório para entender as opções, como seguir pela via judicial.')
) as v(id, s, a) where fases.id = v.id and fases.significado is null;

-- 2) E-mails só saem 45 segundos depois de pedidos (dá tempo de "Desfazer")
alter table public.emails_enviados add column if not exists liberar_em timestamptz not null default now();

create or replace function private.atrasar_email() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tipo is distinct from 'lembrete' then new.liberar_em := now() + interval '45 seconds'; end if;
  return new;
end $$;
drop trigger if exists atrasar_email on public.emails_enviados;
create trigger atrasar_email before insert on public.emails_enviados for each row execute function private.atrasar_email();

create or replace function public.reservar_emails_v4(p_limite integer default 20)
returns table(email_id bigint, destinatario text, tentativas integer, copia boolean, lembrete boolean, protocolo text, requerente_nome text, tipo text, fase_id smallint, fase_nome text, descricao text, mensagem text, prazo_edital date, em timestamp with time zone)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  update public.emails_enviados set status = 'pendente'
   where status = 'enviando' and reservado_em < now() - interval '10 minutes' and tentativas < 3;
  update public.emails_enviados set status = 'falhou', erro = 'Tempo esgotado no envio'
   where status = 'enviando' and reservado_em < now() - interval '10 minutes' and tentativas >= 3;
  return query
  with sel as (
    select e.id from public.emails_enviados e where e.status = 'pendente' and e.liberar_em <= now() order by e.id limit p_limite for update skip locked
  ), upd as (
    update public.emails_enviados e set status = 'enviando', tentativas = e.tentativas + 1, reservado_em = now()
      from sel where e.id = sel.id
    returning e.id, e.destinatario, e.tentativas, e.copia, e.tipo as etipo, e.processo_id, e.historico_id
  )
  select upd.id, upd.destinatario, upd.tentativas, upd.copia, (upd.etipo = 'lembrete'), pr.protocolo, pr.requerente_nome,
         case when upd.etipo = 'lembrete' then 'fase' else h.tipo end,
         case when upd.etipo = 'lembrete' then 3::smallint else h.fase_id end,
         case when upd.etipo = 'lembrete' then f3.nome else f.nome end,
         case when upd.etipo = 'lembrete' then f3.descricao_publica else f.descricao_publica end,
         case when upd.etipo = 'lembrete' then (select hh.mensagem from public.historico hh where hh.processo_id = pr.id and hh.tipo = 'fase' and hh.fase_id = 3 order by hh.em desc limit 1) else h.mensagem end,
         h.prazo_edital,
         case when upd.etipo = 'lembrete' then pr.fase_desde else h.em end
    from upd
    join public.processos pr on pr.id = upd.processo_id
    left join public.historico h on h.id = upd.historico_id
    left join public.fases f on f.id = h.fase_id
    left join public.fases f3 on f3.id = 3
   order by upd.id;
end $$;
revoke all on function public.reservar_emails_v4(integer) from public, anon, authenticated;
grant execute on function public.reservar_emails_v4(integer) to service_role;

-- 3) Importar um processo de planilha (fase, responsável e aviso por e-mail à escolha)
create or replace function public.importar_processo(
  p_protocolo text, p_nome text, p_email text, p_imovel text, p_fase smallint default 1,
  p_responsavel uuid default null, p_responsavel_externo bigint default null,
  p_emails_extra text[] default '{}', p_matricula text default null, p_tipo text default null,
  p_prenotacao date default null, p_referencia text default null, p_advogado bigint default null,
  p_avisar boolean default false)
returns public.processos language plpgsql set search_path = '' as $$
declare v_proc public.processos; v_hist public.historico;
begin
  if not private.is_aprovado() then raise exception 'Sem permissão.'; end if;
  if not exists (select 1 from public.fases where id = p_fase and not oculta) then raise exception 'Fase inválida.'; end if;
  insert into public.processos (protocolo, requerente_nome, requerente_email, emails_extra, imovel, matricula, tipo_usucapiao, data_prenotacao, referencia, advogado_id, responsavel_id, responsavel_externo_id, fase_id, ord)
  values (trim(p_protocolo), trim(p_nome), trim(p_email), coalesce(p_emails_extra, '{}'), coalesce(trim(p_imovel), ''),
          nullif(trim(coalesce(p_matricula, '')), ''), nullif(trim(coalesce(p_tipo, '')), ''), p_prenotacao,
          nullif(trim(coalesce(p_referencia, '')), ''), p_advogado, p_responsavel, p_responsavel_externo, p_fase,
          coalesce((select min(ord) from public.processos), 0) - 1)
  returning * into v_proc;
  insert into public.historico (processo_id, tipo, fase_id, email_solicitado, por)
  values (v_proc.id, 'fase', p_fase, p_avisar, (select auth.uid())) returning * into v_hist;
  if p_avisar then perform private.enfileirar_emails(v_proc.id, v_hist.id); end if;
  return v_proc;
end $$;
revoke all on function public.importar_processo(text,text,text,text,smallint,uuid,bigint,text[],text,text,date,text,bigint,boolean) from public, anon;
grant execute on function public.importar_processo(text,text,text,text,smallint,uuid,bigint,text[],text,text,date,text,bigint,boolean) to authenticated;

-- 4) Desfazer a última mudança de fase (até 2 minutos, só se nenhum e-mail dela já saiu)
create or replace function public.desfazer_movimento(p_hist_id bigint, p_ord double precision default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare h public.historico; v_prev public.historico;
begin
  if not private.is_aprovado() then raise exception 'Sem permissão.'; end if;
  select * into h from public.historico where id = p_hist_id and tipo = 'fase';
  if not found then raise exception 'Movimentação não encontrada.'; end if;
  if h.em < now() - interval '2 minutes' then raise exception 'Já passou o tempo para desfazer.'; end if;
  if exists (select 1 from public.historico x where x.processo_id = h.processo_id and x.id <> h.id and x.em >= h.em) then
    raise exception 'Houve outra movimentação depois desta; não dá para desfazer.';
  end if;
  if exists (select 1 from public.emails_enviados e where e.historico_id = h.id and e.status <> 'pendente') then
    raise exception 'O e-mail desta mudança já foi enviado; não dá para desfazer.';
  end if;
  select * into v_prev from public.historico x where x.processo_id = h.processo_id and x.tipo = 'fase' and x.id <> h.id order by x.em desc limit 1;
  if not found then raise exception 'Não há fase anterior.'; end if;

  delete from public.emails_enviados where historico_id = h.id;
  delete from public.prazos where processo_id = h.processo_id and tipo = 'edital' and criado_em >= h.em - interval '2 seconds' and descricao = 'Prazo do edital' and h.fase_id = 5;
  update public.prazos set situacao = 'aberto', concluido_em = null
   where processo_id = h.processo_id and situacao = 'cumprido' and concluido_em between h.em - interval '2 seconds' and h.em + interval '2 seconds';
  delete from public.historico where id = h.id;
  update public.processos set fase_id = v_prev.fase_id, fase_desde = v_prev.em, ord = coalesce(p_ord, ord), atualizado_em = now()
   where id = h.processo_id;
  return true;
end $$;
revoke all on function public.desfazer_movimento(bigint, double precision) from public, anon;
grant execute on function public.desfazer_movimento(bigint, double precision) to authenticated;
