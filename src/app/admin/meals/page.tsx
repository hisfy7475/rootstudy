import { getMealProductsForAdmin } from "@/lib/actions/meal";
import { AdminMealsClient } from "./meals-client";

export default async function AdminMealsPage() {
  const products = await getMealProductsForAdmin("meal");

  return <AdminMealsClient initialProducts={products} />;
}
