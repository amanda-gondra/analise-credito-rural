# Arquitetura da aplicação

O projeto deixa de terminar num notebook e passa a ser uma aplicação web pública: qualquer pessoa entra no site, escolhe período, estado, atividade e finalidade e vê a análise do crédito rural com dados oficiais do Banco Central.

**Status:** pipeline, banco, consultas, API, assistente e site prontos e testados (fases 3 a 7), rodando localmente. A publicação (fase 8) ainda não foi feita.

## Para quem é

| Público | O que quer saber |
| --- | --- |
| Produtor rural, consultor, técnico agropecuário | Quanto crédito vai para o meu estado e para a minha atividade, e como isso mudou |
| Jornalista, estudante, pesquisador | Números confiáveis, com fonte, método e download dos dados |
| Instituição financeira, analista do setor | Comparação entre estados, finalidades e programas |

## O que o usuário consegue fazer

| Página | Rota | Conteúdo |
| --- | --- | --- |
| Visão geral do Brasil | `/` | Indicadores do ano, mapa por UF com ranking, evolução anual (nominal e corrigida pelo IPCA), agricultura × pecuária e finalidades, sazonalidade e valor médio por contrato |
| Estados | `/estados` | Mapa e lista para escolher um estado |
| Estado | `/estados/:uf` | Indicadores, série, atividades, finalidades, sazonalidade, valor médio, programas e fontes de recursos |
| Comparar | `/comparar` | Regiões, ou dois a cinco estados lado a lado |
| MATOPIBA | `/matopiba` | Os quatro estados como região, participação no Brasil |
| Explorar dados | `/dados` | Filtros por ano, UF ou região, atividade, finalidade e programa; tabela paginada; download em CSV; rankings |
| Sobre os dados | `/sobre` | Fonte, data da coleta, período, limitações e método |

Os filtros ficam na URL, então um endereço copiado abre a mesma visão. O Assistente de Dados fica disponível em todas as páginas.

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
| Front-end | React 19, Vite 7, TypeScript, Tailwind CSS 4, React Router 7, TanStack Query 5, Recharts 3; Vitest e Playwright | Site estático que consome a API; gráficos declarativos; tokens visuais num único arquivo (D22, D23) |
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

Um parâmetro desconhecido ou fora da lista é recusado com 422, em vez de ser ignorado em silêncio. As respostas trazem os valores nominal e real juntos, por isso não há parâmetro para escolher entre eles. Participações dentro de um ano usam o valor nominal e somas de vários anos usam o real; os rankings ordenam e calculam a participação pela mesma regra (D26).

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
| `/api/v1/credit` | — | As linhas da base (mês × UF × atividade × programa × subprograma × fonte × finalidade), página por página, com o resumo da seleção inteira (`state` ou `region`, `activity`, `purpose`, `program`, `limit`, `cursor`) |
| `/api/v1/credit.csv` | — | As mesmas linhas em CSV, até 50.000 por arquivo (mesmos filtros, sem `limit` e `cursor`) |
| `/health` | — | Status da API e do banco (503 se o banco não responde) |

Toda rota de dados responde `{"data", "meta"}`. `meta` traz a fonte, o índice de preços (IPCA, preços de dez/2025) e os filtros aplicados, para que o site e o assistente citem o número com período e fonte (D17). A documentação interativa fica em `/docs` (gerada pelo FastAPI).

**Linhas da base (D21).** `/api/v1/credit` acrescenta `page` (`limit`, de 1 a 500, padrão 50; `next_cursor`, que vai como `cursor` no pedido da página seguinte, com os mesmos filtros; `csv_max_rows`) e `summary` (linhas, contratos e valor corrigido da seleção inteira). O cursor é a chave da última linha devolvida, então páginas seguintes custam o mesmo que a primeira. `/api/v1/credit.csv` é feito para planilhas em português: `;` entre campos, vírgula decimal, UTF-8 com BOM, cabeçalho em português e nome de arquivo com o recorte (por exemplo `credito-rural_2025-2025_pi_pecuaria.csv`). Textos que começam com `=`, `+`, `-` ou `@` recebem um apóstrofo, para a planilha não executá-los como fórmula. Uma seleção com mais de 50.000 linhas recebe 422 `export_too_large`, e a mensagem pede um período menor ou mais filtros.

## Assistente de IA (fase 6)

`POST /api/v1/assistant/ask` recebe `{"question": "...", "context": {...}, "previous_question": "..."}` e devolve a resposta em português, as linhas usadas (`sources[].data`), os filtros e o endereço da página do painel com o mesmo recorte (`panel_path`). Código em `api/app/assistant/`.

