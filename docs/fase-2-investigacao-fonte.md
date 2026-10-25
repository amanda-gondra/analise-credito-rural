# Fase 2 — Investigação da fonte

Registro do que foi testado em 23/10/2026, com URLs, parâmetros, resultados e evidências. As conclusões viram decisões em [decisoes-tecnicas.md](decisoes-tecnicas.md).

**Resultado:** a fonte escolhida são os arquivos anuais oficiais `MATRIZ_CR_REGIAO_<ano>.gz`. O OData funciona, mas falhou em 67% das consultas e não serve para coleta histórica.

## 1. Mecanismos de acesso testados

| Mecanismo | Status em 23/10/2026 | Veredito |
| --- | --- | --- |
| OData `RegiaoUF` | Responde, mas de forma instável: 55 de 168 consultas com HTTP 200 | Usado só como conferência |
| Arquivos anuais CSV/GZ da MDCR (nova disponibilização) | 14 arquivos listados (2013–2026); os 13 de 2013–2025 baixados com HTTP 200 em 5–10 s cada | **Fonte escolhida** |
| Navegador de dados do Olinda | Não utilizado: a documentação JSON do serviço trouxe os mesmos metadados | — |
| Microdados do Sicor | Arquivos por operação listados na página oficial | Fora do MVP (D1) |

### A. Serviço OData

Base: `https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata`

| Consulta | Resultado |
| --- | --- |
| `/$metadata` | HTTP 200 em 0,3 s; as 17 entidades da Fase 1 continuam disponíveis |
| `/RegiaoUF?$top=2&$format=json` | HTTP 200 com dados (o erro da Fase 1 não se repetiu nessa consulta) |
| `/RegiaoUF?$filter=AnoEmissao eq '2024' and MesEmissao eq '01'&$format=json` | HTTP 200, 1.462 registros, 538.094 bytes, 13,7 s |
| Mesmo filtro com `$top=1000` | HTTP 200, 1.000 registros |
| Mesmo filtro com `$skip=1000` | HTTP 500: o recurso é marcado como `naoPaginavel` na documentação |
| `$count=true` | HTTP 500: não suportado |
| `/Faixa?$top=2` | HTTP 500 |
| `CusteioRegiaoUFProduto` com `$select` | HTTP 500; sem `$select`, HTTP 200 |
| 11 meses de 2024, em sequência, com 3 tentativas cada | 1 sucesso (set/2024), 10 falhas HTTP 500 |
| Mapa de disponibilidade 2013-01 a 2026-12 (`$top=1`, 4 consultas paralelas, 3 tentativas) | 55 HTTP 200, 113 HTTP 500 |

**Causa provável dos erros 500:** o documento oficial *Esclarecimentos sobre a MDCR* informa que cada relatório tem limite de 60 segundos de execução. Consultas pesadas ou simultâneas estouram esse limite. As consultas paralelas do mapa de disponibilidade provavelmente agravaram as falhas.

### B. Arquivos anuais (nova disponibilização)

A página oficial `estabilidadefinanceira/micrrural` passou a oferecer "visões" com arquivos `.gz` por ano de emissão. Ela é montada por JavaScript. O endereço dos arquivos foi obtido pela mesma API de conteúdo que a página usa:

1. `GET https://www.bcb.gov.br/api/servico/sitebcb/conteudosite?identificador=matriz-dados-credito-rural`
   → `tronco = estabilidadefinanceira`, `guidLista = 2db313b7-6197-4dd7-aec3-c4fe8cca1d33`
2. `GET https://www.bcb.gov.br/api/servico/sitebcb/Documentos/byListGuid?tronco=estabilidadefinanceira&guidLista=2db313b7-6197-4dd7-aec3-c4fe8cca1d33&ordem=Title%20desc&pasta=%2Fregiao`
   → lista de arquivos com nome, tamanho, data de publicação e URL relativa
3. Download: `https://www.bcb.gov.br/content/estabilidadefinanceira/matriz-dados-credito-rural/regiao/MATRIZ_CR_REGIAO_<ano>.gz`

Visões disponíveis na página (parâmetro `pasta`):

| Pasta | Visão |
| --- | --- |
| `/regiao` | **1. Quantidade e Valor dos Contratos por Região, UF, Município, Programa, Fonte de Recursos e IF** (escolhida) |
| `/produto-municipio` | 2. Por Produto, Região, UF, Município, Programa e Fonte (semestre) |
| `/produto-regiao` | 3. Por Produto, Região, UF, Programa, Fonte e IF |
| `/tipo-pessoa` | 4. Por Tipo de Pessoa, Beneficiário, Gênero, Faixa etária, Região, UF, Programa, Fonte e IF |

