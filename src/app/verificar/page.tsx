import AuthScreen from "@/app/components/AuthScreen";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AuthScreen mode="verify" token={token} />;
}