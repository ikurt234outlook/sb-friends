import { emptyState, STORAGE_KEY, type State } from "../shared/types";
export function createStore(storage: {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (data: Record<string, unknown>) => Promise<void>;
}) {
  let chain: Promise<unknown> = Promise.resolve();
  async function read(): Promise<State> {
    const v = (await storage.get(STORAGE_KEY))[STORAGE_KEY] as
      State | undefined;
    if (!v) return emptyState();
    if (v.schemaVersion !== 1 || v.site !== "linux.sb")
      throw new Error("本地数据版本不支持，请先备份后升级扩展。");
    return v;
  }
  function update(fn: (state: State) => State): Promise<State> {
    const task = chain.then(async () => {
      const next = fn(await read());
      try {
        await storage.set({ [STORAGE_KEY]: next });
      } catch (error) {
        if (!/quota|QUOTA/i.test(String(error))) throw error;
        // Only disposable cache is removed; persistent relationship data is retained.
        next.activities = {};
        next.scopes = {};
        if (next.job)
          next.job = {
            ...next.job,
            status: "error",
            error: "缓存空间不足，已清理动态缓存；名单和备注已保留。",
          };
        await storage.set({ [STORAGE_KEY]: next });
        throw new Error(
          "缓存空间不足，已清理动态缓存并保存名单和备注；本轮操作已停止。",
        );
      }
      return next;
    });
    chain = task.catch(() => {});
    return task;
  }
  return {
    read: async () => {
      await chain;
      return read();
    },
    update,
  };
}
