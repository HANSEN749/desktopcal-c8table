import type { Entry } from "@desktopcal/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("uses the sidebar blank area for the nearest event details", async () => {
    window.localStorage.clear();
    const today = toDateKey(new Date());
    const base = new Date(`${today}T00:00:00`);
    const tomorrow = toDateKey(addDays(base, 1));
    const entries = [
      makeEntry({
        id: "past",
        localId: "past",
        title: "昨天事项",
        date: toDateKey(addDays(base, -1)),
        importance: 5,
      }),
      makeEntry({
        id: "done",
        localId: "done",
        title: "已完成明天事项",
        date: tomorrow,
        completed: true,
      }),
      makeEntry({
        id: "nearest",
        localId: "nearest",
        title: "最近详情事件",
        date: tomorrow,
        time: "09:00",
        unit: "research",
        kind: "duration",
        importance: 4,
        note: "需要带材料",
        attachments: [
          {
            id: "att-1",
            storage: "local",
            localBlobKey: "attachment:att-1",
            name: "detail.png",
            mime: "image/png",
            size: 512,
            createdAt: "2026-05-29T08:00:00.000Z",
          },
        ],
      }),
      makeEntry({
        id: "later",
        localId: "later",
        title: "更晚事项",
        date: toDateKey(addDays(base, 3)),
      }),
    ];
    render(<App entryRepository={new MemoryEntryRepository(entries)} attachmentRepository={makeAttachmentRepository()} />);

    const card = await screen.findByRole("button", { name: "编辑最近事件：最近详情事件" });
    expect(card).toHaveTextContent("最近事件");
    expect(card).toHaveTextContent(tomorrow);
    expect(card).toHaveTextContent("需要带材料");
    expect(card).toHaveTextContent("1 个附件");

    fireEvent.click(card);
    expect(await screen.findByRole("heading", { name: "编辑事件" })).toBeInTheDocument();
    expect(screen.getByLabelText("标题")).toHaveValue("最近详情事件");
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
      target: { value: "明天 15:30 持续 单位 5星 中央巡检" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(await screen.findByRole("heading", { name: "新增事件" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("日期")).toHaveValue(toDateKey(tomorrow)));
    expect(screen.getByLabelText("时间")).toHaveValue("15:30");
    expect(screen.getByLabelText("标题")).toHaveValue("中央巡检");
    expect(screen.getByRole("button", { name: "持续" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("单位")).toHaveValue("work");
  });

  it("parses compact weekday, afternoon time, kind, source, and importance locally", async () => {
    const today = toDateKey(new Date());
    const base = new Date(`${today}T00:00:00`);
    const friday = 5;
    const offset = friday - base.getDay() + 7;
    render(<App entryRepository={new MemoryEntryRepository()} attachmentRepository={makeAttachmentRepository()} />);

    await screen.findByText("近期暂无事件");
    fireEvent.change(screen.getByLabelText("Quick add title"), {
      target: { value: "下周五下午3点持续单位重要巡检材料" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(await screen.findByRole("heading", { name: "新增事件" })).toBeInTheDocument();
    expect(screen.getByLabelText("日期")).toHaveValue(toDateKey(new Date(base.getTime() + offset * 86_400_000)));
    expect(screen.getByLabelText("时间")).toHaveValue("15:00");
    expect(screen.getByLabelText("标题")).toHaveValue("巡检材料");
    expect(screen.getByRole("button", { name: "持续" })).toHaveAttribute("aria-pressed", "true");
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
    expect(screen.getByRole("button", { name: "持续" })).toHaveAttribute("aria-pressed", "true");
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
    expect(screen.getByRole("button", { name: "持续" })).toHaveAttribute("aria-pressed", "true");
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
