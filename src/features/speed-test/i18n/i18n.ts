/**
 * i18n leve: dicionários por locale, fallback para pt.
 * Estrutura preparada para inglês (secção 3.9). Formatação numérica via Intl.
 */

const pt = {
  'app.title': 'Speed Test — Qualidade da Internet',
  'app.subtitle': 'Medição real com o motor Cloudflare. Sem valores simulados.',

  'phase.idle': 'Pronto',
  'phase.checking': 'A verificar suporte e conectividade…',
  'phase.ready': 'Pronto para iniciar',
  'phase.measuring_latency': 'A medir latência em repouso',
  'phase.measuring_download': 'A medir download',
  'phase.measuring_upload': 'A medir upload',
  'phase.measuring_packet_loss': 'A medir perda de pacotes',
  'phase.processing_results': 'A calcular resultados',
  'phase.completed': 'Teste concluído',
  'phase.paused': 'Teste pausado',
  'phase.cancelling': 'A cancelar…',
  'phase.cancelled': 'Teste cancelado',
  'phase.partial': 'Teste interrompido — resultados parciais',
  'phase.failed': 'O teste falhou',

  'action.start': 'Iniciar teste',
  'action.pause': 'Pausar',
  'action.resume': 'Retomar',
  'action.cancel': 'Cancelar',
  'action.retry': 'Repetir teste',
  'action.acknowledgeWarning': 'Entendo o consumo de dados, continuar',
  'action.print': 'Imprimir / PDF',
  'action.copySummary': 'Copiar resumo',
  'action.share': 'Partilhar',
  'action.exportJson': 'Exportar JSON',
  'action.exportCsv': 'Exportar CSV',
  'action.deleteSession': 'Eliminar sessão',
  'action.clearHistory': 'Apagar todo o histórico',
  'action.importBackup': 'Importar cópia de segurança',
  'action.exportBackup': 'Exportar cópia de segurança',

  'profile.label': 'Perfil de teste',
  'profile.fast.name': 'Rápido',
  'profile.fast.description': 'Verificação breve com menos amostras e menor volume.',
  'profile.balanced.name': 'Equilibrado',
  'profile.balanced.description': 'Avaliação completa para uso diário.',
  'profile.precision.name': 'Precisão',
  'profile.precision.description': 'Mais amostras e maior duração; consome mais dados.',
  'profile.diagnostic.name': 'Diagnóstico',
  'profile.diagnostic.description': 'Prioriza consistência, latência sob carga e análise detalhada.',
  'profile.custom.name': 'Personalizado',
  'profile.custom.description': 'Escolhe o nível de amostragem e autoriza o consumo estimado.',
  'profile.dataBudget': 'Volume máximo configurado: ↓ {down} · ↑ {up} ({requests} pedidos)',
  'profile.expectedDuration': 'Duração estimada (aprox.): {min}–{max} s',
  'profile.intensiveWarning': 'Este perfil transfere uma quantidade significativa de dados. Em ligações medidas por volume, use com cuidado.',
  'profile.customLevel': 'Nível de amostragem',
  'profile.level.light': 'Leve',
  'profile.level.standard': 'Padrão',
  'profile.level.heavy': 'Intensivo',

  'metric.download': 'Download',
  'metric.upload': 'Upload',
  'metric.latency': 'Latência em repouso',
  'metric.jitter': 'Jitter em repouso',
  'metric.loadedLatencyDown': 'Latência sob carga (download)',
  'metric.loadedJitterDown': 'Jitter sob carga (download)',
  'metric.loadedLatencyUp': 'Latência sob carga (upload)',
  'metric.loadedJitterUp': 'Jitter sob carga (upload)',
  'metric.loadedLatencyDelta': 'Aumento de latência sob carga',
  'metric.packetLoss': 'Perda de pacotes',
  'metric.duration': 'Duração total',
  'metric.transferred': 'Dados transferidos',
  'unit.unavailable': 'não medido',
  'unit.unsupported': 'não suportado',
  'unit.invalid': 'inválido',
  'unit.note.mbpsVsMBs': 'Mbps = megabits/s; MB/s = megabytes/s (÷ 8). São unidades diferentes.',
  'unit.toggle': 'Unidade',

  'live.phase': 'Fase {done}/{total}',
  'live.elapsed': 'Decorrido: {s} s',
  'live.eta': 'Restante (estimativa): ~{s} s',
  'globe.sidebarLabel': 'Mapa global da ligação',
  'globe.locating': 'A determinar a tua localização aproximada…',
  'globe.locationUnavailable': 'Localização indisponível (geo IP não devolvido)',
  'globe.ipNote': 'Estimativa por geolocalização de IP público — pode ser incorreta.',
  'globe.simulationNote': 'Animação decorativa durante o teste: não representa medições reais nem ligações a servidores.',
  'globe.aria': 'Globo {status}. Localização aproximada: {loc}',
  'globe.status.idle': 'em repouso',
  'globe.status.testing': 'a simular teste global',
  'live.networkActivity': 'Atividade de rede em curso',

  'section.experience': 'Diagnóstico de experiência',
  'section.diagnostics': 'Análise avançada',
  'section.context': 'Contexto do teste',
  'section.history': 'Histórico',
  'section.report': 'Relatório',
  'section.raw': 'Resultados brutos',

  'view.simple': 'Vista simples',
  'view.technical': 'Vista técnica',

  'usecase.gaming': 'Jogos online',
  'usecase.streaming': 'Streaming de vídeo',
  'usecase.videoCalls': 'Videochamadas',
  'usecase.browsing': 'Navegação diária',
  'usecase.fileTransfers': 'Transferência de ficheiros',
  'usecase.remoteWork': 'Trabalho remoto',
  'usecase.gaming.explain': 'Jogos dependem sobretudo de latência baixa e estável sob carga.',
  'usecase.streaming.explain': 'Streaming depende de velocidade de download sustentada.',
  'usecase.videoCalls.explain': 'Chamadas exigem upload suficiente e latência controlada.',
  'usecase.browsing.explain': 'Navegação precisa de latência moderada e download básico.',
  'usecase.fileTransfers.explain': 'Transferências aproveitam download e upload elevados.',
  'usecase.remoteWork.explain': 'Trabalho remoto combina upload, latência e estabilidade.',
  'usecase.gaming.limitation': 'Não medimos um jogo específico; é uma estimativa de adequação.',
  'usecase.streaming.limitation': 'Não testámos serviços de streaming concretos.',
  'usecase.videoCalls.limitation': 'Não medimos plataformas de videochamadas específicas.',
  'usecase.browsing.limitation': 'Estimativa baseada nas características da ligação.',
  'usecase.fileTransfers.limitation': 'Velocidades reais variam com o servidor remoto.',
  'usecase.remoteWork.limitation': 'Estimativa; não avalia aplicações de produtividade.',
  'usecase.limitation.engine': 'Classificação calculada pelo motor Cloudflare (AIM).',
  'rating.great': 'Excelente',
  'rating.good': 'Boa',
  'rating.limited': 'Limitada',
  'rating.poor': 'Fraca',
  'rating.unknown': 'Sem dados suficientes',
  'score.source.engine': 'medida pelo motor',
  'score.source.product': 'calculada pelo produto',
  'rec.improve.latency': 'Para reduzir latência: ligue-se por cabo ao router ou aproxime-se do Wi-Fi e evite tráfego concorrente durante atividades sensíveis.',
  'rec.improve.download': 'Se a velocidade contratada for superior, verifique Wi-Fi, cabos e outros dispositivos em uso antes de contactar o ISP.',
  'rec.improve.upload': 'Upload baixo afeta videochamadas e partilha de ficheiros; confirme se o plano inclui o upload esperado.',

  'stats.metricCol': 'Métrica',
  'stats.nCol': 'N.º amostras',
  'stats.cv': 'Variabilidade (CV)',
  'stats.outliers': 'Atípicos',
  'stats.outliersKept': 'Os valores atípicos são assinalados mas nunca removidos dos dados.',
  'stats.samplesLabel': 'amostras',
  'share.copyFailed': 'Não foi possível copiar; selecione o texto manualmente.',
  'chart.latencyTitle': 'Amostras de latência em repouso (ms)',
  'chart.loadedLatencyTitle': 'Latência sob carga vs. repouso (ms)',
  'chart.bandwidthTitle': 'Amostras por pedido (Mbps)',
  'chart.trendTitle': 'Evolução no tempo',
  'chart.outliersNote': '{count} valor(es) atípico(s) assinalados sem remoção.',
  'stats.median': 'Mediana',
  'stats.p25': 'P25',
  'stats.p75': 'P75',
  'stats.p95': 'P95',
  'stats.min': 'Mín',
  'stats.max': 'Máx',
  'stats.stddev': 'Desvio padrão',
  'stats.samples': 'Amostras válidas: {valid}',

  'diag.pageHidden': 'A página esteve oculta durante o teste; atualizações do browser podem ter sido limitadas.',
  'diag.networkInfoUnavailable': 'O browser não fornece informação sobre o tipo de ligação.',
  'diag.packetLossNotConfigured': 'Perda de pacotes não medida: requer infraestrutura TURN própria (fora do âmbito atual).',
  'diag.noSamples': 'Nenhuma amostra válida foi recolhida.',
  'diag.lowSampleCount': 'Poucas amostras de bandwidth; os valores têm menor confiança.',
  'diag.obs.loadedLatencyDown': 'Observado: a latência aumentou {delta} ms durante o download.',
  'diag.obs.loadedLatencyUp': 'Observado: a latência aumentou {delta} ms durante o upload.',
  'diag.obs.downloadVariability': 'Observado: grande variação entre amostras de download (CV {cv}%).',
  'diag.obs.latencyOutliers': 'Observado: {count} amostra(s) de latência fora do intervalo típico (de {total}).',
  'diag.obs.cellular': 'Observado: o browser reporta ligação celular.',
  'diag.obs.pageHidden': 'Observado: a página ficou oculta durante a medição.',
  'diag.obs.noIssues': 'Observado: nenhuma anomalia relevante nos dados medidos.',
  'diag.obs.contextNote': 'Nota: os resultados descrevem esta sessão e este trajeto até aos servidores de medição.',
  'diag.hyp.bufferbloat': 'Possível causa: buffers excessivos no router/ligação (latência sob carga elevada).',
  'diag.hyp.wifiOrCongestion': 'Possível causa: Wi-Fi instável ou congestionamento na rede local.',
  'diag.hyp.qos': 'Possível causa: priorização de tráfego (QoS) limitada a montante.',
  'diag.hyp.wifiInstability': 'Possível causa: interferência ou oscilação da ligação Wi-Fi.',
  'diag.hyp.concurrentTraffic': 'Possível causa: outras aplicações/dispositivos a usar a ligação durante o teste.',
  'diag.hyp.interferenceOrQueuing': 'Possível causa: intermitência pontual (Wi-Fi, fila no equipamento).',
  'diag.hyp.cellularVariability': 'Ligações celulares variam naturalmente ao longo do tempo.',
  'diag.hyp.throttling': 'Browsers limitam páginas em segundo plano; as contagens temporais podem ser menos precisas.',
  'diag.hyp.generalCaveats': 'VPN, proxy, Wi-Fi e tráfego concorrente podem afetar qualquer medição.',
  'diag.hyp.vpnProxyWifi': 'Se usa VPN/proxy, o resultado reflete esse caminho, não a ligação direta.',

  'env.browser': 'Browser',
  'env.os': 'Sistema operativo',
  'env.connectionType': 'Tipo de ligação (reportado pelo browser)',
  'env.connectionUnknown': 'não fornecido pelo browser',
  'env.hidden': 'oculto',
  'env.visible': 'visível',
  'env.visibility': 'Visibilidade da página durante o teste',

  'history.empty': 'Ainda não há resultados guardados. Os testes aparecem aqui depois de concluídos.',
  'history.localNote': 'O histórico é guardado apenas neste dispositivo (IndexedDB) e pode desaparecer se os dados do browser forem eliminados. Nada é sincronizado sem consentimento explícito.',
  'history.filter.profile': 'Filtrar por perfil',
  'history.filter.all': 'Todos os perfis',
  'history.compare': 'Comparar sessões',
  'history.compareHint': 'Selecione 2 a 4 sessões para comparar.',
  'history.deleted': 'Sessão eliminada.',
  'history.cleared': 'Histórico eliminado.',
  'history.imported': '{count} sessão(ões) importada(s); {rejected} rejeitada(s) por validação.',
  'history.confirmClear': 'Apagar definitivamente todo o histórico local?',

  'share.title': 'Resultado do Speed Test',
  'share.date': 'Data',
  'share.profile': 'Perfil',
  'share.engine': 'Motor',
  'share.product': 'Produto',
  'share.disclaimer': 'Medição de uma única sessão; não é garantia permanente da qualidade da ligação.',
  'share.copied': 'Resumo copiado para a área de transferência.',
  'share.notSupported': 'Partilha nativa não suportada neste browser; use copiar ou exportar.',

  'error.timeout': 'O teste excedeu o tempo limite do perfil. Pode tentar novamente.',
  'error.network': 'Falha de rede durante a medição. Verifique a conectividade e tente de novo.',
  'error.cors': 'O browser bloqueou pedidos de medição (CSP/CORS). Verifique extensões ou redes corporativas.',
  'error.downloadFailed': 'A fase de download falhou. O teste pode ser repetido.',
  'error.uploadFailed': 'A fase de upload falhou. Firewall/proxy podem estar a bloquear pedidos.',
  'error.generic': 'Erro durante o teste: {message}',
  'error.unsupported': 'Este browser não suporta as APIs necessárias (fetch/streaming). Experimente um browser moderno.',
  'error.singleInstance': 'Já existe um teste a decorrer nesta página.',
  'error.crossTab': 'Detetámos outro separador desta aplicação a executar um teste. Evite testes simultâneos.',

  'about.engineNotice': 'As medições usam a infraestrutura pública speed.cloudflare.com. A licença MIT do código não implica capacidade ilimitada dos endpoints. Não garantimos disponibilidade da Cloudflare.',
  'about.privacy': 'Por defeito nada sai do seu browser exceto os pedidos de medição à Cloudflare; os resultados ficam apenas neste dispositivo. Desativámos o envio de resultados para o endpoint de análise do motor.',
  'about.howItWorks': 'Como funciona o teste',
  'about.howText': 'O browser troca dados diretamente com servidores de medição da Cloudflare. Medimos latência em repouso, depois download e upload enquanto pingamos em paralelo (latência sob carga). As classificações por atividade são estimativas de adequação, não medições de aplicações específicas.',
};