- `question`: 3 a 500 caracteres.
- `context` (opcional, D20): o que está na tela de quem pergunta, com `page` (`overview`, `state`, `compare`, `matopiba`, `data`, `about`), `state`, `states` (2 a 5), `region`, `activity`, `start_year` e `end_year`, validados contra as mesmas listas dos filtros. O site envia o contexto sozinho; ele só completa o que a pergunta deixa em aberto ("quanto foi para a pecuária?" na página do Piauí), e a pergunta sempre prevalece.
- `previous_question` (opcional, D28): a pergunta anterior da conversa, de 3 a 500 caracteres, para perguntas de continuação ("e o Ceará?"). A pergunta nova prevalece sobre ela, e ela sobre o contexto.

Antes de sair, cada número da resposta é conferido com os valores que as ferramentas devolveram (`grounding.py`, D27). Se um não confere, o modelo refaz a resposta uma vez; se ainda não conferir, a resposta é retida e o visitante recebe um texto fixo com o link do painel.

```
pergunta → modelo de linguagem → escolhe uma ferramenta → mesma consulta da rota → resultado
                    ↑                                                                 │
                    └──────────────────── escreve a resposta ─────────────────────────┘
```

| Peça | Arquivo | O que faz |
| --- | --- | --- |
| Ferramentas | `tools.py` | Uma por pergunta do plano; cada uma usa o mesmo filtro, a mesma consulta e o mesmo formato da rota correspondente. O modelo não escreve SQL nem vê o banco |
| Fora do escopo | `scope.py` | O modelo só classifica o tema (município, instituição, pessoa, juros, previsão, outro); o texto da recusa é fixo, sem números |
| Instruções | `prompt.py` | Números só das ferramentas e nenhuma conta do modelo, período padrão 2017–2025, uma base de valores por resposta (nominal num ano, corrigido em vários), resposta curta com fonte |
| Conferência | `grounding.py` | Confere se cada número da resposta é o arredondamento de um valor das ferramentas; usada pelo laço e pelo conjunto de avaliação |
| Provedores | `providers.py` | Gemini (formato próprio) e o formato chat/completions (Groq e Cloudflare); falhas viram `ProviderError` |
| Laço | `agent.py` | Até 3 rodadas de ferramentas; resposta conferida antes de sair (refeita uma vez ou retida); se um provedor falha, a pergunta recomeça no próximo; se todos falham, 503 |
| Limites | `quota.py` | Perguntas por visitante por minuto e por dia, e um teto diário do site, antes de chamar o modelo |

| Risco | Controle |
| --- | --- |
| Número inventado | Toda resposta vem com as linhas da consulta e o link do painel; as instruções proíbem números que não vieram de uma ferramenta e contas feitas pelo modelo; o código confere cada número antes de responder e retém a resposta que não confere (D27); o conjunto de avaliação (`api/evaluation/`) mede com as mesmas regras |
| Instrução escondida na pergunta | O modelo só tem ferramentas de leitura com filtros validados; o pior caso é uma resposta fora do assunto, nunca um acesso novo ao banco |
| Abuso e custo | Limites por visitante e do site, pergunta de até 500 caracteres, corpo de até 4 KB, tempo máximo por chamada; só planos gratuitos |
| Chaves | Só em variáveis de ambiente, enviadas no cabeçalho (nunca na URL) e fora dos logs |
| Privacidade | Os logs não guardam a pergunta nem a resposta; os dados enviados ao modelo são públicos e agregados por estado (D18) |
| Provedor fora do ar | Troca automática; sem nenhum provedor, `assistant_available` fica falso em `/api/v1/metadata` e o painel funciona normalmente |

## Site (fase 7)

Implementado em `web/`: React, TypeScript e Tailwind CSS, empacotado pelo Vite como site estático. Em desenvolvimento, o site roda em `127.0.0.1:5173` e o Vite repassa `/api`, `/health` e `/docs` para a API em `127.0.0.1:8000`, então o navegador fala com uma única origem; na publicação, `VITE_API_BASE_URL` aponta para a API.

| Pasta (`web/src/`) | O que tem |
| --- | --- |
| `api/` | Cliente HTTP com erros traduzidos para o português, tipos gerados do OpenAPI da API (`schema.d.ts`) e um hook do TanStack Query por rota |
| `lib/` | Formatação em pt-BR (moeda, porcentagem, datas no fuso de Brasília), listas do domínio (UFs, atividades, finalidades, regiões), filtros na URL, paleta de dados, escalas dos eixos |
| `components/` | Peças de interface (`ui/`), cabeçalho e estrutura (`layout/`), barra e painel de filtros (`filters/`), mapa por UF (`map/`), gráficos (`charts/`) e tabelas (`data/`) |
| `assistant/` | Estado da conversa, painel do computador, painel inferior do celular e o contexto da tela enviado à API |
| `pages/` | As sete páginas da tabela acima e a página de endereço não encontrado |
| `index.css` | Tokens de cor, sombra e tipografia (Tailwind `@theme`); as cores dos gráficos ficam em `lib/palette.ts` (D23) |

