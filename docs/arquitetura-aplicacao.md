# Arquitetura da aplicação

O projeto deixa de terminar num notebook e passa a ser uma aplicação web pública: qualquer pessoa entra no site, escolhe período, estado, atividade e finalidade e vê a análise do crédito rural com dados oficiais do Banco Central.

**Status:** pipeline, banco, consultas e API prontos e testados (fases 3 a 5). Assistente implementado, com avaliação pendente (fase 6). Site e publicação ainda não implementados.

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

## API (versão 1)

Implementada em `api/` (fase 5). Todas as rotas são `GET`, públicas e somente leitura; cada uma executa uma consulta de `sql/queries.sql` como `api_reader`.

**Parâmetros**, todos opcionais, cada rota aceita só os que fazem sentido para ela:

| Parâmetro | Valores | Padrão |
| --- | --- | --- |
| `start_year`, `end_year` | 2013 a 2025, com `start_year` ≤ `end_year` | 2017 e 2025 (série principal, D9) |
| `state` | UF de duas letras (maiúscula ou minúscula) | Brasil inteiro |
| `activity` | `agricultural`, `livestock` | as duas |
| `purpose` | `custeio`, `investimento`, `comercializacao`, `industrializacao` | todas |
| `region` | `norte`, `nordeste`, `sudeste`, `sul`, `centro-oeste` | todas |
| `program` | nome exato, como listado em `/api/v1/metadata` | todos |

Um parâmetro desconhecido ou fora da lista é recusado com 422, em vez de ser ignorado em silêncio. As respostas trazem os valores nominal e real juntos, por isso não há parâmetro para escolher entre eles.

| Rota | Pergunta | Retorna |
| --- | --- | --- |
| `/api/v1/metadata` | — | Anos carregados com a data de coleta, série principal, valores aceitos em cada filtro, programas e último mês do IPCA |
| `/api/v1/totals/yearly` | 1 | Total por ano, contratos e variação anual (`state`, `activity`, `purpose`) |
| `/api/v1/states/ranking` | 2 | Posição, valor e participação de cada UF no período (`activity`, `purpose`) |
| `/api/v1/regions/matopiba/yearly` | 3 | Cada estado do MATOPIBA e o bloco, com participação no Brasil |
| `/api/v1/activities/yearly` | 4 | Agricultura e pecuária por ano (`state`) |
| `/api/v1/purposes/yearly` | 5 | As quatro finalidades por ano (`state`, `activity`) |
| `/api/v1/states/compare?states=PI,CE` | 6 | Séries anuais de 2 a 5 UFs, com participação no Brasil |
| `/api/v1/regions/yearly` | 6 | As cinco regiões por ano (`activity`, `purpose`) |
| `/api/v1/states/{uf}/profile` | 7 | Posição no ranking, série anual, atividades e finalidades de uma UF |
| `/api/v1/programs/ranking` | 8 | Programas ordenados pelo valor do período (`state`) |
| `/api/v1/funding-sources/ranking` | 9 | Fontes de recursos ordenadas pelo valor do período (`state`) |
| `/api/v1/seasonality` | 10 | Participação média, mínima e máxima de cada mês no ano (`state`, `purpose`) |
| `/api/v1/contracts/average` | 11 | Valor médio por contrato, por ano e no período (`state` ou `region`, `activity`, `purpose`, `program`) |
| `/health` | — | Status da API e do banco (503 se o banco não responde) |

Toda rota de dados responde `{"data", "meta"}`. `meta` traz a fonte, o índice de preços (IPCA, preços de dez/2025) e os filtros aplicados, para que o site e o assistente citem o número com período e fonte (D17). A documentação interativa fica em `/docs` (gerada pelo FastAPI).

A tabela paginada e o download em CSV da página "Explorar dados" (`/api/v1/credit` e `/api/v1/credit.csv`) ficam para a fase 7, junto com a página que os usa.

## Assistente de IA (fase 6)

`POST /api/v1/assistant/ask` recebe `{"question": "..."}` (3 a 500 caracteres) e devolve a resposta em português, as linhas usadas (`sources[].data`), os filtros e o endereço da página do painel com o mesmo recorte (`panel_path`). Código em `api/app/assistant/`.

```
pergunta → modelo de linguagem → escolhe uma ferramenta → mesma consulta da rota → resultado
                    ↑                                                                 │
                    └──────────────────── escreve a resposta ─────────────────────────┘
```

