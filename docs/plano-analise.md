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

## Pergunta 6 — Comparação entre estados e regiões

| Item | Definição |
| --- | --- |
| Métrica | Valor e contratos por UF ou por região, por ano; participação de cada um no total nacional |
| Campos | `state_abbr`, `ref_state.region_name`, `reference_year`, `credit_amount`, `contract_count` |
| Filtros | UFs ou regiões escolhidas; série principal |
| Agregação | `SUM` por ano e UF (ou região) |
| Denominador | Total nacional do mesmo ano |
| Riscos | Comparar volumes absolutos de estados de tamanhos muito diferentes sem mostrar a participação |
| Validação | Soma das UFs de uma região = valor da região; soma das 5 regiões = total nacional |
| Gráfico | Linhas por UF ou região, mesmo eixo |

## Pergunta 7 — Perfil de um estado

| Item | Definição |
| --- | --- |
| Métrica | Para uma UF: valor por ano, participação no Brasil, posição no ranking, divisão por atividade e por finalidade |
| Campos | Os das perguntas 1, 2, 4 e 5 |
| Filtros | `state_abbr = :uf`; série principal |
| Agregação | As consultas 1, 2, 4 e 5 filtradas pela UF; não há cálculo novo |
| Denominador | Os das perguntas de origem |
| Riscos | Resumo com números de períodos diferentes |
| Validação | Cada parte bate com a pergunta de origem filtrada pela mesma UF |
| Gráfico | Página do estado no site |

## Pergunta 8 — Programas

| Item | Definição |
| --- | --- |
| Métrica | Valor e contratos por programa e ano; participação no total |
| Campos | `program_name`, `reference_year`, `credit_amount`, `contract_count` |
| Filtros | Série principal; UF opcional |
| Agregação | `SUM` por ano e programa; ranking dos programas |
| Denominador | Total do mesmo recorte |
| Riscos | Antes de 2015 quase tudo é "NÃO INFORMADO" (fora da série principal); nomes como publicados pela fonte, que podem mudar entre anos |
| Validação | Soma dos programas = total do recorte |
| Gráfico | Barras horizontais dos principais programas, demais agrupados em "Outros" |

## Pergunta 9 — Fonte dos recursos

| Item | Definição |
| --- | --- |
| Métrica | Valor e contratos por fonte de recursos e ano; participação no total |
| Campos | `funding_source_name`, `reference_year`, `credit_amount`, `contract_count` |
| Filtros | Série principal; UF opcional |
| Agregação | `SUM` por ano e fonte; ranking das fontes |
| Denominador | Total do mesmo recorte |
| Riscos | Nomes como publicados pela fonte |
| Validação | Soma das fontes = total do recorte |
| Gráfico | Barras horizontais das principais fontes |

## Pergunta 10 — Época do ano

| Item | Definição |
| --- | --- |
| Métrica | Valor por mês de emissão e participação de cada mês no total do ano, em média no período |
| Campos | `reference_month`, `reference_year`, `purpose`, `credit_amount` |
| Filtros | Série principal; finalidade e UF opcionais |
| Agregação | `SUM` por ano e mês; participação do mês no ano; média das participações entre os anos |
| Denominador | Total de cada ano no mesmo recorte |
| Riscos | O calendário agrícola segue o ano-safra (julho a junho), não o ano civil; meses de anos com volumes muito diferentes não devem ser somados sem normalizar |
| Validação | As 12 participações de cada ano somam 100% |
| Gráfico | Barras por mês (janeiro a dezembro) |

## Pergunta 11 — Valor médio por contrato

| Item | Definição |
| --- | --- |
| Métrica | Valor médio por contrato = `SUM(credit_amount) / SUM(contract_count)` no recorte |
| Campos | `credit_amount`, `contract_count` e as dimensões do recorte (ano, UF, região, atividade, finalidade, programa) |
| Filtros | Série principal; recorte escolhido |
| Agregação | Razão das somas, nunca média de médias |
| Denominador | `SUM(contract_count)` do recorte; sem cálculo se for zero |
| Riscos | Média puxada por poucos contratos muito grandes; comparar médias de finalidades diferentes como se fossem o mesmo tipo de operação |
| Validação | Média × contratos = valor total do recorte |
| Gráfico | Barras por recorte, com o número de contratos ao lado |

## Leitura conjunta

Leitura das perguntas 1 a 11, no site (página "Sobre os dados") e no README, separando fato observado de hipótese.

## Perguntas fora do escopo

O assistente (D17) responde a estes casos com uma mensagem específica, sem números:

| Tema | Situação dos dados | Resposta do assistente |
| --- | --- | --- |
| Município | Existe nos arquivos brutos; não carregado na versão 1 (D10, D19) | Explica que o projeto organiza os dados por estado e oferece o estado do município |
| Instituição financeira | Existe nos arquivos brutos; não carregada na versão 1 (D19) | Explica que esse recorte ainda não está no projeto e oferece o total do estado ou por programa |
| Pessoa ou empresa | Não é publicado pelo Banco Central | Explica que a fonte só publica totais agregados |
| Juros, inadimplência, dívida | Existem em outras bases do Banco Central, não na MDCR usada (D19) | Explica que o projeto trata do crédito concedido: valor e número de contratos |
| Previsões | Fora da versão 1 (D19) | Explica que o projeto descreve o que aconteceu e oferece a evolução recente |
| Outros assuntos | — | Explica que responde só sobre crédito rural com os dados do projeto |

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
                                         → ferramenta do assistente (D17)
```

| Pergunta | Consulta | Rota da API (`GET`) | Página do site |
| --- | --- | --- | --- |
| 1 | `yearly_totals` | `/api/v1/totals/yearly` | Visão geral, página do estado |
| 2 | `state_ranking` | `/api/v1/states/ranking` | Visão geral, página do estado |
| 3 | `matopiba_yearly` | `/api/v1/regions/matopiba/yearly` | MATOPIBA |
| 4 | `activity_split` | `/api/v1/activities/yearly` | Visão geral, página do estado |
| 5 | `purpose_split` | `/api/v1/purposes/yearly` | Visão geral, página do estado |
| 6 | `states_yearly`, `regions_yearly` | `/api/v1/states/compare`, `/api/v1/regions/yearly` | Comparar |
| 7 | 1, 2, 4 e 5 para uma UF | `/api/v1/states/{uf}/profile` | Página do estado |
| 8 | `program_ranking` | `/api/v1/programs/ranking` | Explorar os dados |
| 9 | `funding_source_ranking` | `/api/v1/funding-sources/ranking` | Explorar os dados |
| 10 | `seasonality` | `/api/v1/seasonality` | Visão geral |
| 11 | `average_contract_value` | `/api/v1/contracts/average` | Explorar os dados |

A API não recalcula indicadores em Python: ela executa as consultas de `queries.sql` e só renomeia as colunas para nomes curtos (`reference_year` vira `year`, o código de atividade vira `agricultural` ou `livestock`). Os testes da API conferem que cada rota executa a consulta certa com os filtros certos e que as rotas concordam entre si no banco carregado (o perfil do estado repete os números do ranking e da série anual, as partes somam o total). O assistente usa as mesmas rotas, então o número que ele responde é o mesmo que o painel mostra.
