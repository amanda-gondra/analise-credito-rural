# Dicionário de dados

Fonte: arquivos anuais `MATRIZ_CR_REGIAO_<ano>.gz` da MDCR (Banco Central), visão "Quantidade e Valor dos Contratos por Região, UF, Município, Programa, Fonte de Recursos e IF". Perfil feito sobre os 13 arquivos de 2013 a 2025, coletados em 23/10/2026.

Legenda de **status**:
- **Confirmado:** documentação oficial ou conferência numérica com fonte oficial.
- **Observado:** verificado em todos os arquivos, sem documentação oficial que o descreva.
- **Pendente:** não confirmado; não usar como base de cálculo definitivo.

## Formato do arquivo

| Item | Valor | Status |
| --- | --- | --- |
| Compressão | gzip, um CSV por arquivo | Observado |
| Codificação | UTF-8 com BOM | Observado |
| Separador de colunas | `;` | Observado |
| Separador decimal | `,` (sem separador de milhar) | Observado: todos os valores seguem `\d+(,\d+)?` |
| Cabeçalho | 25 colunas, idêntico em 2013–2025 | Observado |
| Linhas por arquivo | 310.260 (2016) a 558.707 (2024) | Observado |
| Valores ausentes | Nenhum, exceto `COD_MUNICIPIO_IBGE` vazio em 0 a 103 linhas por ano | Observado |

## Colunas

| Coluna original | Significado | Tipo observado | Unidade | Valores relevantes | Status | Tratamento planejado |
| --- | --- | --- | --- | --- | --- | --- |
| `ANO_MES_EMISSAO` | Mês de emissão da cédula de crédito | data `AAAA-MM-01` | — | 12 meses em todos os anos | Confirmado (documentação do OData: "ano de emissão da cédula") | Separar em `reference_year` e `reference_month` |
| `REGIAO` | Região | texto | — | NORTE, NORDESTE, SUDESTE, SUL, CENTRO-OESTE | Observado | Não carregado no fato; está em `ref_state` |
| `UF` | Unidade da federação, por extenso e em maiúsculas | texto | — | 27 valores, ex.: `PIAUÍ`, `SÃO PAULO` | Observado | Mapear para a sigla via `ref_state.state_name` |
| `COD_MUNICIPIO_IBGE` | Código IBGE do município | texto com sufixo `,0` (ex.: `2607109,0`) | — | Vazio em poucas linhas do DF | Observado; os 2 primeiros dígitos = código IBGE da UF | Não carregado no MVP (agregação por UF) |
| `MUNICIPIO` | Nome do município | texto, às vezes com espaços à direita | — | No DF, inclui a região administrativa: `BRASILIA (PLANALTINA)` | Observado | Não carregado no MVP |
| `ATIVIDADE` | Atividade do empreendimento financiado | texto | — | `AGRÍCOLA`, `PECUÁRIA` | Confirmado (bate até o centavo com o código do OData) | Mapear para `activity_code` 1 ou 2 |
| `PROGRAMA` | Programa ou linha de crédito | texto, até 99 caracteres | — | 13 a 21 por ano; `NÃO INFORMADO` vale 56% do valor em 2013 e 51% em 2014 | Observado | Carregar como texto |
| `SUBPROGRAMA` | Subprograma | texto, até 60 caracteres | — | Antes de 2015 só existem 7 a 9 valores e todo o valor está em `SEM SUBPROGRAMA` | Observado | Carregar como texto |
| `FONTE_RECURSO` | Fonte dos recursos | texto, até 84 caracteres | — | 19 a 25 por ano | Observado | Carregar como texto |
| `SEGMENTO_IF` | Segmento da instituição financeira | texto | — | 5 a 6 valores (banco público, cooperativa de crédito…) | Observado | Fora do MVP |
| `CNPJ_IF` | Raiz do CNPJ da instituição financeira | texto, 8 dígitos | — | 424 a 481 por ano | Observado | Fora do MVP |
| `NOME_IF` | Nome da instituição financeira | texto | — | Um nome por `CNPJ_IF` dentro de cada ano | Observado | Fora do MVP |
| `CUSTEIO_QTDE` | Quantidade de contratos de custeio | inteiro | contratos | ≥ 0 | Confirmado (bate com BCB/DSTAT) | `contract_count`, finalidade custeio |
| `CUSTEIO_VALOR` | Valor concedido em custeio | decimal, 2 casas | **R$ nominais** | ≥ 0 | Confirmado (reconciliação com BCB/DSTAT) | `credit_amount`, finalidade custeio |
| `INVESTIMENTO_QTDE` / `_VALOR` | Idem, investimento | inteiro / decimal | contratos / R$ | ≥ 0 | Confirmado | Idem |
| `COMERCIALIZACAO_QTDE` / `_VALOR` | Idem, comercialização | inteiro / decimal | contratos / R$ | ≥ 0 | Confirmado | Idem |
| `INDUSTRIALIZACAO_QTDE` / `_VALOR` | Idem, industrialização | inteiro / decimal | contratos / R$ | **Sempre zero antes de jul/2016** | Confirmado (valores); causa da ausência pendente | Idem |
| `CUSTEIO_AREA`, `INVESTIMENTO_AREA`, `TOTAL_AREA` | Área financiada | decimal, 2 casas | **Pendente** (provavelmente hectares) | ≥ 0 | Pendente | Fora do MVP |
| `TOTAL_QTDE` | Soma das quatro quantidades | inteiro | contratos | Igual à soma das 4 em 100% das linhas | Observado | Total de controle em `source_file` |
| `TOTAL_VALOR` | Soma dos quatro valores | decimal | R$ | Igual à soma dos 4 em 100% das linhas | Observado | Total de controle em `source_file` |