Todos os 13 arquivos de 2013 a 2025 foram baixados em 23/10/2026 e estão em `data/raw/mdcr_regiao/`, com SHA-256 registrado.

**Os arquivos são regenerados:** a listagem diz "publicado em 28/06/2026", mas o cabeçalho gzip do arquivo de 2017 indica geração em 23/10/2026 e o de 2024 em 22/10/2026. Cinco arquivos (2018 a 2022) tinham tamanho diferente do informado na listagem. Isso confirma o aviso oficial de que a base é revisada diariamente.

## 2. Amostras obtidas

| Arquivo (em `data/raw/`) | Origem | Coleta | Registros |
| --- | --- | --- | --- |
| `regiao_uf/regiao_uf_2024_01.json` | OData `RegiaoUF`, jan/2024 | 23/10/2026 08:58 (UTC−3) | 1.462 |
| `regiao_uf/regiao_uf_2024_09.json` (+ `.meta.json`) | OData `RegiaoUF`, set/2024 | 23/10/2026 09:14 (UTC−3) | 1.865 |
| `activity_check/CusteioRegiaoUFProduto_2024_01.json` | OData, custeio por produto, jan/2024 | 23/10/2026 | — |
| `mdcr_regiao/MATRIZ_CR_REGIAO_2013.gz` … `_2025.gz` | Arquivos anuais | 23/10/2026 09:33–09:41 (UTC−3) | 310 mil a 559 mil por ano |

Documentos de referência em `data/reference/`: `definicoesCreditoRural.pdf` (esclarecimentos oficiais da MDCR), `manualDadosSicor_V6.pdf`, `documentacao.html` (documentação do OData), boletins Derop de dez/2023 e mar/2025, e o conteúdo das páginas oficiais.

## 3. Evidências principais

### Unidade monetária: reais

Os totais do arquivo de 2024 e de 2023, somados por finalidade, foram comparados com a tabela 3.2.1.3 do Anuário Estatístico do IBGE, cuja fonte é BCB/DSTAT e cujos valores estão "em R$":

| Ano | Finalidade | Arquivo MDCR | BCB/DSTAT (IBGE) | Diferença |
| --- | --- | --- | --- | --- |
| 2024 | Custeio | 208.794.260.184,06 | 207.889.150.663 | +0,44% |
| 2024 | Investimento | 105.365.118.258,22 | 100.193.593.053 | +5,16% |
| 2024 | Comercialização | 43.403.541.216,55 | 43.183.290.033 | +0,51% |
| 2024 | Industrialização | 22.429.762.669,71 | 21.762.471.202 | +3,07% |
| 2024 | **Total** | **379.992.682.328,54** | **373.028.504.952** | **+1,87%** |
| 2023 | **Total** | 406,61 bi | 404,96 bi | **+0,41%** |

Também foram conferidos os contratos de 2024 (2.329.765 contra 2.310.468, +0,84%) e o semestre jul–dez/2023 (R$ 262,70 bi contra os "R$ 261 bilhões" do Boletim Derop de dez/2023).

A ordem de grandeza confirma que os valores estão em reais. As diferenças são pequenas e todas positivas, o que é compatível com inclusões posteriores à extração do Anuário. A diferença de investimento em 2024 (+5,16%) é a maior e fica registrada para acompanhamento.

### Significado de `Atividade`: 1 = agrícola, 2 = pecuária

- **OData × produtos:** em `CusteioRegiaoUFProduto` (jan/2024), `Atividade = 1` tem 116 produtos (milho, soja, café, trigo, feijão…) e `Atividade = 2` tem 21 (bovinos, suínos, peixe, aves, ovinos…).
- **OData × arquivo anual:** jan/2024 agregado por UF × atividade × finalidade é **idêntico até o centavo** nas 212 células quando `1 = AGRÍCOLA` e `2 = PECUÁRIA` (rótulos oficiais do arquivo).
- Set/2024: 211 de 212 células idênticas. A única diferença (1 contrato de investimento agrícola no PA, R$ 155.458,19) é compatível com uma revisão entre a geração do arquivo (22/10) e a consulta ao OData (23/10).

