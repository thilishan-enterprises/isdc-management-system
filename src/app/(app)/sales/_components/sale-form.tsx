"use client";

import {
  startTransition,
  useActionState,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  checkSaleCustomerRecords,
  confirmSaleCustomerRecord,
  createSaleRegistration,
} from "../actions";
import type { CustomerRecordCheckResult } from "../actions";
import { CustomerRecordCheckDialog } from "./customer-record-check-dialog";
import type { RecordChoice } from "./customer-record-check-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { AppInput } from "@/components/common/app-input";
import { AppTextarea } from "@/components/common/app-textarea";
import { FormField } from "@/components/common/form-field";
import { FormSectionTitle } from "@/components/common/form-section-title";
import { AppSelect } from "@/components/common/app-select";
import { AppDatePicker } from "@/components/common/app-date-picker";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Package,
  CirclePlus,
  ReceiptText,
  ShoppingBag,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";

type ProductBrandOption = {
  id: string;
  brandId: string;
  brandName: string;
  price: string;
  stockQuantity: number;
  warrantyMonths: number | null;
};

type ProductOption = {
  id: string;
  name: string;
  price: string;
  stockQuantity: number;
  warrantyMonths: number | null;
  productBrands: ProductBrandOption[];
};

type SelectedSaleItem = {
  key: string;
  productId: string;
  productBrandId: string | null;
  productName: string;
  brandName: string | null;
  quantity: number;
  unitPrice: string;
  stockQuantity: number;
  warrantyMonths: number | null;
};

type EmployeeOption = {
  id: string;
  fullName: string;
};

type SaleFormProps = {
  products: ProductOption[];
  employees: EmployeeOption[];
  today: string;
};

const formErrors: Record<string, string> = {
  invalid: "Please check the required fields and enter valid details.",
  amount: "Please check the sale amount and advance payment.",
  installment: "Please enter a valid monthly installment amount and schedule.",
  duplicate: "That bill number is already registered.",
  verification:
    "Customer record verification expired or changed. Please check the record again.",
  "customer-conflict":
    "This NIC or mobile is already assigned to a customer. Select that customer or resolve the conflict.",
  product: "The selected product is no longer available.",
  "product-brand-required": "Please select a brand for this product.",
  "product-brand":
    "The selected brand is no longer available. Please select another brand.",
  stock:
    "There is not enough stock available for one or more selected products.",
  employee: "The selected employee is no longer active.",
  failed:
    "The sale could not be registered. Your entered details are preserved. Please try again.",
};

