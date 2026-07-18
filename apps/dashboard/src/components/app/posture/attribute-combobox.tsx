import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  attributesByCategory,
  getAttributeByKey,
} from "@/lib/posture-attributes";
import { cn } from "@/lib/utils";

export function AttributeCombobox({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (key: string) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = getAttributeByKey(value);
  const groups = attributesByCategory();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 w-full justify-between px-2.5 font-normal"
          />
        }
      >
        <span className="truncate text-left">
          {selected ? (
            <>
              <span className="text-foreground">{selected.label}</span>
              <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">
                {selected.key}
              </span>
            </>
          ) : value ? (
            <span className="font-mono text-xs">{value}</span>
          ) : (
            <span className="text-muted-foreground">Select attribute…</span>
          )}
        </span>
        <ChevronsUpDownIcon className="text-muted-foreground ml-2 size-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search attributes…" />
          <CommandList>
            <CommandEmpty>No attribute found.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.category} heading={group.label}>
                {group.attributes.map((attr) => (
                  <CommandItem
                    key={attr.key}
                    value={`${attr.label} ${attr.key} ${attr.description}`}
                    data-checked={value === attr.key || undefined}
                    onSelect={() => {
                      onChange(attr.key);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{attr.label}</span>
                      <span className="text-muted-foreground block truncate font-mono text-[10px]">
                        {attr.key}
                      </span>
                    </span>
                    <CheckIcon
                      className={cn(
                        "size-3.5 shrink-0",
                        value === attr.key ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
