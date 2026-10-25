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

### D8 — Stack sem ferramentas extras

- **Decisão:** Python (requests, pandas, SQLAlchemy, psycopg, python-dotenv, pytest), PostgreSQL, Jupyter, Matplotlib.

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
- **Série prevista:** IBGE/SIDRA tabela 1737, variável 2266 (número-índice). A confirmar na implementação.

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
| P9 | Série e endereço do IPCA no SIDRA | Aberta | Necessária na fase de análise |
| P10 | Último mês disponível em 2026 | Aberta | Só para análises parciais |
