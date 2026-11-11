# Decisões técnicas

Formato de cada registro: contexto, decisão, alternativas e justificativa. Hipóteses ficam na seção de pendências, nunca como decisão. Decisões substituídas são mantidas, marcadas, para preservar o histórico.

## Decisões de escopo (definidas pela autora na Fase 2)

- **Ano civil** como referência principal.
- **Anos completos** no comparativo anual principal.
- **Valores nominais** na base, com análise complementar corrigida pelo IPCA.
- **Fonte oficial reproduzível** que ofereça os campos necessários.
- **Modelagem baseada nos dados e na granularidade reais.**

## Decisões confirmadas

### D1 — Usar a MDCR, e não os microdados do Sicor

- **Contexto:** as duas fontes vêm do Sicor. A MDCR é agregada; os microdados são por operação.
- **Decisão:** usar a MDCR.
- **Alternativas:** microdados do Sicor.
- **Justificativa:** as perguntas são por UF, ano, atividade e finalidade, nível que a MDCR já entrega.

### D2 — Arquivos anuais `MATRIZ_CR_REGIAO` como fonte principal *(substitui a D2 da Fase 1)*

- **Contexto:** a Fase 1 escolheu a entidade OData `RegiaoUF`. Na Fase 2 o OData falhou em 113 de 168 consultas, e o BCB passou a publicar arquivos anuais por visão.
- **Decisão:** usar a visão 1 da página da MDCR (`/regiao`), um arquivo `.gz` por ano.
- **Alternativas:** OData `RegiaoUF` (instável, sem paginação, códigos sem descrição); visões 2, 3 e 4 (por produto ou tipo de pessoa, desnecessárias para as perguntas).
- **Justificativa:** 13 requisições estáveis cobrem 2013–2025; os arquivos trazem nomes legíveis e batem com o OData até o centavo (jan/2024). O OData fica como conferência.

### D3 — Coleta por arquivo anual *(substitui a D3 da Fase 1)*

- **Decisão:** um download por ano, guardado sem alteração em `data/raw/mdcr_regiao/`, com SHA-256, data de coleta e data de geração (cabeçalho gzip) registrados em `source_file`.
- **Justificativa:** a base é revisada diariamente; o hash identifica exatamente qual versão gerou cada número.

### D4 — Separar dados brutos de dados tratados

- **Decisão:** brutos em `data/raw/` (fora do Git), dados tratados no PostgreSQL.
- **Justificativa:** reprocessar sem baixar de novo e auditar qualquer número até a origem.

### D5 — Valores monetários como `NUMERIC(15,2)`

- **Decisão:** `NUMERIC(15,2)`, em reais nominais.
- **Alternativas:** `DOUBLE PRECISION`, `MONEY`.
- **Justificativa:** a fonte tem no máximo 2 casas (verificado em 2013–2025); o maior valor agregado é R$ 3,17 bi, bem abaixo do limite do tipo. `MONEY` depende da configuração regional.

### D6 — Finalidade em formato longo no banco

- **Contexto:** a fonte traz as quatro finalidades como pares de colunas.
- **Decisão:** no fato, uma linha por finalidade (`purpose`, `contract_count`, `credit_amount`), sem gravar pares 0/0.
- **Justificativa:** consultas por finalidade sem `UNION`; total preservado (reconciliação com diferença zero em 2017 e 2024).

### D7 — MATOPIBA aproximado pelos estados inteiros

- **Decisão:** MATOPIBA = MA + TO + PI + BA completos.
- **Alternativa:** delimitação oficial por municípios (agora possível, porque o arquivo tem `COD_MUNICIPIO_IBGE`).
- **Justificativa:** mantém o MVP simples; a extensão municipal fica registrada como evolução.

### D8 — Stack sem ferramentas extras *(substituída pela D14 em 25/10/2026)*

- **Decisão original:** Python (requests, pandas, SQLAlchemy, psycopg, python-dotenv, pytest), PostgreSQL, Jupyter, Matplotlib.

