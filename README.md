# Análise de Crédito Rural

Aplicação web para consultar o crédito rural no Brasil com dados oficiais do Banco Central: quanto é concedido, para onde vai e como mudou ao longo dos anos. Qualquer pessoa escolhe período, estado, atividade e finalidade e vê os números, os gráficos e a fonte.

> **Status: Fase 2 concluída — fonte investigada e banco modelado.** O esquema do PostgreSQL existe e foi testado com dados reais de 2017 e 2024. O pipeline, a API e o site ainda não foram implementados.

## O que o site vai oferecer

- **Visão geral do Brasil:** evolução anual, finalidades e agricultura × pecuária, em valores nominais e corrigidos pelo IPCA.
- **Página por estado:** série, composição e posição no ranking.
- **Comparar estados** e ver o **MATOPIBA** (Maranhão, Tocantins, Piauí e Bahia) como região.
- **Explorar os dados:** filtros por ano, UF, atividade, finalidade e programa, com download em CSV.
- **Sobre os dados:** fonte, data da coleta, método e limitações.

## Perguntas que o site responde

1. Como o volume de crédito rural evoluiu ano a ano?
2. Quais estados recebem os maiores volumes?
3. Como se comporta o crédito no MATOPIBA?
4. Como os recursos se distribuem entre agricultura e pecuária?
5. Quanto vai para custeio, investimento, comercialização e industrialização?

## Fonte dos dados

[Matriz de Dados do Crédito Rural (MDCR)](https://www.bcb.gov.br/estabilidadefinanceira/micrrural), Banco Central do Brasil (BCB/Derop), em arquivos anuais por região, UF, município, programa, fonte de recursos e instituição financeira. Valores de crédito concedido, em reais nominais. Licença ODbL.

- **Série principal:** 2017–2025, em ano civil. Antes de 2017 há quebras de classificação e uma falha de cobertura em 2016.
- **Revisões:** a fonte é revisada diariamente; cada carga registra a data de coleta e o hash do arquivo.

Detalhes em [docs/fonte-dados.md](docs/fonte-dados.md).

## Arquitetura

```
Arquivos do BCB → pipeline (Python) → PostgreSQL → API (FastAPI) → site (React) → usuário
```

| Camada | Tecnologia | Status |
| --- | --- | --- |
| Pipeline | Python, pandas, SQLAlchemy, pytest | Planejado (fase 3) |
| Banco | PostgreSQL 16 — `sql/schema.sql` | **Pronto e testado** |
| Consultas | SQL — `sql/queries.sql` | Planejado (fase 4) |
| API | FastAPI, Pydantic, SQLAlchemy Core | Planejado (fase 5) |
| Site | React, Vite, TypeScript | Planejado (fase 6) |
| Publicação | Neon (banco), Render (API), Vercel (site), GitHub Actions | Planejado (fase 7) |

Detalhes, rotas da API e segurança em [docs/arquitetura-aplicacao.md](docs/arquitetura-aplicacao.md).

## Estrutura do repositório

| Caminho | Conteúdo | Status |
| --- | --- | --- |
| `docs/` | Escopo, fonte, dicionário, modelagem, arquitetura, qualidade e decisões | Pronto |
| `sql/schema.sql` | Estrutura do banco | Pronto e testado |
| `pipeline/` | Coleta, validação e carga | Planejado |
| `sql/queries.sql` | Consultas analíticas | Planejado |
| `api/` | API FastAPI | Planejado |
| `web/` | Site React | Planejado |
| `data/` | Arquivos baixados (fora do Git) | Local |

## Criar o banco localmente

Pré-requisito: PostgreSQL 16 ou superior.

```bash
createdb rural_credit
psql -d rural_credit -f sql/schema.sql
```

O script cria o schema `rural_credit` com cinco tabelas e pode ser executado mais de uma vez sem erro. As instruções para carregar os dados, subir a API e o site serão adicionadas a cada fase.

## Plano de execução

1. **Escopo e documentação** — concluída
2. **Fonte, perfil dos dados e banco** — concluída
3. **Pipeline** de coleta, validação e carga, com testes
4. **Consultas SQL** e série do IPCA
5. **API** FastAPI com testes
6. **Site** React
7. **Publicação** e integração contínua

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [Escopo](docs/escopo-projeto.md) | Objetivo, público, perguntas e o que fica fora |
| [Arquitetura da aplicação](docs/arquitetura-aplicacao.md) | Camadas, rotas da API, segurança e publicação |
| [Fonte de dados](docs/fonte-dados.md) | Como obter os arquivos, cobertura e limitações |
| [Investigação da fonte](docs/fase-2-investigacao-fonte.md) | Testes de acesso, amostras e evidências |
| [Dicionário de dados](docs/dicionario-dados.md) | Colunas da fonte e o que foi confirmado |
| [Modelagem do banco](docs/modelagem-banco.md) | Tabelas, chaves e justificativas |
| [Qualidade dos dados](docs/qualidade-dados.md) | Regras de validação e reconciliação |
| [Plano de análise](docs/plano-analise.md) | Da pergunta à consulta e ao gráfico |
| [Decisões técnicas](docs/decisoes-tecnicas.md) | Decisões tomadas e pendências |

## Limitações conhecidas

- Valores nominais na base; a versão corrigida pelo IPCA é calculada nas consultas.
- A fonte é revisada diariamente; os números dependem da data de coleta.
- Antes de 2017 a série não é comparável.
- O MATOPIBA é aproximado pelos quatro estados inteiros.
- No plano gratuito, a API leva cerca de um minuto para responder depois de um período sem acessos.

## Referências

- [Matriz de Dados do Crédito Rural — Banco Central](https://www.bcb.gov.br/estabilidadefinanceira/micrrural)
- [Esclarecimentos sobre a MDCR (BCB)](https://www.bcb.gov.br/conteudo/mdcr/Documents/definicoesCreditoRural.pdf)
- [MDCR no Portal de Dados Abertos do BCB](https://dadosabertos.bcb.gov.br/dataset/matrizdadoscreditorural)
- [Anuário Estatístico do Brasil 2024, tabela 3.2.1.3 (IBGE, fonte BCB/DSTAT)](https://anuario.ibge.gov.br/images/aeb/2024/s3/2_pdf/s3t2103.pdf)

## Autora

Amanda Gondra — [github.com/amanda-gondra](https://github.com/amanda-gondra)