| Peça | Arquivo | O que faz |
| --- | --- | --- |
| Ferramentas | `tools.py` | Uma por pergunta do plano; cada uma usa o mesmo filtro, a mesma consulta e o mesmo formato da rota correspondente. O modelo não escreve SQL nem vê o banco |
| Fora do escopo | `scope.py` | O modelo só classifica o tema (município, instituição, pessoa, juros, previsão, outro); o texto da recusa é fixo, sem números |
| Instruções | `prompt.py` | Números só das ferramentas, período padrão 2017–2025, valores reais ao comparar anos, resposta curta com fonte |
| Provedores | `providers.py` | Gemini (formato próprio) e o formato chat/completions (Groq e Cloudflare); falhas viram `ProviderError` |
| Laço | `agent.py` | Até 3 rodadas de ferramentas; se um provedor falha, a pergunta recomeça no próximo; se todos falham, 503 |
| Limites | `quota.py` | Perguntas por visitante por minuto e por dia, e um teto diário do site, antes de chamar o modelo |

| Risco | Controle |
| --- | --- |
| Número inventado | Toda resposta vem com as linhas da consulta e o link do painel; as instruções proíbem números que não vieram de uma ferramenta; o conjunto de avaliação (fase 6.2) mede o acerto |
| Instrução escondida na pergunta | O modelo só tem ferramentas de leitura com filtros validados; o pior caso é uma resposta fora do assunto, nunca um acesso novo ao banco |
| Abuso e custo | Limites por visitante e do site, pergunta de até 500 caracteres, corpo de até 4 KB, tempo máximo por chamada; só planos gratuitos |
| Chaves | Só em variáveis de ambiente, enviadas no cabeçalho (nunca na URL) e fora dos logs |
| Privacidade | Os logs não guardam a pergunta nem a resposta; os dados enviados ao modelo são públicos e agregados por estado (D18) |
| Provedor fora do ar | Troca automática; sem nenhum provedor, `assistant_available` fica falso em `/api/v1/metadata` e o painel funciona normalmente |

## Segurança

| Risco | Controle |
| --- | --- |
| Injeção de SQL | A API não tem SQL próprio: executa as consultas nomeadas de `queries.sql`, com parâmetros vinculados pelo driver; nenhuma concatenação de entrada do usuário |
| Escrita indevida no banco | A API usa `api_reader`: só `SELECT`, transações somente leitura por padrão |
| Entrada inválida | Pydantic valida tipos, intervalos (anos carregados) e listas fechadas (UF, atividade, finalidade, região); parâmetro desconhecido é recusado |
| Consultas caras e abuso | Limite de requisições por cliente às rotas `/api/v1/` (429 com `Retry-After`); tempo máximo de 5 s por consulta e no máximo 10 conexões do `api_reader`; pool de conexões limitado |
| Acesso de outros sites | CORS fechado por padrão, aberto só às origens listadas em `ALLOWED_ORIGINS` (`*` é recusado), só `GET` |
| Credenciais | Variáveis de ambiente; `.env` fora do Git; `.env.example` com valores fictícios; a API lê só a senha do `api_reader` |
| Erros expostos | Formato único de erro com `request_id`; mensagens genéricas, sem SQL nem dados de conexão; detalhes só nos logs, que não registram os parâmetros da requisição |

Não há login: todos os dados são públicos.

## Estrutura do repositório

```
analise-credito-rural/
├── pipeline/                 # coleta, validação e carga (Python)
├── tests/                    # testes do pipeline (pipeline/) e das consultas (sql/)
├── api/                      # API (FastAPI)
│   ├── app/                  # configuração, banco, filtros, respostas, rotas e middlewares
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
| 6 | Assistente de IA: ferramentas sobre as rotas da API, troca de provedor, limites e conjunto de avaliação (D17, D18) | 5 |
| 7 | Front-end React com as seis páginas e o assistente; rotas da página "Explorar dados" (`/api/v1/credit` e CSV) | 6 |
| 8 | Publicação (Neon, Render, Vercel) e CI no GitHub Actions | 7 |

Cada fase é feita um arquivo por vez, com explicação de cada parte.

## Fora do escopo desta versão

- Login, contas de usuário e dados privados.
- Mapas coloridos por estado (podem entrar depois da versão 1).
- Análise por município ou por instituição financeira (os dados brutos permitem; planejada para a versão 1.1, D19).
- Inadimplência, juros e previsões (versão 2, D19).
- Atualização automática diária dos dados.