### D9 — Série principal: 2017–2025

- **Contexto:** a autora pediu 2013 como início desejado, desde que disponível e comparável.
- **Decisão:** comparativo anual principal de **2017 a 2025**.
- **Justificativa:**
    - 2013–2015 não têm industrialização (finalidade presente em 7% do valor de 2023), e a maior parte do valor de 2013–2014 está sem programa informado.
    - 2016 tem falha de cobertura de março a junho (linhas e contratos caem para cerca de um terço).
    - 2017 é o primeiro ano completo com as quatro finalidades e classificações estáveis.
- **Uso de 2013–2016:** ficam no banco (os arquivos são válidos). Podem aparecer em análises separadas e identificadas, sem entrar na série principal.
- **2026:** apenas em análises separadas e marcadas como parciais.

### D10 — Agregação por UF, sem staging linha a linha

- **Decisão:** o fato `credit_monthly` agrega municípios e instituições dentro de cada UF; não há tabela de staging com as linhas da fonte.
- **Alternativa:** staging com ~6 milhões de linhas por município e instituição.
- **Justificativa:** as perguntas são por UF; os arquivos brutos preservados cumprem o papel de cópia fiel da fonte. Detalhes em [modelagem-banco.md](modelagem-banco.md).

### D11 — Código de atividade: 1 = agrícola, 2 = pecuária

- **Decisão:** `ref_activity` com `1 = AGRÍCOLA` e `2 = PECUÁRIA`.
- **Justificativa:** o arquivo anual traz os rótulos oficiais, e o OData com esses códigos bate até o centavo em jan/2024. A lista de produtos por código confirma o sentido.

### D12 — Correção monetária pelo IPCA, referência dez/2025

- **Decisão:** preservar os valores nominais na base. A análise real usará o IPCA mensal do IBGE, com cada mês corrigido para preços de dez/2025 antes da soma anual.
- **Fórmula:** `valor_real = valor_nominal × (IPCA_dez2025 / IPCA_mês)`.
- **Série:** IBGE/SIDRA tabela 1737, variável 2266 (número-índice, base dez/1993 = 100), confirmada em 05/11/2026; tabela `ipca_monthly`, carga em `pipeline/ipca.py`.

### D13 — O projeto é uma aplicação web pública

- **Contexto:** a autora quer um produto que qualquer pessoa use, e não só um repositório para avaliação técnica.
- **Decisão:** a entrega final é um site com back-end, front-end e banco de dados. O notebook deixa de ser a entrega principal.
- **Funcionalidades:** visão geral do Brasil, página por estado, comparação entre estados, MATOPIBA, exploração com filtros e download em CSV, página sobre os dados.
- **Detalhes:** [arquitetura-aplicacao.md](arquitetura-aplicacao.md).

### D14 — Stack da aplicação *(substitui a D8)*

- **Decisão:** pipeline e API em Python (FastAPI, Pydantic, SQLAlchemy Core, pytest); front-end em React + Vite + TypeScript; PostgreSQL 16; Docker Compose para o banco local; GitHub Actions para os testes.
- **Alternativas:** API em Node.js + Fastify (stack já conhecida pela autora); front-end em Next.js.
- **Justificativa:** uma única linguagem no back-end (pipeline e API); FastAPI valida as entradas e gera documentação OpenAPI; o front-end é estático e simples de publicar.

### D15 — Publicação em serviços gratuitos

- **Decisão:** banco no Neon, API no Render (web service gratuito), site no Vercel (Hobby).
- **Alternativa descartada:** PostgreSQL gratuito do Render, que expira 30 dias após a criação.
- **Consequência:** a API desliga após 15 min sem tráfego e leva cerca de 1 min para voltar; o site precisa mostrar um estado de carregamento claro.
- **Verificado em:** 25/10/2026 e 10/11/2026, nas páginas oficiais de cada serviço (o Neon passou de 0,5 GB para 1 GB por projeto em outubro de 2026). Configuração na D32.

