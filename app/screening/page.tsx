import ScreeningWizard from "@/components/screening/ScreeningWizard";

export const dynamic = "force-dynamic";

export default async function ScreeningPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  return <ScreeningWizard initialLocale={lang === "en" ? "en" : "ar"} />;
}
