import { getMealProductsForAdmin } from "@/lib/actions/meal";
import { AdminMockExamsClient } from "./mock-exams-client";

export default async function AdminMockExamsPage() {
  const products = await getMealProductsForAdmin("exam");

  return <AdminMockExamsClient initialProducts={products} />;
}
