"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { createSaleRegistration } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SquarePlus, ShoppingBag, Trash2 } from "lucide-react";

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
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

const sectionClass =
  "grid grid-cols-1 gap-4 rounded-xl border border-border/70 p-4 sm:grid-cols-2 sm:p-5";

function SectionHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 sm:col-span-2">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
        {number}
      </div>
      <div>
        <h2 className="font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
    <div className="min-w-0 space-y-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? " *" : ""}
      </Label>
      {children}
    </div>
  );
}

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
  const [draftQuantity, setDraftQuantity] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedSaleItem[]>([]);
  const [advancePayment, setAdvancePayment] = useState("");
  const [monthlyInstallmentAmount, setMonthlyInstallmentAmount] = useState("");
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

    return {
      total,
      advance,
      balance,
      installmentCount,
      finalInstallment,
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
    if (!selectedProduct || !draftStockQuantity) return;

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

    if (existingQuantity + quantity > draftStockQuantity) {
      return;
    }

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
    setDraftQuantity("");
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {formErrors[formState.error] ?? formErrors.failed}
        </div>
      )}
      <Card>
        <CardContent className="space-y-6">
          <section className="grid grid-cols-1 gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(260px,1.15fr)] sm:items-center sm:p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <span className="text-sm font-bold">01</span>
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold tracking-tight">Bill Reference</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  A unique number for this sale.
                </p>
              </div>
            </div>

            <Field label="Bill number" htmlFor="billNumber" required>
              <Input
                id="billNumber"
                name="billNumber"
                placeholder="e.g. BILL-2026-001"
                maxLength={50}
                className="h-11 border-primary/30 bg-background font-semibold tracking-wide focus-visible:border-primary"
                required
              />
            </Field>
          </section>

          <section className={sectionClass}>
            <SectionHeading
              number="02"
              title="Customer Information"
              description="Customer identity, address, and contact numbers."
            />

            <Field label="Customer name" htmlFor="fullName" required>
              <Input
                id="fullName"
                name="fullName"
                placeholder="Enter full name as on NIC"
                minLength={2}
                maxLength={150}
                autoComplete="name"
                required
              />
            </Field>

            <Field label="Address" htmlFor="address" required>
              <Input
                id="address"
                name="address"
                placeholder="Enter the full residential address"
                minLength={3}
                maxLength={500}
                autoComplete="street-address"
                required
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
              <Field label="NIC number" htmlFor="nic" required>
                <Input
                  id="nic"
                  name="nic"
                  placeholder="Enter NIC number"
                  minLength={10}
                  maxLength={12}
                  autoComplete="off"
                  required
                />
              </Field>

              <Field label="Primary mobile" htmlFor="mobile" required>
                <Input
                  id="mobile"
                  name="mobile"
                  type="tel"
                  placeholder="Main contact number"
                  minLength={7}
                  maxLength={20}
                  autoComplete="tel"
                  required
                />
              </Field>

              <Field label="Additional mobile" htmlFor="additionalMobile">
                <Input
                  id="additionalMobile"
                  name="additionalMobile"
                  type="tel"
                  placeholder="Alternative number (optional)"
                  minLength={7}
                  maxLength={20}
                  autoComplete="tel"
                />
              </Field>
            </div>
          </section>

          <section className={sectionClass}>
            <SectionHeading
              number="03"
              title="Product Details"
              description="Add one or more products to this sale."
            />

            <div className="space-y-5 sm:col-span-2">
              <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
                <Field label="Product" htmlFor="draftProductId" required>
                  <select
                    id="draftProductId"
                    value={draftProductId}
                    onChange={(event) =>
                      handleProductChange(event.target.value)
                    }
                    className={fieldClass}
                  >
                    <option value="">Select a product</option>
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
                      disabled={!selectedProduct}
                      className={fieldClass}
                    >
                      <option value="">Select a brand</option>
                      {selectedProduct.productBrands.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.brandName} — {formatLKR(Number(option.price))}
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
                      placeholder="Select a product first"
                      readOnly
                      disabled={!selectedProduct}
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
                    onChange={(event) => setDraftQuantity(event.target.value)}
                    placeholder="Select a product first"
                    disabled={!selectedProduct}
                  />
                </Field>

                <Field
                  label="Unit price (LKR)"
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
                    onChange={(event) => setDraftUnitPrice(event.target.value)}
                    placeholder="Select a product first"
                    disabled={
                      !selectedProduct ||
                      (selectedProduct.productBrands.length > 1 &&
                        !selectedProductBrand)
                    }
                  />
                </Field>

                {selectedProduct && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:col-span-2">
                    <span>
                      Available stock: {draftStockQuantity ?? "Select a brand"}
                    </span>
                    {selectedProductBrand?.warrantyMonths !== null &&
                      selectedProductBrand?.warrantyMonths !== undefined && (
                        <span>
                          Warranty: {selectedProductBrand.warrantyMonths} months
                        </span>
                      )}
                    {selectedProduct.productBrands.length === 0 &&
                      selectedProduct.warrantyMonths !== null && (
                        <span>
                          Warranty: {selectedProduct.warrantyMonths} months
                        </span>
                      )}
                  </div>
                )}

                <div className="sm:col-span-2">
                  <Button
                    type="button"
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
                    className="w-full sm:w-auto"
                  >
                    <SquarePlus className="size-4" />
                    Add Product
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold tracking-tight">
                      Selected Products
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Review and adjust the products before registering the
                      sale.
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {selectedItems.length} items
                  </span>
                </div>

                {selectedItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
                    <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
                      <ShoppingBag className="size-6 text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm font-medium">
                      No products added yet
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Select a product above and click Add Product.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-border">
                    <div className="hidden grid-cols-[minmax(0,1fr)_100px_145px_145px_40px] gap-3 bg-muted/60 px-4 py-3 text-xs font-semibold text-muted-foreground sm:grid">
                      <span>Product</span>
                      <span>Quantity</span>
                      <span>Unit price</span>
                      <span className="text-right">Subtotal</span>
                      <span />
                    </div>

                    <div className="divide-y divide-border">
                      {selectedItems.map((item) => (
                        <div
                          key={item.key}
                          className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_100px_145px_145px_40px] sm:items-center"
                        >
                          <div className="col-span-2 min-w-0 sm:col-span-1">
                            <p className="truncate text-sm font-semibold">
                              {item.productName}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.brandName ?? "No brand option"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Stock available: {item.stockQuantity}
                            </p>
                          </div>

                          <div>
                            <Label
                              htmlFor={`quantity-${item.key}`}
                              className="mb-1 block text-xs text-muted-foreground sm:hidden"
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
                              className="h-9"
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
                              className="mb-1 block text-xs text-muted-foreground sm:hidden"
                            >
                              Unit price (LKR)
                            </Label>
                            <Input
                              id={`price-${item.key}`}
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={item.unitPrice}
                              className="h-9"
                              onChange={(event) =>
                                handleUpdateItem(item.key, {
                                  unitPrice: event.target.value,
                                })
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between sm:justify-end">
                            <span className="text-xs text-muted-foreground sm:hidden">
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
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleRemoveProduct(item.key)}
                              aria-label={`Remove ${item.productName}`}
                            >
                              <Trash2 className="size-4" />{" "}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Combined product quantity
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {totalProductQuantity} units
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      Total product value
                    </p>
                    <p className="mt-1 text-xl font-bold tabular-nums">
                      {formatLKR(calculations.total)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <SectionHeading
              number="04"
              title="Payment Plan"
              description="Enter the down payment and agreed installment schedule."
            />

            <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
              <Field
                label="Advance payment (LKR)"
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
                  placeholder="Enter advance payment"
                  required
                />
              </Field>

              <Field
                label="Monthly installment (LKR)"
                htmlFor="monthlyInstallmentAmount"
                required={calculations.balance > 0}
              >
                <Input
                  id="monthlyInstallmentAmount"
                  name="monthlyInstallmentAmount"
                  type="number"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                  value={monthlyInstallmentAmount}
                  onChange={(event) =>
                    setMonthlyInstallmentAmount(event.target.value)
                  }
                  placeholder="Agreed monthly amount"
                  required={calculations.balance > 0}
                />
              </Field>

              <Field
                label="First installment date"
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
                  required
                />
              </Field>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-4 sm:col-span-2">
              <p className="text-sm font-medium">Installment calculation</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Installments are scheduled monthly from the first installment
                date. The last payment is adjusted to clear the remaining
                balance.
              </p>
              {calculations.balance === 0 ? (
                <p className="mt-3 text-sm font-medium text-green-700 dark:text-green-400">
                  The advance covers the full sale amount. No installments are
                  required.
                </p>
              ) : calculations.installmentCount > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Number of installments
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {calculations.installmentCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Regular payment
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {formatLKR(moneyInput(monthlyInstallmentAmount))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Final payment
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {formatLKR(calculations.finalInstallment)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Enter a positive monthly installment amount to calculate the
                  schedule.
                </p>
              )}
            </div>

            <Field label="Dispatch date" htmlFor="saleDate" required>
              <Input
                id="saleDate"
                name="saleDate"
                type="date"
                value={saleDate}
                onChange={(event) => setSaleDate(event.target.value)}
                required
              />
            </Field>

            <Field label="Salesman" htmlFor="salesEmployeeId">
              <select
                id="salesEmployeeId"
                name="salesEmployeeId"
                defaultValue=""
                className={fieldClass}
              >
                <option value="">Select an employee (optional)</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </option>
                ))}
              </select>
              {employees.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No active employees are available.
                </p>
              )}
            </Field>
          </section>

          <section className={sectionClass}>
            <SectionHeading
              number="05"
              title="Collection Details & Review"
              description="Add collection information and check the balance before saving."
            />

            <div className="sm:col-span-2">
              <Field label="Location directions / notes" htmlFor="notes">
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  maxLength={2000}
                  placeholder="Optional directions or useful notes for the collection team"
                  className={fieldClass}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
              <Field label="Collection area" htmlFor="area">
                <Input
                  id="area"
                  name="area"
                  placeholder="Town, village, or collection route"
                  maxLength={150}
                />
              </Field>

              <Field
                label="Guarantor contact details"
                htmlFor="guarantorDetails"
              >
                <textarea
                  id="guarantorDetails"
                  name="guarantorDetails"
                  rows={3}
                  maxLength={2000}
                  placeholder="Name, mobile number, and address"
                  className={fieldClass}
                />
              </Field>
            </div>

            <div className="space-y-4 rounded-xl bg-primary/5 p-4 sm:col-span-2 sm:p-5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">
                  Total sale amount
                </span>
                <span className="text-base font-semibold tabular-nums">
                  {formatLKR(calculations.total)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">
                  Down payment
                </span>
                <span className="text-sm font-medium tabular-nums">
                  − {formatLKR(calculations.advance)}
                </span>
              </div>
              <div className="border-t border-border/70 pt-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">Outstanding balance</span>
                  <span className="text-xl font-bold tabular-nums">
                    {formatLKR(calculations.balance)}
                  </span>
                </div>
              </div>
              {calculations.advance > calculations.total && (
                <p className="text-sm text-destructive" role="alert">
                  The advance cannot exceed the total sale amount.
                </p>
              )}
              {calculations.installmentCount > 1200 && (
                <p className="text-sm text-destructive" role="alert">
                  This plan exceeds the maximum supported number of
                  installments.
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.history.back()}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isPending ||
                  products.length === 0 ||
                  !calculations.valid ||
                  calculations.installmentCount > 1200
                }
              >
                {isPending ? "Saving..." : "Register Sale"}
              </Button>
            </div>
          </section>
        </CardContent>
      </Card>
    </form>
  );
}
