# Qualidade dos dados

Regras que o pipeline vai verificar, onde se aplicam e o que acontece quando falham. A coluna **Evidência** indica o que a Fase 2 observou nos arquivos de 2013–2025. As regras ainda não estão implementadas no pipeline.

## Níveis de gravidade

| Nível | Ação |
| --- | --- |
| **Crítico** | Interrompe a etapa. Os dados não avançam para o banco ou para a análise. |
| **Importante** | Registra o alerta. A análise afetada só segue com a limitação documentada. |
| **Aviso** | Registra e segue. Pode ser comportamento legítimo da fonte. |

Princípio: nenhum registro é descartado em silêncio, e nenhum valor ausente vira zero sem regra documentada. A única linha que não é gravada é o par de finalidade com quantidade 0 **e** valor 0, que não representa nenhum contrato.

## Regras por etapa

### 1. Coleta

| Regra | Risco controlado | Falha | Evidência |
| --- | --- | --- | --- |
| HTTP 200 e arquivo gzip válido (abre e descompacta) | Gravar página de erro como dado | Crítico | 13/13 downloads válidos |
| Registrar URL, data de coleta, SHA-256 e data de geração do gzip | Não saber qual versão gerou os números | Crítico | A base é revisada diariamente |
| Nome do CSV interno = nome esperado | Arquivo trocado | Crítico | Ex.: `MATRIZ_CR_REGIAO_2024.csv` |

### 2. Estrutura

| Regra | Risco controlado | Falha | Evidência |
| --- | --- | --- | --- |
| Cabeçalho idêntico às 25 colunas esperadas, na mesma ordem | Mudança de layout | Crítico | Idêntico em 2013–2025 |
| Coluna nova ou faltando | Mudança não percebida | Crítico (falta) / Importante (nova) | — |

### 3. Tipos e conversões

| Regra | Risco controlado | Falha | Evidência |
| --- | --- | --- | --- |
| `*_VALOR` e `*_AREA` no formato `\d+(,\d{1,2})?` | Separador errado, escala errada | Crítico | 100% das linhas |
| No máximo 2 casas decimais | `NUMERIC(15,2)` arredonda em silêncio | Crítico | Máximo de 2 em todos os anos |
| `*_QTDE` inteiro ≥ 0 | Conversão errada | Crítico | 100% |
| `ANO_MES_EMISSAO` no formato `AAAA-MM-01`, ano = ano do arquivo | Linha de outro ano | Crítico | 0 linhas de outro ano |
| Conversão de vírgula decimal com `Decimal`, nunca `float` | Erro de arredondamento nas somas | Crítico | Reconciliação exata no teste |

### 4. Valores ausentes

| Regra | Risco controlado | Falha | Evidência |
| --- | --- | --- | --- |
| UF, atividade, programa, subprograma, fonte e mês preenchidos | Registro sem dimensão de análise | Crítico | Nenhum vazio |
| `COD_MUNICIPIO_IBGE` vazio | Linha sem código de município | Aviso (a UF vem da coluna `UF`, então a análise não é afetada) | 0 a 103 por ano, todos no DF |

### 5. Unicidade

| Regra | Risco controlado | Falha | Evidência |
| --- | --- | --- | --- |
| Chave da fonte única: `ANO_MES_EMISSAO, UF, COD_MUNICIPIO_IBGE, MUNICIPIO, ATIVIDADE, PROGRAMA, SUBPROGRAMA, FONTE_RECURSO, CNPJ_IF` | Linhas duplicadas inflando totais | Crítico | 0 repetições em todos os anos |
| Chave primária do fato | Duplicidade após agregação | Crítico (o banco rejeita) | Testado |
| Recarga do mesmo ano não duplica | Idempotência | Crítico (`UNIQUE` em `source_file`) | Testado |

### 6. Categorias

