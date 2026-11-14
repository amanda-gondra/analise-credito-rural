# Análise de Crédito Rural

Aplicação web para consultar o crédito rural no Brasil com dados oficiais do Banco Central: quanto é concedido, para onde vai e como mudou ao longo dos anos. Qualquer pessoa escolhe período, estado, atividade e finalidade e vê os números, os gráficos e a fonte.

> **Status: Fase 7 concluída — site pronto, rodando localmente.** Os dados de 2013 a 2025 são baixados do Banco Central, validados e carregados no PostgreSQL com reconciliação até o centavo; o IPCA do IBGE permite mostrar valores corrigidos; as 11 perguntas têm consultas SQL testadas contra o banco, uma API somente leitura que as publica, um assistente de IA avaliado com 38 perguntas e um site em React, testado do celular de 320 px à tela de 1920 px. A publicação (fase 8) ainda não foi feita.

## O que o site oferece

- **Visão geral do Brasil:** mapa por estado, evolução anual, agricultura × pecuária, finalidades, sazonalidade e valor médio por contrato, em valores nominais e corrigidos pelo IPCA.
- **Página por estado:** série, composição, programas, fontes de recursos e posição no ranking.
- **Comparar** regiões ou estados e ver o **MATOPIBA** (Maranhão, Tocantins, Piauí e Bahia) como região.
- **Explorar os dados:** filtros por ano, UF ou região, atividade, finalidade e programa, tabela paginada e download em CSV.
- **Assistente de Dados:** responde perguntas em português com os números do banco, a data da coleta e um link para o mesmo recorte no painel; considera o que está na tela ("quanto foi para a pecuária?" na página do Piauí) e a pergunta anterior ("e o Ceará?"). Antes de responder, a API confere cada número com os dados consultados.
- **Sobre os dados:** fonte, data da coleta, método e limitações.

Os filtros ficam no endereço da página: um link copiado abre a mesma visão.

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
| Assistente | Modelo de linguagem em plano gratuito (Gemini, com Groq e Cloudflare de reserva) e ferramentas sobre as consultas — `api/app/assistant/` | **Pronto e avaliado** |
| Site | React, Vite, TypeScript, Tailwind CSS, Vitest, Playwright — `web/` | **Pronto e testado** |
| Publicação | Neon (banco), Render (API), Cloudflare Pages (site), GitHub Actions | Em andamento (fase 8) |

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
| `web/` | Site React, com testes em `web/src` (Vitest) e `web/e2e` (Playwright) | Pronto e testado |
| `data/` | Arquivos baixados (fora do Git) | Local |

## Rodar localmente

Pré-requisitos: Docker, Python 3.14 e, para o site, Node.js 22 e o Google Chrome (usado pelos testes de navegador). Os comandos abaixo são do PowerShell, na pasta do projeto.

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

A documentação interativa fica em http://127.0.0.1:8000/docs (o endereço sem `/docs` também leva até ela). Se aparecer `No module named 'api'`, o comando foi rodado fora da pasta do projeto; se `/health` responder `unavailable`, o Docker está desligado. A API conecta como `api_reader` (senha do `.env`), só lê, aceita `GET` (e `POST` apenas na rota do assistente) e limita a 60 pedidos por minuto por cliente. Exemplos: http://127.0.0.1:8000/api/v1/states/PI/profile mostra o perfil do Piauí de 2017 a 2025; http://127.0.0.1:8000/api/v1/credit.csv?state=PI&start_year=2025&end_year=2025 baixa as linhas do Piauí em 2025 num CSV que abre direto no Excel em português (até 50.000 linhas por arquivo).

O `pytest` passa a rodar também os testes da API (`api/tests`): validação dos filtros, formato dos erros, CORS e limite de pedidos sem banco; e, com o banco carregado, se as rotas concordam entre si. Os testes do assistente usam provedores simulados: não chamam nenhum modelo nem precisam de chave.

O assistente (`POST /api/v1/assistant/ask`) só responde com pelo menos uma chave gratuita no `.env` (`GEMINI_API_KEY`, `GROQ_API_KEY` ou `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`). Sem chave, ele responde 503 e o resto da API funciona normalmente. A chave do Gemini é criada no AI Studio num projeto **sem faturamento**, para continuar no plano gratuito.

### 5. Site

Com a API do passo 4 no ar, em outro terminal:

```powershell
Set-Location web
npm install
npm run dev
```

O site abre em http://127.0.0.1:5173 e repassa os pedidos `/api` para a API em `127.0.0.1:8000`, sem configuração de CORS. Sem chave de modelo no `.env`, o Assistente de Dados avisa que está indisponível e o resto do site funciona.

```powershell
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # Vitest: formatação, filtros, mapa, cliente da API e assistente
npm run build       # versão de produção em web/dist
```

