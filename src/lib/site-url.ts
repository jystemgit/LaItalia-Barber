export function configuredSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) return null;
  return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
}