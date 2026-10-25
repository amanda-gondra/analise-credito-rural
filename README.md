# Análise de Crédito Rural

Análise do crédito rural no Brasil com dados públicos do Banco Central: quanto é concedido, para onde vai e como mudou ao longo dos anos.

> **Status: Fase 2 concluída — fonte investigada e banco modelado.** O esquema do PostgreSQL existe e foi testado com dados reais de 2017 e 2024. O pipeline de carga, as consultas analíticas e o notebook ainda não foram implementados, e nenhum resultado foi publicado.

## Problema de negócio

O crédito rural financia boa parte da produção agropecuária brasileira. O Banco Central publica esses dados de forma aberta, mas em arquivos grandes e pouco práticos para análise. Este projeto organiza os dados num banco relacional e responde, com SQL, a perguntas sobre distribuição e evolução do crédito.

## Perguntas

1. Como o volume de crédito rural evoluiu ano a ano?
2. Quais estados recebem os maiores volumes?
3. Como se comporta o crédito no MATOPIBA (Maranhão, Tocantins, Piauí e Bahia)?
4. Como os recursos se distribuem entre agricultura e pecuária?
5. Quanto vai para custeio, investimento, comercialização e industrialização?
6. Que mudanças e padrões aparecem no período?

## Fonte dos dados

[Matriz de Dados do Crédito Rural (MDCR)](https://www.bcb.gov.br/estabilidadefinanceira/micrrural), Banco Central do Brasil (BCB/Derop), visão "Quantidade e Valor dos Contratos por Região, UF, Município, Programa, Fonte de Recursos e IF", em arquivos anuais `.gz`. Valores de crédito concedido, em reais nominais. Licença ODbL.

- **Série principal:** 2017–2025, em ano civil. Antes de 2017 há quebras de classificação e uma falha de cobertura em 2016.
- **Revisões:** a fonte é revisada diariamente; cada carga registra data de coleta e hash do arquivo.

Detalhes em [docs/fonte-dados.md](docs/fonte-dados.md).

## Stack

- Python: requests, pandas, SQLAlchemy, psycopg, pytest
- PostgreSQL 16 e SQL
- Jupyter Notebook e Matplotlib
- Git e GitHub

## Fluxo de processamento

```
Arquivos anuais do BCB → download e hash (Python) → validação (pandas)
→ agregação por UF e formato longo → PostgreSQL → consultas (SQL) → notebook → README
```

| Etapa | Responsabilidade | Status |
| --- | --- | --- |
| Coleta | Baixar `MATRIZ_CR_REGIAO_<ano>.gz` e registrar URL, data e SHA-256 | Planejado |
| Validação | Regras de [docs/qualidade-dados.md](docs/qualidade-dados.md) | Planejado |
| Transformação | Somar municípios e instituições por UF; uma linha por finalidade | Planejado |
| Banco | `sql/schema.sql` | **Pronto e testado** |
| Carga | Um ano por transação, sem duplicar em recargas | Planejado |
| Análise | `sql/queries.sql` | Planejado |
| Visualização | `notebooks/analysis.ipynb` | Planejado |

## Estrutura do repositório

| Caminho | Conteúdo | Status |
| --- | --- | --- |
| `README.md` | Este arquivo | Atualizado na Fase 2 |
| `docs/escopo-projeto.md` | Objetivo, perguntas e escopo do MVP | Pronto |
| `docs/fonte-dados.md` | Fonte escolhida, como obter, cobertura e limitações | Pronto |
| `docs/fase-2-investigacao-fonte.md` | Testes de acesso, amostras e evidências | Pronto |
| `docs/dicionario-dados.md` | Colunas da fonte, significados e status | Pronto |
| `docs/modelagem-banco.md` | Tabelas, chaves, restrições e justificativas | Pronto |
| `docs/plano-analise.md` | Pergunta → métrica → consulta → gráfico | Pronto |
| `docs/qualidade-dados.md` | Regras de validação e reconciliação | Pronto |
| `docs/decisoes-tecnicas.md` | Decisões e pendências | Pronto |
| `sql/schema.sql` | Estrutura do banco | Pronto e testado |
| `src/load_data.py` | Coleta, validação e carga | Planejado |
| `sql/queries.sql` | Consultas analíticas | Planejado |
| `tests/` | Testes de transformação e qualidade | Planejado |
| `notebooks/analysis.ipynb` | Análise e gráficos | Planejado |
| `data/` | Arquivos baixados (fora do Git) | Local |

## Criar o banco

Pré-requisito: PostgreSQL 16 ou superior.

```bash
createdb rural_credit
psql -d rural_credit -f sql/schema.sql
```

O script cria o schema `rural_credit` com cinco tabelas e pode ser executado mais de uma vez sem erro. As instruções de carga dos dados serão adicionadas na próxima fase.

## Plano de execução

1. **Fase 1 — Documentação** (concluída)
2. **Fase 2 — Fonte, perfil dos dados e modelagem** (concluída)
3. **Fase 3 — Pipeline:** coleta, validação e carga, com testes
4. **Fase 4 — Análise SQL:** `queries.sql` com reconciliação dos totais
5. **Fase 5 — Notebook e resultados:** gráficos, correção pelo IPCA e descobertas neste README

## Limitações conhecidas

- Valores nominais; comparações entre anos exigem a versão corrigida pelo IPCA.
- A fonte é revisada diariamente; os números dependem da data de coleta.
- Antes de 2017 a série não é comparável (industrialização ausente até jun/2016, programas não informados em 2013–2014, falha de cobertura em mar–jun/2016).
- O MATOPIBA é aproximado pelos quatro estados inteiros.
- A análise agrega por UF; município e instituição financeira ficam fora do MVP.

## Referências

- [Matriz de Dados do Crédito Rural — Banco Central](https://www.bcb.gov.br/estabilidadefinanceira/micrrural)
- [MDCR no Portal de Dados Abertos do BCB](https://dadosabertos.bcb.gov.br/dataset/matrizdadoscreditorural)
- [Esclarecimentos sobre a MDCR (BCB)](https://www.bcb.gov.br/conteudo/mdcr/Documents/definicoesCreditoRural.pdf)
- [Tabelas e microdados do crédito rural e do Proagro](https://www.bcb.gov.br/estabilidadefinanceira/tabelas-credito-rural-proagro)
- [Anuário Estatístico do Brasil 2024, tabela 3.2.1.3 (IBGE, fonte BCB/DSTAT)](https://anuario.ibge.gov.br/images/aeb/2024/s3/2_pdf/s3t2103.pdf)

## Autora

Amanda Gondra — [github.com/amanda-gondra](https://github.com/amanda-gondra)
