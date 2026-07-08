import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowData,
  type RowSelectionState,
} from "@tanstack/react-table";

import { Checkbox } from "@/components/ui/checkbox";
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

type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  className?: string;
  emptyMessage?: string;
  selectable?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
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
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: selectable,
    onRowSelectionChange,
    state: selectable ? { rowSelection: rowSelection ?? {} } : undefined,
    getRowId,
  });

  return (
    <div className={cn("rounded-lg border", className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {selectable ? (
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      table.getIsAllPageRowsSelected()
                        ? true
                        : table.getIsSomePageRowsSelected()
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(value) =>
                      table.toggleAllPageRowsSelected(value === true)
                    }
                    aria-label="Select all"
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
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
  );
}