function formatLKR(value: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function moneyInput(value: string) {
  if (value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span
        className={
          muted ? "text-xs text-muted-foreground" : "text-muted-foreground"
        }
      >
        {label}
      </span>
      <span className="shrink-0 font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function SaleForm({ products, employees }: SaleFormProps) {
  const [formState, formAction, isPending] = useActionState(
    createSaleRegistration,
    {},
  );

  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerNic, setCustomerNic] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerAdditionalMobile, setCustomerAdditionalMobile] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [recordVerified, setRecordVerified] = useState(false);
  const [checkingRecord, setCheckingRecord] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [checkResult, setCheckResult] =
    useState<CustomerRecordCheckResult | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [verificationToken, setVerificationToken] = useState("");
  const [confirmingRecord, setConfirmingRecord] = useState(false);
  const [customerArea, setCustomerArea] = useState("");
  const [customerGuarantor, setCustomerGuarantor] = useState("");
  const requestVersion = useRef(0);
  const [saleDate, setSaleDate] = useState("");
  const [firstInstallmentDate, setFirstInstallmentDate] = useState("");
  const [draftProductId, setDraftProductId] = useState("");
  const [draftProductBrandId, setDraftProductBrandId] = useState("");
  const [draftUnitPrice, setDraftUnitPrice] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("1");
  const [selectedItems, setSelectedItems] = useState<SelectedSaleItem[]>([]);
  const [advancePayment, setAdvancePayment] = useState("0");
  const [monthlyInstallmentAmount, setMonthlyInstallmentAmount] = useState("0");

  const canCheckRecord =
    billNumber.trim().length > 0 &&
    /^[A-Za-z0-9/-]{1,50}$/.test(billNumber.trim()) &&
    customerName.trim().length >= 2 &&
    customerAddress.trim().length >= 3 &&
    /^[A-Za-z0-9-]{5,20}$/.test(customerNic.trim()) &&
    /^[0-9]{7,10}$/.test(customerMobile) &&
    (customerAdditionalMobile === "" ||
      /^[0-9]{7,10}$/.test(customerAdditionalMobile));

  function invalidateVerification() {
    requestVersion.current += 1;
    setRecordVerified(false);
    setCheckResult(null);
    setCheckError("");
    setSelectedCustomerId(null);
    setVerificationToken("");
  }

  async function handleCheckRecord() {
    if (!canCheckRecord || checkingRecord) return;
    const version = ++requestVersion.current;
    setCheckingRecord(true);
    setCheckError("");
    try {
      const result = await checkSaleCustomerRecords({
        billNumber,
        fullName: customerName,
        address: customerAddress,
        nic: customerNic,
        mobile: customerMobile,
        additionalMobile: customerAdditionalMobile,
      });
      if (version !== requestVersion.current) return;
      if (!result.success) {
        setCheckError(result.error ?? "Unable to check records.");
      } else {
        setCheckResult(result);
      }
    } catch {
      if (version === requestVersion.current) {
        setCheckError("Record check failed. Please try again.");
      }
    } finally {
      setCheckingRecord(false);
    }
  }

  async function handleRecordChoice(choice: RecordChoice) {
    if (confirmingRecord) return;
    const version = requestVersion.current;
    setConfirmingRecord(true);
    setCheckError("");
    try {
      const confirmation = await confirmSaleCustomerRecord({
        entered: {
          billNumber,
          fullName: customerName,
          address: customerAddress,
          nic: customerNic,
          mobile: customerMobile,
          additionalMobile: customerAdditionalMobile,
        },
        selectedCustomerId: choice.customerId,
        details: choice.details,
      });
      if (version !== requestVersion.current) return;
      if (!confirmation.success || !confirmation.token) {
        setCheckError(confirmation.error ?? "Unable to confirm this record.");
        setCheckResult(null);
        return;
      }
      if (choice.details) {
        const details = choice.details;
        setCustomerName(details.fullName);
        setCustomerAddress(details.address);
        setCustomerNic(details.nic);
        setCustomerMobile(details.mobile);
        setCustomerAdditionalMobile(details.additionalMobile ?? "");
        setCustomerArea(details.area ?? "");
        setCustomerGuarantor(details.guarantorDetails ?? "");
      }
      setSelectedCustomerId(choice.customerId);
      setVerificationToken(confirmation.token);
      setRecordVerified(true);
      setCheckResult(null);
    } catch {
      if (version === requestVersion.current) {
        setCheckError("Could not confirm the record. Please try again.");
      }
    } finally {
      setConfirmingRecord(false);
    }
  }

  const selectedProduct = products.find(
    (product) => product.id === draftProductId,
  );

  const selectedProductBrand = selectedProduct?.productBrands.find(
    (option) => option.id === draftProductBrandId,
  );

  const draftStockQuantity =
    selectedProductBrand?.stockQuantity ??
    (selectedProduct?.productBrands.length === 0
      ? selectedProduct.stockQuantity
      : undefined);

  const totalProductAmount = selectedItems.reduce(
    (total, item) => total + moneyInput(item.unitPrice) * item.quantity,
    0,
  );

  const totalProductQuantity = selectedItems.reduce(
    (total, item) => total + item.quantity,
    0,
  );

  const calculations = useMemo(() => {
    const total = totalProductAmount;
    const advance = moneyInput(advancePayment);
    const balance = Math.max(0, total - advance);
    const monthly = moneyInput(monthlyInstallmentAmount);

    const installmentCount =
      balance > 0 && monthly > 0 ? Math.ceil(balance / monthly) : 0;

    const finalInstallment =
      installmentCount > 0 ? balance - monthly * (installmentCount - 1) : 0;

    const regularInstallmentCount =
      installmentCount > 0 && finalInstallment !== monthly
        ? installmentCount - 1
        : installmentCount;

    return {
      total,
      advance,
      balance,
      installmentCount,
      finalInstallment,
      regularInstallmentCount,
      valid:
        selectedItems.length > 0 &&
        selectedItems.every(
          (item) =>
            Number.isInteger(item.quantity) &&
            item.quantity >= 1 &&
            item.quantity <= item.stockQuantity &&
            moneyInput(item.unitPrice) > 0,
        ) &&
        advance <= total &&
        (balance === 0 || monthly > 0) &&
        installmentCount <= 1200,
    };
  }, [
    totalProductAmount,
    advancePayment,
    monthlyInstallmentAmount,
    selectedItems,
  ]);

  function handleProductChange(nextProductId: string) {
    setDraftProductId(nextProductId);

    const product = products.find((item) => item.id === nextProductId);
    const availableBrands = product?.productBrands ?? [];

    if (availableBrands.length === 1) {
      setDraftProductBrandId(availableBrands[0].id);
      setDraftUnitPrice(availableBrands[0].price);
    } else if (availableBrands.length === 0) {
      setDraftProductBrandId("");
      setDraftUnitPrice(product?.price ?? "");
    } else {
      setDraftProductBrandId("");
      setDraftUnitPrice("");
    }

    setDraftQuantity("1");
  }

  function handleBrandChange(nextProductBrandId: string) {
    setDraftProductBrandId(nextProductBrandId);

    const option = selectedProduct?.productBrands.find(
      (item) => item.id === nextProductBrandId,
    );

    setDraftUnitPrice(option?.price ?? "");
  }

  function handleAddProduct() {
    if (!recordVerified) return;
    if (!selectedProduct || draftStockQuantity === undefined) return;

    const quantity = Number(draftQuantity);
    const price = moneyInput(draftUnitPrice);

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10000 ||
      price <= 0 ||
      quantity > draftStockQuantity
    ) {
      return;
    }

    const brand = selectedProductBrand ?? null;

    const existingIndex = selectedItems.findIndex(
      (item) =>
        item.productId === selectedProduct.id &&
        item.productBrandId === (brand?.id ?? null),
    );

    const existingQuantity =
      existingIndex >= 0 ? selectedItems[existingIndex].quantity : 0;

    if (existingQuantity + quantity > draftStockQuantity) return;

    if (existingIndex >= 0) {
      setSelectedItems((current) =>
        current.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        ),
      );
    } else {
      setSelectedItems((current) => [
        ...current,
        {
          key: `${selectedProduct.id}-${brand?.id ?? "base"}`,
          productId: selectedProduct.id,
          productBrandId: brand?.id ?? null,
          productName: selectedProduct.name,
          brandName: brand?.brandName ?? null,
          quantity,
          unitPrice: price.toFixed(2),
          stockQuantity: draftStockQuantity,
          warrantyMonths: brand
            ? brand.warrantyMonths
            : selectedProduct.warrantyMonths,
        },
      ]);
    }

    setDraftProductId("");
    setDraftProductBrandId("");
    setDraftUnitPrice("");
    setDraftQuantity("1");
  }

  function handleRemoveProduct(key: string) {
    if (!recordVerified) return;
    setSelectedItems((current) => current.filter((item) => item.key !== key));
  }

  function handleUpdateItem(
    key: string,
    changes: Partial<Pick<SelectedSaleItem, "quantity" | "unitPrice">>,
  ) {
    if (!recordVerified) return;
    setSelectedItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, ...changes } : item,
      ),
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recordVerified || !canCheckRecord || !verificationToken) return;
    const formData = new FormData(event.currentTarget);
    formData.set("selectedCustomerId", selectedCustomerId ?? "");
    formData.set("verificationToken", verificationToken);

    startTransition(() => {
      formAction(formData);
    });
  }

  const canSubmit =
    !isPending &&
    recordVerified &&
    Boolean(verificationToken) &&
    canCheckRecord &&
    products.length > 0 &&
    Boolean(saleDate && firstInstallmentDate) &&
    calculations.valid &&
    calculations.installmentCount <= 1200;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          selectedItems.map((item) => ({
            productId: item.productId,
            productBrandId: item.productBrandId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        )}
      />

      {checkResult && (
        <CustomerRecordCheckDialog
          result={checkResult}
          onChoose={handleRecordChoice}
          onClose={() => setCheckResult(null)}
        />
      )}
      <input
        type="hidden"
        name="selectedCustomerId"
        value={selectedCustomerId ?? ""}
      />
      <input type="hidden" name="verificationToken" value={verificationToken} />
      {checkError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {checkError}
        </p>
      )}
      {formState.error && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{formErrors[formState.error] ?? formErrors.failed}</span>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {/* Customer and bill information */}
          <Card className="border-border/70 shadow-sm">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FormSectionTitle
                  icon={UserRound}
                  title="Customer & Bill Information"
                  description="Enter the customer's details and sale reference."
                />
                <Button
                  type="button"
                  disabled={!canCheckRecord || checkingRecord || isPending}
                  className="gap-2 font-semibold"
                  onClick={handleCheckRecord}
                >
                  <CheckCircle2 className="size-4" />
                  {checkingRecord
                    ? "Checking records..."
                    : recordVerified
                      ? "Recheck Record"
                      : "Check Record"}
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="Bill Number" htmlFor="billNumber" required>
                  <AppInput
                    id="billNumber"
                    value={billNumber}
                    name="billNumber"
                    placeholder="e.g. BILL-2026-001"
                    maxLength={50}
                    className="font-semibold tracking-wide"
                    required
                    onChange={(event) => {
                      invalidateVerification();
                      setBillNumber(event.target.value);
                    }}
                  />
                </FormField>

                <FormField label="Customer Name" htmlFor="fullName" required>
                  <AppInput
                    id="fullName"
                    value={customerName}
                    name="fullName"
                    placeholder="Full name as on NIC"
                    minLength={2}
                    maxLength={150}
                    autoComplete="name"
                    required
                    onChange={(event) => {
                      invalidateVerification();
                      setCustomerName(event.target.value);
                    }}
                  />
                </FormField>

                <FormField label="Address" htmlFor="address" required>
                  <AppInput
                    id="address"
                    value={customerAddress}
                    name="address"
                    placeholder="Residential address"
                    minLength={3}
                    maxLength={500}
                    autoComplete="street-address"
                    required
                    onChange={(event) => {
                      invalidateVerification();
                      setCustomerAddress(event.target.value);
                    }}
                  />
                </FormField>

                <FormField label="NIC Number" htmlFor="nic" required>
                  <AppInput
                    id="nic"
                    value={customerNic}
                    name="nic"
                    placeholder="9 or 12 digit NIC number"
                    minLength={9}
                    maxLength={12}
                    pattern="(?:[0-9]{9}|[0-9]{12})"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    onChange={(event) => {
                      invalidateVerification();
                      setCustomerNic(
                        event.target.value.replace(/\D/g, "").slice(0, 12),
                      );
                    }}
                  />
                </FormField>

                <FormField label="Primary Mobile" htmlFor="mobile" required>
                  <AppInput
                    id="mobile"
                    value={customerMobile}
                    name="mobile"
                    type="tel"
                    inputMode="numeric"
                    pattern="(?:070|071|072|074|075|076|077|078)[0-9]{7}"
                    placeholder="Main contact number"
                    minLength={10}
                    maxLength={10}
                    autoComplete="tel"
                    onChange={(event) => {
                      invalidateVerification();
                      setCustomerMobile(event.target.value.replace(/\D/g, ""));
                    }}
                    required
                  />
                </FormField>

                <FormField label="Additional Mobile" htmlFor="additionalMobile">
                  <AppInput
                    id="additionalMobile"
                    value={customerAdditionalMobile}
                    name="additionalMobile"
                    type="tel"
                    inputMode="numeric"
                    pattern="(?:(?:070|071|072|074|075|076|077|078)[0-9]{7}|[0-9]{11,15})"
                    placeholder="Alternative number"
                    minLength={10}
                    maxLength={15}
                    autoComplete="tel"
                    onChange={(event) => {
                      invalidateVerification();
                      setCustomerAdditionalMobile(
                        event.target.value.replace(/\D/g, "").slice(0, 15),
                      );
                    }}
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>

          {/* Product selection */}
          <Card className="border-border/70 shadow-sm">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FormSectionTitle
                  icon={ShoppingBag}
                  title="Products"
                  description="Select products, quantities and selling prices."
                />
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {selectedItems.length} Selected
                </span>
              </div>

              {products.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-6 text-center">
                  <Package className="mx-auto size-6 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">
                    No active products available
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add or activate products before registering a sale.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <FormField
                      label="Product"
                      htmlFor="draftProductId"
                      required
                    >
                      <AppSelect
                        value={draftProductId}
                        onValueChange={handleProductChange}
                        placeholder="Select Product"
                        options={products.map((product) => ({
                          value: product.id,
                          label: product.name,
                        }))}
                        disabled={!recordVerified}
                      />
                    </FormField>

                    <FormField label="Brand" htmlFor="draftProductBrandId">
                      {selectedProduct &&
                      selectedProduct.productBrands.length > 1 ? (
                        <AppSelect
                          value={draftProductBrandId}
                          onValueChange={handleBrandChange}
                          placeholder="Select brand"
                          options={selectedProduct.productBrands.map(
                            (option) => ({
                              value: option.id,
                              label: option.brandName,
                            }),
                          )}
                          disabled={!recordVerified}
                        />
                      ) : (
                        <AppInput
                          id="draftBrandDisplay"
                          value={
                            !selectedProduct
                              ? ""
                              : selectedProduct.productBrands.length === 0
                                ? "No brand option"
                                : (selectedProductBrand?.brandName ?? "")
                          }
                          placeholder="Select product first"
                          readOnly
                          disabled={!recordVerified || !selectedProduct}
                        />
                      )}
                    </FormField>

                    <FormField
                      label="Quantity"
                      htmlFor="draftQuantity"
                      required
                    >
                      <AppInput
                        id="draftQuantity"
                        type="number"
                        min="1"
                        max="10000"
                        step="1"
                        value={draftQuantity}
                        onChange={(event) =>
                          setDraftQuantity(event.target.value)
                        }
                        placeholder="Quantity"
                        disabled={!recordVerified || !selectedProduct}
                        className="h-8"
                      />
                    </FormField>

                    <FormField
                      label="Unit Price (LKR)"
                      htmlFor="draftUnitPrice"
                      required
                    >
                      <AppInput
                        id="draftUnitPrice"
                        type="number"
                        min="0.01"
                        max="9999999999.99"
                        step="0.01"
                        value={draftUnitPrice}
                        onChange={(event) =>
                          setDraftUnitPrice(event.target.value)
                        }
                        placeholder="Selling price"
                        disabled={
                          !recordVerified ||
                          !selectedProduct ||
                          (selectedProduct.productBrands.length > 1 &&
                            !selectedProductBrand)
                        }
                        className="h-8"
                      />
                    </FormField>
                  </div>

                  {selectedProduct && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Available stock:{" "}
                          <strong className="font-semibold text-foreground">
                            {draftStockQuantity ?? "Select a brand"}
                          </strong>
                        </span>
                        {selectedProductBrand?.warrantyMonths != null && (
                          <span>
                            Warranty: {selectedProductBrand.warrantyMonths}{" "}
                            months
                          </span>
                        )}
                        {selectedProduct.productBrands.length === 0 &&
                          selectedProduct.warrantyMonths != null && (
                            <span>
                              Warranty: {selectedProduct.warrantyMonths} months
                            </span>
                          )}
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddProduct}
                        disabled={
                          !recordVerified ||
                          !selectedProduct ||
                          draftStockQuantity === undefined ||
                          (selectedProduct.productBrands.length > 1 &&
                            !selectedProductBrand) ||
                          !Number.isInteger(Number(draftQuantity)) ||
                          Number(draftQuantity) < 1 ||
                          Number(draftQuantity) > (draftStockQuantity ?? 0) ||
                          moneyInput(draftUnitPrice) <= 0
                        }
                      >
                        <CirclePlus className="size-4" />
                        Add product
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {selectedItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/80 px-4 py-6 text-center">
                  <ShoppingBag className="mx-auto size-6 text-muted-foreground/70" />
                  <p className="mt-2 text-sm font-medium">No products added</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Choose a product above to add it to this sale.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border/80 bg-muted/20 shadow-sm">
                  <div className="hidden grid-cols-[minmax(0,1fr)_90px_130px_125px_36px] items-center gap-3 border-b border-border/70 bg-muted/70 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                    <span>Product</span>
                    <span>Qty</span>
                    <span>Unit Price</span>
                    <span className="text-right">Subtotal</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border/70 bg-background/50">
                    {selectedItems.map((item) => (
                      <div
                        key={item.key}
                        className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-3 sm:grid-cols-[minmax(0,1fr)_90px_130px_125px_36px] sm:items-center"
                      >
                        <div className="col-span-2 min-w-0 sm:col-span-1">
                          <p className="truncate text-sm font-medium">
                            {item.productName}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {item.brandName || null}{" "}
                            {item.warrantyMonths != null
                              ? ` · ${item.warrantyMonths} month warranty`
                              : ""}
                            {" · Stock "}
                            {item.stockQuantity}
                          </p>
                        </div>

                        <div>
                          <Label
                            htmlFor={`quantity-${item.key}`}
                            className="mb-1 block text-[11px] text-muted-foreground sm:hidden"
                          >
                            Quantity
                          </Label>
                          <Input
                            id={`quantity-${item.key}`}
                            type="number"
                            min="1"
                            max={item.stockQuantity}
                            step="1"
                            value={item.quantity}
                            className="h-8"
                            disabled={!recordVerified}
                            onChange={(event) => {
                              const nextQuantity = Number(event.target.value);
                              if (
                                Number.isInteger(nextQuantity) &&
                                nextQuantity >= 1 &&
                                nextQuantity <= item.stockQuantity
                              ) {
                                handleUpdateItem(item.key, {
                                  quantity: nextQuantity,
                                });
                              }
                            }}
                          />
                        </div>

                        <div>
                          <Label
                            htmlFor={`price-${item.key}`}
                            className="mb-1 block text-[11px] text-muted-foreground sm:hidden"
                          >
                            Unit Price (LKR)
                          </Label>
                          <Input
                            id={`price-${item.key}`}
                            type="number"
                            min="0.01"
                            max="9999999999.99"
                            step="0.01"
                            value={item.unitPrice}
                            className="h-8"
                            disabled={!recordVerified}
                            onChange={(event) =>
                              handleUpdateItem(item.key, {
                                unitPrice: event.target.value,
                              })
                            }
                          />
                        </div>

                        <div className="flex items-center justify-between sm:justify-end">
                          <span className="text-[11px] text-muted-foreground sm:hidden">
                            Subtotal
                          </span>
                          <span className="text-sm font-semibold tabular-nums">
                            {formatLKR(
                              moneyInput(item.unitPrice) * item.quantity,
                            )}
                          </span>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            disabled={!recordVerified}
                            onClick={() => handleRemoveProduct(item.key)}
                            aria-label={`Remove ${item.productName}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-muted/30 px-3 py-2.5 text-xs">
                    <span className="text-muted-foreground">
                      {totalProductQuantity} Total Units
                    </span>
                    <span className="font-semibold tabular-nums">
                      Products Total: {formatLKR(calculations.total)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment and schedule */}
          <Card className="border-border/70 shadow-sm">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <FormSectionTitle
                icon={Wallet}
                title="Payment Plan"
                description="Set the advance payment and installment schedule."
              />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FormField
                  label="Advance Payment (LKR)"
                  htmlFor="advancePayment"
                  required
                >
                  <AppInput
                    id="advancePayment"
                    name="advancePayment"
                    type="number"
                    min="0"
                    max="9999999999.99"
                    step="0.01"
                    value={advancePayment}
                    onChange={(event) => setAdvancePayment(event.target.value)}
                    disabled={!recordVerified}
                    required
                  />
                </FormField>

                <FormField
                  label="Monthly Installment (LKR)"
                  htmlFor="monthlyInstallmentAmount"
                  required
                >
                  <AppInput
                    id="monthlyInstallmentAmount"
                    name="monthlyInstallmentAmount"
                    type="number"
                    min="0"
                    max="9999999999.99"
                    step="0.01"
                    value={monthlyInstallmentAmount}
                    onChange={(event) =>
                      setMonthlyInstallmentAmount(event.target.value)
                    }
                    disabled={!recordVerified}
                    required
                  />
                </FormField>

                <FormField
                  label="First Installment Date"
                  htmlFor="firstInstallmentDate"
                  required
                >
                  <AppDatePicker
                    name="firstInstallmentDate"
                    value={firstInstallmentDate}
                    onChange={setFirstInstallmentDate}
                    placeholder="Select first installment date"
                    disabled={!recordVerified}
                  />
                </FormField>
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/25 px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-muted-foreground" />
                    <span className="text-xs font-semibold">
                      Installment Schedule Preview
                    </span>
                  </div>
                  {calculations.balance === 0 ? (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Fully Paid Upfront
                    </span>
                  ) : calculations.installmentCount > 0 ? (
                    <span className="text-xs font-medium text-primary">
                      {calculations.installmentCount} Monthly Payments
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Awaiting Monthly Amount
                    </span>
                  )}
                </div>

                {calculations.balance > 0 &&
                  calculations.installmentCount > 0 && (
                    <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground">
                          Total installments
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums">
                          {calculations.installmentCount}
                        </p>
                      </div>

                      {calculations.regularInstallmentCount > 0 && (
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Regular Payment
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums">
                            {formatLKR(moneyInput(monthlyInstallmentAmount))}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            × {calculations.regularInstallmentCount} payments
                          </p>
                        </div>
                      )}

                      {calculations.finalInstallment !==
                        moneyInput(monthlyInstallmentAmount) && (
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Final Payment
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums">
                            {formatLKR(calculations.finalInstallment)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            × 1 payment
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                {calculations.balance > 0 &&
                  calculations.installmentCount === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Enter a positive monthly installment amount to preview the
                      schedule.
                    </p>
                  )}
              </div>
            </CardContent>
          </Card>

          {/* Dispatch and collection details */}
          <Card className="border-border/70 shadow-sm">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <FormSectionTitle
                icon={ReceiptText}
                title="Sale & Collection Details"
                description="Sales date, responsible employee and collection information."
              />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="Sales Date" htmlFor="saleDate" required>
                  <AppDatePicker
                    name="saleDate"
                    value={saleDate}
                    onChange={setSaleDate}
                    placeholder="Select sales date"
                    disabled={!recordVerified}
                  />
                </FormField>

                <FormField label="Salesman" htmlFor="salesEmployeeId">
                  <AppSelect
                    name="salesEmployeeId"
                    defaultValue=""
                    placeholder="Select employee"
                    options={employees.map((employee) => ({
                      value: employee.id,
                      label: employee.fullName,
                    }))}
                    disabled={!recordVerified}
                  />
                  {employees.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      No active employees available.
                    </p>
                  )}
                </FormField>

                <FormField label="Collection Area" htmlFor="area">
                  <AppInput
                    id="area"
                    value={customerArea}
                    onChange={(event) => setCustomerArea(event.target.value)}
                    name="area"
                    placeholder="Town or collection route"
                    maxLength={150}
                    disabled={!recordVerified}
                  />
                </FormField>

                <div className="sm:col-span-2 lg:col-span-3">
                  <FormField
                    label="Location Directions / Notes"
                    htmlFor="notes"
                  >
                    <AppTextarea
                      id="notes"
                      name="notes"
                      rows={2}
                      maxLength={2000}
                      placeholder="Optional directions or useful notes for the collection team"
                      disabled={!recordVerified}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <FormField
                    label="Guarantor Contact Details"
                    htmlFor="guarantorDetails"
                  >
                    <AppTextarea
                      id="guarantorDetails"
                      value={customerGuarantor}
                      onChange={(event) =>
                        setCustomerGuarantor(event.target.value)
                      }
                      name="guarantorDetails"
                      rows={2}
                      maxLength={2000}
                      placeholder="Name, mobile number and address (optional)"
                      disabled={!recordVerified}
                    />
                  </FormField>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sale summary and submit */}
        <aside className="min-w-0 xl:sticky xl:top-4">
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <div className="border-b border-border/70 bg-muted/25 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ReceiptText className="size-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Sale Summary</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Live payment breakdown
                  </p>
                </div>
              </div>
            </div>

            <CardContent className="space-y-3.5 p-4">
              <div className="space-y-2.5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      Products
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {totalProductQuantity} units total
                    </p>
                  </div>

                  {selectedItems.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-start justify-between gap-3 text-xs"
                    >
                      <p className="min-w-0 font-medium leading-5">
                        {item.productName}
                        {item.brandName ? ` - ${item.brandName}` : ""}
                      </p>

                      <p className="shrink-0 font-semibold tabular-nums">
                        × {item.quantity}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/60 pt-2.5">
                  <SummaryRow
                    label="Sale amount"
                    value={formatLKR(calculations.total)}
                  />
                </div>
                <SummaryRow
                  label="Down payment"
                  value={`− ${formatLKR(calculations.advance)}`}
                />
              </div>

              <div className="rounded-lg bg-primary/5 p-3.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Outstanding balance
                </p>

                <p className="mt-1 text-xl font-bold tracking-tight tabular-nums">
                  {formatLKR(calculations.balance)}
                </p>
              </div>

              {calculations.balance > 0 &&
                calculations.installmentCount > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {calculations.regularInstallmentCount > 0 && (
                      <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                        <p className="text-[10px] font-medium text-muted-foreground">
                          Regular Payment
                        </p>
                        <p className="mt-1 font-semibold text-[12px]">
                          {formatLKR(moneyInput(monthlyInstallmentAmount))}
                        </p>
                        <p className="text-[10px] font-medium text-muted-foreground">
                          × {calculations.regularInstallmentCount} payments
                        </p>
                      </div>
                    )}

                    {Math.abs(
                      calculations.finalInstallment -
                        moneyInput(monthlyInstallmentAmount),
                    ) > 0.009 && (
                      <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                        <p className="text-[10px] font-medium text-muted-foreground">
                          Final Payment
                        </p>
                        <p className="mt-1 font-semibold text-[12px]">
                          {formatLKR(calculations.finalInstallment)}
                        </p>
                        <p className="text-[10px] font-medium text-muted-foreground">
                          × 1{""} payment
                        </p>
                      </div>
                    )}
                  </div>
                )}

              <div className="space-y-2 border-t border-border/60 pt-3">
                {calculations.advance > calculations.total && (
                  <p
                    className="flex items-start gap-1.5 text-xs text-destructive"
                    role="alert"
                  >
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    Advance cannot exceed the sale amount.
                  </p>
                )}

                {calculations.installmentCount > 1200 && (
                  <p
                    className="flex items-start gap-1.5 text-xs text-destructive"
                    role="alert"
                  >
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    This plan exceeds the 1,200-installment limit.
                  </p>
                )}

                {calculations.valid ? (
                  <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                    Sale details are ready to submit.
                  </p>
                ) : (
                  <p className="text-xs leading-5 text-muted-foreground">
                    Add at least one product, check quantities and prices, and
                    complete the payment details to continue.
                  </p>
                )}
              </div>

              <div className="space-y-2 pt-1">
                <Button type="submit" disabled={!canSubmit} className="w-full">
                  {isPending ? "Registering sale..." : "Register sale"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => window.history.back()}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>

              <p className="text-center text-[10px] leading-4 text-muted-foreground">
                Product stock will be validated and updated when the sale is
                registered.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </form>
  );
}
