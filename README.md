# Central de Usucapiões Extrajudiciais

Registro de Imóveis de Itararé.

Site com duas partes:

- **`/`**: página pública. O cliente digita o número do protocolo e vê a linha do tempo do pedido.
- **`/painel`**: painel interno dos escreventes, em quadro Kanban. Exige login e aprovação do Oficial.

Os dados ficam no Supabase (projeto `central-usucapioes-sp`, região São Paulo).
O site é estático (HTML, CSS e JavaScript) e não precisa de build.

## Como publicar na Vercel

1. Em vercel.com, entre com a conta do GitHub `criitarare-source`.
2. Clique em **Add New → Project** e escolha o repositório `central-usucapioes`.
3. Não mude nada nas configurações (Framework Preset: *Other*; sem comando de build).
4. Clique em **Deploy**. O site abre em um endereço como `central-usucapioes.vercel.app`.

## Depois de publicar: configurar o login (Supabase)

No painel do Supabase, em **Authentication → URL Configuration**:

- **Site URL:** o endereço do site na Vercel.
- **Redirect URLs:** adicione `https://SEU-ENDERECO/painel`.

Sem isso, os links de confirmação de e-mail e de recuperação de senha não voltam para o painel.

## Primeiro acesso

1. Abra `/painel` e clique em **Criar conta** com o e-mail `cri.itarare@gmail.com`.
2. Confirme o e-mail pelo link recebido. Esta conta já nasce como **Oficial**, aprovada.
3. Cada escrevente cria a própria conta e aparece em **Equipe** para o Oficial aprovar.

Crie a conta do Oficial **antes** de divulgar o endereço do painel.

## Subdomínio do cartório (quando o site for assinado)

Na Vercel: **Settings → Domains** e adicione, por exemplo, `acompanhamento.seucartorio.com.br`.
A Vercel mostra o registro DNS (CNAME) que quem administra o domínio deve criar.
Depois troque a *Site URL* no Supabase para o novo endereço.

## Estrutura

```
index.html          página pública do cliente
painel/index.html   painel dos escreventes
assets/             estilos, scripts, logo e configuração do Supabase
vercel.json         ajustes de endereço e cabeçalhos de segurança
```

## Segurança

- A chave em `assets/config.js` é a chave pública (*publishable*). Ela foi feita para ficar no navegador.
- O acesso aos dados é controlado no banco (RLS). Conta sem aprovação não vê nada.
- A consulta pública devolve só o andamento: fases, datas, mensagens ao cliente e prazo do edital.
  Nome, e-mail, imóvel e notas internas nunca saem do painel.
- A consulta pública tem limite de consultas por minuto, contra tentativa de varrer protocolos.
- Nunca coloque senhas nem a chave `service_role` neste repositório.
