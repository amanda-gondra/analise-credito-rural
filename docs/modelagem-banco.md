# Modelagem do banco

Esquema em [`sql/schema.sql`](../sql/schema.sql), schema PostgreSQL `rural_credit`. Testado em PostgreSQL 16.15 com carga de 2017 e 2024 (resultados em [fase-2-investigacao-fonte.md](fase-2-investigacao-fonte.md#4-schema-testado)).

**Status:** o modelo foi validado contra os dados reais. Ele continua sujeito a revisão quando o pipeline e as consultas forem implementados.

## Visão geral

```
ref_state ─────┐
ref_activity ──┼──< credit_monthly >── source_file
ref_purpose ───┘
```

| Tabela | Objetivo | Granularidade (uma linha =) | Linhas |
| --- | --- | --- | --- |
| `ref_state` | Siglas, nomes como na fonte, código IBGE e região | uma UF | 27 |
| `ref_activity` | Rótulo da fonte ↔ código 1/2 do OData | uma atividade | 2 |
| `ref_purpose` | Finalidades e o prefixo das colunas na fonte | uma finalidade | 4 |
| `source_file` | Rastreabilidade e totais de controle | um arquivo anual carregado | 1 por ano |
| `credit_monthly` | Fato analítico | mês × UF × atividade × programa × subprograma × fonte × finalidade | ~235 mil (2013–2025) |

## Decisões de modelagem

### Por que não há tabela de staging linha a linha

Os arquivos `.gz` originais são preservados sem alteração em `data/raw/`, identificados por SHA-256 e com totais de controle gravados em `source_file`. Uma staging com todas as linhas da fonte teria cerca de 6 milhões de registros com nomes repetidos, só para duplicar o arquivo. A validação acontece no pipeline Python antes da carga, e a reconciliação em SQL compara o fato com os totais de controle.

Se no futuro uma análise precisar de município ou instituição financeira, basta reprocessar os arquivos brutos.

### Por que agregar por UF

Todas as perguntas do MVP são por ano, UF, atividade e finalidade. O nível de município e de instituição financeira levaria a tabela de cerca de 235 mil para mais de 6 milhões de linhas sem responder nada a mais. Programa, subprograma e fonte de recursos ficam no fato porque custam pouco e permitem análises futuras (ex.: participação do Pronaf).

### Formato longo (uma linha por finalidade)

Na fonte, as quatro finalidades são pares de colunas `<FINALIDADE>_QTDE` e `<FINALIDADE>_VALOR`. No fato, cada par vira uma linha com `purpose`, `contract_count` e `credit_amount`.

- **Vantagens:** `GROUP BY purpose` responde à pergunta 5 diretamente; uma finalidade nova vira linha, e não coluna nova.
- **Regra:** pares com quantidade 0 **e** valor 0 não são gravados. Eles só existem por causa do formato largo. O total é preservado (reconciliação com diferença zero).
- **Verificado:** na fonte, valor > 0 com quantidade 0 nunca ocorre. Quantidade > 0 com valor 0 ocorre em 10 linhas (8 em 2014, 2 em 2015); elas são mantidas, porque a regra só descarta 0/0.

### Chave primária de `credit_monthly`

`(reference_year, reference_month, state_abbr, activity_code, program_name, subprogram_name, funding_source_name, purpose)`

A unicidade é garantida pela construção: o pipeline agrupa exatamente por essas colunas. A chave da fonte (que inclui município e instituição) foi verificada como única em 2013–2025, então nenhuma linha legítima é somada por engano com outra.

### Nomes em vez de códigos

O arquivo anual não traz códigos para programa, subprograma e fonte; traz nomes. Eles ficam como `TEXT` no fato, sem tabelas de referência próprias, porque nenhuma pergunta do MVP precisa deles e as listas mudam entre anos. Para UF, atividade e finalidade, que são usadas em todas as consultas e precisam de valores controlados, existem tabelas de referência com chave estrangeira. Uma categoria desconhecida faz a carga falhar, em vez de entrar em silêncio.

### Tipos

| Dado | Tipo | Justificativa |
| --- | --- | --- |
| Valores em R$ | `NUMERIC(15,2)` | Precisão decimal exata. Suporta até R$ 9,99 trilhões por linha; o maior valor agregado observado é R$ 3,17 bi. A fonte tem no máximo 2 casas (verificado). |
| Quantidades | `INTEGER` | Maior total anual: 2,3 milhões de contratos |
| Ano e mês | `SMALLINT` separados | Evita inventar um dia; facilita filtrar ano civil e ano-safra |
| UF | `CHAR(2)` | Sigla de tamanho fixo |
| Nomes da fonte | `TEXT` | Até 99 caracteres; sem limite artificial |

`MONEY` foi descartado porque depende da configuração regional (`lc_monetary`).

### Restrições e o que cada uma impede

| Restrição | Impede | Base |
| --- | --- | --- |
| `contract_count >= 0`, `credit_amount >= 0` | Valores negativos | Nenhum negativo em 2013–2025; o conceito é crédito concedido |
| `credit_monthly_not_empty` | Linhas 0/0 | Regra de transformação |
| `reference_month BETWEEN 1 AND 12` | Mês inválido | — |
| `reference_year BETWEEN 2013 AND 2100` | Ano anterior ao Sicor | Sicor começa em 01/01/2013 |
| FKs para `ref_state`, `ref_activity`, `ref_purpose` | Categorias desconhecidas | 27 UFs e 2 atividades em todos os anos |
| FK para `source_file` com `ON DELETE RESTRICT` | Fato sem origem; apagar arquivo com fatos | Rastreabilidade |
| `UNIQUE (dataset, reference_year)` em `source_file` | Carregar o mesmo ano duas vezes | Idempotência |
| `file_sha256 ~ '^[0-9a-f]{64}$'` | Hash malformado | — |

`ON DELETE RESTRICT` foi escolhido em vez de `CASCADE`: para recarregar um ano, o pipeline apaga explicitamente os fatos e depois o arquivo, dentro de uma transação. Assim, nenhuma exclusão acontece por efeito colateral.

### Índices

Nenhum índice secundário. A chave primária já atende filtros por ano e mês, e o volume total (~100 MB) é pequeno. A decisão será revista com `EXPLAIN ANALYZE` quando `queries.sql` existir.

## Estratégia de carga (para a próxima fase)

1. Baixar o arquivo anual e calcular SHA-256 e totais de controle.
2. Validar (regras em [qualidade-dados.md](qualidade-dados.md)).
3. Agregar por UF, converter para o formato longo e remover pares 0/0.
4. Em uma única transação: apagar fatos e `source_file` do mesmo ano (se existirem), inserir `source_file`, inserir os fatos.
5. Reconciliar em SQL: soma do fato = `source_total_amount` e `source_total_qty`.

## Correção monetária (planejada, não implementada)

A tabela guarda apenas valores nominais. A versão real será calculada nas consultas (e servida pela API), nunca gravada por cima dos valores originais.

- **Índice:** IPCA mensal, número-índice (base dez/1993 = 100), IBGE/SIDRA tabela 1737, variável 2266. **A confirmar** na implementação.
- **Referência de preços:** dezembro de 2025.
- **Fórmula, por mês:** `valor_real = valor_nominal × (IPCA_dez2025 / IPCA_mês_de_emissão)`
- **Agregação:** corrigir cada mês antes de somar o ano.
