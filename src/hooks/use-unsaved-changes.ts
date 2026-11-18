"use client";

import { useEffect, useMemo, useRef } from "react";
import { useUnsavedChangesGuard } from "@/components/common/unsaved-changes-guard";

type ComparableValue =
  | null
  | undefined
  | boolean
  | number
  | string
  | Date
  | ComparableValue[]
  | { [key: string]: ComparableValue };

export function areFormValuesEqual(
  left: ComparableValue,
  right: ComparableValue,
): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (left instanceof Date || right instanceof Date) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => areFormValuesEqual(value, right[index]))
    );
  }
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const leftRecord = left as { [key: string]: ComparableValue };
    const rightRecord = right as { [key: string]: ComparableValue };
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(rightRecord, key) &&
          areFormValuesEqual(leftRecord[key], rightRecord[key]),
      )
    );
  }
  return false;
}

export function useFormDirtyState<T extends ComparableValue>(
  initialValues: T,
  currentValues: T,
) {
  return useMemo(
    () => !areFormValuesEqual(initialValues, currentValues),
    [initialValues, currentValues],
  );
}

type UseUnsavedChangesOptions = {
  onDiscard?: () => void | Promise<void>;
};

export function useUnsavedChanges(
  isDirty: boolean,
  options: UseUnsavedChangesOptions = {},
) {
  const guardId = useRef(Symbol("unsaved-changes-form"));
  const { registerGuard } = useUnsavedChangesGuard();

  useEffect(
    () => registerGuard(guardId.current, isDirty, options.onDiscard),
    [isDirty, options.onDiscard, registerGuard],
  );
}