## Definições oficiais

Do documento *Esclarecimentos sobre a Matriz de Dados do Crédito Rural* (BCB):

- **Valor:** "refere-se ao crédito concedido, que é o montante de recursos liberados ao beneficiário e sobre o qual incorrerão as remunerações financeiras".
- **Revisões:** "uma mesma consulta feita em momentos distintos poderá trazer dados diferentes", por inclusões e exclusões na base. A página da MDCR diz que a base é atualizada diariamente.

## Granularidade

Uma linha do arquivo = **mês de emissão × município × atividade × programa × subprograma × fonte de recursos × instituição financeira**, com os valores das quatro finalidades em colunas.

Chave única verificada em todos os anos (0 repetições):
`ANO_MES_EMISSAO, UF, COD_MUNICIPIO_IBGE, MUNICIPIO, ATIVIDADE, PROGRAMA, SUBPROGRAMA, FONTE_RECURSO, CNPJ_IF`

`MUNICIPIO` é necessário porque algumas linhas do DF não têm código IBGE e se distinguem só pelo nome da região administrativa.

## Regras observadas (2013–2025)

| Regra | Resultado |
| --- | --- |
| Valores e quantidades negativos | Nenhum |
| `TOTAL_*` = soma das quatro finalidades | 100% das linhas |
| Quantidade > 0 com valor = 0 | 10 casos: 8 em 2014 e 2 em 2015 (alerta, não erro) |
| Valor > 0 com quantidade = 0 | Nenhum |
| Mais de 2 casas decimais | Nenhum |
| Linhas de outro ano dentro do arquivo | Nenhuma |
| Maior valor numa linha (`TOTAL_VALOR`) | R$ 0,25 bi (2015) a R$ 3,0 bi (2025) |

## Entidade OData `RegiaoUF` (referência)

Usada apenas como conferência. Mesmos conceitos, com outros formatos:

| Campo OData | Equivalente no arquivo | Diferença |
| --- | --- | --- |
| `nomeUF` | `UF` | Sigla (`PI`) em vez do nome |
| `cdEstado` | — | Código interno do BCB em ordem alfabética (AC = 1); **não** é o código IBGE |
| `Atividade` | `ATIVIDADE` | `1` / `2` em vez de `AGRÍCOLA` / `PECUÁRIA` |
| `cdPrograma`, `cdSubPrograma`, `cdFonteRecurso` | `PROGRAMA`, `SUBPROGRAMA`, `FONTE_RECURSO` | Códigos sem descrição em vez de nomes |
| `Vl*`, `Qtd*` | `*_VALOR`, `*_QTDE` | Mesmos valores (jan/2024 idêntico) |
| — | Município e IF | Não existem no OData |
