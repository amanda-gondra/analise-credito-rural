# Fonte de dados

Última verificação: 23/10/2026. Evidências e testes em [fase-2-investigacao-fonte.md](fase-2-investigacao-fonte.md); campos em [dicionario-dados.md](dicionario-dados.md).

## Fonte escolhida

**Matriz de Dados do Crédito Rural (MDCR)**, Banco Central do Brasil (BCB/Derop), visão *"Quantidade e Valor dos Contratos por Região, UF, Município, Programa, Fonte de Recursos e IF"*, em arquivos anuais:

```
https://www.bcb.gov.br/content/estabilidadefinanceira/matriz-dados-credito-rural/regiao/MATRIZ_CR_REGIAO_<ano>.gz
```

| Item | Valor | Status |
| --- | --- | --- |
| O que mede | Crédito rural **concedido** (recursos liberados ao beneficiário) | Confirmado (documento oficial) |
| Formato | CSV dentro de `.gz`; `;` como separador; vírgula decimal; UTF-8 com BOM | Observado |
| Arquivos | Um por ano de emissão, de 2013 a 2026 | Confirmado (listagem oficial) |
| Tamanho | 11 a 21 MB compactado; até 179 MB descompactado | Observado |
| Granularidade | Mês × município × atividade × programa × subprograma × fonte × instituição financeira | Observado em 2013–2025 |
| Unidade dos valores | Reais nominais | Confirmado (reconciliação com BCB/DSTAT, ±2%) |
| Atualização | A base é revisada diariamente e os arquivos são regenerados | Confirmado (página oficial + cabeçalho gzip) |
| Licença | ODbL (catálogo de dados abertos da MDCR) | Confirmado |
| Responsável | BCB/Derop, contato sicor.derop@bcb.gov.br | Confirmado |

### Como obter a lista de arquivos

A página oficial monta os links por JavaScript. A mesma lista vem da API de conteúdo do site:

```
GET https://www.bcb.gov.br/api/servico/sitebcb/Documentos/byListGuid
    ?tronco=estabilidadefinanceira
    &guidLista=2db313b7-6197-4dd7-aec3-c4fe8cca1d33
    &ordem=Title%20desc
    &pasta=%2Fregiao
```

A resposta traz `Nome`, `Tamanho`, `DataPublicacao` e `Url` de cada arquivo. O `guidLista` vem de `.../conteudosite?identificador=matriz-dados-credito-rural`. Essa API não é documentada como serviço público e pode mudar; se mudar, os arquivos continuam no endereço acima.

### Por que esta fonte

| Critério | Arquivos anuais | OData `RegiaoUF` |
| --- | --- | --- |
| Estabilidade em 23/10/2026 | 13 de 13 downloads com sucesso (2013–2025) | 55 de 168 consultas com sucesso |
| Requisições para 2013–2025 | 13 | 156 (uma por mês, sem paginação) |
| Atividade, programa e fonte | Nomes legíveis | Códigos sem descrição |
| Município e instituição | Sim | Não |
| Coerência com o OData | Jan/2024 idêntico até o centavo | — |

## Links consultados

| Link | Resultado (23/10/2026) |
| --- | --- |
| https://www.bcb.gov.br/estabilidadefinanceira/micrrural | Página com JavaScript; conteúdo lido via `api/paginasite`. Descreve os arquivos `.gz` por visão e ano. |
| https://www.bcb.gov.br/estabilidadefinanceira/tabelas-credito-rural-proagro | Conteúdo lido via `api/paginasite`. Lista tabelas de domínio do Sicor e microdados por operação desde 2013. |
| https://www.bcb.gov.br/conteudo/mdcr/Documents/definicoesCreditoRural.pdf | Lido. Define "crédito concedido", alerta sobre revisões e limite de 60 s por consulta. |
| https://dadosabertos.bcb.gov.br/dataset/matrizdadoscreditorural | Lido na Fase 1. Catálogo com 23 recursos, licença ODbL. |
| https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata/$metadata | HTTP 200. 17 entidades. |
| https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/documentacao | HTTP 200. Descrições dos campos; `RegiaoUF` marcado como não paginável. |
| https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata/RegiaoUF | Instável: sucesso intermitente, HTTP 500 na maioria das consultas. |
| https://www.bcb.gov.br/htms/sicor/manualDadosSicor_V6.pdf | Lido. Define `ATIVIDADE` como "atividade do empreendimento", sem lista de códigos. |
| https://anuario.ibge.gov.br/images/aeb/2024/s3/2_pdf/s3t2103.pdf | Lido. Tabela BCB/DSTAT de 2023–2024 por finalidade, em R$. Usada na reconciliação. |
| Boletim do Crédito Rural e do Proagro, dez/2023 (BCB) | Lido. "R$ 261 bilhões" de jul a dez/2023. Usado na reconciliação. |

## Fonte secundária de conferência: OData

O serviço `https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata/RegiaoUF` traz os mesmos números por UF, com códigos no lugar dos nomes. Ele fica como conferência pontual, não como fonte de coleta. Sintaxe verificada:

```
RegiaoUF?$filter=AnoEmissao eq '2024' and MesEmissao eq '01'&$format=json
```

`$skip` e `$count` retornam HTTP 500. `$top` funciona.

## Cobertura e comparabilidade

| Período | Situação | Uso |
| --- | --- | --- |
| 2013–2015 | 12 meses; sem industrialização; programa "NÃO INFORMADO" em 51–56% do valor (2013–2014); subprogramas só a partir de 2015 | Fora da série principal |
| 2016 | Falha de cobertura em mar–jun (cerca de 1/3 das linhas e contratos); industrialização começa em julho | Fora da série principal |
| **2017–2025** | 12 meses; mesmas colunas e classificações; quatro finalidades | **Série principal** |
| 2026 | Ano em andamento | Apenas análises separadas e marcadas como parciais |

## Limitações conhecidas

- **Revisões:** os números mudam com o tempo. Cada carga registra data de coleta e SHA-256 do arquivo; o README deve informar a data dos dados usados.
- **Diferença em relação a publicações oficiais:** o arquivo coletado em 2026 fica até 5% acima da tabela BCB/DSTAT de 2024 (investimento) por causa de inclusões posteriores.
- **Valores nominais:** sem correção pela inflação.
- **Data de emissão:** o tempo é o mês de emissão da cédula, não o de liberação de cada parcela.
- **MATOPIBA:** a análise usa os quatro estados inteiros. A delimitação oficial por municípios é possível com o arquivo, mas está fora do MVP.

## Pendências

| Item | Impacto | Como verificar |
| --- | --- | --- |
| Causa da falha de mar–jun/2016 e do início da industrialização em jul/2016 | Explicação da quebra (o tratamento já está definido: série a partir de 2017) | Contato com sicor.derop@bcb.gov.br ou documentação do Sicor |
| Unidade das colunas `*_AREA` | Nenhum no MVP | Dicionário oficial |
| Último mês disponível em 2026 | Análises parciais de 2026 | Abrir o arquivo de 2026 na fase de pipeline |
| Estabilidade da API de listagem do site | Automação da descoberta de arquivos | Monitorar; o padrão de URL dos arquivos é a alternativa |
