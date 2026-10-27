# Testes automáticos

Abrem o site num navegador de verdade (Playwright) com um Supabase **simulado**: nenhum dado real é usado.

Cobrem, entre outras coisas: tabela de emolumentos, valores e estimativas nos cartões, botão "Valores", o que o Oficial e o escrevente enxergam, edição de emolumentos, gráficos, auditoria e tema claro padrão.

```
cd tests && npm install          # só na primeira vez
pip install playwright && playwright install chromium
python3 tests/run.py             # TRACE=1 mostra o detalhe dos erros
```

No GitHub, os testes rodam sozinhos a cada envio (aba Actions).
