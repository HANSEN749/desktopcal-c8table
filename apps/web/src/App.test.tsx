import type { Entry } from "@desktopcal/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { addDays, toDateKey } from "./domain/date";
import type { AttachmentRepository, EntryDraft, EntryRepository } from "./repositories/EntryRepository";
import { createEntryFromDraft, touchEntry } from "./repositories/EntryRepository";
import { makeEntry } from "./test/factories";

class MemoryEntryRepository implements EntryRepository {
  list = vi.fn(async () => this.entries);
  create = vi.fn(async (draft: EntryDraft) => {
    const entry = createEntryFromDraft(draft, `rec-${this.entries.length + 1}`);
    this.entries = [entry, ...this.entries];
    return entry;
  });
  update = vi.fn(async (entry: Entry) => {
    const updated = touchEntry(entry);
    this.entries = this.entries.map((item) => (item.id === updated.id ? updated : item));
    return updated;
  });
  delete = vi.fn(async (id: string) => {
    this.entries = this.entries.filter((entry) => entry.id !== id);
  });

  constructor(private entries: Entry[] = []) {}
}

function makeAttachmentRepository(): AttachmentRepository {
  return {
    add: vi.fn(async (file: File) => ({
      id: "att-1",
      storage: "local" as const,
      localBlobKey: "attachment:att-1",
      name: file.name,
      mime: file.type,
      size: file.size,
      createdAt: "2026-05-27T08:00:00.000Z",
      kind: "image" as const,
    })),
    get: vi.fn(async () => new Blob(["image-bytes"], { type: "image/png" })),
    remove: vi.fn(async () => undefined),
  };
}

