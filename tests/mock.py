"""Apoio dos testes: servidor local do site + Supabase simulado (nenhum dado real é usado)."""
import base64, datetime, functools, http.server, json, os, re, threading
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = os.path.join(RAIZ, 'tests', 'node_modules')
HOJE = datetime.date.today()
def dia(n): return (HOJE + datetime.timedelta(days=n)).isoformat()
def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')

OFICIAL = '11111111-1111-1111-1111-111111111111'
ESCREVENTE = '22222222-2222-2222-2222-222222222222'

FASES = [{"id": i, "nome": n, "descricao_publica": "desc", "significado": "Significa X", "acao": "Fazer Y", "ordem": o, "etapa_principal": e, "oculta": False}
         for i, n, o, e in [(1, "Protocolo", 1, True), (2, "Qualificação", 2, True), (3, "Exigências", 2.5, False), (4, "Notificação", 3, True), (5, "Edital", 4, True), (8, "Concluído", 8, True), (9, "Rejeitado", 9, False)]]
PERFIS = [
    {"id": OFICIAL, "nome": "Oficial", "email": "oficial@teste.com", "papel": "oficial", "aprovado": True, "criado_em": "2026-10-01T00:00:00Z", "resumo_diario": True},
    {"id": ESCREVENTE, "nome": "Maria Silva", "email": "maria@teste.com", "papel": "escrevente", "aprovado": True, "criado_em": "2026-10-02T00:00:00Z", "resumo_diario": True},
]

def processo(i, prot, fase, nome, resp=None, **extra):
    p = {"id": i, "protocolo": prot, "requerente_nome": nome, "requerente_email": "a@b.com", "emails_extra": [], "imovel": "Rua A", "fase_id": fase,
         "responsavel_id": resp, "responsavel_externo_id": None, "prazo_edital": None, "notas_internas": "", "fase_desde": "2026-08-01T00:00:00Z", "ord": i,
         "criado_em": "2026-08-01T00:00:00Z", "atualizado_em": "2026-08-01T00:00:00Z", "matricula": None, "tipo_usucapiao": "Ordinária",
         "data_prenotacao": None, "referencia": "Chácara", "advogado_id": 1, "valor": None, "emolumentos": None, "registros": None}
    p.update(extra); return p

PROCS = [
    processo(1, "52474", 5, "João", OFICIAL, valor=300000.0, emolumentos=1850.5),        # valor + emolumento pago
    processo(2, "52475", 3, "Ana", OFICIAL, valor=695837.33),                              # só estimado
    processo(3, "52476", 1, "Zé", ESCREVENTE, valor=5917034.6, registros=[2064128.02, 2064128.02, 1029050.72, 759727.84]),
    processo(4, "52477", 1, "A preencher (protocolo 52477)", ESCREVENTE, requerente_email=None),
    processo(5, "52478", 8, "Concluída", None, valor=80000.0),                              # concluído: sem estimativa
]
TABELAS = {
    'perfis': PERFIS, 'fases': FASES, 'processos': PROCS, 'mensagens_padrao': [], 'pessoas_externas': [],
    'advogados': [{"id": 1, "nome": "Dr. Fulano", "email": "f@x.com", "copia_email": True, "codigo_final": "5E6F", "ativo": True, "criado_em": "2026-10-01T00:00:00Z"}],
    'prazos': [{"id": 1, "processo_id": 1, "tipo": "intimacao", "descricao": "Silva", "vence_em": dia(3), "situacao": "aberto", "concluido_em": None, "criado_em": "2026-10-01T00:00:00Z"}],
    'historico': [{"id": 1, "processo_id": 1, "tipo": "fase", "fase_id": 5, "mensagem": None, "prazo_edital": None, "email_solicitado": True, "por": OFICIAL, "em": (datetime.datetime.utcnow() - datetime.timedelta(days=2)).isoformat() + "Z"}],
    'auditoria': [{"id": 1, "processo_id": 1, "protocolo": "52474", "acao": "editado", "detalhes": {"valor": {"de": None, "para": 300000}, "emolumentos": {"de": None, "para": 1850.5}}, "por": OFICIAL, "em": (datetime.datetime.utcnow() - datetime.timedelta(days=1)).isoformat() + "Z"}],
    'emails_enviados': [],
}
ESTATISTICAS = {"meses": [{"mes": "2026-%02d" % m, "entradas": m % 4, "concluidos": m % 3} for m in range(1, 11)] + [{"mes": "2026-11", "entradas": 1, "concluidos": 0}, {"mes": "2026-12", "entradas": 0, "concluidos": 0}],
                "fases": [{"fase_id": 1, "dias": 0.5, "n": 3}, {"fase_id": 2, "dias": 12.5, "n": 2}]}
