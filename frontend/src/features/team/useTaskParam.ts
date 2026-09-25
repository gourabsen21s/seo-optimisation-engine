import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** The task sheet is driven by `?task=<id>` so any view can deep-link and open a task in place. */
export function useTaskParam() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("task");
  const taskId = raw != null && /^\d+$/.test(raw) ? Number(raw) : null;
  const update = useCallback(
    (id: number | null) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id == null) next.delete("task");
        else next.set("task", String(id));
        return next;
      }),
    [setParams],
  );
  return { taskId, openTask: (id: number) => update(id), closeTask: () => update(null) };
}