### D16 — Separação de responsabilidades e acesso ao banco

- **Decisão:** o pipeline é o único que escreve no banco (usuário `loader`); a API usa um usuário só com `SELECT` (`api_reader`); o site só conversa com a API.
- **Justificativa:** uma falha ou ataque na API não consegue alterar os dados.

### D17 — Assistente de perguntas em linguagem natural (agente de IA)

- **Contexto:** além de filtrar o painel, a pessoa deve poder perguntar em português ("Quanto o Piauí recebeu para pecuária em 2024?") e receber a resposta com os números do banco.
- **Decisão:** o agente não escreve SQL. Ele escolhe entre ferramentas fechadas, uma por pergunta do [plano de análise](plano-analise.md), que executam as mesmas consultas de `sql/queries.sql` usadas pelo painel, com o usuário `api_reader`. Toda resposta traz o número, o período, a fonte, a data de coleta e um link que abre o painel com os mesmos filtros.
- **Fora do escopo:** perguntas sobre município, instituição financeira, pessoas ou empresas, juros, inadimplência, previsões ou outros assuntos recebem uma resposta específica, que explica o motivo e sugere o que o projeto mostra (lista no plano de análise).
- **Avaliação:** um conjunto de perguntas de teste com respostas conferidas direto no banco mede se o agente escolhe a ferramenta certa, acerta o número e recusa o que está fora do escopo. Implementado em `api/evaluation/` (35 casos); em 06/11/2026, com `gemini-3.5-flash-lite`, 31 de 35 na 1ª rodada e 35 de 35 na 2ª, depois de proibir somas feitas pelo modelo e exigir arredondamento (relatórios em `api/evaluation/reports/`).
- **Alternativa descartada:** gerar SQL livre a partir da pergunta (text-to-SQL). Mais flexível, mas difícil de auditar e mais exposto a respostas erradas e a abusos.

### D18 — Modelo de linguagem em planos gratuitos, com reserva

- **Decisão:** provedor principal Google Gemini (modelos Flash, plano gratuito); reservas Groq e Cloudflare Workers AI, também gratuitos e sem cartão. Se um provedor falhar ou atingir o limite, a chamada passa para o próximo.
- **Proteções:** as chaves ficam só nas variáveis de ambiente da API; limite diário de perguntas por visitante; tamanho máximo da pergunta; se todos os limites se esgotarem, o assistente avisa e o painel continua funcionando, porque não depende do modelo.
- **Privacidade:** no plano gratuito do Gemini, o conteúdo enviado pode ser usado pelo Google para melhorar seus produtos. Os dados do projeto são públicos e agregados por estado, sem dado pessoal; o site informa isso junto do assistente.
- **Risco aceito:** os planos gratuitos mudam sem aviso. A troca de provedor fica isolada em um único módulo.
- **Modelo escolhido:** `gemini-3.5-flash-lite`. Em 06/11/2026, com as 13 ferramentas, o `gemini-3.6-flash` levou de 11 a 14 s por chamada (uma passou de 30 s e outra voltou 503, sobrecarga), e o Flash-Lite levou cerca de 1 s escolhendo a mesma ferramenta com os mesmos filtros. Cada pergunta usa pelo menos duas chamadas. O modelo é configurável (`GEMINI_MODEL`) e o conjunto de avaliação mede se a troca piora o acerto.
- **Faturamento:** a chave do Gemini é criada num projeto do AI Studio **sem** faturamento; ligar uma conta de cobrança tira o projeto do plano gratuito.
- **Verificado em:** 05/11/2026 e 06/11/2026.

### D19 — Versões do projeto