const en: Record<string, string> = {
  'app.title': 'Speed Test — Internet Quality',
  'globe.sidebarLabel': 'Global connection map',
  'globe.locating': 'Determining your approximate location…',
  'globe.locationUnavailable': 'Location unavailable (geo IP not returned)',
  'globe.ipNote': 'Estimated from public IP geolocation — may be inaccurate.',
  'globe.simulationNote': 'Decorative animation during the test: it does not represent real measurements or server connections.',
  'globe.aria': 'Globe {status}. Approximate location: {loc}',
  'globe.status.idle': 'idle',
  'globe.status.testing': 'simulating a global test',
  'app.subtitle': 'Real measurement with the Cloudflare engine. No simulated values.',
  'action.start': 'Start test',
  'action.pause': 'Pause',
  'action.resume': 'Resume',
  'action.cancel': 'Cancel',
  'action.retry': 'Run again',
  'action.acknowledgeWarning': 'I understand the data usage, continue',
  'metric.download': 'Download',
  'metric.upload': 'Upload',
  'metric.latency': 'Idle latency',
  'metric.jitter': 'Idle jitter',
  'phase.measuring_download': 'Measuring download',
  'phase.measuring_upload': 'Measuring upload',
  'phase.measuring_latency': 'Measuring idle latency',
  'phase.completed': 'Test completed',
  'profile.balanced.name': 'Balanced',
  'profile.fast.name': 'Fast',
  'profile.precision.name': 'Precision',
  'profile.diagnostic.name': 'Diagnostic',
  'section.history': 'History',
  'section.experience': 'Experience diagnostics',
  'rating.great': 'Great',
  'rating.good': 'Good',
  'rating.limited': 'Limited',
  'rating.poor': 'Poor',
  'unit.unavailable': 'not measured',
};

export type Locale = 'pt' | 'en';
const dictionaries: Record<Locale, Record<string, string>> = { pt, en };

export function translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
  let text = dictionaries[locale][key] ?? dictionaries.pt[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function formatNumber(locale: Locale, value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale === 'pt' ? 'pt-PT' : 'en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatBytes(locale: Locale, bytes: number | null): string {
  if (bytes === null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${formatNumber(locale, v, v >= 100 ? 0 : 1)} ${units[u]}`;
}

export function formatDate(locale: Locale, iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-PT' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
