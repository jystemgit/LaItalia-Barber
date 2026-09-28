import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AccountDashboard from "@/app/components/AccountDashboard";

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/ingresar?next=/account");
  if (user.role === "ADMIN") redirect("/admin");
  return <AccountDashboard user={user} />;
}