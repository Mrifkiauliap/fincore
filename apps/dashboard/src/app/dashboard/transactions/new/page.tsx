import { redirect } from "next/navigation";

export default function NewTransactionPage() {
  redirect("/dashboard/transactions/new/edit");
}