- **Versão 1:** dados por estado, painel e agente com as 11 perguntas do plano de análise.
- **Versão 1.1:** tabelas já agregadas por município (município × ano × atividade × finalidade) e por instituição financeira (instituição × UF × ano × finalidade), a partir dos mesmos arquivos brutos. Estimativa: algumas centenas de milhares de linhas, dentro do limite gratuito do Neon.
- **Versão 2:** inadimplência do crédito rural por UF (SCR.data, outra base do Banco Central; mede a dívida em aberto, conceito diferente do crédito concedido), encargos financeiros por programa e previsão dos próximos meses com teste em anos anteriores e margem de incerteza.

### D20 — Contexto da tela nas perguntas ao assistente

- **Decisão:** `POST /api/v1/assistant/ask` aceita o campo opcional `context` com a página e os filtros em tela (`page`, `state`, `states`, `region`, `activity`, `start_year`, `end_year`). Cada campo é validado contra as mesmas listas fechadas dos filtros das rotas (`extra="forbid"`), então a linha entregue ao modelo só contém palavras conhecidas, nunca texto livre.
- **Regra do prompt (regra 8):** o contexto só preenche o que a pergunta deixa em aberto ("este estado", "no período"); o que a pergunta diz sempre prevalece, e a resposta nomeia o recorte que usou do contexto.
- **Verificado em:** 08/11/2026. "Quanto foi para a pecuária?" com o contexto da página do Piauí em 2025 foi respondida para o Piauí em 2025, com a ferramenta `yearly_totals` e os filtros `state=PI`, `activity=livestock` e período 2025.
- **Alternativa descartada:** mandar a URL da página. Ela pode trazer qualquer texto e exigiria interpretar parâmetros no prompt.

### D21 — Linhas da base: paginação por chave e CSV

- **Decisão:** `GET /api/v1/credit` devolve as linhas de `credit_monthly` na ordem da chave primária, com paginação por chave (o cursor é a chave da última linha, em base64url, validado como os demais parâmetros). `GET /api/v1/credit.csv` devolve as mesmas linhas para planilhas em português: `;` entre campos, vírgula decimal, UTF-8 com BOM, e apóstrofo antes de textos que começam com `=`, `+`, `-`, `@`, tabulação ou retorno de carro.
- **Limites:** até 500 linhas por página; até 50.000 linhas por arquivo. Acima disso a API responde 422 `export_too_large` antes de ler as linhas. Contagem de 08/11/2026: a série 2017–2025 inteira tem 174.511 linhas; 2025 sozinho, 22.119; a maior UF na série principal (MG), 13.908.
- **Justificativa:** com `OFFSET`, cada página seguinte custa mais e uma recarga da fonte pode pular ou repetir linhas. Com a chave, o PostgreSQL usa o índice da chave primária (plano verificado com `EXPLAIN ANALYZE` em 08/11/2026, a partir do meio da série: `Index Scan using credit_monthly_pkey`, execução em 2,7 ms no banco local).

### D22 — Stack do site

- **Decisão:** Vite 7, React 19, TypeScript 5.9, Tailwind CSS 4 (tokens em `@theme`), TanStack Query 5, React Router 7, Recharts 3, fonte Public Sans servida pelo próprio site. Tipos da API gerados do OpenAPI com `openapi-typescript`.
- **Testes:** Vitest 5 com Testing Library (unidade e componentes) e Playwright usando o Chrome já instalado (canal `chrome`, sem baixar navegador), contra a API local e o banco carregado.

### D23 — Identidade visual