CONSULTA = {"protocolo": "52474", "requerente": "João da S. R.", "fase_id": 1, "prazos": [], "historico": [{"tipo": "fase", "fase_id": 1, "fase_nome": "Protocolo", "descricao": "Recebido", "mensagem": None, "prazo_edital": None, "em": "2026-08-01T10:00:00Z"}]}


class Servidor:
    def __enter__(self):
        h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=RAIZ)
        h.log_message = lambda *a, **k: None
        class Q(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a): pass
        self.srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=RAIZ))
        self.porta = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        return self
    def __exit__(self, *a): self.srv.shutdown()
    @property
    def url(self): return 'http://127.0.0.1:%d' % self.porta


class Navegador:
    """with Navegador(servidor, papel='oficial') as nav: nav.page, nav.calls, nav.erros"""
    def __init__(self, servidor, papel='oficial', largura=1300, altura=850):
        self.s, self.papel, self.larg, self.alt = servidor, papel, largura, altura
        self.uid = OFICIAL if papel == 'oficial' else ESCREVENTE
    def __enter__(self):
        for f in ('@supabase/supabase-js/dist/umd/supabase.js', 'sortablejs/Sortable.min.js'):
            if not os.path.exists(os.path.join(NODE, f)):
                raise SystemExit('Faltam as dependências dos testes. Rode: cd tests && npm ci (ou npm install)')
        user = {'id': self.uid, 'email': 'teste@teste.com', 'aud': 'authenticated', 'factors': [], 'app_metadata': {}, 'user_metadata': {}}
        jwt = b64({'alg': 'HS256', 'typ': 'JWT'}) + '.' + b64({'sub': self.uid, 'aal': 'aal1', 'exp': 4102444800, 'session_id': 's', 'role': 'authenticated'}) + '.sig'
        sessao = {'access_token': jwt, 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': 4102444800, 'refresh_token': 'r', 'user': user}
        self.calls, self.erros = [], []
        self.pw = sync_playwright().start()
        self.b = self.pw.chromium.launch()
        ctx = self.b.new_context(viewport={'width': self.larg, 'height': self.alt}, accept_downloads=True)
        ctx.add_init_script("try{localStorage.setItem('central_tour_v1_%s','1')}catch(e){}" % self.uid)
        def rota(route):
            u, m = route.request.url, route.request.method
            ok = lambda corpo, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(corpo))
            if 'supabase-js' in u: return route.fulfill(path=os.path.join(NODE, '@supabase/supabase-js/dist/umd/supabase.js'), content_type='application/javascript')
            if 'Sortable' in u: return route.fulfill(path=os.path.join(NODE, 'sortablejs/Sortable.min.js'), content_type='application/javascript')
            if 'fonts.g' in u: return route.abort()
            if 'supabase.co' in u:
                if '/auth/v1/token' in u: return ok(sessao)
                if '/auth/v1/user' in u: return ok(user)
                if '/auth/v1/factors' in u: return ok([])
                mm = re.search(r'/rest/v1/(rpc/)?([a-z_]+)', u)
                if mm:
                    nome = mm.group(2)
                    if mm.group(1):
                        self.calls.append((nome, route.request.post_data))
                        return ok(ESTATISTICAS if nome == 'estatisticas' else CONSULTA if nome == 'consulta_publica' else {"id": 1})
                    if m != 'GET':
                        self.calls.append((m + ' ' + nome, route.request.post_data)); return ok([])
                    linhas = TABELAS.get(nome, [])
                    if nome == 'perfis' and 'id=eq.' in u: linhas = [p for p in PERFIS if p['id'] == self.uid]
                    if nome == 'fases' and 'object' not in route.request.headers.get('accept', ''): linhas = FASES
                    obj = 'object' in route.request.headers.get('accept', '')
                    return ok(linhas[0] if obj and linhas else linhas)
                return ok({})
            return route.continue_()
        ctx.route('**/*', rota)
        self.page = ctx.new_page()
        self.page.on('pageerror', lambda e: self.erros.append(str(e)))
        return self
    def entrar(self):
        p = self.page
        p.goto(self.s.url + '/painel/index.html'); p.wait_for_timeout(600)
        p.fill('#aMail', 'teste@teste.com'); p.fill('#aPass', '12345678'); p.click('#aBtn'); p.wait_for_timeout(1200)
        return p
    def __exit__(self, *a):
        self.b.close(); self.pw.stop()
