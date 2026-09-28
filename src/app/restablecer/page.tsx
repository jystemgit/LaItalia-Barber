import AuthScreen from "@/app/components/AuthScreen";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AuthScreen mode="reset" token={token} />;
}