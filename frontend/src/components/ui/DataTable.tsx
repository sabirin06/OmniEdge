import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Spinner } from './Spinner';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDesc?: string;
  emptyAction?: React.ReactNode;
  selectable?: boolean;
  selected?: Set<number>;
  onSelect?: (id: number) => void;
  onSelectAll?: () => void;
  getRowId?: (row: T) => number;
  keyField?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns, data, loading, error, onRetry, onRowClick,
  emptyTitle = 'No records found', emptyDesc, emptyAction,
  selectable, selected, onSelect, onSelectAll, getRowId, keyField = 'id',
}: DataTableProps<T>) {
  const [sortKey, setSortKey]   = useState<string | null>(null);
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = [...data].sort((a, b) => {
    if (!sortKey) return 0;
    const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? '';
    const cmp = String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  if (loading) return (
    <div className="loading-container" style={{ minHeight: 300 }}>
      <Spinner large />
      <span>Loading…</span>
    </div>
  );
  if (error) return <ErrorState message={error} onRetry={onRetry} />;

  if (!data.length) return (
    <EmptyState title={emptyTitle} description={emptyDesc} action={emptyAction} />
  );

  const allSelected = selected && data.length > 0 && data.every(r => selected.has(Number((r as Record<string, unknown>)[keyField])));

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {selectable && (
              <th style={{ width: 40 }}>
                <input type="checkbox" checked={!!allSelected} onChange={onSelectAll} />
              </th>
            )}
            {columns.map(col => (
              <th
                key={col.key}
                style={{ width: col.width }}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const id = getRowId ? getRowId(row) : Number((row as Record<string, unknown>)[keyField]);
            const isSelected = selected?.has(id);
            return (
              <tr
                key={id ?? i}
                onClick={() => onRowClick?.(row)}
                className={isSelected ? 'selected' : ''}
              >
                {selectable && (
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={!!isSelected} onChange={() => onSelect?.(id)} />
                  </td>
                )}
                {columns.map(col => (
                  <td key={col.key}>
                    {col.render ? col.render(row) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
