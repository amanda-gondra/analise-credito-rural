# Plano de análise

Cada pergunta de negócio mapeada para métrica, campos, agregação, validação e visualização. Os campos são os da tabela `credit_monthly` ([modelagem-banco.md](modelagem-banco.md)); a origem de cada um está no [dicionario-dados.md](dicionario-dados.md). Todas as dependências de dados da Fase 1 foram resolvidas na Fase 2.

## Definições comuns

- **Valor total contratado** = `SUM(credit_amount)` no recorte, somando as quatro finalidades.
- **Ano** = `reference_year`, ano civil de emissão da cédula.
- **Série principal** = 2017 a 2025 (D9 em [decisoes-tecnicas.md](decisoes-tecnicas.md)). 2013–2016 e 2026 só em análises separadas e identificadas.
- **Universo nacional** = todas as 27 UFs no mesmo período.
- **Unidade** = reais nominais. Onde houver comparação entre anos, apresentar também a versão corrigida pelo IPCA (preços de dez/2025, método em [modelagem-banco.md](modelagem-banco.md#correção-monetária-planejada-não-implementada)), sempre identificada.
- **Data dos dados:** todo resultado informa a data de coleta dos arquivos, porque a fonte é revisada diariamente.

## Pergunta 1 — Evolução anual

| Item | Definição |
| --- | --- |
| Métrica | Valor total por ano; variação absoluta e percentual sobre o ano anterior; nominal e real |
| Campos | `reference_year`, `reference_month`, `credit_amount` |
| Filtros | `reference_year BETWEEN 2017 AND 2025` |
| Agregação | `SUM` por ano; `LAG` para o ano anterior |
| Denominador | Valor do ano anterior; sem cálculo se for nulo ou zero |
| Riscos | Ler inflação como crescimento; incluir 2016 (falha de cobertura) |
| Validação | 12 meses por ano; total do ano = `source_file.source_total_amount` |
| Gráfico | Linha, eixo em R$ bilhões, séries nominal e real identificadas |

## Pergunta 2 — Ranking estadual

| Item | Definição |
| --- | --- |
| Métrica | Valor por UF no período e participação no total nacional; posição no ranking |
| Campos | `state_abbr`, `credit_amount` |
| Filtros | Série principal |
| Agregação | `SUM` por UF; `RANK()` por valor |
| Denominador | Total nacional do mesmo período |
| Riscos | Confundir volume absoluto com acesso relativo ao crédito |
| Validação | Soma das UFs = total nacional; 27 UFs |
| Gráfico | Barras horizontais ordenadas, período no subtítulo |

## Pergunta 3 — MATOPIBA

| Item | Definição |
| --- | --- |
| Métrica | Valor por ano para MA, TO, PI e BA; valor do conjunto; participação do conjunto no Brasil |
| Campos | `state_abbr`, `reference_year`, `credit_amount` |
| Filtros | `state_abbr IN ('MA', 'TO', 'PI', 'BA')`; série principal |
| Agregação | `SUM` por ano e UF; `SUM` por ano para o conjunto |
| Denominador | Total nacional do mesmo ano |
| Riscos | Os estados inteiros superestimam o MATOPIBA oficial, que inclui só parte do território (D7) |
| Validação | Conjunto = soma das 4 UFs; participação entre 0 e 100% |
| Gráfico | Linha da participação do MATOPIBA no Brasil, com as 4 UFs em painel separado |

## Pergunta 4 — Agricultura e pecuária

| Item | Definição |
| --- | --- |
| Métrica | Valor por atividade e ano; participação no total |
| Campos | `activity_code` (1 = agrícola, 2 = pecuária, confirmado), `credit_amount` |
| Filtros | Série principal |
| Agregação | `SUM` por ano e atividade |
| Denominador | Total do ano |
| Riscos | Atividade é a do empreendimento financiado; "PASTAGEM" é classificada como agrícola na fonte |
| Validação | Soma das 2 atividades = total do ano |
| Gráfico | Barras 100% empilhadas por ano |

## Pergunta 5 — Finalidade

| Item | Definição |
| --- | --- |
| Métrica | Valor e contratos por finalidade (custeio, investimento, comercialização, industrialização) por ano; participação |
| Campos | `purpose`, `credit_amount`, `contract_count` |
| Filtros | Série principal |
| Agregação | `SUM` por ano e finalidade |
| Denominador | Valor total do ano |
| Riscos | Mostrar só custeio e investimento como se fossem 100%; usar anos anteriores a 2017, quando industrialização não existe na fonte |
| Validação | Soma das 4 finalidades = total da pergunta 1 |
| Gráfico | Barras empilhadas por ano com as quatro finalidades |

## Pergunta 6 — Padrões no período

Leitura conjunta das perguntas 1 a 5, no site (página "Sobre os dados") e no README, separando fato observado de hipótese.

## Visualizações previstas

| # | Pergunta | Gráfico | Condição para a comparação ser válida |
| --- | --- | --- | --- |
| 1 | Evolução anual | Linha | Série 2017–2025; nominal e real identificados |
| 2 | Ranking estadual | Barras horizontais | Mesmo período para todas as UFs |
| 3 | MATOPIBA | Linha de participação | Mesmo denominador nacional por ano |
| 4 | Agricultura × pecuária | Barras 100% | Soma das atividades = total |
| 5 | Finalidade | Barras empilhadas | As quatro finalidades presentes (2017+) |

Padrão visual: uma paleta, mesma cor para a mesma categoria em todos os gráficos, eixo começando em zero nas barras, e fonte, período e data de coleta em cada gráfico.

## Onde cada resultado aparece

Desde 25/10/2026 a entrega é uma aplicação web ([arquitetura-aplicacao.md](arquitetura-aplicacao.md)). Cada pergunta segue o mesmo caminho:

```
consulta em sql/queries.sql → rota da API → gráfico no site
```

| Pergunta | Rota da API | Página do site |
| --- | --- | --- |
| 1 | `/api/v1/brazil/yearly` | Visão geral |
| 2 | `/api/v1/states/ranking` | Visão geral e página do estado |
| 3 | `/api/v1/regions/matopiba/yearly` | MATOPIBA |
| 4 | `/api/v1/brazil/yearly` | Visão geral |
| 5 | `/api/v1/brazil/yearly` | Visão geral |

A API não recalcula indicadores em Python: ela executa as consultas de `queries.sql`. Um teste automatizado compara as respostas da API com o resultado direto das consultas.