Testes no navegador (Playwright, com o Chrome instalado): as 8 páginas em 7 tamanhos de tela, de 320×640 a 1920×1080, sem rolagem horizontal, e 9 fluxos (menu, filtros, assistente, tabela, CSV, mapa pelo teclado). Usam a API e o banco de verdade; só as respostas do assistente são simuladas, para não gastar cota. Como cada página faz vários pedidos e os testes rodam em paralelo, suba a API sem o limite de pedidos por minuto, só para isso:

```powershell
# terminal 1, na pasta do projeto
$env:RATE_LIMIT_PER_MINUTE = "0"; .venv\Scripts\python -m uvicorn api.app.main:create_app --factory --port 8000
# terminal 2, em web/
npm run e2e
```

As capturas de tela ficam em `web/test-results/visual`. `npm run api:types` regenera `src/api/schema.d.ts` a partir do OpenAPI da API, e `npm run shapes` regenera o mapa a partir da malha do IBGE.

### 6. Avaliação do assistente

```powershell
.venv\Scripts\python -m api.evaluation.run --provider gemini
```

Faz as 38 perguntas de `api/evaluation/cases.json` ao modelo real, com o banco local, e grava um relatório em `api/evaluation/reports/`. Cada caso confere três coisas: se o assistente usou a ferramenta e os filtros esperados; se cada número escrito na resposta é o arredondamento correto de um valor que veio do banco; e se as perguntas fora do escopo recebem a recusa do tema certo. Três casos testam o contexto da tela e as perguntas de continuação ("e o Ceará?"). Gasta cota gratuita, por isso não roda no `pytest`.

| Rodada (`gemini-3.5-flash-lite`) | Aprovados | Ferramenta certa | Números conferem | Recusas certas | Tempo mediano |
| --- | --- | --- | --- | --- | --- |
| [1ª, 06/11/2026](api/evaluation/reports/2026-11-06-gemini-gemini-3.5-flash-lite-run1.md) | 31 de 35 | 24 de 24 | 22 de 24 | 6 de 7 | 2,4 s |
| [2ª, 06/11/2026](api/evaluation/reports/2026-11-06-gemini-gemini-3.5-flash-lite-run2.md) | 35 de 35 | 25 de 25 | 25 de 25 | 7 de 7 | 2,5 s |
| [3ª, 09/11/2026](api/evaluation/reports/2026-11-09-gemini-gemini-3.5-flash-lite.md) | 38 de 38 | 25 de 25 | 25 de 25 | 7 de 7 | 2,5 s |

Na 3ª rodada a API já conferia cada número antes de responder (D27): uma resposta foi refeita pela conferência e nenhuma precisou ser retida. Os três casos de contexto e continuação passaram.

Na 1ª rodada o modelo cortou uma casa decimal (66,5% em vez de 66,6%), somou por conta própria um total que não veio do banco (R$ 50,9 bi; o certo é R$ 51,07 bi) e classificou "previsão do tempo" como previsão de crédito; uma pergunta falhou por limite de pedidos do plano gratuito. Entre as rodadas, as instruções passaram a proibir somas feitas pelo modelo e a exigir arredondamento, e cada tema de recusa ganhou uma descrição. As mudanças são gerais, mas a 2ª rodada usou as mesmas perguntas, e um modelo de linguagem não responde sempre igual: o resultado é uma medida deste conjunto, não uma garantia.

## Publicação

| Peça | Serviço (plano gratuito) | Configuração |
| --- | --- | --- |
| Banco | Neon, AWS US East (N. Virginia), PostgreSQL 16 | `scripts/setup_remote_database.py` e o pipeline |
| API | Render, região Virginia | `render.yaml` (Blueprint) e `.python-version` |
| Site | Cloudflare Pages | `web/public/_headers`: cabeçalhos de segurança |
| Verificação | GitHub Actions | `.github/workflows/ci.yml`: testes da API, do pipeline e do site a cada push |

Banco e API ficam na mesma região porque cada página faz várias consultas; o Neon tem São Paulo, mas o Render não. O Render só publica um commit da `main` depois que o GitHub Actions passa nele. Os nomes `analise-credito-rural` (Cloudflare Pages) e `analise-credito-rural-api` (Render) aparecem em `render.yaml` e em `web/public/_headers`; outro nome exige trocar os dois arquivos. Decisões em D15, D31 e D32.

As senhas e endereços do banco publicado ficam em `.env.production`, fora do Git, e nos painéis do Render e do GitHub. Nenhum segredo fica no código.

### 1. Banco (Neon)

No Neon, crie o projeto em **AWS US East 1 (N. Virginia)** com PostgreSQL 16. Em **Connect**, desligue **Connection pooling** e copie o endereço de conexão para `.env.production`, na pasta do projeto, numa linha `NEON_OWNER_URL=...`. Depois, com o Docker ligado:

```powershell
.venv\Scripts\python scripts\setup_remote_database.py
```

