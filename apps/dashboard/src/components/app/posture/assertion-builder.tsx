import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  ChevronDownIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useId, useState } from "react";

import { AttributeCombobox } from "@/components/app/posture/attribute-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSERTION_TEMPLATES,
  defaultOperatorFor,
  defaultValueFor,
  getAttributeByKey,
  OPERATOR_LABELS,
  type PostureOperator,
} from "@/lib/posture-attributes";
import {
  type AssertionRow,
  createEmptyAssertionRow,
  describeAssertion,
  parseAssertionsToRows,
} from "@/lib/posture-types";
import { cn } from "@/lib/utils";

const ALL_OPERATORS = Object.keys(OPERATOR_LABELS) as PostureOperator[];

export function AssertionBuilder({
  rows,
  onChange,
}: {
  rows: AssertionRow[];
  onChange: (rows: AssertionRow[]) => void;
}) {
  const baseId = useId();

  function updateRow(id: string, patch: Partial<AssertionRow>) {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    if (rows.length <= 1) {
      onChange([createEmptyAssertionRow()]);
      return;
    }
    onChange(rows.filter((row) => row.id !== id));
  }

  function addRow() {
    onChange([...rows, createEmptyAssertionRow()]);
  }

  function applyTemplate(assertions: string[]) {
    onChange(parseAssertionsToRows(assertions));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm">Rules</Label>
        <div className="flex flex-wrap gap-1.5">
          {ASSERTION_TEMPLATES.map((template) => (
            <Button
              key={template.id}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              title={template.description}
              onClick={() => applyTemplate(template.assertions)}
            >
              {template.label}
            </Button>
          ))}
        </div>
      </div>

      <DragDropProvider
        onDragEnd={(event) => {
          if (event.canceled) return;
          onChange(move(rows, event));
        }}
      >
        <ul className="space-y-2" aria-label="Assertion rules">
          {rows.map((row, index) => (
            <SortableAssertionRow
              key={row.id}
              row={row}
              index={index}
              baseId={`${baseId}-${row.id}`}
              onChange={(patch) => updateRow(row.id, patch)}
              onRemove={() => removeRow(row.id)}
            />
          ))}
        </ul>
      </DragDropProvider>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={addRow}
      >
        <PlusIcon className="mr-1.5 size-3.5" />
        Add rule
      </Button>
    </div>
  );
}

function SortableAssertionRow({
  row,
  index,
  baseId,
  onChange,
  onRemove,
}: {
  row: AssertionRow;
  index: number;
  baseId: string;
  onChange: (patch: Partial<AssertionRow>) => void;
  onRemove: () => void;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: row.id,
    index,
    type: "assertion-rule",
    accept: "assertion-rule",
  });

  return (
    <li
      ref={ref}
      className={cn(
        "overflow-hidden rounded-lg border border-border/70 bg-muted/20 transition-[opacity,box-shadow] duration-150",
        isDragging && "z-10 opacity-60 shadow-md ring-1 ring-ring/40",
      )}
    >
      <AssertionRowEditor
        row={row}
        index={index}
        baseId={baseId}
        handleRef={handleRef}
        onChange={onChange}
        onRemove={onRemove}
      />
    </li>
  );
}

