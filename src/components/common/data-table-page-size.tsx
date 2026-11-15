"use client";

import { useRouter } from "next/navigation";
import { AppSelect } from "@/components/common/app-select";

type Props = {
  value: number;
  options: {
    value: string;
    label: string;
    href: string;
  }[];
};

export function DataTablePageSize({ value, options }: Props) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        Rows per page
      </span>

      <div className="w-[85px]">
        <AppSelect
          value={String(value)}
          options={options.map(({ value, label }) => ({
            value,
            label,
          }))}
          onValueChange={(nextValue) => {
            const selected = options.find(
              (option) => option.value === nextValue,
            );

            if (selected) {
              router.push(selected.href, {
                scroll: false,
              });
            }
          }}
        />
      </div>
    </div>
  );
}