- **Logo:** a imagem oficial, só recortada nas margens brancas, com o fundo branco convertido em transparência (as cores e as proporções não mudam). Por isso o cabeçalho é branco: um cabeçalho escuro exigiria uma versão clara do logo, que seria redesenho. Favicon: o símbolo do próprio logo, recortado.
- **Paleta de interface:** verde-floresta `#174B32` (ação principal, cabeçalho do assistente), azul-petróleo `#315B6B` (avisos informativos e pecuária), verde médio `#78A85A` só decorativo (contraste 2,78 no branco), fundo `#F7F8F4`, texto `#202923`, texto secundário `#5F6A63` (ajustado de `#69746D` para passar de 4,5:1 também sobre o fundo e as superfícies cinza). Sem roxo.
- **Cores de dados:** agricultura `#4F7F2D` e pecuária `#315B6B` (diferença CIEDE2000 de 36,5 em deuteranopia); três rampas de seis classes com os mesmos passos de luminosidade OKLCH (total em verde-floresta, agricultura em verde-folha, pecuária em petróleo); paleta de categorias para finalidades, regiões e estados, nunca no mesmo gráfico que agricultura e pecuária. Validadas com o verificador de paletas e de contraste em 08/11/2026.
- **Paleta de categorias (revista em 09/11/2026):** azul `#2B73A8`, laranja `#D9732C`, verde-água `#1F9A8A`, ocre `#B8860B` e rosa `#C4527A`, sempre nessa ordem (a cor segue a categoria, não a posição no ranking). Substitui a terracota, marrom, mostarda, grafite e vinho, que eram quase todos tons quentes e escuros, difíceis de separar entre si. Verificador de paletas: menor diferença entre cores vizinhas de 11,6 em daltonismo simulado e 18,5 em visão normal; todas com contraste de pelo menos 3:1 no branco. As regiões têm cor fixa (`REGION_COLOR`), a mesma nos gráficos de Comparar e na página Estados. O verde fica para o que é da marca e para as séries únicas.

### D24 — Mapa por UF

- **Decisão:** malha de UFs do IBGE de 2022 (API de malhas v3, qualidade intermediária), simplificada sem separar fronteiras vizinhas e projetada na cônica equivalente de Albers (paralelos −2° e −22°), para que a área dos estados seja comparável. O arquivo é gerado por `web/scripts/build-uf-shapes.mjs` e versionado. Ilhas que somem na escala do mapa (como Fernando de Noronha) ficam de fora do desenho.
- **Classes:** participação no total em seis classes fixas, iguais para qualquer período e atividade: menos de 0,5%; 0,5% a 0,9%; 1,0% a 2,4%; 2,5% a 4,9%; 5,0% a 9,9%; 10% ou mais. A UF é classificada pelo valor que aparece na tela (uma casa decimal, o mesmo arredondamento de `formatPercent`), para que "0,5%" nunca caia em "menos de 0,5%". Os rótulos antigos ("0,5% a 1%", "1% a 2,5%") deixavam o limite ambíguo e foram trocados em 09/11/2026.

### D25 — Navegação e assistente em telas pequenas

- **Navegação:** um único mecanismo. Abaixo de 1024 px, cabeçalho compacto com botão "Menu" que abre os links num painel lateral. Navegação inferior descartada: seis seções de uso parecido não justificam uma barra fixa que disputaria espaço com o botão do assistente.
- **Assistente:** botão flutuante em todas as páginas, acima da área segura da tela. No computador mostra o nome; no celular é um círculo de 56 px com o nome como rótulo acessível. No computador o painel flutua sem bloquear a página; no celular é um painel inferior que acompanha a área visível (`visualViewport`), para o campo de digitação ficar acima do teclado também no Safari do iOS. A conversa sobrevive a fechar, minimizar e trocar de página.
- **Filtros no celular:** botão "Filtros" com o número de filtros ativos, painel inferior com os controles e os filtros ativos como etiquetas removíveis. Os valores ficam na URL.

### D26 — Uma base de valores por período (rankings e site)

