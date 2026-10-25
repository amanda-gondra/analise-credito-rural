# Arquitetura da aplicação

O projeto deixa de terminar num notebook e passa a ser uma aplicação web pública: qualquer pessoa entra no site, escolhe período, estado, atividade e finalidade e vê a análise do crédito rural com dados oficiais do Banco Central.

**Status:** planejamento. Nada desta arquitetura foi implementado ainda, exceto o esquema do banco (`sql/schema.sql`).

## Para quem é

| Público | O que quer saber |
| --- | --- |
| Produtor rural, consultor, técnico agropecuário | Quanto crédito vai para o meu estado e para a minha atividade, e como isso mudou |
| Jornalista, estudante, pesquisador | Números confiáveis, com fonte, método e download dos dados |
| Instituição financeira, analista do setor | Comparação entre estados, finalidades e programas |

## O que o usuário consegue fazer

| Página | Rota | Conteúdo |
| --- | --- | --- |
| Visão geral do Brasil | `/` | Evolução anual (nominal e corrigida pelo IPCA), composição por finalidade e por atividade |
| Estado | `/estados/:uf` | Série do estado, composição, posição no ranking e participação no Brasil |
| Comparar | `/comparar` | Dois a cinco estados lado a lado |
| MATOPIBA | `/matopiba` | Os quatro estados como região, participação no Brasil |
| Explorar dados | `/dados` | Filtros por ano, UF, atividade, finalidade e programa; tabela paginada; download em CSV |
| Sobre os dados | `/sobre` | Fonte, data da coleta, período, limitações e método |

Todas as páginas mostram a data de coleta dos dados e o aviso de que os valores podem diferir de publicações anteriores por causa das revisões da fonte.

## Visão geral

```
                    ┌──────────────────────┐
 Arquivos anuais    │ pipeline/ (Python)   │  executado manualmente ou agendado
 do Banco Central ─►│ baixa, valida,       │
                    │ agrega e carrega     │
                    └──────────┬───────────┘
                               │ escrita (usuário loader)
                               ▼
                    ┌──────────────────────┐
                    │ PostgreSQL (Neon)    │  schema rural_credit
                    └──────────┬───────────┘
                               │ somente leitura (usuário api_reader)
                               ▼
                    ┌──────────────────────┐
                    │ api/ (FastAPI)       │  JSON e CSV
                    └──────────┬───────────┘
                               │ HTTPS
                               ▼
                    ┌──────────────────────┐
 Usuário ──────────►│ web/ (React + Vite)  │  site estático
                    └──────────────────────┘
```

Cada camada tem uma responsabilidade: o pipeline é o único que escreve no banco; a API só lê; o site só conversa com a API.

## Stack

| Camada | Tecnologia | Por quê |
| --- | --- | --- |
| Pipeline | Python 3.12, pandas, SQLAlchemy, psycopg, pytest | Mesma linguagem da análise; pandas lê os CSVs da fonte |
| Banco | PostgreSQL 16 | Esquema já criado e testado |
| API | Python 3.12, FastAPI, Pydantic, SQLAlchemy (Core, sem ORM), pytest | Validação automática das entradas, documentação OpenAPI gerada, mesma linguagem do pipeline |
| Front-end | React, Vite, TypeScript, TanStack Query, Recharts | Site estático que consome a API; gráficos declarativos |
| Local | Docker Compose (PostgreSQL) | Ambiente igual para qualquer pessoa |
| CI | GitHub Actions | Testes do pipeline, da API e do front-end a cada push |

SQLAlchemy Core em vez de ORM: as consultas são analíticas (agregações), e o SQL escrito à mão é parte do que o projeto quer mostrar.

## API (versão 1, proposta)

Todas as rotas são `GET`, públicas e somente leitura. Parâmetros comuns: `start_year`, `end_year`, `activity` (`agricultural` | `livestock`), `purpose` (`custeio` | `investimento` | `comercializacao` | `industrializacao`), `value` (`nominal` | `real`).

