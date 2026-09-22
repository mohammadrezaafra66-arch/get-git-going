/**
 * Product-list label filter.
 *
 * The catalog request must restrict product ids before pagination. Filtering
 * the already-paged rows hides tagged products that are not on the current
 * unfiltered page and leaves `total` equal to the unfiltered count.
 */

export type LabelLink = {
  product_id: string;
  label_id: string;
};

export type CatalogCandidate = {
  id: string;
  labelIds: string[];
  brandId?: string | null;
  categoryId?: string | null;
  productType?: string | null;
  stockStatus?: string | null;
  status?: string | null;
};

export type CatalogListFilter = {
  labelIds: string[];
  brandId?: string | null;
  categoryId?: string | null;
  productType?: string | null;
  stockStatus?: string | null;
  status?: string | null;
};

/** Product ids that carry every requested label. Order is not significant. */
export function productIdsHavingAllLabels(links: LabelLink[], labelIds: string[]): string[] {
  if (labelIds.length === 0) return [];
  const needed = [...new Set(labelIds)];
  const found = new Map<string, Set<string>>();
  for (const link of links) {
    if (!needed.includes(link.label_id)) continue;
    const set = found.get(link.product_id) ?? new Set<string>();
    set.add(link.label_id);
    found.set(link.product_id, set);
  }
  const ids: string[] = [];
  for (const [productId, set] of found) {
    if (needed.every((id) => set.has(id))) ids.push(productId);
  }
  return ids;
}

export function filterCatalogCandidates<T extends CatalogCandidate>(
  products: T[],
  filters: CatalogListFilter,
): T[] {
  return products.filter((product) => {
    if (filters.labelIds.length > 0) {
      const have = new Set(product.labelIds);
      if (!filters.labelIds.every((id) => have.has(id))) return false;
    }
    if (filters.brandId && product.brandId !== filters.brandId) return false;
    if (filters.categoryId && product.categoryId !== filters.categoryId) return false;
    if (filters.productType && product.productType !== filters.productType) return false;
    if (filters.stockStatus && product.stockStatus !== filters.stockStatus) return false;
    if (filters.status && product.status !== filters.status) return false;
    return true;
  });
}

export function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { rows: T[]; total: number } {
  const size = Math.max(1, pageSize);
  const from = Math.max(0, page) * size;
  return { rows: rows.slice(from, from + size), total: rows.length };
}

/** Filter the ordered catalog, then paginate. `total` is the filtered count. */
export function listCatalogPage<T extends CatalogCandidate>(
  ordered: T[],
  filters: CatalogListFilter,
  page: number,
  pageSize: number,
): { rows: T[]; total: number } {
  return paginateRows(filterCatalogCandidates(ordered, filters), page, pageSize);
}

/**
 * Combine a text-search id list with a label-match id list.
 * `ids === null` means "do not add an id restriction".
 */
export function restrictProductIds(
  textIds: string[] | null,
  labelMatchIds: string[] | null,
): { empty: boolean; ids: string[] | null } {
  if (textIds && labelMatchIds) {
    const allow = new Set(labelMatchIds);
    const ids = textIds.filter((id) => allow.has(id));
    return { empty: ids.length === 0, ids };
  }
  if (labelMatchIds) return { empty: labelMatchIds.length === 0, ids: labelMatchIds };
  if (textIds) return { empty: textIds.length === 0, ids: textIds };
  return { empty: false, ids: null };
}
