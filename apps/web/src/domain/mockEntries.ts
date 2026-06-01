import type { Entry } from "@desktopcal/shared";
import { addDays, toDateKey } from "./date";

export function createMockEntries(now = new Date()): Entry[] {
  const today = toDateKey(now);
  const tomorrow = toDateKey(addDays(now, 1));
  const dayAfter = toDateKey(addDays(now, 2));

  return [
    {
      id: "mock-1",
      localId: "mock-1",
      unit: "work",
      title: "八局例行汇报",
      date: today,
      time: "09:30",
      category: "calendar",
      shape: "circle",
      kind: "event",
      importance: 3,
      note: "本地 mock 数据，Teable 接入在下一阶段。",
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "mock-2",
      localId: "mock-2",
      unit: "research",
      title: "论文持续任务",
      date: tomorrow,
      category: "calendar",
      shape: "triangle",
      kind: "duration",
      importance: 5,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "mock-3",
      localId: "mock-3",
      unit: "review",
      title: "兼职评审",
      date: dayAfter,
      time: "15:00",
      category: "calendar",
      shape: "square",
      kind: "event",
      importance: 2,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}