describe("App event interactions", () => {
  it("requires c8table OAuth before entering the public web app when configured", async () => {
    const storage = window.localStorage;
    storage.clear();
    storage.setItem("desktopcal.teable.oauth.clientId", "client-id");
    try {
      render(<App attachmentRepository={makeAttachmentRepository()} requireTeableOAuth storage={storage} />);

      expect(await screen.findByRole("main", { name: "c8table OAuth required" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "待办历" })).toBeInTheDocument();
      expect(screen.getByText("把待办和日历融合在一起的个人效率 app。")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "使用 c8table 登录" })).toBeEnabled();
      expect(screen.queryByText("授权方式")).not.toBeInTheDocument();
      expect(screen.queryByText("回调 URL")).not.toBeInTheDocument();
      expect(screen.queryByText("近期暂无事件")).not.toBeInTheDocument();
    } finally {
      storage.clear();
    }
  });

  it("opens the event drawer on date double-click with that date prefilled", async () => {
    const today = toDateKey(new Date());
    render(<App entryRepository={new MemoryEntryRepository()} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findByText("近期暂无事件");
    expect(screen.getByRole("button", { name: "常用视图" })).toHaveClass("active");
    fireEvent.doubleClick(screen.getByTestId(`common-day-${today}`));

    expect(screen.getByRole("heading", { name: "新增事件" })).toBeInTheDocument();
    expect(screen.getByLabelText("日期")).toHaveValue(today);
    expect(screen.getByLabelText("时间")).toBeInTheDocument();
    expect(screen.getByLabelText("单位")).toHaveValue("work");
    expect(screen.getByLabelText("备注")).toBeInTheDocument();
    expect(screen.getByLabelText("添加附件")).toBeInTheDocument();
  });

  it("closes the event drawer when clicking outside it", async () => {
    const today = toDateKey(new Date());
    render(<App entryRepository={new MemoryEntryRepository()} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findByText("近期暂无事件");
    fireEvent.doubleClick(screen.getByTestId(`common-day-${today}`));
    expect(screen.getByRole("heading", { name: "新增事件" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭事件详情" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "新增事件" })).not.toBeInTheDocument();
    });
  });

  it("shows a database visualization warning when no remote table is mounted", async () => {
    const storage = window.localStorage;
    storage.clear();
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => undefined);

    render(<App attachmentRepository={makeAttachmentRepository()} storage={storage} />);

    await screen.findByText("近期暂无事件");
    fireEvent.click(screen.getByRole("button", { name: "进入后台数据库" }));

    expect(alertMock).toHaveBeenCalledWith("尚未挂载多维表格，无法可视化数据库");
    alertMock.mockRestore();
  });

  it("opens the mounted c8table database from the sidebar", async () => {
    const storage = window.localStorage;
    storage.clear();
    const openMock = vi.spyOn(window, "open").mockImplementation(() => ({ closed: false }) as Window);

    render(
      <App
        entryRepository={new MemoryEntryRepository()}
        attachmentRepository={makeAttachmentRepository()}
        storage={storage}
      />,
    );

    await screen.findByText("近期暂无事件");
    fireEvent.click(screen.getByRole("button", { name: "进入后台数据库" }));

    expect(openMock).toHaveBeenCalledWith(
      "https://c8table.com/table/tbl2wWI7diI2vs5anMs",
      "_blank",
      "noopener,noreferrer",
    );
    openMock.mockRestore();
  });

  it("opens the saved visual database URL exactly when one is configured", async () => {
    const storage = window.localStorage;
    storage.clear();
    storage.setItem("desktopcal.database.url", "https://c8table.com/base/app123/table/tbl2wWI7diI2vs5anMs/view/viw123");
    const openMock = vi.spyOn(window, "open").mockImplementation(() => ({ closed: false }) as Window);

    render(
      <App
        entryRepository={new MemoryEntryRepository()}
        attachmentRepository={makeAttachmentRepository()}
        storage={storage}
      />,
    );

    await screen.findByText("近期暂无事件");
    fireEvent.click(screen.getByRole("button", { name: "进入后台数据库" }));

    expect(openMock).toHaveBeenCalledWith(
      "https://c8table.com/base/app123/table/tbl2wWI7diI2vs5anMs/view/viw123",
      "_blank",
      "noopener,noreferrer",
    );
    openMock.mockRestore();
  });

  it("uses the native shell bridge for the database link inside Tauri", async () => {
    const storage = window.localStorage;
    storage.clear();
    const invoke = vi.fn(async () => undefined);
    Object.assign(window, { __TAURI_INTERNALS__: { invoke } });
    const openMock = vi.spyOn(window, "open").mockImplementation(() => ({ closed: false }) as Window);

    render(
      <App
        entryRepository={new MemoryEntryRepository()}
        attachmentRepository={makeAttachmentRepository()}
        storage={storage}
      />,
    );

    await screen.findByText("近期暂无事件");
    fireEvent.click(screen.getByRole("button", { name: "进入后台数据库" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("open_external_url", {
        url: "https://c8table.com/table/tbl2wWI7diI2vs5anMs",
      }),
    );
    expect(openMock).not.toHaveBeenCalled();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    openMock.mockRestore();
  });

  it("saves a new drawer event into the month and upcoming list", async () => {
    const today = toDateKey(new Date());
    const repo = new MemoryEntryRepository();
    render(<App entryRepository={repo} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findByText("近期暂无事件");
    fireEvent.doubleClick(screen.getByTestId(`common-day-${today}`));
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "新增组会" } });
    fireEvent.change(screen.getByLabelText("单位"), { target: { value: "research" } });
    fireEvent.click(screen.getAllByRole("button", { name: "保存" }).at(-1) as HTMLElement);

    await waitFor(() => expect(repo.create).toHaveBeenCalled());
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ unit: "research" }));
    fireEvent.click(screen.getByRole("button", { name: "日历模式" }));
    expect((await screen.findAllByText("新增组会")).length).toBeGreaterThanOrEqual(2);
  });

  it("shows a common schedule window with at least ten events in one day", async () => {
    const today = toDateKey(new Date());
    const base = new Date(`${today}T00:00:00`);
    const entries = Array.from({ length: 12 }, (_, index) =>
      makeEntry({
        id: `rec-${index}`,
        localId: `local-${index}`,
        title: `事项 ${index + 1}`,
        date: today,
        time: `${String(8 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}`,
      }),
    );
    entries.push(
      makeEntry({
        id: "old",
        localId: "old",
        title: "范围外旧事项",
        date: toDateKey(new Date(base.getTime() - 4 * 86_400_000)),
      }),
    );
    render(<App entryRepository={new MemoryEntryRepository(entries)} attachmentRepository={makeAttachmentRepository()} />);

    expect(await screen.findByText("前 3 天到后 11 天")).toBeInTheDocument();
    for (let index = 1; index <= 10; index += 1) {
      expect(screen.getAllByText(`事项 ${index}`).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("还有 2 条")).toBeInTheDocument();
    expect(screen.queryByText("范围外旧事项")).not.toBeInTheDocument();
  });

  it("shows the next dated calendar event in the common header", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-02T22:00:00"));
    try {
      const today = toDateKey(new Date());
      const base = new Date(`${today}T00:00:00`);
      const nextDate = toDateKey(addDays(base, 1));
      const laterDate = toDateKey(addDays(base, 3));
      const entries = [
        makeEntry({
          id: "todo",
          localId: "todo",
          title: "高优先级待办",
          date: today,
          category: "todo",
          importance: 5,
        }),
        makeEntry({
          id: "past-morning",
          localId: "past-morning",
          title: "今天早上已过事件",
          date: today,
          time: "09:00",
        }),
        makeEntry({
          id: "past-night",
          localId: "past-night",
          title: "今天晚上已过事件",
          date: today,
          time: "20:00",
        }),
        makeEntry({
          id: "later",
          localId: "later",
          title: "稍后的明确事件",
          date: laterDate,
          time: "09:00",
        }),
        makeEntry({
          id: "next",
          localId: "next",
          title: "下一个明确事件",
          date: nextDate,
          time: "08:25",
        }),
      ];
      render(<App entryRepository={new MemoryEntryRepository(entries)} attachmentRepository={makeAttachmentRepository()} />);

      expect(await screen.findByRole("button", { name: /下一个明确日期事件/ })).toHaveTextContent("下一个明确事件");
      expect(screen.getByRole("button", { name: /下一个明确日期事件/ })).toHaveTextContent("明天 08:25");
      expect(screen.getByRole("button", { name: /下一个明确日期事件/ })).not.toHaveTextContent("今天早上已过事件");
      expect(screen.getByRole("button", { name: /下一个明确日期事件/ })).not.toHaveTextContent("高优先级待办");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the sidebar blank area for pending todos sorted by importance", async () => {
    window.localStorage.clear();
    const today = toDateKey(new Date());
    const entries = [
      makeEntry({
        id: "calendar",
        localId: "calendar",
        title: "普通日历事件",
        date: today,
        importance: 5,
      }),
      makeEntry({
        id: "done-todo",
        localId: "done-todo",
        title: "已完成代办",
        date: today,
        category: "todo",
        completed: true,
      }),
      makeEntry({
        id: "middle-todo",
        localId: "middle-todo",
        title: "中优先级代办",
        date: today,
        category: "todo",
        unit: "research",
        importance: 3,
        createdAt: "2026-05-29T09:00:00.000Z",
      }),
      makeEntry({
        id: "high-todo",
        localId: "high-todo",
        title: "高优先级代办",
        date: today,
        category: "todo",
        importance: 5,
        createdAt: "2026-05-29T08:00:00.000Z",
      }),
    ];
    render(<App entryRepository={new MemoryEntryRepository(entries)} attachmentRepository={makeAttachmentRepository()} />);

    const highTodo = await screen.findByRole("button", { name: "编辑代办：高优先级代办" });
    const middleTodo = screen.getByRole("button", { name: "编辑代办：中优先级代办" });
    expect(screen.getByLabelText("代办清单")).toHaveTextContent("未完成待办");
    expect(screen.getAllByText("普通日历事件").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "编辑代办：已完成代办" })).not.toBeInTheDocument();
    const todoButtons = screen.getAllByRole("button", { name: /编辑代办：/ });
    expect(todoButtons.indexOf(highTodo)).toBeLessThan(todoButtons.indexOf(middleTodo));

    fireEvent.click(highTodo);
    expect(await screen.findByRole("heading", { name: "编辑代办" })).toBeInTheDocument();
    expect(screen.getByLabelText("标题")).toHaveValue("高优先级代办");
    expect(screen.queryByLabelText("时间")).not.toBeInTheDocument();
  });

  it("marks a sidebar todo as done from the quick action", async () => {
    const today = toDateKey(new Date());
    const repo = new MemoryEntryRepository([
      makeEntry({
        id: "todo-sidebar",
        localId: "todo-sidebar",
        title: "侧栏待办",
        date: today,
        category: "todo",
        importance: 4,
      }),
    ]);
    render(<App entryRepository={repo} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findByRole("button", { name: "编辑代办：侧栏待办" });
    const todoPanel = screen.getByLabelText("代办清单");
    fireEvent.click(within(todoPanel).getByRole("button", { name: "设为已办：侧栏待办" }));

    await waitFor(() =>
      expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({ id: "todo-sidebar", completed: true })),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "编辑代办：侧栏待办" })).not.toBeInTheDocument(),
    );
  });

  it("marks a common-view todo as done without opening the drawer", async () => {
    const today = toDateKey(new Date());
    const repo = new MemoryEntryRepository([
      makeEntry({
        id: "todo-common",
        localId: "todo-common",
        title: "常用视图待办",
        date: today,
        category: "todo",
      }),
    ]);
    render(<App entryRepository={repo} attachmentRepository={makeAttachmentRepository()} />);

    const dayCard = await screen.findByTestId(`common-day-${today}`);
    fireEvent.click(within(dayCard).getByRole("button", { name: "设为已办：常用视图待办" }));

    await waitFor(() =>
      expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({ id: "todo-common", completed: true })),
    );
    expect(screen.queryByRole("heading", { name: "编辑代办" })).not.toBeInTheDocument();
  });

  it("marks a month-calendar todo as done from the inline action", async () => {
    const today = toDateKey(new Date());
    const repo = new MemoryEntryRepository([
      makeEntry({
        id: "todo-month",
        localId: "todo-month",
        title: "月历待办",
        date: today,
        category: "todo",
      }),
    ]);
    render(<App entryRepository={repo} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findByRole("button", { name: "编辑代办：月历待办" });
    fireEvent.click(screen.getByRole("button", { name: "日历模式" }));
    const dayCell = await screen.findByTestId(`day-${today}`);
    fireEvent.click(within(dayCell).getByRole("button", { name: "设为已办：月历待办" }));

    await waitFor(() =>
      expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({ id: "todo-month", completed: true })),
    );
    expect(screen.queryByRole("heading", { name: "编辑代办" })).not.toBeInTheDocument();
  });

  it("marks an existing drawer todo as done from the title action", async () => {
    const today = toDateKey(new Date());
    const repo = new MemoryEntryRepository([
      makeEntry({
        id: "todo-drawer",
        localId: "todo-drawer",
        title: "已有待办",
        date: today,
        category: "todo",
      }),
    ]);
    render(<App entryRepository={repo} attachmentRepository={makeAttachmentRepository()} />);

    fireEvent.click(await screen.findByRole("button", { name: "编辑代办：已有待办" }));
    const heading = await screen.findByRole("heading", { name: "编辑代办" });
    const drawer = heading.closest(".eventDrawer") as HTMLElement;
    fireEvent.click(within(drawer).getByRole("button", { name: "设为已办：已有待办" }));

    await waitFor(() =>
      expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({ id: "todo-drawer", completed: true })),
    );
    await waitFor(() => expect(screen.queryByRole("heading", { name: "编辑代办" })).not.toBeInTheDocument());
  });

  it("creates a todo without time and pins it to the real creation date", async () => {
    const today = toDateKey(new Date());
    const repo = new MemoryEntryRepository();
    render(<App entryRepository={repo} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findByText("近期暂无事件");
    fireEvent.doubleClick(screen.getByTestId(`common-day-${today}`));
    fireEvent.click(screen.getByRole("button", { name: "代办" }));
    expect(screen.queryByLabelText("时间")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "整理发票" } });
    fireEvent.click(screen.getAllByRole("button", { name: "保存" }).at(-1) as HTMLElement);

    await waitFor(() => expect(repo.create).toHaveBeenCalled());
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ category: "todo", time: undefined }));
    expect(await screen.findByRole("button", { name: "编辑代办：整理发票" })).toBeInTheDocument();
    await expect(repo.create.mock.results[0]?.value).resolves.toMatchObject({
      category: "todo",
      date: today,
      time: undefined,
    });
  });

  it("shows todo markers in the calendar and uses a gray hollow marker when completed", async () => {
    const today = toDateKey(new Date());
    const entries = [
      makeEntry({ id: "todo-open", localId: "todo-open", title: "未完成代办", date: today, category: "todo", importance: 5 }),
      makeEntry({
        id: "todo-done",
        localId: "todo-done",
        title: "已完成代办",
        date: today,
        category: "todo",
        completed: true,
        importance: 4,
      }),
    ];
    render(<App entryRepository={new MemoryEntryRepository(entries)} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findByRole("button", { name: "编辑代办：未完成代办" });
    fireEvent.click(screen.getByRole("button", { name: "日历模式" }));

    const openMonthTitle = (await screen.findAllByText("未完成代办")).at(-1) as HTMLElement;
    const doneMonthTitle = (await screen.findAllByText("已完成代办")).at(-1) as HTMLElement;
    const openMarker = openMonthTitle.closest("button")?.querySelector(".marker");
    const doneMarker = doneMonthTitle.closest("button")?.querySelector(".marker");
    expect(openMarker).toHaveTextContent("●");
    expect(openMarker).toHaveClass("todoLevel5");
    expect(doneMarker).toHaveTextContent("○");
    expect(doneMarker).toHaveClass("completed");
  });

  it("organizes many time records by pending groups with completed items collapsed", async () => {
    const today = toDateKey(new Date());
    const entries = [
      makeEntry({ id: "low", localId: "low", title: "低优先级", date: today, time: "08:00", importance: 1 }),
      makeEntry({ id: "high", localId: "high", title: "高优先级", date: today, importance: 5 }),
      makeEntry({ id: "done", localId: "done", title: "已完成事项", date: today, completed: true }),
      ...Array.from({ length: 11 }, (_, index) =>
        makeEntry({
          id: `bulk-${index}`,
          localId: `bulk-${index}`,
          title: `批量事项 ${index + 1}`,
          date: today,
          importance: 3,
        }),
      ),
    ];
    render(<App entryRepository={new MemoryEntryRepository(entries)} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findAllByText("高优先级");
    fireEvent.click(screen.getByRole("button", { name: "时间记录" }));

    expect(await screen.findByRole("heading", { name: "当前与后续" })).toBeInTheDocument();
    expect(screen.getByText("还有 3 条，展开全部")).toBeInTheDocument();
    expect(screen.queryByText("已完成事项")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /已完成 \/ 历史/ }));
    expect(screen.getByText("已完成事项")).toBeInTheDocument();
  });

  it("parses quick add text and opens the drawer for confirmation", async () => {
    const today = toDateKey(new Date());
    const tomorrow = new Date(`${today}T00:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    render(<App entryRepository={new MemoryEntryRepository()} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findByText("近期暂无事件");
    fireEvent.change(screen.getByLabelText("Quick add title"), {
      target: { value: "明天 15:30 截止 单位 5星 中央巡检" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(await screen.findByRole("heading", { name: "新增事件" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("日期")).toHaveValue(toDateKey(tomorrow)));
    expect(screen.getByLabelText("时间")).toHaveValue("15:30");
    expect(screen.getByLabelText("标题")).toHaveValue("中央巡检");
    expect(screen.getByRole("button", { name: "截止" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("单位")).toHaveValue("work");
  });

  it("parses undated task text as a todo", async () => {
    render(<App entryRepository={new MemoryEntryRepository()} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findByText("近期暂无事件");
    fireEvent.change(screen.getByLabelText("Quick add title"), {
      target: { value: "待办 整理发票 很重要" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(await screen.findByRole("heading", { name: "新增代办" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "代办" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("时间")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "截止" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("标题")).toHaveValue("整理发票");
    expect(screen.getAllByRole("radio")[4]).toHaveAttribute("aria-checked", "true");
  });

  it("parses compact weekday, afternoon time, kind, source, and importance locally", async () => {
    const today = toDateKey(new Date());
    const base = new Date(`${today}T00:00:00`);
    const friday = 5;
    const offset = friday - base.getDay() + 7;
    render(<App entryRepository={new MemoryEntryRepository()} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findByText("近期暂无事件");
    fireEvent.change(screen.getByLabelText("Quick add title"), {
      target: { value: "下周五下午3点截止单位重要巡检材料" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(await screen.findByRole("heading", { name: "新增事件" })).toBeInTheDocument();
    expect(screen.getByLabelText("日期")).toHaveValue(toDateKey(new Date(base.getTime() + offset * 86_400_000)));
    expect(screen.getByLabelText("时间")).toHaveValue("15:00");
    expect(screen.getByLabelText("标题")).toHaveValue("巡检材料");
    expect(screen.getByRole("button", { name: "截止" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("radio")[3]).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("单位")).toHaveValue("work");
  });

  it("parses Chinese numeral afternoon time locally", async () => {
    const storage = window.localStorage;
    storage.clear();
    storage.setItem("desktopcal.unitProfiles.v1", JSON.stringify({ work: { label: "学校" } }));
    render(
      <App
        entryRepository={new MemoryEntryRepository()}
        attachmentRepository={makeAttachmentRepository()}
        storage={storage}
      />,
    );

    await screen.findByText("近期暂无事件");
    fireEvent.change(screen.getByLabelText("Quick add title"), {
      target: { value: "5月30日下午三点 学校 东南大学课题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(await screen.findByRole("heading", { name: "新增事件" })).toBeInTheDocument();
    expect(screen.getByLabelText("日期")).toHaveValue(`${new Date().getFullYear()}-05-30`);
    expect(screen.getByLabelText("时间")).toHaveValue("15:00");
    expect(screen.getByLabelText("单位")).toHaveValue("work");
    expect(screen.getByLabelText("标题")).toHaveValue("东南大学课题");
  });

  it("extracts deadline, work unit, duration kind, high importance, and link note from long work notices", async () => {
    const storage = window.localStorage;
    storage.clear();
    storage.setItem(
      "desktopcal.unitProfiles.v1",
      JSON.stringify({ work: { label: "中建八局" } }),
    );
    render(
      <App
        entryRepository={new MemoryEntryRepository()}
        attachmentRepository={makeAttachmentRepository()}
        storage={storage}
      />,
    );

    await screen.findByText("近期暂无事件");
    fireEvent.change(screen.getByLabelText("Quick add title"), {
      target: {
        value:
          "@所有人各位领导同事，请于5月30日前完成巡视整改台账月度进展情况更新。另外请及时归还保密文件。 【腾讯文档】中建八局2026年ZY巡视常态化整改台账 https://docs.qq.com/sheet/demo",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(await screen.findByRole("heading", { name: "新增事件" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("日期")).toHaveValue(`${new Date().getFullYear()}-05-30`));
    expect(screen.getByLabelText("时间")).toHaveValue("");
    expect(screen.getByLabelText("单位")).toHaveValue("work");
    expect(screen.getByRole("button", { name: "截止" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("radio")[4]).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("标题")).toHaveValue("巡视整改台账月度进展情况更新；归还保密文件");
    expect(screen.getByLabelText("备注")).toHaveValue("https://docs.qq.com/sheet/demo");
  });

  it("uses quick add confirmation instead of creating immediately", async () => {
    const repo = new MemoryEntryRepository();
    render(<App entryRepository={repo} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findByText("近期暂无事件");
    fireEvent.change(screen.getByLabelText("Quick add title"), { target: { value: "明天 开会" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(repo.create).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "新增事件" })).toBeInTheDocument();
  });

  it("uses AI parser output for quick add when configured", async () => {
    const storage = window.localStorage;
    storage.clear();
    storage.setItem("desktopcal.aiParser.token", "test-token");
    storage.setItem("desktopcal.aiParser.baseUrl", "https://ai.example/v1");
    storage.setItem("desktopcal.aiParser.model", "v4-flash");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "给领导发巡检材料",
                  date: "2026-05-29",
                  time: "15:00",
                  unit: "work",
                  kind: "duration",
                  importance: 5,
                  note: "AI parsed",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App entryRepository={new MemoryEntryRepository()} attachmentRepository={makeAttachmentRepository()} storage={storage} />);

    await screen.findByText("近期暂无事件");
    fireEvent.change(screen.getByLabelText("Quick add title"), {
      target: { value: "下周提醒我给领导材料，挺重要，算单位事项" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(await screen.findByRole("heading", { name: "新增事件" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ai.example/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
    await waitFor(() => expect(screen.getByLabelText("日期")).toHaveValue("2026-05-29"));
    expect(screen.getByLabelText("时间")).toHaveValue("15:00");
    expect(screen.getByLabelText("标题")).toHaveValue("给领导发巡检材料");
    expect(screen.getByRole("button", { name: "截止" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("AI parsed")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("edits an existing event through the drawer and calls update", async () => {
    const today = toDateKey(new Date());
    const repo = new MemoryEntryRepository([
      makeEntry({ id: "rec-1", localId: "local-1", title: "原事件", date: today }),
    ]);
    render(<App entryRepository={repo} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findAllByText("原事件");
    fireEvent.click(screen.getAllByText("原事件")[0]);
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "更新事件" } });
    fireEvent.click(screen.getAllByRole("button", { name: "保存" }).at(-1) as HTMLElement);

    await waitFor(() => expect(repo.update).toHaveBeenCalled());
    expect((await screen.findAllByText("更新事件")).length).toBeGreaterThanOrEqual(1);
  });

  it("shows uploaded local attachment names in the drawer", async () => {
    const today = toDateKey(new Date());
    const attachments = makeAttachmentRepository();
    render(<App entryRepository={new MemoryEntryRepository()} attachmentRepository={attachments} />);

    await screen.findByText("近期暂无事件");
    fireEvent.doubleClick(screen.getByTestId(`common-day-${today}`));
    await userEvent.upload(
      screen.getByLabelText("添加附件"),
      new File(["image-bytes"], "photo.png", { type: "image/png" }),
    );

    expect(await screen.findByText("photo.png")).toBeInTheDocument();
    expect(attachments.add).toHaveBeenCalled();
  });

  it("persists custom source names in settings", async () => {
    const storage = window.localStorage;
    storage.clear();
    const { container, unmount } = render(
      <App entryRepository={new MemoryEntryRepository()} attachmentRepository={makeAttachmentRepository()} storage={storage} />,
    );

    await screen.findByText("近期暂无事件");
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(
      [...container.querySelectorAll(".markerNameField input")].map((input) => input.getAttribute("aria-label")),
    ).toEqual(["科研名称", "单位名称", "评审名称", "个人名称", "其他名称"]);
    fireEvent.change(screen.getByLabelText("单位名称"), { target: { value: "工作" } });
    expect(screen.getByRole("heading", { name: "分类名称" })).toBeInTheDocument();
    unmount();

    render(
      <App entryRepository={new MemoryEntryRepository()} attachmentRepository={makeAttachmentRepository()} storage={storage} />,
    );
    await screen.findByText("近期暂无事件");
    fireEvent.click(screen.getByRole("button", { name: "设置" }));

    expect(screen.getByLabelText("单位名称")).toHaveValue("工作");
  });
});
