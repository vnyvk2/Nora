const mapWithConcurrency = async <Item, Result>(
  items: Item[],
  concurrency: number,
  mapper: (item: Item, index: number) => Promise<Result>
) => {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    })
  );

  return results;
};

export default mapWithConcurrency;
