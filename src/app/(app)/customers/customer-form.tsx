"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { createSaleRegistration } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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

type CustomerFormProps = {
  products: ProductOption[];
  employees: EmployeeOption[];
  today: string;
};

const fieldClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-none outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50";

const textareaClass =
  "min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

const formErrors: Record<string, string> = {
  invalid: "Please check the required fields and enter valid details.",
  amount: "Please check the sale amount and advance payment.",
  installment: "Please enter a valid monthly installment amount and schedule.",
  duplicate: "That bill number is already registered.",
  "customer-conflict":
    "The NIC and mobile number belong to different customer records. Please check them.",
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

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-xs font-medium text-foreground/85"
      >
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
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

export function CustomerForm({ products, employees }: CustomerFormProps) {
  const [formState, formAction, isPending] = useActionState(
    createSaleRegistration,
    {},
  );

  const [saleDate, setSaleDate] = useState("");
  const [firstInstallmentDate, setFirstInstallmentDate] = useState("");
  const [draftProductId, setDraftProductId] = useState("");
  const [draftProductBrandId, setDraftProductBrandId] = useState("");
  const [draftUnitPrice, setDraftUnitPrice] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("1");
  const [selectedItems, setSelectedItems] = useState<SelectedSaleItem[]>([]);
  const [advancePayment, setAdvancePayment] = useState("0");
  const [monthlyInstallmentAmount, setMonthlyInstallmentAmount] = useState("0");

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
    setSelectedItems((current) => current.filter((item) => item.key !== key));
  }

  function handleUpdateItem(
    key: string,
    changes: Partial<Pick<SelectedSaleItem, "quantity" | "unitPrice">>,
  ) {
    setSelectedItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, ...changes } : item,
      ),
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      formAction(formData);
    });
  }

  const canSubmit =
    !isPending &&
    products.length > 0 &&
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
                <SectionTitle
                  icon={UserRound}
                  title="Customer & Bill Information"
                  description="Enter the customer's details and sale reference."
                />
                <span className="text-[11px] text-muted-foreground">
                  * Required fields
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Bill Number" htmlFor="billNumber" required>
                  <Input
                    id="billNumber"
                    name="billNumber"
                    placeholder="e.g. BILL-2026-001"
                    maxLength={50}
                    className={`${fieldClass} font-semibold tracking-wide`}
                    required
                  />
                </Field>

                <Field label="Customer Name" htmlFor="fullName" required>
                  <Input
                    id="fullName"
                    name="fullName"
                    placeholder="Full name as on NIC"
                    minLength={2}
                    maxLength={150}
                    autoComplete="name"
                    className={fieldClass}
                    required
                  />
                </Field>

                <Field label="Address" htmlFor="address" required>
                  <Input
                    id="address"
                    name="address"
                    placeholder="Residential address"
                    minLength={3}
                    maxLength={500}
                    autoComplete="street-address"
                    className={fieldClass}
                    required
                  />
                </Field>

                <Field label="NIC Number" htmlFor="nic" required>
                  <Input
                    id="nic"
                    name="nic"
                    placeholder="NIC number"
                    minLength={5}
                    maxLength={20}
                    autoComplete="off"
                    className={fieldClass}
                    required
                  />
                </Field>

                <Field label="Primary Mobile" htmlFor="mobile" required>
                  <Input
                    id="mobile"
                    name="mobile"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9+()\\-\\s]*"
                    placeholder="Main contact number"
                    minLength={7}
                    maxLength={20}
                    autoComplete="tel"
                    className={fieldClass}
                    required
                  />
                </Field>

                <Field label="Additional Mobile" htmlFor="additionalMobile">
                  <Input
                    id="additionalMobile"
                    name="additionalMobile"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9+()\\-\\s]*"
                    placeholder="Alternative number"
                    maxLength={20}
                    autoComplete="tel"
                    className={fieldClass}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Product selection */}
          <Card className="border-border/70 shadow-sm">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionTitle
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
                    <Field label="Product" htmlFor="draftProductId" required>
                      <select
                        id="draftProductId"
                        value={draftProductId}
                        onChange={(event) =>
                          handleProductChange(event.target.value)
                        }
                        className={selectClass}
                      >
                        <option value="">Select Product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Brand" htmlFor="draftProductBrandId">
                      {selectedProduct &&
                      selectedProduct.productBrands.length > 1 ? (
                        <select
                          id="draftProductBrandId"
                          value={draftProductBrandId}
                          onChange={(event) =>
                            handleBrandChange(event.target.value)
                          }
                          className={selectClass}
                        >
                          <option value="">Select brand</option>
                          {selectedProduct.productBrands.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.brandName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
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
                          disabled={!selectedProduct}
                          className={fieldClass}
                        />
                      )}
                    </Field>

                    <Field label="Quantity" htmlFor="draftQuantity" required>
                      <Input
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
                        disabled={!selectedProduct}
                        className={fieldClass}
                      />
                    </Field>

                    <Field
                      label="Unit Price (LKR)"
                      htmlFor="draftUnitPrice"
                      required
                    >
                      <Input
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
                          !selectedProduct ||
                          (selectedProduct.productBrands.length > 1 &&
                            !selectedProductBrand)
                        }
                        className={fieldClass}
                      />
                    </Field>
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
                <div className="overflow-hidden rounded-lg border border-border/70">
                  <div className="hidden grid-cols-[minmax(0,1fr)_90px_130px_125px_36px] items-center gap-3 bg-muted/45 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                    <span>Product</span>
                    <span>Qty</span>
                    <span>Unit Price</span>
                    <span className="text-right">Subtotal</span>
                    <span />
                  </div>

                  <div className="divide-y divide-border/60">
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
              <SectionTitle
                icon={Wallet}
                title="Payment Plan"
                description="Set the advance payment and installment schedule."
              />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="Advance Payment (LKR)"
                  htmlFor="advancePayment"
                  required
                >
                  <Input
                    id="advancePayment"
                    name="advancePayment"
                    type="number"
                    min="0"
                    max="9999999999.99"
                    step="0.01"
                    value={advancePayment}
                    onChange={(event) => setAdvancePayment(event.target.value)}
                    className={fieldClass}
                    required
                  />
                </Field>

                <Field
                  label="Monthly Installment (LKR)"
                  htmlFor="monthlyInstallmentAmount"
                  required
                >
                  <Input
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
                    className={fieldClass}
                    required
                  />
                </Field>

                <Field
                  label="First Installment Date"
                  htmlFor="firstInstallmentDate"
                  required
                >
                  <Input
                    id="firstInstallmentDate"
                    name="firstInstallmentDate"
                    type="date"
                    value={firstInstallmentDate}
                    onChange={(event) =>
                      setFirstInstallmentDate(event.target.value)
                    }
                    className={fieldClass}
                    required
                  />
                </Field>
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
              <SectionTitle
                icon={ReceiptText}
                title="Sale & Collection Details"
                description="Dispatch date, responsible employee and collection information."
              />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Dispatch Date" htmlFor="saleDate" required>
                  <Input
                    id="saleDate"
                    name="saleDate"
                    type="date"
                    value={saleDate}
                    onChange={(event) => setSaleDate(event.target.value)}
                    className={fieldClass}
                    required
                  />
                </Field>

                <Field label="Salesman" htmlFor="salesEmployeeId">
                  <select
                    id="salesEmployeeId"
                    name="salesEmployeeId"
                    defaultValue=""
                    className={selectClass}
                  >
                    <option value="">Select employee (optional)</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </option>
                    ))}
                  </select>
                  {employees.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      No active employees available.
                    </p>
                  )}
                </Field>

                <Field label="Collection Area" htmlFor="area">
                  <Input
                    id="area"
                    name="area"
                    placeholder="Town or collection route"
                    maxLength={150}
                    className={fieldClass}
                  />
                </Field>

                <div className="sm:col-span-2 lg:col-span-3">
                  <Field label="Location Directions / Notes" htmlFor="notes">
                    <textarea
                      id="notes"
                      name="notes"
                      rows={2}
                      maxLength={2000}
                      placeholder="Optional directions or useful notes for the collection team"
                      className={textareaClass}
                    />
                  </Field>
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <Field
                    label="Guarantor Contact Details"
                    htmlFor="guarantorDetails"
                  >
                    <textarea
                      id="guarantorDetails"
                      name="guarantorDetails"
                      rows={2}
                      maxLength={2000}
                      placeholder="Name, mobile number and address (optional)"
                      className={textareaClass}
                    />
                  </Field>
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
