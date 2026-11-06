"""Run the evaluation set against one real provider and the loaded database.

    python -m api.evaluation.run --provider gemini            # every case
    python -m api.evaluation.run --provider groq --only q01,s03

Uses the keys of .env and spends free quota (two to four model calls per case), so it runs
by hand, with a pause between cases to stay under the free per-minute limits. The report
goes to api/evaluation/reports/<date>-<provider>-<model>.md, with every answer written out,
so the numbers of the README can always be traced back to a run.
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
from datetime import date
from pathlib import Path
from typing import Any, Final

import httpx2

from api.app.assistant.agent import Assistant, AssistantUnavailableError
from api.app.assistant.providers import build_providers
from api.app.config import Settings
from api.app.database import Database
from api.evaluation.checks import CaseResult, judge

HERE: Final = Path(__file__).resolve().parent
CASES_FILE: Final = HERE / "cases.json"
REPORTS: Final = HERE / "reports"


def load_cases(only: set[str] | None = None) -> list[dict[str, Any]]:
    cases = json.loads(CASES_FILE.read_text(encoding="utf-8"))
    return [case for case in cases if not only or case["id"] in only]


def _rate(results: list[CaseResult], attribute: str) -> str:
    values = [getattr(r, attribute) for r in results if getattr(r, attribute) is not None]
    return f"{sum(values)} de {len(values)}" if values else "-"


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def report(results: list[CaseResult], provider: str, model: str) -> str:
    in_scope = [r for r in results if r.category.startswith("question")]
    refusals = [r for r in results if r.category == "out of scope"]
    robustness = [r for r in results if r.category == "robustness"]
    seconds = [r.seconds for r in results if r.error is None]
    lines = [
        f"# Avaliação do assistente — {date.today():%d/%m/%Y}",
        "",
        f"Provedor: `{provider}` · modelo: `{model}` · casos: {len(results)} (`api/evaluation/cases.json`)",
        "",
        "| Medida | Resultado |",
        "| --- | --- |",
        f"| Casos aprovados | {sum(r.passed for r in results)} de {len(results)} |",
        f"| Perguntas do plano: ferramenta e filtros certos | {_rate(in_scope, 'tool_ok')} |",
        f"| Perguntas do plano: todos os números conferem com o banco | {_rate(in_scope, 'grounded')} |",
        f"| Fora do escopo: recusa com o tema certo | {_rate(refusals, 'refusal_ok')} |",
        f"| Robustez (instruções na pergunta, ano sem dados) | {sum(r.passed for r in robustness)} de {len(robustness)} |",
        f"| Falhas do provedor | {sum(r.error is not None for r in results)} |",
        f"| Tempo mediano por pergunta | {statistics.median(seconds):.1f} s |" if seconds else "| Tempo | - |",
        "",
        "## Casos",
        "",
        "| Caso | Pergunta | Ferramentas | Ferramenta | Números | Recusa | Resultado | Tempo |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    mark = {True: "ok", False: "**erro**", None: "-"}
    for r in results:
        lines.append(
            f"| {r.id} | {_cell(r.question)} | {', '.join(r.tools) or '-'} | {mark[r.tool_ok]} | "
            f"{mark[r.grounded]}{' (' + ', '.join(r.ungrounded) + ')' if r.ungrounded else ''} | "
            f"{mark[r.refusal_ok]} | {'aprovado' if r.passed else '**reprovado**'} | {r.seconds:.1f} s |"
        )
    lines += ["", "## Respostas", ""]
    for r in results:
        lines += [f"**{r.id}.** {r.question}", "", f"> {_cell(r.error or r.answer)}", ""]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--provider", choices=["gemini", "groq", "cloudflare"], default="gemini")
    parser.add_argument("--only", help="comma-separated case ids")
    parser.add_argument("--pause", type=float, default=6.0, help="seconds between cases (free per-minute limits)")
    args = parser.parse_args()

    settings = Settings(assistant_providers=[args.provider])  # type: ignore[call-arg]
    client = httpx2.Client(timeout=httpx2.Timeout(settings.assistant_timeout_seconds, connect=5.0))
    providers = build_providers(settings, client)
    if not providers:
        raise SystemExit(f"no key for {args.provider} in .env")
    model = {"gemini": settings.gemini_model, "groq": settings.groq_model, "cloudflare": settings.cloudflare_model}
    assistant, database = Assistant(providers), Database.from_settings(settings)

    results = []
    cases = load_cases(set(args.only.split(",")) if args.only else None)
    for index, case in enumerate(cases):
        if index:
            time.sleep(args.pause)
        started = time.perf_counter()
        try:
            answer, error = assistant.ask(case["question"], database), None
        except AssistantUnavailableError:
            answer, error = None, "provider failed (limit, timeout or server error)"
        result = judge(case, answer, time.perf_counter() - started, error)
        results.append(result)
        print(f"{result.id}: {'pass' if result.passed else 'FAIL'} {result.tools} {result.ungrounded or ''}", flush=True)

    REPORTS.mkdir(exist_ok=True)
    path = REPORTS / f"{date.today():%Y-%m-%d}-{args.provider}-{model[args.provider].replace('/', '_').replace('@', '')}.md"
    path.write_text(report(results, args.provider, model[args.provider]), encoding="utf-8")
    print(f"\n{sum(r.passed for r in results)} of {len(results)} passed; report: {path}")
    client.close()
    database.dispose()


if __name__ == "__main__":
    main()