- **Decisão:** os rankings (`state_ranking`, `program_ranking`, `funding_source_ranking`) ordenam e calculam a participação pelo valor nominal quando o período é um ano só, e pelo valor corrigido quando são vários, como as demais participações (convenção de `sql/queries.sql`). O site mostra o mesmo valor que ordenou o ranking: "Valor concedido" (nominal) num ano só, "Valor corrigido" em vários anos, e deixa de mostrar somas e médias nominais de vários anos (em 2017–2025, o valor médio por contrato aparecia como R$ 134,9 mil nominais ao lado de R$ 163,3 mil corrigidos).
- **Efeito medido (09/11/2026):** no ranking de estados de 2025, a participação muda no máximo 0,01 ponto percentual e nenhuma UF troca de posição. É coerência, não mudança de resultado.
- **Contrato da API:** os campos continuam os mesmos; muda o cálculo de `share_pct` e de `position` num ano só (API 1.3.0).

### D27 — Conferência dos números do assistente

- **Decisão:** antes de uma resposta sair da API, cada número escrito nela precisa ser o arredondamento de um valor devolvido pelas ferramentas (`api/app/assistant/grounding.py`, as mesmas regras do conjunto de avaliação). Se um não for, o modelo refaz a resposta uma vez, sem ferramentas e com a lista dos números que não conferiram; se ainda houver um, a resposta é retida e o visitante recebe um texto fixo com o link do painel.
- **Instruções:** uma base de valores por resposta (nominal num ano só, corrigido em vários) e nenhuma conta do modelo: somas, diferenças, médias, razões e porcentagens só quando vêm prontas de uma ferramenta.
- **Não conferidos:** anos e números inteiros de 1 a 31 sem unidade (posição, quantidade de UFs, meses). Dinheiro, contratos e porcentagens sempre são conferidos.
- **Alternativa descartada:** só reforçar as instruções. O modelo de linguagem não responde sempre igual, e uma regra no prompt não garante o número; a conferência no código garante que nenhum número fora dos dados chegue ao visitante.
- **Custo:** uma chamada a mais ao modelo só quando a primeira resposta não confere.

### D28 — Perguntas de continuação

- **Decisão:** `POST /api/v1/assistant/ask` aceita o campo opcional `previous_question` (3 a 500 caracteres), que o site preenche com a pergunta anterior da conversa. O modelo a recebe numa linha própria antes da pergunta, sem quebras de linha nem colchetes, e só a usa para completar o que a pergunta nova deixa em aberto ("e o Ceará?", "e em 2024?"). A pergunta nova prevalece sobre a anterior, e a anterior sobre o contexto da tela.
- **Alternativa descartada:** mandar a conversa inteira. Mais texto livre por pedido, mais custo de cota e mais espaço para instruções escondidas, sem ganho para as perguntas de continuação, que dependem só da anterior.

### D29 — Siglas de todas as UFs e legenda que explica a cor

- **Siglas:** as UFs grandes têm a sigla dentro da forma. As que não comportam a sigla (RN, PB, PE, AL, SE, ES, RJ e DF) têm a sigla do lado de fora, numa coluna no mar ou ao lado do estado, ligada ao centro da UF por uma linha fina. As posições são espalhadas por código (`calloutPositions`) para que as siglas nunca se toquem em nenhum tamanho de fonte usado pelo mapa (testado de 9 a 22 px). A sigla externa também é clicável. O mapa não foi reduzido: a área de desenho só ganhou uma faixa à direita para a coluna de siglas.
- **Legenda:** cada classe mostra quantas UFs estão nela no recorte atual; uma linha "sem registros" aparece se alguma UF não tiver dados. Ao passar o cursor, focar ou selecionar uma UF (no mapa ou no ranking), a classe dela é destacada na legenda com a sigla e a porcentagem, e uma frase diz a relação inteira, por exemplo "Minas Gerais: 12,7% do total do Brasil em 2017–2025, na faixa de 10% ou mais". A frase é anunciada a leitores de tela. A faixa também aparece na dica do mapa, no cartão da UF selecionada e no ranking (quadrado da cor da classe).
- **Dados:** a participação vem da API (`share_pct` do ranking de estados, já com os filtros de período, atividade e finalidade); o site só escolhe a classe. Conferido em 09/11/2026 contra a API em cinco recortes (2017–2025; 2025; 2025 pecuária; 2017 investimento; 2019–2021 agricultura e comercialização): as 27 UFs na classe certa e as contagens da legenda iguais às da API.

