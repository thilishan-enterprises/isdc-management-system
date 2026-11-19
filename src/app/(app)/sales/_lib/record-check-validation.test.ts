import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidSaleBillNumber,
  sanitizeSaleBillNumberInput,
  validateSaleRecordCheck,
} from "./record-check-validation";

test("sale bill number accepts exactly four ASCII digits and preserves leading zeroes", () => {
  assert.equal(isValidSaleBillNumber("0001"), true);
  assert.equal(isValidSaleBillNumber("9876"), true);
});

test("bill input rejects non-ASCII characters and limits typing or paste to four digits", () => {
  assert.equal(sanitizeSaleBillNumberInput("00A12"), "0012");
  assert.equal(sanitizeSaleBillNumberInput("123456"), "1234");
  assert.equal(sanitizeSaleBillNumberInput("１２34"), "34");
  assert.equal(sanitizeSaleBillNumberInput("0001"), "0001");
});

test("sale bill number rejects non-four-digit values", () => {
  for (const value of ["", "123", "12345", "12A4", "１２３４", "1-23"]) {
    assert.equal(isValidSaleBillNumber(value), false, value);
  }
});

test("record check returns field-specific errors and accepts a valid record", () => {
  const invalid = validateSaleRecordCheck({
    billNumber: "12",
    fullName: "",
    address: "",
    nic: "123",
    mobile: "07123",
    additionalMobile: "07123",
  });
  assert.deepEqual(Object.keys(invalid), [
    "billNumber",
    "fullName",
    "address",
    "nic",
    "mobile",
    "additionalMobile",
  ]);

  assert.deepEqual(
    validateSaleRecordCheck({
      billNumber: "0042",
      fullName: "Test Customer",
      address: "Test address",
      nic: "200012345678",
      mobile: "0712345678",
      additionalMobile: "0772345678",
    }),
    {},
  );
});