| Rota | Retorna |
| --- | --- |
| `GET /api/v1/metadata` | Anos disponíveis, série principal, UFs, atividades, finalidades, programas e data de coleta |
| `GET /api/v1/brazil/yearly` | Total por ano, variação anual, composição por finalidade e atividade |
| `GET /api/v1/states/ranking` | Valor e participação por UF no período, com posição |
| `GET /api/v1/states/{uf}/yearly` | Série anual de uma UF, composição e participação no Brasil |
| `GET /api/v1/states/compare?states=MA,PI` | Séries anuais de 2 a 5 UFs |
| `GET /api/v1/regions/matopiba/yearly` | Série da região e de cada estado, participação no Brasil |
| `GET /api/v1/credit` | Linhas filtradas, paginadas (máximo 500 por página) |
| `GET /api/v1/credit.csv` | Mesmo filtro, em CSV para download |
| `GET /health` | Status da API e do banco |

A documentação interativa fica em `/docs` (gerada pelo FastAPI).

## Segurança

| Risco | Controle |
| --- | --- |
| Injeção de SQL | Parâmetros sempre vinculados pelo driver; nenhuma concatenação de entrada do usuário |
| Escrita indevida no banco | A API usa um usuário só com `SELECT` no schema `rural_credit` |
| Entrada inválida | Pydantic valida tipos, intervalos (anos dentro do disponível) e listas fechadas (UF, atividade, finalidade) |
| Consultas caras e abuso | Paginação obrigatória, limite de linhas no CSV, limite de requisições por IP |
| Acesso de outros sites | CORS restrito ao domínio do front-end |
| Credenciais | Variáveis de ambiente; `.env` fora do Git; `.env.example` com valores fictícios |
| Erros expostos | Mensagens genéricas para o usuário; detalhes só nos logs |

Não há login: todos os dados são públicos.

## Estrutura do repositório

```
analise-credito-rural/
├── pipeline/                 # coleta, validação e carga (Python)
│   ├── rural_credit_pipeline/
│   └── tests/
├── api/                      # API (FastAPI)
│   ├── app/
│   └── tests/
├── web/                      # site (React + Vite + TypeScript)
│   └── src/
├── sql/
│   ├── schema.sql            # estrutura do banco
│   └── queries.sql           # consultas analíticas, base das rotas da API
├── docs/
├── docker-compose.yml        # PostgreSQL local
├── .env.example
└── README.md
```

## Publicação (planos gratuitos)

Condições verificadas em 25/10/2026; elas mudam com frequência.

| Peça | Serviço | Condições do plano gratuito | Impacto |
| --- | --- | --- | --- |
| Banco | Neon | 1 GB por projeto; 100 CU-horas por mês; desliga após 5 min sem uso | Os dados ocupam cerca de 100 MB; a primeira consulta após um período parado é mais lenta |
| API | Render (web service gratuito) | Desliga após 15 min sem tráfego; volta em cerca de 1 min; 750 h por mês | O primeiro acesso do dia pode levar cerca de um minuto; o site deve mostrar um aviso de carregamento |
| Site | Vercel (Hobby) | Gratuito para projetos pessoais | Sem impacto relevante |

O PostgreSQL gratuito do Render foi descartado: expira 30 dias após a criação.

## Ordem de construção

| Fase | Entrega | Depende de |
| --- | --- | --- |
| 3 | Pipeline: download, validação, agregação, carga + testes; Docker Compose com PostgreSQL local | — |
| 4 | `queries.sql`: uma consulta por pergunta, com reconciliação; série do IPCA no banco | 3 |
| 5 | API FastAPI com as rotas acima + testes | 4 |
| 6 | Front-end React com as seis páginas | 5 |
| 7 | Publicação (Neon, Render, Vercel) e CI no GitHub Actions | 6 |

Cada fase é feita um arquivo por vez, com explicação de cada parte.

## Fora do escopo desta versão

- Login, contas de usuário e dados privados.
- Mapas coloridos por estado (podem entrar depois da versão 1).
- Análise por município ou por instituição financeira (os dados brutos permitem, mas exigem outra tabela).
- Atualização automática diária dos dados.
