# Speed Test

Teste de qualidade da Internet baseado no motor [@cloudflare/speedtest](https://github.com/cloudflare/speedtest) (versão fixada **1.14.2**), com análise, diagnóstico, histórico local e relatórios. Documento de implementação completo: ver especificação do produto; API validada do motor em `docs/engine-api-1.14.2.d.ts`.

## Executar

```bash
npm install        # dependências fixadas no package-lock.json
npm run dev        # http://localhost:3000
npm run build      # build de produção (Next.js 16, App Router)
npm start          # servir o build
npm test           # 45 testes unitários/integração (Vitest + jsdom + fake-indexeddb)
npm run typecheck  # tsc --noEmit
```

## Como funciona

- O browser comunica **diretamente** com os endpoints de medição da Cloudflare (`https://speed.cloudflare.com/__down` / `__up`). Não existe backend a retransmitir bytes do teste.
- O teste **só começa após ação explícita** do utilizador (`autoStart: false`).
- Resultados são guardados **localmente** em IndexedDB (histórico, comparação, backup JSON). Nada é sincronizado remotamente por defeito — o logging remoto do motor (`logAimApiUrl`) está desativado.
- Métricas ausentes nunca são apresentadas como zero: cada valor tem unidade, fonte (`engine`/`derived`) e estado (`measured`/`unavailable`/`unsupported`/`invalid`).

## Funcionalidades

- **Perfis de teste versionados** (rápido, equilibrado, precisão, diagnóstico, personalizado) com orçamento máximo de bytes/pedidos documentado e aviso antes de perfis intensivos.
- **Métricas**: download/upload (Mbps ⇄ MB/s), latência e jitter em repouso, latência/jitter sob carga (download e upload), delta sob carga, amostras válidas, volume transferido, duração.
- **Diagnóstico de experiência** para gaming, streaming, videochamadas, navegação, transferências e trabalho remoto — usa as pontuações AIM do motor quando existem; caso contrário aplica regras próprias v1, documentadas e versionadas. São estimativas de adequação, não medições diretas de aplicações.
- **Análise avançada**: gráficos SVG das amostras, mediana/percentis/CV, outliers IQR assinalados sem remoção, vista simples vs. técnica.
- **Histórico**: lista, detalhes, comparação de sessões, filtros, exportar/importar backup (validado), apagar tudo.
- **Partilha**: resumo copiável, JSON, CSV, impressão/PDF, Web Share API quando suportada.
- **Acessibilidade/i18n**: português com estrutura para inglês, navegação por teclado, `aria-live` sem excesso, contraste e `prefers-reduced-motion`.

## Limitações conhecidas

- **Perda de pacotes** não é medida: exige infraestrutura TURN própria (configuração documentada pendente). A métrica aparece como `unsupported`, nunca como 0%.
- O motor não expõe API pública de "cancelar"; o cancelamento pausa o motor e preserva resultados parciais com estado explícito.
- O tipo de rede/ISP/localização não são inventados: só se mostram quando o browser os fornece de forma fiável.
- Os endpoints públicos da Cloudflare não têm SLA/quota garantida ao produto; os perfis limitam pedidos e bytes, e a interface bloqueia testes concorrentes.
- Dados de medição trafegam entre o browser e a Cloudflare (ver secção de privacidade da documentação do motor).

## Arquitetura

```
src/app/                     layout, página, estilos globais, headers CSP (next.config.mjs)
src/features/speed-test/
  engine/                    SpeedTestAdapter (interface) · CloudflareSpeedTestAdapter (única camada que conhece o motor)
                             profileRegistry (perfis versionados + orçamento) · engineTypes (modelo normalizado)
  domain/                    normalizeResults · deriveMetrics · classifyExperience · diagnoseConnection · environmentInfo
  state/                     testController (máquina de estados, sessão única, erros mapeados)
  storage/                   indexedDb (histórico + migrações + validação anti-abuso)
  export/                    JSON · CSV · backup · resumo textual
  i18n/                      dicionário pt/en + hook useI18n
  components/                TestDashboard, MetricCard, Charts, ExperienceScores, DiagnosticsPanel, SessionReport, ShareReport
tests/                       45 testes: unidades, normalização, classificação, perfis, storage, exportações, controlador
docs/engine-api-1.14.2.d.ts  definição de tipos exata da versão instalada (referência verificável)
```

Regras estruturais: a UI depende apenas de `SpeedTestAdapter`; trocar de motor não exige reescrever componentes. Cada métrica apresentada é rastreável à sua fonte e unidade.
