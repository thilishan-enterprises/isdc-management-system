"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import type {
  CustomerRecordCheckResult,
  CustomerRecordDetails,
} from "./actions";

export type RecordChoice = {
  customerId: string | null;
  details: CustomerRecordDetails | null;
};

type Props = {
  result: CustomerRecordCheckResult;
  onChoose: (choice: RecordChoice) => void;
  onClose: () => void;
};

export function CustomerRecordCheckDialog({
  result,
  onChoose,
  onClose,
}: Props) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [saleId, setSaleId] = useState<string>("");
  const [identityChoice, setIdentityChoice] = useState<"existing" | "new">(
    "new",
  );
  const [confirmNew, setConfirmNew] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selected = result.matches.find((m) => m.customerId === customerId);
  const selectedSale = selected?.sales.find((s) => s.id === saleId);
  const selectedDetails =
    selectedSale?.details ?? selected?.currentDetails ?? null;
  const canUseEntered =
    result.matches.length === 0 ||
    (identityChoice === "existing" ? !!selected : confirmNew);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-check-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b p-4 sm:p-5">
          <div>
            <h2 id="record-check-title" className="text-base font-semibold">
              Customer record check
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Review the matches and confirm the customer identity before
              continuing.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close record check"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
          {result.billNumberTaken && (
            <div
              role="alert"
              className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" /> This bill number
              already exists. Close this dialog and enter a different bill
              number.
            </div>
          )}
          {result.matches.length === 0 ? (
            <div className="rounded-lg border border-dashed p-5 text-center text-sm">
              No matching customer records found. You can continue with the
              entered details.
            </div>
          ) : (
            <>
              <p className="text-sm font-medium">
                {result.matches.length} matching customer record(s)
              </p>
              {result.hasMoreMatches && (
                <p className="text-xs text-destructive">
                  Additional matches may exist. Refine the entered details or
                  check the customer directory before proceeding.
                </p>
              )}
              <div className="space-y-3">
                {result.matches.map((match) => (
                  <div
                    key={match.customerId}
                    className={`rounded-lg border p-3 ${customerId === match.customerId ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name="record-customer-choice"
                        checked={customerId === match.customerId}
                        onChange={() => {
                          setCustomerId(match.customerId);
                          setSaleId("");
                          setIdentityChoice("existing");
                          setConfirmNew(false);
                        }}
                        className="mt-1 accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {match.currentDetails.fullName}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          NIC: {match.currentDetails.nic} · Mobile:{" "}
                          {match.currentDetails.mobile}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {match.totalSales} sale(s) · Matched:{" "}
                          {match.matchedBy.join(", ")}
                        </span>
                      </span>
                    </label>
                    {customerId === match.customerId && (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        <p className="text-xs font-medium">
                          Choose details to copy (optional)
                        </p>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="radio"
                            name="record-sale-choice"
                            checked={saleId === ""}
                            onChange={() => setSaleId("")}
                          />{" "}
                          Current customer details
                        </label>
                        {match.sales.map((sale) => (
                          <label
                            key={sale.id}
                            className="flex items-start gap-2 rounded-md bg-muted/30 p-2 text-xs"
                          >
                            <input
                              type="radio"
                              name="record-sale-choice"
                              checked={saleId === sale.id}
                              onChange={() => setSaleId(sale.id)}
                            />
                            <span>
                              <strong>{sale.billNumber}</strong> ·{" "}
                              {sale.saleDate} · {sale.details.fullName}
                              <span className="block text-muted-foreground">
                                NIC: {sale.details.nic} · Mobile:{" "}
                                {sale.details.mobile} · {sale.details.address}
                              </span>
                              {sale.detailsSource === "legacy" && (
                                <span className="block text-amber-600">
                                  Legacy record: historical personal details
                                  were not preserved
                                </span>
                              )}
                            </span>
                          </label>
                        ))}
                        {match.hasMoreSales && (
                          <p className="text-xs text-muted-foreground">
                            Only the latest {match.sales.length} bills are
                            shown.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <p className="text-sm font-semibold">
                  Which customer does this new sale belong to?
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={identityChoice === "existing"}
                    onChange={() => {
                      setIdentityChoice("existing");
                      setConfirmNew(false);
                    }}
                  />{" "}
                  Selected existing customer
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={identityChoice === "new"}
                    onChange={() => {
                      setIdentityChoice("new");
                      setCustomerId(null);
                      setSaleId("");
                    }}
                  />{" "}
                  A genuinely new customer
                </label>
                {identityChoice === "new" && (
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={confirmNew}
                      onChange={(e) => setConfirmNew(e.target.checked)}
                    />{" "}
                    I reviewed the matches and confirm this is a different
                    person, not an existing customer.
                  </label>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t p-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Back to form
          </Button>
          <Button
            type="button"
            disabled={
              result.billNumberTaken || !canUseEntered || result.hasMoreMatches
            }
            onClick={() =>
              onChoose({
                customerId: identityChoice === "existing" ? customerId : null,
                details: null,
              })
            }
          >
            <CheckCircle2 className="mr-2 size-4" /> Use Entered Details
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              result.billNumberTaken ||
              result.hasMoreMatches ||
              identityChoice !== "existing" ||
              !selectedDetails
            }
            onClick={() => onChoose({ customerId, details: selectedDetails })}
          >
            Use Existing Details
          </Button>
        </div>
      </div>
    </div>
  );
}
