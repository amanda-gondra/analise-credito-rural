# Escopo do projeto

## Objetivo

Analisar como o crédito rural é distribuído no Brasil e como seu volume evolui ao longo do tempo, usando dados públicos do Banco Central, com um processo de coleta, armazenamento e análise reproduzível.

## Justificativa

O crédito rural é a principal forma de financiamento da produção agropecuária no Brasil. Os dados são públicos, mas aparecem em consultas pouco amigáveis. O projeto transforma essa base em respostas claras a perguntas de negócio, aplicando práticas reais de engenharia e análise de dados: coleta automatizada, banco relacional, SQL analítico, validação e comunicação dos resultados.

## Público-alvo

- **Recrutadores e avaliadores técnicos:** avaliam organização, SQL, qualidade dos dados e capacidade de explicar resultados.
- **Leitores interessados em agronegócio:** querem as respostas, sem precisar ler código.

## Perguntas de negócio

| # | Pergunta | Dados necessários | Disponibilidade |
| --- | --- | --- | --- |
| 1 | Como o volume de crédito rural evoluiu ano a ano? | mês de emissão, valores | Confirmado na Fase 2 |
| 2 | Quais estados recebem os maiores volumes? | UF, valores | Confirmado (27 UFs) |
| 3 | Como se comporta o crédito no MATOPIBA? | UF (MA, TO, PI, BA), valores | Confirmado |
| 4 | Como os recursos se distribuem entre agricultura e pecuária? | `ATIVIDADE` | Confirmado: `AGRÍCOLA` e `PECUÁRIA` |
| 5 | Quanto vai para custeio, investimento, comercialização e industrialização? | Quatro pares `*_QTDE` / `*_VALOR` | Confirmado; industrialização só a partir de jul/2016 |
| 6 | Quais mudanças e padrões aparecem no período? | Resultados das perguntas 1 a 5 | Depende das anteriores |

Fonte: arquivos anuais `MATRIZ_CR_REGIAO` da MDCR (alterado na Fase 2). Detalhes em [fonte-dados.md](fonte-dados.md).

## Indicadores previstos

- Valor total contratado por ano (soma das quatro finalidades).
- Variação anual absoluta e percentual.
- Valor por UF e ranking no período.
- Participação de cada UF e do MATOPIBA no total nacional.
- Valor e participação por atividade.
- Valor e participação por finalidade.
- Quantidade de contratos, quando a regra de contagem for confirmada.

Definições, fórmulas e denominadores: [plano-analise.md](plano-analise.md).

## Escopo do MVP

Entra:

1. Coleta automatizada dos arquivos anuais `MATRIZ_CR_REGIAO` do Banco Central.
2. Preservação dos dados brutos com data de coleta.
3. Tratamento, validação e carga no PostgreSQL.
4. Arquivo `sql/queries.sql` respondendo às perguntas 1 a 5.
5. Notebook com 5 gráficos e interpretação.
6. Testes das regras de transformação e validação.
7. README com instruções de execução e descobertas validadas.

**Período da série principal:** 2017 a 2025, em ano civil. 2013–2016 têm quebras de classificação e de cobertura e ficam fora do comparativo principal; 2026 só aparece como dado parcial. Justificativa na D9 em [decisoes-tecnicas.md](decisoes-tecnicas.md).

## Exclusões

- Microdados do Sicor (nível de operação).
- Análises por município, produto, instituição financeira, gênero ou programa.
- Dashboards interativos (Power BI, Streamlit).
- Nuvem, orquestradores e agendamento automático.
- Modelos preditivos.
- Indicadores de intensidade (crédito por produtor ou por área), que exigem bases externas.

## Critérios gerais de sucesso

- Qualquer pessoa consegue reproduzir a análise seguindo o README.
- Os totais carregados batem exatamente com os arquivos coletados, e a diferença em relação às publicações oficiais está explicada.
- Cada pergunta tem uma consulta SQL, um gráfico e uma interpretação.
- As limitações (valores nominais, anos parciais, classificação de atividade) estão documentadas.
- Nenhum número no README foi escrito à mão: todos vêm das consultas.
