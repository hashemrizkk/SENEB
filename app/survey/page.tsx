import { redirect } from "next/navigation";

export default async function SurveyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  redirect(lang === "en" ? "/screening?lang=en" : "/screening?lang=ar");
}
