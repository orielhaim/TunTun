import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  type OnChangeFn,
  type RowData,
  type RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
    headerClassName?: string;
  }
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  className?: string;
  emptyMessage?: string;
  selectable?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  /** Defaults to 25. Set `false` to disable pagination. */
  pageSize?: number | false;
};

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  className,
  emptyMessage = "No results.",
  selectable = false,
  rowSelection,
  onRowSelectionChange,
  pageSize: pageSizeProp = 25,
}: DataTableProps<TData>) {
  const paginationEnabled = pageSizeProp !== false;
  const initialPageSize =
    pageSizeProp === false ? Math.max(data.length, 1) : pageSizeProp;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(paginationEnabled
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
    enableRowSelection: selectable,
    onRowSelectionChange,
    getRowId,
    initialState: {
      pagination: {
        pageSize: initialPageSize,
        pageIndex: 0,
      },
    },
    state: selectable ? { rowSelection: rowSelection ?? {} } : undefined,
  });

  const selectedCount = Object.keys(rowSelection ?? {}).filter(
    (k) => rowSelection?.[k],
  ).length;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const from = data.length === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(data.length, (pageIndex + 1) * pageSize);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {selectable ? (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={table.getIsAllPageRowsSelected()}
                      indeterminate={
                        table.getIsSomePageRowsSelected() &&
                        !table.getIsAllPageRowsSelected()
                      }
                      onCheckedChange={(value) =>
                        table.toggleAllPageRowsSelected(value === true)
                      }
                      aria-label="Select all on page"
                    />
                  </TableHead>
                ) : null}
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={header.column.columnDef.meta?.headerClassName}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {selectable ? (
                    <TableCell>
                      <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) =>
                          row.toggleSelected(value === true)
                        }
                        aria-label="Select row"
                      />
                    </TableCell>
                  ) : null}
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cell.column.columnDef.meta?.className}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="text-muted-foreground h-24 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {selectable && selectedCount > 0 && selectedCount < data.length ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
          <span>{selectedCount} selected on this list.</span>
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => table.toggleAllRowsSelected(true)}
          >
            Select all {data.length}
          </Button>
        </div>
      ) : null}

      {paginationEnabled && data.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <p className="text-muted-foreground text-xs">
            {from}–{to} of {data.length}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">Rows</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  if (!value) return;
                  table.setPageSize(Number(value));
                }}
              >
                <SelectTrigger className="h-7 w-[72px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
                aria-label="Previous page"
              >
                <ChevronLeftIcon />
              </Button>
              <span className="text-muted-foreground min-w-16 text-center text-xs">
                {pageCount === 0 ? 0 : pageIndex + 1} / {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
                aria-label="Next page"
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
