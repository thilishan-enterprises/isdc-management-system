import { redirect } from "next/navigation";

type LegacySaleRegistrationPageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
  }>;
};

export default async function LegacySaleRegistrationPage({
  searchParams,
}: LegacySaleRegistrationPageProps) {
  const current = await searchParams;
  const next = new URLSearchParams();

  if (current.created === "1") next.set("created", "1");
  if (typeof current.error === "string" && current.error) {
    next.set("error", current.error);
  }

  const query = next.toString();
  redirect(`/sales/new${query ? `?${query}` : ""}`);
}