| Regra | Risco controlado | Falha | Evidência |
| --- | --- | --- | --- |
| `UF` existe em `ref_state.state_name` | UF com grafia nova | Crítico | 27 valores, todos mapeados |
| `ATIVIDADE` existe em `ref_activity.source_label` | Atividade nova | Crítico | Só `AGRÍCOLA` e `PECUÁRIA` |
| Prefixo do código IBGE do município = código da UF | UF errada | Importante | 100% coerente |
| Programa, subprograma e fonte novos em relação ao ano anterior | Mudança de classificação | Aviso (lista no relatório) | Mudam entre anos |
| Valor com programa `NÃO INFORMADO` acima de 5% no ano | Classificação incompleta | Importante | 56% em 2013, 51% em 2014, 1,9% em 2015, 0 depois |

### 7. Valores financeiros

| Regra | Risco controlado | Falha | Evidência |
| --- | --- | --- | --- |
| Nenhum valor ou quantidade negativo | Estorno ou erro | Crítico (o banco rejeita) | Nenhum |
| `TOTAL_VALOR` = soma das 4 finalidades e `TOTAL_QTDE` = soma das 4 quantidades | Coluna corrompida | Crítico | 100% das linhas |
| Quantidade > 0 com valor 0 | Registro incompleto na fonte | Aviso (mantém) | 10 linhas (2014–2015) |
| Valor > 0 com quantidade 0 | Registro incompleto na fonte | Importante | Nenhum |
| Valores extremos | Erro ou operação legítima | Aviso; nunca excluir por ser alto | Maior linha: R$ 3,0 bi (2025) |

### 8. Temporal

| Regra | Risco controlado | Falha | Evidência |
| --- | --- | --- | --- |
| 12 meses presentes em cada ano completo | Ano parcial | Crítico para a série principal | 12 meses em 2013–2025 |
| Linhas **ou** contratos de um mês fora de 50% a 200% da mediana mensal do ano | Falha de cobertura | Importante | Testado em 2013–2025: sinaliza mar–jun/2016 e jan/2019 (contratos a 49% da mediana, caso limítrofe a investigar antes da análise) |
| Finalidade com zero em todo o ano | Quebra de classificação | Importante | Industrialização zerada em 2013–2015 |

### 9. Reconciliação

| Regra | Risco controlado | Falha | Evidência |
| --- | --- | --- | --- |
| Linhas lidas = `source_row_count` | Perda na leitura | Crítico | — |
| Soma do fato por arquivo = `source_total_amount` e `source_total_qty` | Perda ou duplicação na transformação ou carga | Crítico; tolerância zero | Diferença R$ 0,00 em 2017 e 2024 |
| Totais anuais por finalidade ± 6% da tabela BCB/DSTAT (Anuário IBGE) | Erro de unidade ou cobertura | Importante; diferença esperada por revisões | 2023: até +0,73%; 2024: até +5,16% |
| Conferência pontual com o OData | Divergência entre canais oficiais | Aviso | Jan/2024 idêntico; set/2024 com 1 contrato de diferença |

A tolerância de 6% na comparação com a tabela BCB/DSTAT não esconde erros de pipeline: a reconciliação interna (fato × arquivo) tem tolerância zero. Os 6% cobrem apenas as revisões feitas pela fonte entre a publicação do Anuário e a coleta, com folga sobre a maior diferença observada (+5,16%). Diferenças acima disso indicam erro de unidade, de cobertura ou de leitura.

## Onde cada regra roda

1. Após o download: regras 1.
2. Após a leitura do CSV: regras 2, 3 e 4.
3. Antes da carga: regras 5, 6, 7 e 8.
4. Após a carga, em SQL: regra 9 (reconciliação interna).
5. Antes de publicar resultados: comparação com BCB/DSTAT.

## Relatório de qualidade

Cada execução registra: data, arquivo, SHA-256, linhas lidas e carregadas, regras aprovadas, alertas, falhas e a decisão de liberar ou não os dados. Uma regra não executada nunca aparece como aprovada.

## Decisões tomadas na Fase 2

- A chave da fonte foi confirmada (seção 5).
- Valores negativos não existem; o banco passa a rejeitá-los.
- A referência oficial para reconciliação é a tabela BCB/DSTAT publicada no Anuário Estatístico do IBGE.
