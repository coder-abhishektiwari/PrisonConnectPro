/**
 * Generic pagination + search + sort helper for JSON-DB list endpoints.
 *
 * Usage in a route handler:
 *   const { items, total, limit, offset } = await paginate({ req, data, search, searchFields, sortField, sortDir });
 *   return sendSuccess(res, { items, total, limit, offset });
 */

async function paginate({ req, data, search, searchFields = [], defaultSort = null }) {
  let items = [...data];

  // --- Search ---
  const q = (req.query.search || '').trim().toLowerCase();
  if (q && searchFields.length > 0) {
    items = items.filter((item) =>
      searchFields.some((f) => String(item[f] || '').toLowerCase().includes(q))
    );
  } else if (q && typeof search === 'function') {
    items = items.filter((item) => search(item, q));
  }

  // --- Sort ---
  const sortField = req.query.sortField || defaultSort;
  const sortDir = req.query.sortDir === 'asc' ? 1 : -1;
  if (sortField) {
    items.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return sortDir * (av - bv);
      return sortDir * String(av).localeCompare(String(bv));
    });
  }

  // --- Pagination ---
  const total = items.length;
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const paged = items.slice(offset, offset + limit);

  return { items: paged, total, limit, offset };
}

module.exports = { paginate };
