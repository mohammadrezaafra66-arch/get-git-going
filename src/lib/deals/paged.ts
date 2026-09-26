const PAGE = 200;

export async function fetchAllPages<T>(
  queryPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxRows = Number.POSITIVE_INFINITY,
): Promise<{ rows: T[]; hasMore: boolean }> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const take = Math.min(PAGE, maxRows - out.length);
    if (take <= 0) return { rows: out, hasMore: true };
    const { data, error } = await queryPage(from, from + take - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < take) return { rows: out, hasMore: false };
    from += take;
    if (out.length >= maxRows) return { rows: out, hasMore: true };
  }
}
