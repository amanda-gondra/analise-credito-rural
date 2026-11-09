import { Link } from "react-router";

import { PageHeader } from "../components/layout/PageHeader";
import { buttonClass } from "../components/ui/controls";

export default function NotFoundPage() {
  return (
    <>
      <PageHeader title="Página não encontrada">
        <p>O endereço não existe ou mudou. Os dados continuam na visão geral.</p>
      </PageHeader>
      <Link to="/" className={buttonClass("primary")}>
        Ir para a visão geral
      </Link>
    </>
  );
}
