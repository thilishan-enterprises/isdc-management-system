import { cn } from "@/lib/utils";
import { toWhatsAppNumber } from "@/lib/customer-contact";

type WhatsAppPhoneProps = {
  phone?: string | null;
  className?: string;
  emptyLabel?: string;
};

export function WhatsAppPhone({
  phone,
  className,
  emptyLabel = "—",
}: WhatsAppPhoneProps) {
  const displayPhone = phone?.trim();

  if (!displayPhone) {
    return <span className={className}>{emptyLabel}</span>;
  }

  const whatsappNumber = toWhatsAppNumber(displayPhone);

  if (!whatsappNumber) {
    return <span className={className}>{displayPhone}</span>;
  }

  return (
    <a
      href={`https://wa.me/${whatsappNumber}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open WhatsApp conversation with ${displayPhone}`}
      className={cn(
        "rounded-sm underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
    >
      {displayPhone}
    </a>
  );
}