### Granularidade e chave

- **OData `RegiaoUF`:** a combinação UF + ano + mês + programa + subprograma + fonte + atividade **não é única** (31 pares em jan/2024). Em cada par, uma linha traz custeio e/ou investimento e a outra traz comercialização e/ou industrialização, nunca a mesma finalidade. No formato longo, sem as células zeradas, a chave fica única.
- **Arquivo anual:** uma linha = mês de emissão × município × atividade × programa × subprograma × fonte de recursos × instituição financeira. A combinação `ANO_MES_EMISSAO + UF + COD_MUNICIPIO_IBGE + MUNICIPIO + ATIVIDADE + PROGRAMA + SUBPROGRAMA + FONTE_RECURSO + CNPJ_IF` é única em todos os anos de 2013 a 2025, com 0 repetições. Sem `MUNICIPIO`, 2013 tem 39 repetições: linhas do DF sem código IBGE, diferenciadas só pelo nome da região administrativa.
- Nenhuma linha totalmente duplicada em nenhum ano.

### Comparabilidade entre anos

| Ano | Linhas | Meses | Programas "NÃO INFORMADO" (% do valor) | Subprogramas distintos | Contratos de industrialização |
| --- | --- | --- | --- | --- | --- |
| 2013 | 413.959 | 12 | 56,0% | 7 | 0 |
| 2014 | 407.213 | 12 | 51,1% | 9 | 0 |
| 2015 | 385.763 | 12 | 1,9% | 45 | 0 |
| 2016 | 310.260 | 12 | 0% | 47 | 404 (a partir de jul) |
| 2017 | 420.078 | 12 | 0% | 43 | 698 |
| 2018–2025 | 428 mil a 559 mil | 12 | 0% | 41 a 52 | 829 a 1.868 |

**Falha de cobertura em 2016:** de março a junho, o número de linhas e de contratos cai para cerca de um terço do normal:

| Mês | Linhas 2015 | Linhas 2016 | Linhas 2017 | Contratos 2015 | Contratos 2016 | Contratos 2017 |
| --- | --- | --- | --- | --- | --- | --- |
| fev | 22.460 | 24.753 | 24.855 | 134.571 | 129.475 | 110.798 |
| mar | 27.672 | **9.225** | 32.985 | 165.282 | **21.506** | 157.824 |
| abr | 28.081 | **9.281** | 30.385 | 173.649 | **21.237** | 142.170 |
| mai | 30.534 | **16.534** | 36.715 | 183.017 | **44.963** | 180.879 |
| jun | 33.735 | **16.181** | 40.355 | 208.476 | **42.355** | 181.240 |
| jul | 28.196 | 24.708 | 28.490 | 196.993 | 169.252 | 175.138 |

A queda coincide com o surgimento da industrialização em julho/2016, o que sugere uma mudança no sistema. A causa não está documentada pela fonte.

## 4. Schema testado

Teste executado em PostgreSQL 16.15, num banco de desenvolvimento vazio.

| Teste | Resultado |
| --- | --- |
| `schema.sql` executado duas vezes seguidas | Sem erro (idempotente) |
| Referências carregadas | 27 UFs, 2 atividades, 4 finalidades |
| Carga de 2017 e 2024 (script de teste descartável, agregação em `Decimal`) | 17.912 e 23.403 linhas |
| Reconciliação fato × totais de controle do arquivo | Diferença R$ 0,00 e 0 contratos nos dois anos |
| Ano do fato × ano do arquivo | 0 divergências |
| 14 testes negativos (valor ou contrato negativo, linha zerada, mês 13, ano < 2013, UF, atividade e finalidade desconhecidas, arquivo órfão, PK duplicada, ano carregado duas vezes, SHA-256 inválido, exclusão de arquivo com fatos) | 13 rejeitados corretamente; 1 teste mal construído (casas decimais, ver abaixo) |
| Linha válida (controle positivo) | Aceita |
| Tamanho | 41.315 linhas = 18 MB (estimativa 2013–2025: cerca de 100 MB) |

**Casas decimais:** `NUMERIC(15,2)` arredonda em silêncio (1,005 vira 1,01). A fonte nunca tem mais de 2 casas (verificado em 2013–2025), mas o pipeline deve validar isso antes da carga. Regra registrada em [qualidade-dados.md](qualidade-dados.md).

O pipeline real de carga ainda não existe. O script de teste não faz parte do repositório.
