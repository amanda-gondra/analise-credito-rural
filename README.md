# Análise de Crédito Rural

Aplicação web para consultar o crédito rural no Brasil com dados oficiais do Banco Central: quanto é concedido, para onde vai e como mudou ao longo dos anos. Qualquer pessoa escolhe período, estado, atividade e finalidade e vê os números, os gráficos e a fonte.

> **Status: Fase 5 concluída — API pronta.** Os dados de 2013 a 2025 são baixados do Banco Central, validados e carregados no PostgreSQL com reconciliação até o centavo; o IPCA do IBGE permite mostrar valores corrigidos; as 11 perguntas têm consultas SQL testadas contra o banco e uma API somente leitura que as publica. O assistente e o site ainda não foram implementados.

## O que o site vai oferecer

- **Visão geral do Brasil:** evolução anual, finalidades e agricultura × pecuária, em valores nominais e corrigidos pelo IPCA.
- **Página por estado:** série, composição e posição no ranking.
- **Comparar estados** e ver o **MATOPIBA** (Maranhão, Tocantins, Piauí e Bahia) como região.
- **Explorar os dados:** filtros por ano, UF, atividade, finalidade e programa, com download em CSV.
- **Pergunte aos dados:** um assistente de IA responde perguntas em português com os números do banco, a fonte e um link para o mesmo recorte no painel.
- **Sobre os dados:** fonte, data da coleta, método e limitações.

## Perguntas que o site responde

1. Como o volume de crédito rural evoluiu ano a ano?
2. Quais estados recebem os maiores volumes?
3. Como se comporta o crédito no MATOPIBA?
4. Como os recursos se distribuem entre agricultura e pecuária?
5. Quanto vai para custeio, investimento, comercialização e industrialização?
6. Como estados e regiões se comparam?
7. Qual é o perfil do crédito rural em cada estado?
8. Quais programas concentram o crédito?
9. De quais fontes vêm os recursos?
10. Em que época do ano o crédito é contratado?
11. Qual é o valor médio por contrato?

