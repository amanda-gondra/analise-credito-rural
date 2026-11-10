/**
 * Suggested questions for each page: a short label on the chip, a full question sent to the
 * assistant. "este estado" and "no período" are filled from the screen context by the model.
 */
import type { ScreenContext } from "../api/types";

export interface Suggestion {
  label: string;
  question: string;
}

const OVERVIEW: Suggestion[] = [
  { label: "Quais estados lideram?", question: "Quais estados lideram o crédito rural no período?" },
  { label: "Evolução por ano", question: "Como o crédito rural evoluiu ano a ano no período?" },
  { label: "MATOPIBA", question: "Qual a participação do MATOPIBA no crédito rural do Brasil?" },
];

const BY_PAGE: Record<ScreenContext["page"], Suggestion[]> = {
  overview: OVERVIEW,
  state: [
    { label: "Total do estado", question: "Quanto este estado recebeu de crédito rural no período?" },
    { label: "Agricultura e pecuária", question: "Quanto foi para agricultura e quanto foi para pecuária neste estado?" },
    { label: "Posição no ranking", question: "Qual a posição deste estado no ranking dos estados?" },
  ],
  compare: [
    { label: "Regiões", question: "Como se compara o crédito rural entre as regiões no período?" },
    { label: "Estados comparados", question: "Como se comparam os estados selecionados ano a ano?" },
    { label: "Quais estados lideram?", question: "Quais estados lideram o crédito rural no período?" },
  ],
  matopiba: [
    { label: "Participação do MATOPIBA", question: "Qual a participação do MATOPIBA no crédito rural do Brasil?" },
    { label: "Estados do MATOPIBA", question: "Quanto cada estado do MATOPIBA recebeu no período?" },
    { label: "Evolução por ano", question: "Como o crédito rural do MATOPIBA evoluiu ano a ano?" },
  ],
  data: [
    { label: "Principais programas", question: "Quais programas concentram mais crédito rural no período?" },
    { label: "Fontes de recursos", question: "Quais fontes de recursos financiam mais crédito rural no período?" },
    { label: "Valor médio", question: "Qual o valor médio por contrato no período?" },
  ],
  about: OVERVIEW,
};

export function suggestionsFor(page: ScreenContext["page"]): Suggestion[] {
  return BY_PAGE[page];
}
