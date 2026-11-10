/** Types of the API, generated from its OpenAPI document (npm run api:types). */
import type { components } from "./schema";

type Schemas = components["schemas"];

export type Meta = Schemas["Meta"];
export type Envelope<T> = { data: T; meta: Meta };

export type YearlyTotal = Schemas["YearlyTotal"];
export type StateRank = Schemas["StateRank"];
export type StateYear = Schemas["StateYear"];
export type StateProfile = Schemas["StateProfile"];
export type RegionYear = Schemas["RegionYear"];
export type MatopibaYear = Schemas["MatopibaYear"];
export type ActivityShare = Schemas["ActivityShare"];
export type PurposeShare = Schemas["PurposeShare"];
export type ProgramRank = Schemas["ProgramRank"];
export type FundingSourceRank = Schemas["FundingSourceRank"];
export type MonthShare = Schemas["MonthShare"];
export type AverageContract = Schemas["AverageContract"];
export type Metadata = Schemas["Metadata"];
export type CreditRow = Schemas["CreditRow"];
export type CreditPage = Schemas["CreditPage"];

export type AskRequest = Schemas["AskRequest"];
export type AskResponse = Schemas["AskResponse"];
export type AssistantSource = Schemas["AssistantSource"];
export type ScreenContext = Schemas["ScreenContext"];