**Dados.** Todo número vem de uma rota da API; o site não calcula totais próprios nem usa dados de exemplo. Cada bloco tem estado de carregamento, de erro (com "Tentar novamente") e de vazio. Se a API demora mais de 5 s, um aviso explica que ela pode estar acordando (plano gratuito). As respostas ficam 10 minutos em memória, e um erro 4xx não é repetido.

**Filtros.** Período, atividade, finalidade, estado, região e aba ficam na URL. No computador, numa barra fixa abaixo do cabeçalho; abaixo de 1024 px, num botão "Filtros" com o número de filtros ativos, que abre um painel inferior, e os filtros ativos aparecem como etiquetas removíveis (D25).

**Valores.** Num ano só, o site mostra o valor concedido (nominal) ao lado do corrigido; em vários anos, só o corrigido, porque valores nominais de anos diferentes não se somam (D26).

**Mapa e gráficos.** O mapa por UF (D24) usa uma rampa de cor por atividade, identifica as 27 UFs (as pequenas com a sigla do lado de fora, ligada por uma linha; D29), aceita mouse, toque e teclado (setas entre estados vizinhos, Enter seleciona, Esc limpa) e vem com o ranking ao lado. A legenda conta as UFs de cada classe no recorte atual e destaca a classe da UF apontada ou selecionada, com uma frase que liga estado, porcentagem e faixa. Cada gráfico abre com uma frase de leitura tirada dos dados da API (D30), tem um resumo para leitores de tela e a tabela com os números ("Ver os números"). Os eixos usam valores redondos; as linhas têm o nome ou o valor escrito na ponta, não só a cor; categorias usam uma paleta validada para daltonismo (D23).

**Assistente de Dados.** Botão fixo em todas as páginas. No computador abre um painel flutuante ao lado do conteúdo, que pode ser minimizado; no celular, um painel inferior que acompanha o teclado virtual. A conversa continua ao fechar, minimizar ou trocar de página. Cada pergunta leva o contexto da tela (D20) e a pergunta anterior (D28); cada resposta mostra a data da coleta e o link para o mesmo recorte no painel. Sem provedor disponível, o painel avisa e o resto do site funciona.

**Acessibilidade.** Contraste AA no texto, foco visível em todos os controles, navegação por teclado (inclusive no mapa e no painel do assistente), rótulos nos botões só com ícone, animações desligadas para quem pede menos movimento.

**Testes.**

| Ferramenta | O que cobre |
| --- | --- |
| Vitest + Testing Library (`npm test`) | Formatação, filtros na URL, base de valores por período, classes do mapa (limites, arredondamento, contagem, sem registros), posição das siglas externas, escalas, frases de leitura dos gráficos, cliente da API e o fluxo do assistente (envio, erro, nova tentativa, contexto, pergunta anterior) |
| Playwright (`npm run e2e`) | As 8 páginas em 7 tamanhos de tela (320×640 a 1920×1080), sem rolagem horizontal e com capturas de tela; e 9 fluxos: menu, filtros no celular, assistente no celular e no computador, tabela e cartões com paginação e CSV, seleção no ranking, mapa pelo teclado, erros do assistente |

Os testes do Playwright usam a API local e o banco carregado; o assistente é simulado com uma resposta real gravada, para não gastar cota.

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
├── web/                      # site (React + Vite + TypeScript + Tailwind)
│   ├── src/                  # api, lib, components, assistant, pages
│   ├── e2e/                  # testes do Playwright
│   └── scripts/              # geração do mapa por UF a partir da malha do IBGE
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
| 7 | Front-end React com as páginas, o mapa e o Assistente de Dados; rotas da página "Explorar dados" (`/api/v1/credit` e CSV) e contexto da tela no assistente (D20 a D25) | 6 |
| 8 | Publicação (Neon, Render, Vercel) e CI no GitHub Actions | 7 |

Cada fase é feita um arquivo por vez, com explicação de cada parte.

## Fora do escopo desta versão

- Login, contas de usuário e dados privados.
- Análise por município ou por instituição financeira (os dados brutos permitem; planejada para a versão 1.1, D19).
- Inadimplência, juros e previsões (versão 2, D19).
- Atualização automática diária dos dados.
