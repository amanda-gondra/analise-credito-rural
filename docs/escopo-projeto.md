# Escopo do projeto

## Objetivo

Oferecer uma aplicação web pública em que qualquer pessoa consulte como o crédito rural é distribuído no Brasil e como seu volume evolui ao longo do tempo, com dados oficiais do Banco Central, coletados, validados e armazenados por um processo reproduzível.

*Alterado em 25/10/2026: o projeto deixou de terminar num notebook e passou a ser uma aplicação com back-end, front-end e banco de dados. Arquitetura em [arquitetura-aplicacao.md](arquitetura-aplicacao.md).*

## Justificativa

O crédito rural é a principal forma de financiamento da produção agropecuária no Brasil. Os dados são públicos, mas aparecem em consultas pouco amigáveis. O projeto transforma essa base em respostas claras a perguntas de negócio, aplicando práticas reais de engenharia e análise de dados: coleta automatizada, banco relacional, SQL analítico, validação e comunicação dos resultados.

## Público-alvo

- **Usuários do site:** produtores, consultores, técnicos, jornalistas, estudantes e analistas do setor que querem consultar os números sem ler código.
- **Avaliadores técnicos:** veem no repositório a arquitetura, o SQL, a qualidade dos dados e os testes.

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
4. Arquivo `sql/queries.sql` respondendo às perguntas 1 a 5, com série do IPCA para valores reais.
5. API somente leitura em FastAPI.
6. Site em React com visão geral do Brasil, página por estado, comparação, MATOPIBA, exploração dos dados com download em CSV e página sobre os dados.
7. Testes do pipeline, da API e do front-end, executados no GitHub Actions.
8. Publicação gratuita: banco no Neon, API no Render, site no Vercel.
9. README com instruções de execução, link do site e descobertas validadas.

**Período da série principal:** 2017 a 2025, em ano civil. 2013–2016 têm quebras de classificação e de cobertura e ficam fora do comparativo principal; 2026 só aparece como dado parcial. Justificativa na D9 em [decisoes-tecnicas.md](decisoes-tecnicas.md).

## Exclusões

- Microdados do Sicor (nível de operação).
- Análises por município, produto, instituição financeira ou gênero. Programa entra apenas como filtro na exploração dos dados.
- Login e contas de usuário: todos os dados são públicos.
- Mapas coloridos por estado (depois da versão 1).
- Orquestradores e atualização automática diária dos dados.
- Modelos preditivos.
- Indicadores de intensidade (crédito por produtor ou por área), que exigem bases externas.

## Critérios gerais de sucesso

- O site está publicado e responde às cinco perguntas sem que o usuário precise ler código.
- Qualquer pessoa consegue rodar o projeto inteiro localmente seguindo o README.
- Os números do site são os mesmos de `queries.sql` (testado).
- Os totais carregados batem exatamente com os arquivos coletados, e a diferença em relação às publicações oficiais está explicada.
- Cada pergunta tem uma consulta SQL, uma rota da API e um gráfico no site.
- As limitações (valores nominais, anos parciais, classificação de atividade) estão documentadas.
- Nenhum número no README foi escrito à mão: todos vêm das consultas.
