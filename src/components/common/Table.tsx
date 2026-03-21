import { type ReactNode, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (item: T, index: number) => ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  onRowClick?: (item: T) => void;
  hoverable?: boolean;
  striped?: boolean;
  compact?: boolean;
  emptyState?: ReactNode;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  hoverable = false,
  striped = false,
  compact = false,
  emptyState,
}: TableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  function handleSort(columnKey: string) {
    const column = columns.find(col => col.key === columnKey);
    if (!column?.sortable) return;

    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  }

  const sortedData = [...data];
  if (sortColumn) {
    sortedData.sort((a, b) => {
      const aVal = (a as any)[sortColumn];
      const bVal = (b as any)[sortColumn];

      if (aVal === bVal) return 0;

      const comparison = aVal > bVal ? 1 : -1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const paddingClass = compact ? 'px-3 py-2' : 'px-6 py-3';
  const rowClass = hoverable ? 'hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer' : '';

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-100 dark:bg-slate-800">
          <tr>
            {columns.map((column) => {
              const alignClass = {
                left: 'text-left',
                center: 'text-center',
                right: 'text-right',
              }[column.align || 'left'];

              return (
                <th
                  key={column.key}
                  className={`${paddingClass} ${alignClass} text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider ${column.sortable ? 'cursor-pointer select-none' : ''}`}
                  style={{ width: column.width }}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className={`flex items-center gap-2 ${column.align === 'center' ? 'justify-center' : column.align === 'right' ? 'justify-end' : ''}`}>
                    <span>{column.header}</span>
                    {column.sortable && (
                      <span className="text-slate-400 dark:text-slate-500">
                        {sortColumn === column.key ? (
                          sortDirection === 'asc' ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )
                        ) : (
                          <ChevronsUpDown className="w-4 h-4" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {sortedData.map((item, index) => {
            const stripedClass = striped && index % 2 === 1 ? 'bg-slate-50 dark:bg-slate-900/50' : '';

            return (
              <tr
                key={keyExtractor(item, index)}
                className={`${rowClass} ${stripedClass} transition-colors`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((column) => {
                  const alignClass = {
                    left: 'text-left',
                    center: 'text-center',
                    right: 'text-right',
                  }[column.align || 'left'];

                  return (
                    <td
                      key={column.key}
                      className={`${paddingClass} ${alignClass} text-sm text-slate-900 dark:text-slate-100`}
                    >
                      {column.render
                        ? column.render(item, index)
                        : (item as any)[column.key]}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