A rede do computador precisa permitir conexões de saída na porta 5432, a do PostgreSQL. Algumas redes (de faculdade, de empresa, alguns roteadores) só liberam as portas de sites; nelas a conexão é recusada, e a saída é rodar estes passos em outra rede, como o roteador do celular.

O script cria as tabelas (`sql/schema.sql`) e os usuários `loader` e `api_reader` (`sql/roles.sql`) no Neon, gera as senhas deles sem mostrá-las e grava em `.env.production` os endereços `DATABASE_URL` (carga) e `DATABASE_URL_READER` (leitura, para o Render). Pode ser executado de novo: mantém as senhas e não recria as tabelas. A carga usa o mesmo pipeline do banco local, só que apontado para o Neon nesta sessão do terminal:

```powershell
Get-Content .env.production | Where-Object { $_ -match '^DATABASE_URL(_READER)?=' } | ForEach-Object { $k, $v = $_ -split '=', 2; Set-Item "env:$k" $v }
.venv\Scripts\python -m pipeline.load 2013 2025
.venv\Scripts\python -m pipeline.ipca
.venv\Scripts\python -m pytest            # testes das consultas e da API contra o Neon, como api_reader
Remove-Item env:DATABASE_URL, env:DATABASE_URL_READER   # o terminal volta a usar o banco local
```

### 2. API (Render)

No Render, **New → Blueprint**, escolha este repositório e confirme o `render.yaml`. O painel pede dois segredos: `DATABASE_URL_READER` (de `.env.production`) e `GEMINI_API_KEY`. As chaves de reserva (`GROQ_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN`) podem ser acrescentadas depois em **Environment**. A API fica em `https://analise-credito-rural-api.onrender.com`; `/health` deve responder `{"status":"ok","database":"ok"}`.

O limite por visitante usa o cabeçalho `CF-Connecting-IP`, que o Cloudflare, na frente do Render, escreve em todo pedido; o `X-Forwarded-For` não é usado porque o visitante consegue falsificar o começo dele (D31).

### 3. Site (Cloudflare Pages)

Na Cloudflare, **Workers & Pages → Create → Pages → Connect to Git**, escolha este repositório e use:

| Campo | Valor |
| --- | --- |
| Project name | `analise-credito-rural` |
| Production branch | `main` |
| Framework preset | React (Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `web` |
| Environment variable | `VITE_API_BASE_URL=https://analise-credito-rural-api.onrender.com` |

O site fica em `https://analise-credito-rural.pages.dev`, a origem liberada no CORS da API (`ALLOWED_ORIGINS` em `render.yaml`). A versão do Node vem de `web/.node-version`. Os links diretos (`/estados/PI`) funcionam sem configuração: sem um `404.html`, a Cloudflare trata o site como aplicação de página única e devolve o `index.html`. O `web/public/_headers` define os cabeçalhos de segurança, entre eles a política de conteúdo que só deixa o site falar com a própria origem e com a API.

### 4. Verificação contínua (GitHub Actions)

A cada push e pull request, o GitHub Actions roda os testes do pipeline e da API e, no site, TypeScript, ESLint, Vitest e o build. Com o segredo de repositório `DATABASE_URL_READER` (em **Settings → Secrets and variables → Actions**), os testes das consultas também rodam contra o banco publicado; sem ele, aparecem como pulados. Os testes de navegador (Playwright) precisam da API e do banco, por isso rodam localmente.

## Plano de execução

1. **Escopo e documentação** — concluída
2. **Fonte, perfil dos dados e banco** — concluída
3. **Pipeline** de coleta, validação e carga, com testes — concluída
4. **Consultas SQL** e série do IPCA — concluída
5. **API** FastAPI com testes — concluída
6. **Assistente de IA** com ferramentas fechadas e avaliação — concluída
7. **Site** React com o Assistente de Dados — concluída
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
- No plano gratuito, a API leva cerca de um minuto para responder depois de um período sem acessos; o site avisa quando a resposta demora.
- O CSV aceita até 50.000 linhas por arquivo; a série inteira do país passa disso e precisa ser baixada por período ou por filtro.

## Referências

- [Matriz de Dados do Crédito Rural — Banco Central](https://www.bcb.gov.br/estabilidadefinanceira/micrrural)
- [Esclarecimentos sobre a MDCR (BCB)](https://www.bcb.gov.br/conteudo/mdcr/Documents/definicoesCreditoRural.pdf)
- [MDCR no Portal de Dados Abertos do BCB](https://dadosabertos.bcb.gov.br/dataset/matrizdadoscreditorural)
- [Anuário Estatístico do Brasil 2024, tabela 3.2.1.3 (IBGE, fonte BCB/DSTAT)](https://anuario.ibge.gov.br/images/aeb/2024/s3/2_pdf/s3t2103.pdf)

## Autora

Amanda Gondra — [github.com/amanda-gondra](https://github.com/amanda-gondra)