### D30 — Anatomia dos gráficos e frase de leitura

- **Anatomia:** linhas retas de 2 px com um ponto por ano (anel branco) e o último valor escrito na ponta, ligado ao ponto por um traço curto da cor da série quando precisa ser afastado de outro rótulo; barras de no máximo 32 px, cantos arredondados só na ponta do dado e 2 px de branco entre as partes empilhadas; grade fina; texto sempre na cor do texto, nunca na cor da série; legenda com a mesma marca do gráfico (traço com ponto para linha, quadrado para barra); dica com o valor primeiro. Um eixo só: não há gráfico com duas escalas.
- **Frase de leitura:** cada cartão de gráfico abre com uma frase que diz o principal (na página de Minas Gerais: "Em 2025, custeio teve a maior parte: 55,8%; investimento, 22,6%."). A frase só escolhe valores que a API devolveu (a linha do ano final, o maior de uma lista) e não faz conta; sem os dados, não aparece (`components/charts/readings.ts`, com testes).
- **Desvio da referência visual:** a página do estado não tem um gráfico "estado contra Brasil" com duas escalas. A comparação fica na participação no Brasil, que já é a razão entre os dois.

### D31 — Quem é o visitante atrás do proxy

- **Problema (P13):** no Render, a conexão que chega à API é do proxy, igual para todos os visitantes; sem outra informação, o limite de pedidos e a cota do assistente valeriam para o site inteiro.
- **Decisão:** a variável `CLIENT_IP_HEADER` diz qual cabeçalho traz o endereço do visitante; no Render, `CF-Connecting-IP`, que o Cloudflare (na frente do Render) escreve em todo pedido, apagando o que o visitante tenha mandado. Sem a variável (uso local), vale o endereço da conexão. A regra fica em `api/app/client_ip.py` e é a mesma para o limite de pedidos e para a cota do assistente.
- **Alternativa descartada:** `X-Forwarded-For`, o cabeçalho mais comum. O proxy do Render mantém o que o visitante escreve no começo dele e só acrescenta ao final; um script poderia ganhar um limite novo a cada pedido trocando esse valor. A configuração recusa `X-Forwarded-For`, `Forwarded` e `X-Real-IP`, e o Uvicorn roda com `--no-proxy-headers`.
- **Detalhes:** cabeçalho ausente, repetido ou com valor que não é endereço faz a API usar o endereço da conexão (o limite volta a valer para o site inteiro, nunca some) e registrar um aviso uma vez no log; endereços IPv6 contam por rede /64, porque uma conexão costuma receber a rede inteira. O limite subiu de 60 para 120 pedidos por minuto no Render: uma página faz de 5 a 8 pedidos, e quem troca filtros várias vezes num minuto não deve receber 429.
- **Verificação:** testes com cabeçalhos falsificados (`api/tests/test_api_client_ip.py`) e um ensaio com o servidor real e o comando de início do Render: `X-Forwarded-For` diferente a cada pedido não deu limite novo, e dois visitantes tiveram limites separados.

### D32 — Configuração da publicação

