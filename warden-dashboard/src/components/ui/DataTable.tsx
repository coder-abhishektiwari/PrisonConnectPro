import { useState } from 'react';

interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  title?: string;
  subtitle?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  onRowClick?: (item: T) => void;
  loading?: boolean;
  emptyState?: React.ReactNode;
  pageSize?: number;
  renderMap?: Record<string, (item: T) => React.ReactNode>;
}

export function DataTable<T>({
  data,
  columns,
  title,
  subtitle,
  searchable = true,
  searchPlaceholder = 'Search...',
  onRowClick,
  loading = false,
  emptyState,
  pageSize = 10,
  renderMap,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = data.filter((item) => {
    if (!search) return true;
    return columns.some((column) => {
      const value = item[column.key as keyof T];
      if (typeof value === 'string') {
        return value.toLowerCase().includes(search.toLowerCase());
      }
      if (typeof value === 'number') {
        return value.toString().includes(search.toLowerCase());
      }
      return false;
    });
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortKey) return 0;
    const aValue = a[sortKey as keyof T];
    const bValue = b[sortKey as keyof T];
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = sortedData.slice(startIndex, startIndex + pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {(title || subtitle) && (
          <div className="px-6 py-4 border-b border-neutral-200">
            {title && <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>}
            {subtitle && <p className="text-sm text-neutral-600 mt-1">{subtitle}</p>}
          </div>
        )}
        <div className="p-6">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-neutral-100 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (sortedData.length === 0 && emptyState) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {(title || subtitle) && (
          <div className="px-6 py-4 border-b border-neutral-200">
            {title && <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>}
            {subtitle && <p className="text-sm text-neutral-600 mt-1">{subtitle}</p>}
          </div>
        )}
        <div className="p-12">{emptyState}</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
      {/* Header */}
      {(title || subtitle) && (
        <div className="px-6 py-4 border-b border-neutral-200">
          {title && <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>}
          {subtitle && <p className="text-sm text-neutral-600 mt-1">{subtitle}</p>}
        </div>
      )}

      {/* Search */}
      {searchable && (
        <div className="px-6 py-4 border-b border-neutral-200">
          <div className="relative">
            <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer hover:bg-neutral-100' : ''
                  }`}
                  style={{ width: column.width }}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center gap-2">
                    {column.header}
                    {column.sortable && sortKey === column.key && (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {sortDirection === 'asc' ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                        )}
                      </svg>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {paginatedData.map((item, index) => (
              <tr
                key={index}
                onClick={() => onRowClick?.(item)}
                className={`hover:bg-neutral-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((column) => (
                  <td key={column.key} className="px-6 py-4 text-sm text-neutral-900">
                    {column.render 
                      ? column.render(item) 
                      : renderMap?.[column.key] 
                        ? renderMap[column.key](item)
                        : String(item[column.key as keyof T] || '')
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-between">
          <p className="text-sm text-neutral-600">
            Showing {startIndex + 1} to {Math.min(startIndex + pageSize, sortedData.length)} of {sortedData.length} results
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-neutral-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}