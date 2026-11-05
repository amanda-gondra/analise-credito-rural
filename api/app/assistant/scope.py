"""Fixed answers for questions the project does not answer (docs/plano-analise.md,
"Perguntas fora do escopo").

The model only classifies the topic, by calling the explain_out_of_scope tool; the text
shown to the visitor is always one of these, so a refusal never contains invented numbers
and can be checked in the evaluation set.
"""

from __future__ import annotations

from typing import Final, Literal, get_args

OutOfScopeTopic = Literal[
    "municipality",
    "financial_institution",
    "person_or_company",
    "interest_default_or_debt",
    "forecast",
    "other",
]
TOPICS: Final = get_args(OutOfScopeTopic)

MESSAGES: Final[dict[str, str]] = {
    "municipality": (
        "O projeto organiza o crédito rural por estado: os dados por município ainda não estão "
        "carregados (estão previstos para a versão 1.1). Posso mostrar os números do estado desse município."
    ),
    "financial_institution": (
        "O recorte por instituição financeira (banco ou cooperativa) ainda não está no projeto; "
        "está previsto para a versão 1.1. Posso mostrar o total do estado ou a divisão por programa "
        "e por fonte de recursos."
    ),
    "person_or_company": (
        "O Banco Central publica apenas totais agregados, sem dados de pessoas ou empresas. "
        "Posso mostrar os totais por estado, atividade, finalidade ou programa."
    ),
    "interest_default_or_debt": (
        "O projeto trata do crédito rural concedido: valor e número de contratos. Juros, inadimplência "
        "e dívida estão em outras bases do Banco Central e não fazem parte desta versão."
    ),
    "forecast": (
        "O projeto descreve o que já aconteceu, de 2013 a 2025; previsões não fazem parte desta versão. "
        "Posso mostrar a evolução recente."
    ),
    "other": (
        "Respondo apenas sobre o crédito rural no Brasil, com os dados do Banco Central usados neste "
        "projeto: valores e contratos por ano, estado, região, atividade, finalidade, programa e fonte "
        "de recursos."
    ),
}


def out_of_scope_message(topic: object) -> str:
    """The fixed text of the topic; an unknown topic gets the general one."""
    return MESSAGES.get(topic, MESSAGES["other"]) if isinstance(topic, str) else MESSAGES["other"]