- **Regiões:** banco no Neon em AWS US East 1 (N. Virginia) e API no Render em Virginia. Cada página faz várias consultas ao banco, então banco e API ficam juntos; o Neon tem São Paulo, mas o Render não, e separar os dois somaria a distância a cada consulta. Para quem acessa do Brasil, a distância até a Virginia fica em torno de 120 ms por pedido.
- **Banco:** PostgreSQL 16, o mesmo do Docker local. `scripts/setup_remote_database.py` cria as tabelas e os usuários no Neon com os mesmos `schema.sql` e `roles.sql`, gera as senhas sem mostrá-las e grava os endereços em `.env.production` (fora do Git). A carga é o mesmo pipeline do banco local. Conexão direta, não o pooler do Neon (PgBouncer em modo transação), que não serve para `COPY` nem para os comandos do `psql`; a API mantém até 5 conexões, abaixo do limite de 10 do `api_reader`.
- **Ensaio:** antes do Neon, o processo inteiro (script, carga de 2013 a 2025 e IPCA, testes) rodou num PostgreSQL 16 descartável: 279 testes passaram contra ele, incluindo a conferência dos números com os arquivos de origem.
- **API:** `render.yaml` (Blueprint) com plano gratuito, Python de `.python-version` (3.14), verificação de saúde em `/health` e publicação automática só depois que o GitHub Actions passa no commit (`autoDeployTrigger: checksPass`). Segredos (`DATABASE_URL_READER`, `GEMINI_API_KEY`) são pedidos pelo painel do Render e nunca aparecem no arquivo. Mudanças só no site ou nos testes não publicam a API (`buildFilter`).
- **Site:** `web/vercel.json` devolve `index.html` para qualquer endereço que não seja arquivo (P16) e envia cabeçalhos de segurança: política de conteúdo (scripts só da própria origem; conexões só com a própria origem e com a API; nenhum quadro), `nosniff`, política de referência e de permissões. Os arquivos de `/assets/` têm nome com hash e ficam em cache por um ano.
- **CI:** `.github/workflows/ci.yml` roda o `pytest` e, no site, TypeScript, ESLint, Vitest e build, com permissão só de leitura no repositório. Com o segredo `DATABASE_URL_READER`, os testes das consultas rodam contra o banco publicado. Os testes de navegador continuam locais: precisam da API e do banco carregados.

## Pendências

| # | Pendência | Status | Impacto |
| --- | --- | --- | --- |
| P1 | Consultas ao OData com HTTP 500 | **Resolvida:** fonte trocada (D2) | — |
| P2 | Significado de `Atividade` | **Resolvida** (D11) | — |
| P3 | Unidade dos valores | **Resolvida:** reais (reconciliação ±2% com BCB/DSTAT) | — |
| P4 | Formato da UF | **Resolvida:** sigla no OData, nome por extenso no arquivo; mapeamento em `ref_state` | — |
| P5 | Chave lógica | **Resolvida:** chave da fonte única em 2013–2025; chave do fato por construção | — |
| P6 | Revisão retroativa dos dados | **Confirmada:** a base é revisada diariamente; tratada com SHA-256 e data de coleta | — |
| P7 | Referência oficial para reconciliação | **Resolvida:** tabela BCB/DSTAT no Anuário IBGE (2023, 2024) e Boletim Derop | — |
| P8 | Causa da quebra de 2016 | Aberta | Só explicativo; o tratamento já está decidido (D9) |
| P9 | Série e endereço do IPCA no SIDRA | **Resolvida:** tabela 1737, variável 2266 (D12) | — |
| P10 | Último mês disponível em 2026 | Aberta | Só para análises parciais |
| P11 | Tabela do IPCA no banco (estrutura e carga) | **Resolvida:** `ipca_monthly` no `schema.sql` e `pipeline/ipca.py` (fase 4) | — |
| P12 | Criação dos usuários `loader` e `api_reader` | **Resolvida:** `sql/roles.sql` (fase 3) | — |
| P13 | Limite de 60 pedidos por minuto por visitante | **Resolvida no código** (D31): visitante pelo `CF-Connecting-IP`, 120 pedidos por minuto no Render; falta conferir no Render publicado | — |
| P14 | Assistente misturando valores nominais e corrigidos numa mesma resposta e calculando participações | **Resolvida** (D27) | — |
| P15 | Participação do ranking de um único ano calculada sobre valores corrigidos | **Resolvida** (D26) | — |
| P16 | Links diretos para páginas do site publicado (`/estados/PI`) | **Resolvida no código** (D32): `web/vercel.json`; falta conferir no Vercel publicado | — |
