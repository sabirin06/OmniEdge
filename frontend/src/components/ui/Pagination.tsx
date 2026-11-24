import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end   = Math.min(page * pageSize, total);

  const pages: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) pages.push(i);
    else if (pages[pages.length - 1] !== '...') pages.push('...');
  }

  return (
    <div className="pagination">
      <span className="pagination-info">Showing {start}–{end} of {total}</span>
      <div className="pagination-controls">
        <button className="page-btn" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={14} />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} style={{ padding: '0 4px', color: 'var(--color-text-muted)' }}>…</span>
          ) : (
            <button
              key={p} className={`page-btn ${p === page ? 'active' : ''}`}
              onClick={() => onPageChange(Number(p))}
            >{p}</button>
          )
        )}
        <button className="page-btn" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
