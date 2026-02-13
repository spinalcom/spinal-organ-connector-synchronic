export async function ardPaginatedFetch<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{
    count: number;
    records: { item: T[] };
  }>,
  pageSize = 100
) {
  let page = 1;
  let total = 0;
  const all: T[] = [];

  do {
    const res = await fetchPage(page, pageSize);

    if (page === 1) total = res.count;

    const items = res.records?.item ?? [];
    if (items.length === 0) break;

    all.push(...items);
    page++;
  } while (all.length < total);

  return all;
}
