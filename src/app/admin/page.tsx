import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AccountDashboard from "@/app/components/AccountDashboard";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/ingresar?next=/admin");
  if (user.role !== "ADMIN") redirect("/account");
  return <AccountDashboard user={user} />;
}