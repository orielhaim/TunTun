import { useMemo } from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxValue,
} from "@/components/ui/combobox";
import { useTagDefinitions } from "@/lib/queries/management";
import { cn } from "@/lib/utils";

function normalizeTagName(value: string): string {
  return value.trim().replace(/^tag:/i, "").toLowerCase();
}

function useTagOptions(
  orgId: string | undefined,
  extra: readonly string[],
): string[] {
  const { data: definitions } = useTagDefinitions(orgId);
  const extraKey = extra.join("\0");
  return useMemo(() => {
    const names = new Set<string>();
    for (const def of definitions ?? []) {
      names.add(normalizeTagName(def.name));
    }
    for (const tag of extraKey ? extraKey.split("\0") : []) {
      const name = normalizeTagName(tag);
      if (name) names.add(name);
    }
    return [...names].sort();
  }, [definitions, extraKey]);
}

export function TagMultiCombobox({
  orgId,
  value,
  onValueChange,
  placeholder = "Select tags…",
  disabled,
  className,
  id,
}: {
  orgId: string | undefined;
  value: string[];
  onValueChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const selected = useMemo(
    () => [...new Set(value.map(normalizeTagName).filter(Boolean))].sort(),
    [value],
  );
  const items = useTagOptions(orgId, selected);

  return (
    <Combobox
      multiple
      items={items}
      value={selected}
      onValueChange={(next) => {
        onValueChange(
          [
            ...new Set((next ?? []).map(normalizeTagName).filter(Boolean)),
          ].sort(),
        );
      }}
      disabled={disabled}
    >
      <ComboboxChips className={cn(className)} id={id}>
        <ComboboxValue>
          {(selectedValue: string[]) => (
            <>
              {selectedValue.map((tag) => (
                <ComboboxChip aria-label={tag} key={tag}>
                  {tag}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                aria-label={placeholder}
                placeholder={selectedValue.length > 0 ? undefined : placeholder}
                disabled={disabled}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxPopup>
        <ComboboxEmpty>
          {items.length === 0
            ? "No tag definitions yet. Create tags first."
            : "No matching tags."}
        </ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}

export function TagCombobox({
  orgId,
  value,
  onValueChange,
  placeholder = "Select a tag…",
  disabled,
  className,
  id,
}: {
  orgId: string | undefined;
  value: string;
  onValueChange: (tag: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const normalized = normalizeTagName(value);
  const extra = useMemo(() => (normalized ? [normalized] : []), [normalized]);
  const items = useTagOptions(orgId, extra);
  const selected = normalized || null;

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(next) => {
        onValueChange(next ? normalizeTagName(next) : "");
      }}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        className={cn("w-full", className)}
        placeholder={placeholder}
        showClear={Boolean(selected)}
        disabled={disabled}
      />
      <ComboboxPopup>
        <ComboboxEmpty>
          {items.length === 0
            ? "No tag definitions yet. Create tags first."
            : "No matching tags."}
        </ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}

/** Multi-select of tag owners stored as `tag:<name>` (plus `autogroup:admin`). */
export function TagOwnerCombobox({
  orgId,
  value,
  onValueChange,
  placeholder = "Select tag owners…",
  disabled,
  className,
  id,
}: {
  orgId: string | undefined;
  value: string[];
  onValueChange: (owners: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const { data: definitions } = useTagDefinitions(orgId);
  const valueKey = value.join("\0");
  const items = useMemo(() => {
    const names = (definitions ?? []).map(
      (d) => `tag:${normalizeTagName(d.name)}`,
    );
    const current = valueKey ? valueKey.split("\0") : [];
    return [...new Set(["autogroup:admin", ...names, ...current])].sort();
  }, [definitions, valueKey]);

  return (
    <Combobox
      multiple
      items={items}
      value={value}
      onValueChange={(next) => onValueChange(next ?? [])}
      disabled={disabled}
    >
      <ComboboxChips className={cn(className)} id={id}>
        <ComboboxValue>
          {(selectedValue: string[]) => (
            <>
              {selectedValue.map((owner) => (
                <ComboboxChip aria-label={owner} key={owner}>
                  {owner}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                aria-label={placeholder}
                placeholder={selectedValue.length > 0 ? undefined : placeholder}
                disabled={disabled}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxPopup>
        <ComboboxEmpty>No matching owners.</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