function AssertionRowEditor({
  row,
  index,
  baseId,
  handleRef,
  onChange,
  onRemove,
}: {
  row: AssertionRow;
  index: number;
  baseId: string;
  handleRef: (element: Element | null) => void;
  onChange: (patch: Partial<AssertionRow>) => void;
  onRemove: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(row.mode === "custom");
  const attr = getAttributeByKey(row.attribute);
  const operators = attr?.suggestedOperators ?? ALL_OPERATORS;
  const needsValue = row.operator !== "IS SET" && row.operator !== "IS NOT SET";

  function setAttribute(key: string) {
    const next = getAttributeByKey(key);
    const operator = defaultOperatorFor(next);
    onChange({
      attribute: key,
      operator,
      value: defaultValueFor(next, operator),
      mode: "builder",
    });
  }

  function setOperator(operator: PostureOperator) {
    const nextAttr = getAttributeByKey(row.attribute);
    let value = row.value;
    if (operator === "IS SET" || operator === "IS NOT SET") {
      value = null;
    } else if (operator === "IN" || operator === "NOT IN") {
      value = Array.isArray(row.value)
        ? row.value
        : row.value == null || row.value === ""
          ? defaultValueFor(nextAttr, operator)
          : [String(row.value)];
    } else if (Array.isArray(value)) {
      value = defaultValueFor(nextAttr, operator);
    } else if (value === null) {
      value = defaultValueFor(nextAttr, operator);
    }
    onChange({ operator, value, mode: "builder" });
  }

  return (
    <div className="space-y-2.5 p-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          ref={handleRef}
          className="text-muted-foreground hover:text-foreground touch-none mt-0.5 inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md active:cursor-grabbing"
          aria-label={`Drag to reorder rule ${index + 1}`}
        >
          <GripVerticalIcon className="size-3.5" aria-hidden />
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          {row.mode === "custom" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${baseId}-custom`} className="text-xs">
                Custom expression
              </Label>
              <Textarea
                id={`${baseId}-custom`}
                value={row.customExpression}
                onChange={(e) =>
                  onChange({ customExpression: e.target.value, mode: "custom" })
                }
                rows={2}
                className="font-mono text-xs"
                placeholder="device:diskEncryption == true"
              />
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
              <div className="space-y-1">
                <Label htmlFor={`${baseId}-attr`} className="text-xs">
                  Attribute
                </Label>
                <AttributeCombobox
                  id={`${baseId}-attr`}
                  value={row.attribute}
                  onChange={setAttribute}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${baseId}-op`} className="text-xs">
                  Operator
                </Label>
                <Select
                  value={row.operator}
                  onValueChange={(v) => {
                    if (v) setOperator(v as PostureOperator);
                  }}
                >
                  <SelectTrigger id={`${baseId}-op`} className="h-8 w-full">
                    <SelectValue placeholder="Operator">
                      {OPERATOR_LABELS[row.operator]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((op) => (
                      <SelectItem
                        key={op}
                        value={op}
                        label={OPERATOR_LABELS[op]}
                      >
                        <span className="text-xs">{OPERATOR_LABELS[op]}</span>
                        <span className="text-muted-foreground ml-2 font-mono text-[10px]">
                          {op}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Value</Label>
                {needsValue ? (
                  <ValueControl row={row} baseId={baseId} onChange={onChange} />
                ) : (
                  <div className="text-muted-foreground flex h-8 items-center text-xs">
                    No value needed
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="text-muted-foreground text-xs leading-relaxed">
            {describeAssertion(row)}
          </p>
        </div>

        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="shrink-0"
          aria-label="Remove rule"
          onClick={onRemove}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>

      <div className="border-border/60 border-t pt-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((o) => !o)}
        >
          <ChevronDownIcon
            className={cn(
              "size-3 transition-transform duration-150",
              advancedOpen && "rotate-180",
            )}
          />
          Advanced
        </button>
        {advancedOpen ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id={`${baseId}-custom-mode`}
                checked={row.mode === "custom"}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onChange({
                      mode: "custom",
                      customExpression:
                        row.customExpression ||
                        `${row.attribute} ${row.operator}${
                          row.value == null
                            ? ""
                            : Array.isArray(row.value)
                              ? ` [${row.value.map((v) => `'${v}'`).join(", ")}]`
                              : typeof row.value === "string"
                                ? ` '${row.value}'`
                                : ` ${String(row.value)}`
                        }`,
                    });
                  } else {
                    onChange({ mode: "builder" });
                  }
                }}
              />
              <Label
                htmlFor={`${baseId}-custom-mode`}
                className="text-muted-foreground text-xs font-normal"
              >
                Custom expression
              </Label>
            </div>
            {attr ? (
              <Badge variant="outline" className="font-mono text-[10px]">
                {attr.key}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ValueControl({
  row,
  baseId,
  onChange,
}: {
  row: AssertionRow;
  baseId: string;
  onChange: (patch: Partial<AssertionRow>) => void;
}) {
  const attr = getAttributeByKey(row.attribute);

  if (row.operator === "IN" || row.operator === "NOT IN") {
    const list = Array.isArray(row.value) ? row.value : [];
    return (
      <MultiValueInput
        id={`${baseId}-list`}
        values={list}
        suggestions={attr?.enumValues}
        onChange={(values) => onChange({ value: values })}
      />
    );
  }

  if (attr?.valueType === "bool") {
    const checked = row.value === true;
    return (
      <fieldset className="bg-muted/50 m-0 grid h-8 grid-cols-2 rounded-md border border-input p-0.5">
        <legend className="sr-only">Boolean value</legend>
        <button
          type="button"
          id={`${baseId}-bool-on`}
          className={cn(
            "rounded-sm text-xs transition-colors duration-150",
            checked
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={checked}
          onClick={() => onChange({ value: true })}
        >
          Enabled
        </button>
        <button
          type="button"
          id={`${baseId}-bool-off`}
          className={cn(
            "rounded-sm text-xs transition-colors duration-150",
            !checked
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={!checked}
          onClick={() => onChange({ value: false })}
        >
          Disabled
        </button>
      </fieldset>
    );
  }

  if (attr?.enumValues && attr.enumValues.length > 0) {
    const current =
      typeof row.value === "string" ? row.value : (attr.enumValues[0] ?? "");
    return (
      <Select
        value={current}
        onValueChange={(v) => {
          if (v != null) onChange({ value: v });
        }}
      >
        <SelectTrigger id={`${baseId}-enum`} className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {attr.enumValues.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (attr?.valueType === "number") {
    return (
      <Input
        id={`${baseId}-num`}
        type="number"
        className="h-8"
        value={typeof row.value === "number" ? row.value : ""}
        onChange={(e) => {
          const n = e.target.value === "" ? 0 : Number(e.target.value);
          onChange({ value: Number.isFinite(n) ? n : 0 });
        }}
      />
    );
  }

  return (
    <Input
      id={`${baseId}-str`}
      className="h-8"
      value={
        typeof row.value === "string" ? row.value : String(row.value ?? "")
      }
      onChange={(e) => onChange({ value: e.target.value })}
      placeholder="value"
    />
  );
}

function MultiValueInput({
  id,
  values,
  suggestions,
  onChange,
}: {
  id: string;
  values: string[];
  suggestions?: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addValue(raw: string) {
    const next = raw.trim();
    if (!next || values.includes(next)) {
      setDraft("");
      return;
    }
    onChange([...values, next]);
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-input px-1.5 py-1">
        {values.map((item) => (
          <Badge
            key={item}
            variant="secondary"
            className="gap-1 pr-1 font-mono text-[10px]"
          >
            {item}
            <button
              type="button"
              className="hover:bg-muted rounded-sm p-0.5"
              aria-label={`Remove ${item}`}
              onClick={() => onChange(values.filter((v) => v !== item))}
            >
              <XIcon className="size-2.5" />
            </button>
          </Badge>
        ))}
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addValue(draft);
            }
            if (e.key === "Backspace" && draft === "" && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          className="h-6 min-w-[5rem] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          placeholder={values.length === 0 ? "Add value…" : ""}
        />
      </div>
      {suggestions && suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {suggestions
            .filter((s) => !values.includes(s))
            .map((s) => (
              <button
                key={s}
                type="button"
                className="text-muted-foreground hover:text-foreground hover:bg-muted rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors"
                onClick={() => addValue(s)}
              >
                + {s}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