O que o projeto não responde, e por quê, está no [plano de análise](docs/plano-analise.md#perguntas-fora-do-escopo).

## Fonte dos dados

[Matriz de Dados do Crédito Rural (MDCR)](https://www.bcb.gov.br/estabilidadefinanceira/micrrural), Banco Central do Brasil (BCB/Derop), em arquivos anuais por região, UF, município, programa, fonte de recursos e instituição financeira. Valores de crédito concedido, em reais nominais. Licença ODbL.

- **Série principal:** 2017–2025, em ano civil. Antes de 2017 há quebras de classificação e uma falha de cobertura em 2016.
- **Revisões:** a fonte é revisada diariamente; cada carga registra a data de coleta e o hash do arquivo.

Detalhes em [docs/fonte-dados.md](docs/fonte-dados.md).

## Arquitetura

```
Arquivos do BCB → pipeline (Python) → PostgreSQL → API (FastAPI) → site (React) → usuário
                                                     ↑
                                          assistente de IA (ferramentas fechadas)
```

| Camada | Tecnologia | Status |
| --- | --- | --- |
| Pipeline | Python, pandas, SQLAlchemy, pytest | **Pronto e testado** |
| Banco | PostgreSQL 16 — `sql/schema.sql` | **Pronto e testado** |
| Consultas | SQL — `sql/queries.sql` e a visão `credit_monthly_adjusted` | **Pronto e testado** |
| API | FastAPI, Pydantic, SQLAlchemy Core — `api/` | **Pronto e testado** |
| Assistente | Modelo de linguagem em plano gratuito (Gemini, com Groq e Cloudflare de reserva) e ferramentas sobre as consultas — `api/app/assistant/` | Implementado; avaliação em andamento (fase 6) |
| Site | React, Vite, TypeScript | Planejado (fase 7) |
| Publicação | Neon (banco), Render (API), Vercel (site), GitHub Actions | Planejado (fase 8) |

Detalhes, rotas da API e segurança em [docs/arquitetura-aplicacao.md](docs/arquitetura-aplicacao.md).

## Estrutura do repositório

| Caminho | Conteúdo | Status |
| --- | --- | --- |
| `docs/` | Escopo, fonte, dicionário, modelagem, arquitetura, qualidade e decisões | Pronto |
| `sql/schema.sql` | Estrutura do banco | Pronto e testado |
| `pipeline/` | Coleta, validação e carga | Pronto e testado |
| `sql/roles.sql` | Usuários do banco com permissões mínimas | Pronto e testado |
| `tests/` | Testes automatizados (pytest) | Pronto |
| `sql/queries.sql` | Uma consulta por pergunta, com valores nominais e corrigidos | Pronto e testado |
| `api/` | API FastAPI somente leitura, com testes em `api/tests` | Pronto e testado |
| `web/` | Site React | Planejado |
| `data/` | Arquivos baixados (fora do Git) | Local |

## Rodar localmente

Pré-requisitos: Docker e Python 3.12. Os comandos abaixo são do PowerShell, na pasta do projeto.

### 1. Banco de dados

```powershell
Copy-Item .env.example .env   # depois troque as senhas no .env
docker compose up -d
```

O PostgreSQL 16 sobe num contêiner, acessível só deste computador, e cria as tabelas de `sql/schema.sql` na primeira vez.

### 2. Usuários do banco

```powershell
$cfg = Get-Content .env -Raw | ConvertFrom-StringData
Get-Content sql\roles.sql -Raw | docker compose exec -T db psql -U postgres -d rural_credit -v ON_ERROR_STOP=1 -v loader_password="$($cfg.LOADER_PASSWORD)" -v api_reader_password="$($cfg.API_READER_PASSWORD)"
```

Cria `loader`, que o pipeline usa para gravar, e `api_reader`, que a API usa só para ler. Pode ser executado de novo para atualizar as senhas.

### 3. Pipeline

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r pipeline\requirements-dev.txt
.venv\Scripts\python -m pipeline.load 2013 2025
.venv\Scripts\python -m pipeline.ipca
.venv\Scripts\python -m pytest
```

O pipeline baixa os arquivos anuais do Banco Central, valida, agrega por estado e grava cada ano numa única transação, conferindo os totais até o centavo. Os 13 anos levam cerca de 3 minutos. `pipeline.ipca` baixa do IBGE o índice de inflação usado para corrigir os valores (preços de dez/2025).

O `pytest` roda os testes do pipeline e, com o banco no ar e carregado, também os testes das consultas (`tests/sql`), que conectam como `api_reader` e conferem se as partes somam o todo. Sem banco, esses testes aparecem como pulados, com o motivo.

### 4. API

```powershell
.venv\Scripts\python -m pip install -r api\requirements-dev.txt
.venv\Scripts\python -m uvicorn api.app.main:create_app --factory --port 8000
```

A documentação interativa fica em http://127.0.0.1:8000/docs (o endereço sem `/docs` também leva até ela). Se aparecer `No module named 'api'`, o comando foi rodado fora da pasta do projeto; se `/health` responder `unavailable`, o Docker está desligado. A API conecta como `api_reader` (senha do `.env`), só lê, aceita apenas `GET` e limita a 60 pedidos por minuto por cliente. Exemplo: http://127.0.0.1:8000/api/v1/states/PI/profile mostra o perfil do Piauí de 2017 a 2025.

O `pytest` passa a rodar também os testes da API (`api/tests`): validação dos filtros, formato dos erros, CORS e limite de pedidos sem banco; e, com o banco carregado, se as rotas concordam entre si. Os testes do assistente usam provedores simulados: não chamam nenhum modelo nem precisam de chave.

O assistente (`POST /api/v1/assistant/ask`) só responde com pelo menos uma chave gratuita no `.env` (`GEMINI_API_KEY`, `GROQ_API_KEY` ou `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`). Sem chave, ele responde 503 e o resto da API funciona normalmente.

## Plano de execução

1. **Escopo e documentação** — concluída
2. **Fonte, perfil dos dados e banco** — concluída
3. **Pipeline** de coleta, validação e carga, com testes — concluída
4. **Consultas SQL** e série do IPCA — concluída
5. **API** FastAPI com testes — concluída
6. **Assistente de IA** com ferramentas fechadas e avaliação
7. **Site** React
8. **Publicação** e integração contínua

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
