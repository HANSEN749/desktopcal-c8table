import {
  entryUnitProfiles,
  type EntryUnitId,
  type EntryUnitProfile,
  getEntryMarkerSymbol,
  kindLabels,
  shapeLabels,
  type Entry,
} from "@desktopcal/shared";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout, type RepositoryMode } from "./components/AppLayout";
import { CommonScheduleView } from "./components/CommonScheduleView";
import { EventDrawer } from "./components/EventDrawer";
import { MonthCalendar } from "./components/MonthCalendar";
import { QuickAdd } from "./components/QuickAdd";
import { ReportPreview } from "./components/ReportPreview";
import { TimeRecordBoard } from "./components/TimeRecordBoard";
import { UpcomingList } from "./components/UpcomingList";
import { addDays, toDateKey } from "./domain/date";
import { groupUpcomingEntries } from "./domain/upcoming";
import type { AttachmentRepository, EntryDraft, EntryRepository } from "./repositories/EntryRepository";
import { sortEntries } from "./repositories/EntryRepository";
import { DEFAULT_FEISHU_BASE_URL } from "./repositories/FeishuBitableEntryRepository";
import { LocalAttachmentRepository } from "./repositories/LocalAttachmentRepository";
import { DEFAULT_TEABLE_BASE_URL, DEFAULT_TEABLE_TABLE_ID } from "./repositories/TeableJsonEntryRepository";
import {
  beginTeableOAuthLogin,
  clearTeableOAuthSession,
  completeTeableOAuthCallback,
  ensureFreshTeableOAuthToken,
  getTeableOAuthRedirectUri,
  readActiveTeableOAuthAccount,
  readTeableOAuthAccounts,
  readTeableOAuthConfig,
  readTeableOAuthSession,
  removeTeableOAuthAccount,
  saveStoredOAuthClientId,
  switchTeableOAuthAccount,
  type TeableOAuthAccount,
  type TeableOAuthConfig,
} from "./repositories/TeableOAuth";
import {
  createDefaultEntryRepository,
  readRuntimeRepositoryConfig,
  saveStoredDatabaseUrl,
  saveStoredFeishuConfig,
  saveStoredRepositoryProvider,
  saveStoredTeableToken,
  type FeishuRuntimeConfig,
  type RepositoryProvider,
} from "./repositories/runtimeConfig";

interface DrawerState {
  open: boolean;
  date: string;
  entry?: Entry;
  draft?: EntryDraft;
}

export type AppView = "common" | "calendar" | "time" | "reports" | "settings";

type UnitProfileMap = Record<EntryUnitId, EntryUnitProfile>;

const UNIT_PROFILE_STORAGE_KEY = "desktopcal.unitProfiles.v1";
const AI_PARSER_TOKEN_STORAGE_KEY = "desktopcal.aiParser.token";
const AI_PARSER_BASE_URL_STORAGE_KEY = "desktopcal.aiParser.baseUrl";
const AI_PARSER_MODEL_STORAGE_KEY = "desktopcal.aiParser.model";
const DEFAULT_AI_PARSER_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_AI_PARSER_MODEL = "v4-flash";
const AI_PARSER_TIMEOUT_MS = 900;

interface AiParserConfig {
  token?: string;
  baseUrl: string;
  model: string;
}

interface OAuthViewState {
  config: TeableOAuthConfig;
  connected: boolean;
  expiresAt?: number;
  activeAccount?: TeableOAuthAccount;
  accounts: TeableOAuthAccount[];
}

export interface AppProps {
  entryRepository?: EntryRepository;
  attachmentRepository?: AttachmentRepository;
  storage?: Storage;
}

export function App({ entryRepository, attachmentRepository, storage }: AppProps = {}) {
  const today = useMemo(() => toDateKey(new Date()), []);
  const [tokenRevision, setTokenRevision] = useState(0);
  const runtimeConfig = useMemo(
    () => readRuntimeRepositoryConfig(storage),
    [storage, tokenRevision],
  );
  const oauthState = useMemo(() => readOAuthViewState(storage), [storage, tokenRevision]);
  const attachments = useMemo(
    () =>
      attachmentRepository ??
      new LocalAttachmentRepository(`desktopcal-local-attachments-${runtimeConfig.localStorageScope}`),
    [attachmentRepository, runtimeConfig.localStorageScope],
  );
  const [unitProfiles, setUnitProfiles] = useState<UnitProfileMap>(() => readStoredUnitProfiles(storage));
  const [aiParserRevision, setAiParserRevision] = useState(0);
  const aiParserConfig = useMemo(
    () => readStoredAiParserConfig(storage),
    [storage, aiParserRevision],
  );
  const repository = useMemo(
    () =>
      entryRepository ??
      createDefaultEntryRepository(runtimeConfig, {
        readLocalAttachmentBlob: (attachment) =>
          attachment.localBlobKey ? attachments.get(attachment.localBlobKey) : Promise.resolve(undefined),
      }),
    [attachments, entryRepository, runtimeConfig],
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [range, setRange] = useState<3 | 7 | 14>(7);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, date: today });
  const [activeView, setActiveView] = useState<AppView>("common");
  const [statusText, setStatusText] = useState("正在读取事件");
  const [saveError, setSaveError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const remoteConfigured = Boolean(
    entryRepository ||
      (runtimeConfig.provider === "teable" && runtimeConfig.teableToken) ||
      (runtimeConfig.provider === "feishu" &&
        runtimeConfig.feishu.accessToken &&
        runtimeConfig.feishu.appToken &&
        runtimeConfig.feishu.tableId),
  );
  const mode: RepositoryMode = entryRepository ? "teable" : runtimeConfig.provider;
  const backendLabel = backendModeLabel(mode);
  const databaseUrl = useMemo(
    () => (remoteConfigured ? runtimeDatabaseUrl(runtimeConfig, Boolean(entryRepository)) : undefined),
    [entryRepository, remoteConfigured, runtimeConfig],
  );
  const groups = useMemo(() => groupUpcomingEntries(entries, today, range), [entries, range, today]);

  const refreshEntries = useCallback(
    async (silent = false) => {
      if (!silent) {
        setStatusText(remoteConfigured ? `正在读取 ${backendLabel}` : "正在读取本地备用库");
      }
      const items = await repository.list();
      setEntries(sortEntries(items));
      setStatusText(
        remoteConfigured
          ? `${backendLabel} 已同步 ${items.length} 条事件`
          : `本地备用库 ${items.length} 条事件`,
      );
    },
    [backendLabel, remoteConfigured, repository],
  );

  useEffect(() => {
    let alive = true;
    completeTeableOAuthCallback(oauthState.config, storage)
      .then((result) => {
        if (!alive || result === "none") {
          return;
        }
        setStatusText("c8table OAuth 已连接");
        setTokenRevision((current) => current + 1);
      })
      .catch((error) => {
        if (alive) {
          setSaveError(error instanceof Error ? error.message : "c8table OAuth 登录失败");
        }
      });
    return () => {
      alive = false;
    };
  }, [oauthState.config, storage]);

  useEffect(() => {
    if (!oauthState.config.clientId) {
      return undefined;
    }
    let alive = true;
    const refresh = async () => {
      try {
        const token = await ensureFreshTeableOAuthToken(oauthState.config, storage);
        if (alive && token) {
          setTokenRevision((current) => current + 1);
        }
      } catch (error) {
        if (alive) {
          setSaveError(error instanceof Error ? error.message : "c8table OAuth 刷新失败");
        }
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 8 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [oauthState.config, storage]);

  useEffect(() => {
    let alive = true;
    const load = async (silent = false) => {
      if (!silent) {
        setStatusText(remoteConfigured ? `正在读取 ${backendLabel}` : "正在读取本地备用库");
      }
      repository
        .list()
      .then((items) => {
        if (!alive) {
          return;
        }
        setEntries(sortEntries(items));
        setStatusText(
            remoteConfigured
              ? `${backendLabel} 已同步 ${items.length} 条事件`
              : `本地备用库 ${items.length} 条事件`,
        );
      })
      .catch((error) => {
        if (!alive) {
          return;
        }
        setStatusText(error instanceof Error ? error.message : "读取事件失败");
      });
    };
    void load(false);
    const interval = remoteConfigured ? window.setInterval(() => void load(true), 15_000) : undefined;
    return () => {
      alive = false;
      if (interval) {
        window.clearInterval(interval);
      }
    };
  }, [backendLabel, remoteConfigured, repository]);

  async function prepareQuickEntry(text: string) {
    const localDraft = parseQuickEntry(text, today, unitProfiles);
    const draft = await parseQuickEntryWithAi(text, today, unitProfiles, localDraft, aiParserConfig);
    setSaveError(undefined);
    setDrawer({ open: true, date: draft.date, draft });
  }

  async function saveDrawerEntry(draft: EntryDraft) {
    setBusy(true);
    setSaveError(undefined);
    try {
      if (drawer.entry) {
        const saved = await repository.update({
          ...drawer.entry,
          ...draft,
          attachments: draft.attachments ?? [],
        });
        setEntries((current) =>
          sortEntries(current.map((entry) => (entry.id === saved.id ? saved : entry))),
        );
      } else {
        const saved = await repository.create(draft);
        setEntries((current) => sortEntries([saved, ...current]));
      }
      setDrawer({ open: false, date: draft.date });
      setStatusText(remoteConfigured ? `事件已写入 ${backendLabel}` : "事件已保存到本地备用库");
      await refreshEntries(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDrawerEntry(entry: Entry) {
    setBusy(true);
    setSaveError(undefined);
    try {
      await repository.delete(entry.id);
      await Promise.all(
        entry.attachments.map((attachment) =>
          attachment.localBlobKey ? attachments.remove(attachment.localBlobKey) : Promise.resolve(),
        ),
      );
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setDrawer({ open: false, date: entry.date });
      setStatusText(remoteConfigured ? `事件已从 ${backendLabel} 删除` : "事件已从本地备用库删除");
      await refreshEntries(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function setEntryCompleted(entry: Entry, completed: boolean) {
    setBusy(true);
    setSaveError(undefined);
    try {
      const saved = await repository.update({ ...entry, completed });
      setEntries((current) =>
        sortEntries(current.map((item) => (item.id === saved.id ? saved : item))),
      );
      setStatusText(saved.completed ? "条目已标记完成" : "条目已恢复未完成");
      await refreshEntries(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "更新完成状态失败");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEntryCompleted(entry: Entry) {
    await setEntryCompleted(entry, !(entry.completed ?? false));
  }

  async function completeTodo(entry: Entry) {
    if (entry.completed) {
      return;
    }
    await setEntryCompleted(entry, true);
    if (drawer.entry?.id === entry.id) {
      setDrawer({ open: false, date: entry.date });
    }
  }

  function saveToken(token: string) {
    saveStoredTeableToken(token, storage);
    setTokenRevision((current) => current + 1);
  }

  function clearToken() {
    saveStoredTeableToken("", storage);
    setTokenRevision((current) => current + 1);
  }

  function saveProvider(provider: RepositoryProvider) {
    saveStoredRepositoryProvider(provider, storage);
    setTokenRevision((current) => current + 1);
  }

  function saveFeishuConfig(config: Partial<FeishuRuntimeConfig>) {
    saveStoredFeishuConfig(config, storage);
    setTokenRevision((current) => current + 1);
  }

  function saveDatabaseUrl(url: string) {
    saveStoredDatabaseUrl(url, storage);
    setTokenRevision((current) => current + 1);
  }

  function clearDatabaseUrl() {
    saveStoredDatabaseUrl("", storage);
    setTokenRevision((current) => current + 1);
  }

  function saveOAuthClientId(clientId: string) {
    saveStoredOAuthClientId(clientId, storage);
    setTokenRevision((current) => current + 1);
  }

  async function loginWithOAuth() {
    setSaveError(undefined);
    try {
      await beginTeableOAuthLogin(oauthState.config, storage);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "c8table OAuth 登录失败");
    }
  }

  function logoutOAuth() {
    clearTeableOAuthSession(storage);
    setTokenRevision((current) => current + 1);
    setStatusText("c8table OAuth 已退出");
  }

  function switchOAuthAccount(accountId: string) {
    switchTeableOAuthAccount(accountId, storage);
    setTokenRevision((current) => current + 1);
    setStatusText("已切换 c8table OAuth 账号");
  }

  function removeOAuthAccount(accountId: string) {
    removeTeableOAuthAccount(accountId, storage);
    setTokenRevision((current) => current + 1);
    setStatusText("已移除 c8table OAuth 账号");
  }

  function updateUnitProfileLabel(id: EntryUnitId, label: string) {
    setUnitProfiles((current) => {
      const next = {
        ...current,
        [id]: {
          ...current[id],
          label,
        },
      };
      saveStoredUnitProfiles(next, storage);
      return next;
    });
  }

  function resetUnitProfiles() {
    saveStoredUnitProfiles(entryUnitProfiles, storage);
    setUnitProfiles(entryUnitProfiles);
  }

  function saveAiParserConfig(config: AiParserConfig) {
    saveStoredAiParserConfig(config, storage);
    setAiParserRevision((current) => current + 1);
  }

  function clearAiParserToken() {
    saveStoredAiParserConfig({ ...aiParserConfig, token: undefined }, storage);
    setAiParserRevision((current) => current + 1);
  }

  return (
    <AppLayout
      activeView={activeView}
      entries={entries}
      today={today}
      unitProfiles={unitProfiles}
      databaseUrl={databaseUrl}
      onViewChange={setActiveView}
      onEditEntry={(entry) => setDrawer({ open: true, date: entry.date, entry })}
      onCompleteTodo={(entry) => void completeTodo(entry)}
      quickAdd={<QuickAdd disabled={busy} onAdd={prepareQuickEntry} />}
      drawer={
        <EventDrawer
          open={drawer.open}
          date={drawer.date}
          entry={drawer.entry}
          draft={drawer.draft}
          unitProfiles={unitProfiles}
          saving={busy}
          error={saveError}
          attachmentRepository={attachments}
          onClose={() => setDrawer({ open: false, date: drawer.date })}
          onSave={saveDrawerEntry}
          onDelete={deleteDrawerEntry}
          onCompleteTodo={completeTodo}
        />
      }
    >
      {activeView === "common" ? (
        <CommonScheduleView
          entries={entries}
          today={today}
          unitProfiles={unitProfiles}
          onCreateAtDate={(date) => setDrawer({ open: true, date })}
          onEditEntry={(entry) => setDrawer({ open: true, date: entry.date, entry })}
          onCompleteTodo={(entry) => void completeTodo(entry)}
        />
      ) : null}

      {activeView === "calendar" ? (
        <div className="dashboard">
          <MonthCalendar
            entries={entries}
            today={today}
            currentMonth={currentMonth}
            unitProfiles={unitProfiles}
            onMonthChange={setCurrentMonth}
            onCreateAtDate={(date) => setDrawer({ open: true, date })}
            onEditEntry={(entry) => setDrawer({ open: true, date: entry.date, entry })}
            onCompleteTodo={(entry) => void completeTodo(entry)}
          />

          <section className="rightRail">
            <UpcomingList
              groups={groups}
              today={today}
              range={range}
              unitProfiles={unitProfiles}
              onRangeChange={setRange}
              onEditEntry={(entry) => setDrawer({ open: true, date: entry.date, entry })}
            />
            <ReportPreview entries={entries} today={today} />
          </section>
        </div>
      ) : null}

      {activeView === "time" ? (
        <TimeRecordBoard
          entries={entries}
          today={today}
          unitProfiles={unitProfiles}
          onEditEntry={(entry) => setDrawer({ open: true, date: entry.date, entry })}
          onToggleCompleted={toggleEntryCompleted}
        />
      ) : null}

      {activeView === "reports" ? <ReportPreview entries={entries} today={today} /> : null}

      {activeView === "settings" ? (
        <SettingsView
          mode={mode}
          today={today}
          unitProfiles={unitProfiles}
          aiParserConfig={aiParserConfig}
          oauthState={oauthState}
          runtimeConfig={runtimeConfig}
          statusText={saveError ?? statusText}
          onSaveProvider={saveProvider}
          onSaveToken={saveToken}
          onClearToken={clearToken}
          onSaveFeishuConfig={saveFeishuConfig}
          onSaveDatabaseUrl={saveDatabaseUrl}
          onClearDatabaseUrl={clearDatabaseUrl}
          onSaveOAuthClientId={saveOAuthClientId}
          onLoginWithOAuth={loginWithOAuth}
          onLogoutOAuth={logoutOAuth}
          onSwitchOAuthAccount={switchOAuthAccount}
          onRemoveOAuthAccount={removeOAuthAccount}
          onSaveAiParserConfig={saveAiParserConfig}
          onClearAiParserToken={clearAiParserToken}
          onUnitProfileLabelChange={updateUnitProfileLabel}
          onResetUnitProfiles={resetUnitProfiles}
        />
      ) : null}
    </AppLayout>
  );
}

interface SettingsViewProps {
  mode: RepositoryMode;
  today: string;
  unitProfiles: UnitProfileMap;
  aiParserConfig: AiParserConfig;
  oauthState: OAuthViewState;
  runtimeConfig: ReturnType<typeof readRuntimeRepositoryConfig>;
  statusText: string;
  onSaveProvider(provider: RepositoryProvider): void;
  onSaveToken(token: string): void;
  onClearToken(): void;
  onSaveFeishuConfig(config: Partial<FeishuRuntimeConfig>): void;
  onSaveDatabaseUrl(url: string): void;
  onClearDatabaseUrl(): void;
  onSaveOAuthClientId(clientId: string): void;
  onLoginWithOAuth(): Promise<void>;
  onLogoutOAuth(): void;
  onSwitchOAuthAccount(accountId: string): void;
  onRemoveOAuthAccount(accountId: string): void;
  onSaveAiParserConfig(config: AiParserConfig): void;
  onClearAiParserToken(): void;
  onUnitProfileLabelChange(id: EntryUnitId, label: string): void;
  onResetUnitProfiles(): void;
}

function SettingsView({
  mode,
  today,
  unitProfiles,
  aiParserConfig,
  oauthState,
  runtimeConfig,
  statusText,
  onSaveProvider,
  onSaveToken,
  onClearToken,
  onSaveFeishuConfig,
  onSaveDatabaseUrl,
  onClearDatabaseUrl,
  onSaveOAuthClientId,
  onLoginWithOAuth,
  onLogoutOAuth,
  onSwitchOAuthAccount,
  onRemoveOAuthAccount,
  onSaveAiParserConfig,
  onClearAiParserToken,
  onUnitProfileLabelChange,
  onResetUnitProfiles,
}: SettingsViewProps) {
  const [token, setToken] = useState("");
  const [oauthClientId, setOauthClientId] = useState(oauthState.config.clientId ?? "");
  const [feishuAccessToken, setFeishuAccessToken] = useState("");
  const [feishuAppToken, setFeishuAppToken] = useState(runtimeConfig.feishu.appToken ?? "");
  const [feishuTableId, setFeishuTableId] = useState(runtimeConfig.feishu.tableId ?? "");
  const [feishuBaseUrl, setFeishuBaseUrl] = useState(runtimeConfig.feishu.baseUrl);
  const [databaseUrl, setDatabaseUrl] = useState(runtimeConfig.databaseUrl ?? "");
  const [aiToken, setAiToken] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState(aiParserConfig.baseUrl);
  const [aiModel, setAiModel] = useState(aiParserConfig.model);
  const units = Object.values(unitProfiles);
  const oauthRedirectUri = getTeableOAuthRedirectUri();

  useEffect(() => {
    setOauthClientId(oauthState.config.clientId ?? "");
  }, [oauthState.config.clientId]);

  useEffect(() => {
    setFeishuAppToken(runtimeConfig.feishu.appToken ?? "");
    setFeishuTableId(runtimeConfig.feishu.tableId ?? "");
    setFeishuBaseUrl(runtimeConfig.feishu.baseUrl);
  }, [runtimeConfig.feishu.appToken, runtimeConfig.feishu.baseUrl, runtimeConfig.feishu.tableId]);

  useEffect(() => {
    setDatabaseUrl(runtimeConfig.databaseUrl ?? "");
  }, [runtimeConfig.databaseUrl]);

  function submitToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSaveToken(token);
    setToken("");
  }

  function submitOAuthClientId(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSaveOAuthClientId(oauthClientId);
  }

  function submitFeishuConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSaveFeishuConfig({
      accessToken: feishuAccessToken.trim() || runtimeConfig.feishu.accessToken,
      appToken: feishuAppToken,
      tableId: feishuTableId,
      baseUrl: feishuBaseUrl.trim() || DEFAULT_FEISHU_BASE_URL,
    });
    setFeishuAccessToken("");
  }

  function submitDatabaseUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSaveDatabaseUrl(databaseUrl);
  }

  function clearDatabaseUrl() {
    setDatabaseUrl("");
    onClearDatabaseUrl();
  }

  function submitAiParser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSaveAiParserConfig({
      token: aiToken.trim() || aiParserConfig.token,
      baseUrl: aiBaseUrl.trim() || DEFAULT_AI_PARSER_BASE_URL,
      model: aiModel.trim() || DEFAULT_AI_PARSER_MODEL,
    });
    setAiToken("");
  }

  return (
    <section className="panel fullPanel">
      <div className="paneHeader">
        <div>
          <p className="eyebrow">设置</p>
          <h3>同步、字段与显示规则</h3>
        </div>
      </div>
      <div className="settingsGrid">
        <div>
          <strong>后端</strong>
          <span>{backendModeLabel(mode)}</span>
        </div>
        <div>
          <strong>自动刷新</strong>
          <span>{mode === "local" ? "本地即时保存" : "每 15 秒读取远端表格"}</span>
        </div>
        <div>
          <strong>状态</strong>
          <span>{statusText}</span>
        </div>
      </div>
      <div className="settingsSections">
        <section className="settingsCard providerSettingsCard" aria-label="Backend provider">
          <div className="settingsCardHeader">
            <div>
              <p className="eyebrow">数据后端</p>
              <h4>选择存储方式</h4>
            </div>
          </div>
          <div className="providerPicker" role="group" aria-label="数据后端">
            {([
              ["local", "本地备用库", "不配置远端也能新增、编辑、删除。"],
              ["teable", "c8table", "同步到 c8table 表格。"],
              ["feishu", "飞书多维表格", "同步到飞书 bitable。"],
            ] as const).map(([provider, label, description]) => (
              <button
                aria-pressed={mode === provider}
                className={mode === provider ? "providerOption active" : "providerOption"}
                key={provider}
                type="button"
                onClick={() => onSaveProvider(provider)}
              >
                <strong>{label}</strong>
                <span>{description}</span>
              </button>
            ))}
          </div>
          <p className="settingsStatus">
            本地备用库始终启用；选择远端后，应用会先保存本地，再尝试同步到对应多维表格。
          </p>
        </section>

        <section className="settingsCard" aria-label="c8table connection">
          <div className="settingsCardHeader">
            <div>
              <p className="eyebrow">c8table</p>
              <h4>{runtimeConfig.teableToken ? "已配置" : "未配置"}</h4>
            </div>
            <span>{today}</span>
          </div>
          <dl className="settingsDefinition">
            <div>
              <dt>Base</dt>
              <dd>{DEFAULT_TEABLE_BASE_URL}</dd>
            </div>
            <div>
              <dt>Table</dt>
              <dd>{DEFAULT_TEABLE_TABLE_ID}</dd>
            </div>
            <div>
              <dt>字段模式</dt>
              <dd>fieldKeyType=name，自动创建结构化字段</dd>
            </div>
          </dl>
          <form className="settingsTokenForm" onSubmit={submitToken}>
            <input
              value={token}
              onChange={(event) => setToken(event.currentTarget.value)}
              type="password"
              placeholder="API token"
              aria-label="Teable API token"
            />
            <button type="submit">保存</button>
            <button type="button" onClick={onClearToken}>
              清除令牌
            </button>
          </form>
          <p className="settingsStatus">{statusText}</p>
        </section>

        <section className="settingsCard" aria-label="Feishu bitable connection">
          <div className="settingsCardHeader">
            <div>
              <p className="eyebrow">飞书多维表格</p>
              <h4>
                {runtimeConfig.feishu.accessToken && runtimeConfig.feishu.appToken && runtimeConfig.feishu.tableId
                  ? "已配置"
                  : "未配置"}
              </h4>
            </div>
            <span>bitable</span>
          </div>
          <dl className="settingsDefinition">
            <div>
              <dt>Base</dt>
              <dd>{runtimeConfig.feishu.baseUrl}</dd>
            </div>
            <div>
              <dt>App</dt>
              <dd>{runtimeConfig.feishu.appToken ?? "未设置"}</dd>
            </div>
            <div>
              <dt>Table</dt>
              <dd>{runtimeConfig.feishu.tableId ?? "未设置"}</dd>
            </div>
          </dl>
          <form className="feishuConfigForm" onSubmit={submitFeishuConfig}>
            <label>
              <span>Access token</span>
              <input
                value={feishuAccessToken}
                onChange={(event) => setFeishuAccessToken(event.currentTarget.value)}
                type="password"
                placeholder={runtimeConfig.feishu.accessToken ? "已保存，留空不变" : "tenant/user access token"}
                aria-label="Feishu access token"
              />
            </label>
            <label>
              <span>App token</span>
              <input
                value={feishuAppToken}
                onChange={(event) => setFeishuAppToken(event.currentTarget.value)}
                placeholder="多维表格 app_token"
                aria-label="Feishu app token"
              />
            </label>
            <label>
              <span>Table ID</span>
              <input
                value={feishuTableId}
                onChange={(event) => setFeishuTableId(event.currentTarget.value)}
                placeholder="数据表 table_id"
                aria-label="Feishu table id"
              />
            </label>
            <label>
              <span>Base URL</span>
              <input
                value={feishuBaseUrl}
                onChange={(event) => setFeishuBaseUrl(event.currentTarget.value)}
                aria-label="Feishu base URL"
              />
            </label>
            <button type="submit">保存并切换</button>
          </form>
        </section>

        <section className="settingsCard databaseLinkSettingsCard" aria-label="Database visual link">
          <div className="settingsCardHeader">
            <div>
              <p className="eyebrow">后台数据库</p>
              <h4>{runtimeConfig.databaseUrl ? "已指定" : "自动推断"}</h4>
            </div>
            <span>URL</span>
          </div>
          <form className="settingsTokenForm databaseUrlForm" onSubmit={submitDatabaseUrl}>
            <input
              value={databaseUrl}
              onChange={(event) => setDatabaseUrl(event.currentTarget.value)}
              placeholder="c8table 或飞书多维表格页面 URL"
              aria-label="后台数据库 URL"
            />
            <button type="submit">保存</button>
            <button type="button" onClick={clearDatabaseUrl}>
              清除
            </button>
          </form>
        </section>

        <section className="settingsCard" aria-label="c8table OAuth login">
          <div className="settingsCardHeader">
            <div>
              <p className="eyebrow">OAuth 登录</p>
              <h4>{oauthState.connected ? "OAuth 已连接" : oauthState.config.clientId ? "OAuth 可登录" : "缺少 Client ID"}</h4>
            </div>
            <span>PKCE</span>
          </div>
          <dl className="settingsDefinition">
            <div>
              <dt>授权</dt>
              <dd>桌面和网页共用 c8table OAuth</dd>
            </div>
            <div>
              <dt>回调</dt>
              <dd title={oauthRedirectUri}>{oauthRedirectUri}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>
                {oauthState.connected && oauthState.expiresAt
                  ? `已连接：${oauthAccountLabel(oauthState.activeAccount)}，${new Date(
                      oauthState.expiresAt,
                    ).toLocaleTimeString()} 前刷新`
                  : "未连接"}
              </dd>
            </div>
            <div>
              <dt>本地隔离</dt>
              <dd>{runtimeConfig.localStorageScope}</dd>
            </div>
          </dl>
          {oauthState.accounts.length > 0 ? (
            <div className="oauthAccountList" aria-label="OAuth accounts">
              {oauthState.accounts.map((account) => (
                <div className="oauthAccountRow" key={account.id}>
                  <button
                    aria-pressed={oauthState.activeAccount?.id === account.id}
                    className={oauthState.activeAccount?.id === account.id ? "oauthAccount active" : "oauthAccount"}
                    type="button"
                    onClick={() => onSwitchOAuthAccount(account.id)}
                  >
                    <strong>{oauthAccountLabel(account)}</strong>
                    <span>{account.user.email ?? account.id}</span>
                  </button>
                  <button
                    className="smallTextButton"
                    type="button"
                    onClick={() => onRemoveOAuthAccount(account.id)}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <form className="settingsTokenForm oauthClientForm" onSubmit={submitOAuthClientId}>
            <input
              aria-label="Teable OAuth Client ID"
              onChange={(event) => setOauthClientId(event.currentTarget.value)}
              placeholder="OAuth Client ID"
              value={oauthClientId}
            />
            <button type="submit">保存</button>
            <button disabled={!oauthState.config.clientId} type="button" onClick={() => void onLoginWithOAuth()}>
              登录
            </button>
          </form>
          <button className="smallTextButton" disabled={!oauthState.connected} type="button" onClick={onLogoutOAuth}>
            退出 OAuth
          </button>
        </section>

        <section className="settingsCard" aria-label="AI quick parser">
          <div className="settingsCardHeader">
            <div>
              <p className="eyebrow">AI 解析</p>
              <h4>{aiParserConfig.token ? "已启用" : "未启用"}</h4>
            </div>
          </div>
          <form className="aiParserForm" onSubmit={submitAiParser}>
            <label>
              <span>Base URL</span>
              <input
                value={aiBaseUrl}
                onChange={(event) => setAiBaseUrl(event.currentTarget.value)}
                aria-label="AI parser base URL"
              />
            </label>
            <label>
              <span>模型</span>
              <input
                value={aiModel}
                onChange={(event) => setAiModel(event.currentTarget.value)}
                aria-label="AI parser model"
              />
            </label>
            <label className="aiTokenField">
              <span>API key</span>
              <input
                value={aiToken}
                onChange={(event) => setAiToken(event.currentTarget.value)}
                type="password"
                placeholder={aiParserConfig.token ? "已保存，留空不变" : "API key"}
                aria-label="AI parser API key"
              />
            </label>
            <div className="aiParserActions">
              <button type="submit">保存</button>
              <button type="button" onClick={onClearAiParserToken}>
                清除 key
              </button>
            </div>
          </form>
          <p className="settingsStatus">quick add 会先调用 AI 解析，失败时回退本地规则，并始终打开抽屉确认。</p>
        </section>

        <section className="settingsCard markerSettingsCard" aria-label="Marker rules">
          <div className="settingsCardHeader">
            <div>
              <p className="eyebrow">图标规则</p>
              <h4>分类名称</h4>
            </div>
            <button className="smallTextButton" type="button" onClick={onResetUnitProfiles}>
              恢复默认
            </button>
          </div>
          <div className="markerRuleList">
            {units.map((unit) => (
              <div className="markerRule" key={unit.id}>
                <div className="markerPreview" aria-hidden="true">
                  <span className="marker level3">{getEntryMarkerSymbol(unit.shape, "event")}</span>
                  <span className="marker level3">{getEntryMarkerSymbol(unit.shape, "duration")}</span>
                </div>
                <label className="markerNameField">
                  <input
                    value={unit.label}
                    onChange={(event) =>
                      onUnitProfileLabelChange(unit.id, event.currentTarget.value)
                    }
                    aria-label={`${entryUnitProfiles[unit.id].label}名称`}
                  />
                </label>
                <span className="shapeName">{shapeLabels[unit.shape]}</span>
              </div>
            ))}
          </div>
          <div className="kindRule">
            <span>
              <strong>{kindLabels.event}</strong>
              空心，表示某一时刻发生的事
            </span>
            <span>
              <strong>{kindLabels.duration}</strong>
              实心，表示有截止要求或必须完成的事
            </span>
          </div>
        </section>
      </div>
    </section>
  );
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function backendModeLabel(mode: RepositoryMode): string {
  if (mode === "teable") {
    return "c8table";
  }
  if (mode === "feishu") {
    return "飞书多维表格";
  }
  return "本地备用库";
}

function runtimeDatabaseUrl(
  config: ReturnType<typeof readRuntimeRepositoryConfig>,
  hasInjectedRemote = false,
): string | undefined {
  if (config.databaseUrl) {
    return config.databaseUrl;
  }
  if ((hasInjectedRemote || config.provider === "teable") && (hasInjectedRemote || config.teableToken)) {
    return teableDatabaseUrl(config.teableBaseUrl, config.teableTableId);
  }
  if (config.provider === "feishu" && config.feishu.accessToken && config.feishu.appToken && config.feishu.tableId) {
    return feishuDatabaseUrl(config.feishu.baseUrl, config.feishu.appToken, config.feishu.tableId);
  }
  return undefined;
}

function teableDatabaseUrl(baseUrl: string, tableId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/table/${encodeURIComponent(tableId)}`;
}

function feishuDatabaseUrl(baseUrl: string, appToken: string, tableId: string): string {
  const host = baseUrl.includes("larksuite") ? "https://larksuite.com" : "https://feishu.cn";
  return `${host}/base/${encodeURIComponent(appToken)}?table=${encodeURIComponent(tableId)}`;
}

function readStoredUnitProfiles(storage = browserStorage()): UnitProfileMap {
  if (!storage) {
    return entryUnitProfiles;
  }
  const raw = storage.getItem(UNIT_PROFILE_STORAGE_KEY);
  if (!raw) {
    return entryUnitProfiles;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Record<EntryUnitId, Partial<EntryUnitProfile>>>;
    return mergeUnitProfiles(parsed);
  } catch {
    return entryUnitProfiles;
  }
}

function saveStoredUnitProfiles(profiles: UnitProfileMap, storage = browserStorage()): void {
  storage?.setItem(UNIT_PROFILE_STORAGE_KEY, JSON.stringify(profiles));
}

function readStoredAiParserConfig(storage = browserStorage()): AiParserConfig {
  return {
    token: storage?.getItem(AI_PARSER_TOKEN_STORAGE_KEY)?.trim() || undefined,
    baseUrl: storage?.getItem(AI_PARSER_BASE_URL_STORAGE_KEY)?.trim() || DEFAULT_AI_PARSER_BASE_URL,
    model: storage?.getItem(AI_PARSER_MODEL_STORAGE_KEY)?.trim() || DEFAULT_AI_PARSER_MODEL,
  };
}

function saveStoredAiParserConfig(config: AiParserConfig, storage = browserStorage()): void {
  if (!storage) {
    return;
  }
  if (config.token?.trim()) {
    storage.setItem(AI_PARSER_TOKEN_STORAGE_KEY, config.token.trim());
  } else {
    storage.removeItem(AI_PARSER_TOKEN_STORAGE_KEY);
  }
  storage.setItem(AI_PARSER_BASE_URL_STORAGE_KEY, config.baseUrl.trim() || DEFAULT_AI_PARSER_BASE_URL);
  storage.setItem(AI_PARSER_MODEL_STORAGE_KEY, config.model.trim() || DEFAULT_AI_PARSER_MODEL);
}

function readOAuthViewState(storage = browserStorage()): OAuthViewState {
  const config = readTeableOAuthConfig(storage);
  const session = readTeableOAuthSession(storage);
  const activeAccount = readActiveTeableOAuthAccount(storage);
  return {
    config,
    connected: Boolean(session && session.refreshExpiresAt > Date.now()),
    expiresAt: session?.expiresAt,
    activeAccount,
    accounts: readTeableOAuthAccounts(storage),
  };
}

function oauthAccountLabel(account: TeableOAuthAccount | undefined): string {
  if (!account) {
    return "未识别账号";
  }
  return account.user.name || account.user.email || account.id;
}

function mergeUnitProfiles(
  profiles: Partial<Record<EntryUnitId, Partial<EntryUnitProfile>>>,
): UnitProfileMap {
  const shapes = new Set(Object.keys(shapeLabels));
  return Object.fromEntries(
    Object.values(entryUnitProfiles).map((unit) => {
      const stored = profiles[unit.id];
      const label = typeof stored?.label === "string" && stored.label.trim() ? stored.label.trim() : unit.label;
      const shape = stored?.shape && shapes.has(stored.shape) ? stored.shape : unit.shape;
      return [unit.id, { ...unit, label, shape }];
    }),
  ) as UnitProfileMap;
}

function parseQuickEntry(text: string, today: string, unitProfiles: UnitProfileMap): EntryDraft {
  let rest = text.trim();
  const note = parseQuickNote(rest);
  const date = parseQuickDate(rest, today);
  rest = removeMatchedToken(rest, date.matched);
  const time = parseQuickTime(rest);
  rest = removeMatchedToken(rest, time.matched);
  const category = parseQuickCategory(text, date.matched, time.value);
  const kind = parseQuickKind(rest);
  rest = removeMatchedToken(rest, kind.matched);
  const importance = parseQuickImportance(rest);
  rest = removeMatchedToken(rest, importance.matched);
  const unit = parseQuickUnit(rest, unitProfiles);
  rest = removeMatchedToken(rest, unit.matched);
  const title = cleanupQuickTitle(rest, text);
  return {
    title,
    date: date.value,
    time: category === "todo" ? undefined : time.value,
    category,
    unit: unit.value,
    kind: category === "todo" ? "event" : kind.value,
    importance: importance.value,
    note,
    attachments: [],
  };
}

function parseQuickCategory(text: string, matchedDate: string | undefined, time: string | undefined): EntryDraft["category"] {
  if (/(待办|代办|任务)/.test(text) && !matchedDate && !time) {
    return "todo";
  }
  return "calendar";
}

function parseQuickDate(text: string, today: string): { value: string; matched?: string } {
  const todayDate = new Date(`${today}T00:00:00`);
  const relativeRules: Array<[RegExp, number]> = [
    [/(今天|今日)/, 0],
    [/(明天|明日)/, 1],
    [/(后天|后日)/, 2],
  ];
  for (const [pattern, offset] of relativeRules) {
    const match = text.match(pattern);
    if (match) {
      return { value: toDateKey(addDays(todayDate, offset)), matched: match[0] };
    }
  }
  const fullDate = text.match(/((20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})(?:日|号)?(?:前|之前|以前|截止前)?)/);
  if (fullDate) {
    return {
      value: `${fullDate[2]}-${fullDate[3].padStart(2, "0")}-${fullDate[4].padStart(2, "0")}`,
      matched: fullDate[1],
    };
  }
  const monthDay = text.match(/((\d{1,2})[./月-](\d{1,2})(?:日|号)?(?:前|之前|以前|截止前)?)/);
  if (monthDay) {
    return {
      value: `${todayDate.getFullYear()}-${monthDay[2].padStart(2, "0")}-${monthDay[3].padStart(2, "0")}`,
      matched: monthDay[1],
    };
  }
  const dayOnly = text.match(/((\d{1,2})(?:日|号)(?:前|之前|以前|截止前)?)/);
  if (dayOnly) {
    return {
      value: `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${dayOnly[2].padStart(2, "0")}`,
      matched: dayOnly[1],
    };
  }
  const weekday = text.match(/((下|本|这)?(?:周|星期|礼拜)([一二三四五六日天1-7]))/);
  if (weekday) {
    return { value: resolveWeekdayDate(todayDate, weekday[2], weekday[3]), matched: weekday[1] };
  }
  return { value: today };
}

function parseQuickTime(text: string): { value?: string; matched?: string } {
  const match = text.match(
    /((?:上午|早上|早晨|下午|晚上|今晚|中午)?\s*([01]?\d|2[0-3]|[零〇一二两三四五六七八九十]{1,3})(?:[:：点]([0-5]\d|[零〇一二两三四五六七八九十]{1,3})?(半)?)(?:分)?)/,
  );
  if (!match || !/[点:：]/.test(match[0])) {
    return {};
  }
  const parsedHour = parseTimeNumber(match[2]);
  if (parsedHour === undefined || parsedHour > 23) {
    return {};
  }
  let hour = parsedHour;
  const meridiem = match[1];
  if (/(下午|晚上|今晚)/.test(meridiem) && hour < 12) {
    hour += 12;
  }
  if (/中午/.test(meridiem) && hour < 11) {
    hour += 12;
  }
  const minute = match[4] ? 30 : parseTimeNumber(match[3]) ?? 0;
  if (minute > 59) {
    return {};
  }
  return { value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, matched: match[1].trim() };
}

function parseTimeNumber(token: string | undefined): number | undefined {
  if (!token) {
    return undefined;
  }
  if (/^\d+$/.test(token)) {
    return Number(token);
  }
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (token === "十") {
    return 10;
  }
  if (token.startsWith("十")) {
    return 10 + (digits[token.slice(1)] ?? 0);
  }
  if (token.includes("十")) {
    const [tens, ones] = token.split("十");
    return (digits[tens] ?? 0) * 10 + (ones ? digits[ones] ?? 0 : 0);
  }
  return digits[token];
}

function parseQuickKind(text: string): { value: EntryDraft["kind"]; matched?: string } {
  const duration = text.match(/(持续|长期|推进|跟进|任务|待办|截止|ddl|deadline|前完成|之前完成|完成|提交|更新|整改|归还|处理|落实)/i);
  if (duration) {
    return { value: "duration", matched: duration[0] };
  }
  const event = text.match(/(事件|会议|开会|发生|提醒)/);
  return { value: "event", matched: event?.[0] };
}

function parseQuickImportance(text: string): { value: EntryDraft["importance"]; matched?: string } {
  const level = text.match(/(?:L|l|重要性|星级)\s*([1-5])/);
  if (level) {
    return { value: Number(level[1]) as EntryDraft["importance"], matched: level[0] };
  }
  const stars = text.match(/([1-5])\s*(?:星|级)/);
  if (stars) {
    return { value: Number(stars[1]) as EntryDraft["importance"], matched: stars[0] };
  }
  const important = text.match(/(非常重要|很重要|紧急|高优先级|重要)/);
  if (important) {
    return { value: important[0] === "重要" ? 4 : 5, matched: important[0] };
  }
  const highSignal = text.match(/(领导|保密|巡视|整改|集团|党组|中央|截止|前完成|及时)/);
  if (highSignal) {
    return { value: 5, matched: highSignal[0] };
  }
  const low = text.match(/(不重要|低优先级)/);
  if (low) {
    return { value: 1, matched: low[0] };
  }
  return { value: 3 };
}

function parseQuickUnit(text: string, unitProfiles: UnitProfileMap): { value: EntryUnitId; matched?: string } {
  for (const unit of Object.values(unitProfiles)) {
    if (unit.label && text.includes(unit.label)) {
      return { value: unit.id, matched: unit.label };
    }
  }
  if (/(单位|公司|部门|领导|同事|集团|党组|中建|八局|巡视|整改)/.test(text)) {
    return { value: "work" };
  }
  return { value: "work" };
}

function parseQuickNote(text: string): string | undefined {
  const urls = text.match(/https?:\/\/\S+/g);
  return urls?.join("\n");
}

function cleanupQuickTitle(text: string, originalText: string): string {
  const taskTitle = extractTaskTitle(originalText);
  if (taskTitle) {
    return taskTitle;
  }
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/【[^】]*】/g, " ")
    .replace(/@所有人/g, " ")
    .replace(/各位(?:领导)?同事/g, " ")
    .replace(/请[于在]?/g, " ")
    .replace(/\b(todo|task)\b/gi, " ")
    .replace(/待办|代办/g, " ")
    .replace(/前完成|之前完成|以前完成/g, " ")
    .replace(/另外|及时/g, " ")
    .replace(/[，,。；;：:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || originalText.trim();
}

function extractTaskTitle(text: string): string | undefined {
  const tasks: string[] = [];
  const complete = text.match(/完成([^。；;，,\n]+?)(?:。|；|;|，|,|\n|$)/);
  if (complete?.[1]?.trim()) {
    tasks.push(complete[1].trim());
  }
  const returnFile = text.match(/归还([^。；;，,\n]+?)(?:。|；|;|，|,|\n|$)/);
  if (returnFile?.[1]?.trim()) {
    tasks.push(`归还${returnFile[1].trim()}`);
  }
  return tasks.length > 0 ? tasks.join("；") : undefined;
}

function resolveWeekdayDate(todayDate: Date, weekPrefix: string | undefined, weekdayToken: string): string {
  const numericWeekday =
    weekdayToken === "日" || weekdayToken === "天"
      ? 0
      : /[1-7]/.test(weekdayToken)
        ? Number(weekdayToken) % 7
        : "一二三四五六".indexOf(weekdayToken) + 1;
  const current = todayDate.getDay();
  let offset = numericWeekday - current;
  if (weekPrefix === "下") {
    offset += 7;
  } else if (weekPrefix !== "本" && weekPrefix !== "这" && offset < 0) {
    offset += 7;
  }
  return toDateKey(addDays(todayDate, offset));
}

function removeMatchedToken(text: string, token: string | undefined): string {
  return token ? text.replace(token, " ").replace(/\s+/g, " ").trim() : text;
}

async function parseQuickEntryWithAi(
  text: string,
  today: string,
  unitProfiles: UnitProfileMap,
  fallback: EntryDraft,
  config: AiParserConfig,
): Promise<EntryDraft> {
  if (!config.token) {
    return fallback;
  }
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const responsePromise = fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 260,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              [
                "你是 DesktopCal 的中文快速添加解析器。只返回 JSON，不要解释。",
                "目标是把一句自然语言拆成日历字段，不要改写用户本意。",
                "字段必须是 title,date,time,category,unit,kind,importance,note。",
                "date 必须是 YYYY-MM-DD；time 必须是 HH:mm 或 null；unit 必须从给定 units.id 中选。",
                "category 只能是 calendar 或 todo：todo=没有具体截止时间的代办，只在创建当天归属显示；calendar=有明确日期或时间的日历条目。",
                "如果文本包含待办/代办/任务且没有明确日期和时间，category=todo，time=null。只要文本有明确日期或时间，category=calendar。",
                "date 抽取规则：'5月30日前/之前/截止前/请于5月30日前完成' 的日期就是当年 05-30，不要退回 today。",
                "time 抽取规则：只有明确几点/HH:mm/上午下午时才填；没有明确时间填 null。中文数字也要解析，例如 下午三点=15:00，三点半=03:30，下午三点半=15:30。",
                "unit 抽取规则：如果正文精确包含某个 units.label，选对应 id；含单位/公司/部门/领导/同事/集团/中建/八局/巡视/整改时优先 work。",
                "kind 只能是 event 或 duration：event=某一时刻发生的会议/提醒；duration=截止/必须完成/持续推进/占用时间/任务/提交/更新/整改/归还。",
                "importance 必须是 1-5：默认 3；重要/高优先级=4；紧急/非常重要/领导/保密/巡视/整改/集团/党组/中央/截止/及时=5。",
                "title 只保留要办的事情，删除 @所有人、日期、时间、来源、重要性、截止/事件、链接等元信息。",
                "note 可放链接或补充说明；正文里有 URL 时放入 note。",
                "示例：today=2026-05-28，text='@所有人各位领导同事，请于5月30日前完成巡视整改台账月度进展情况更新。另外请及时归还保密文件。 https://docs.qq.com/x'，输出 {\"title\":\"巡视整改台账月度进展情况更新；归还保密文件\",\"date\":\"2026-05-30\",\"time\":null,\"category\":\"calendar\",\"unit\":\"work\",\"kind\":\"duration\",\"importance\":5,\"note\":\"https://docs.qq.com/x\"}",
                "示例：today=2026-05-28，text='待办 整理发票 很重要'，输出 {\"title\":\"整理发票\",\"date\":\"2026-05-28\",\"time\":null,\"category\":\"todo\",\"unit\":\"work\",\"kind\":\"event\",\"importance\":4,\"note\":null}",
              ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              today,
              text,
              fallback,
              units: Object.values(unitProfiles).map((unit) => ({ id: unit.id, label: unit.label })),
            }),
          },
        ],
      }),
    });
    const timeoutPromise = new Promise<Response | undefined>((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve(undefined);
      }, AI_PARSER_TIMEOUT_MS);
    });
    const response = await Promise.race([responsePromise, timeoutPromise]);
    if (!response) {
      return fallback;
    }
    if (!response.ok) {
      return fallback;
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return fallback;
    }
    return normalizeAiDraft(JSON.parse(content), fallback, unitProfiles);
  } catch {
    return fallback;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeAiDraft(value: unknown, fallback: EntryDraft, unitProfiles: UnitProfileMap): EntryDraft {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : fallback.title;
  const date = typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : fallback.date;
  const time = typeof data.time === "string" && /^\d{2}:\d{2}$/.test(data.time) ? data.time : fallback.time;
  const category = data.category === "todo" || data.category === "calendar" ? data.category : fallback.category;
  const unit =
    typeof data.unit === "string" && Object.prototype.hasOwnProperty.call(unitProfiles, data.unit)
      ? (data.unit as EntryUnitId)
      : fallback.unit;
  const kind = category === "todo" ? "event" : data.kind === "duration" || data.kind === "event" ? data.kind : fallback.kind;
  const importance =
    typeof data.importance === "number" && Number.isInteger(data.importance) && data.importance >= 1 && data.importance <= 5
      ? (data.importance as EntryDraft["importance"])
      : fallback.importance;
  const note = typeof data.note === "string" && data.note.trim() ? data.note.trim() : fallback.note;
  return { ...fallback, title, date, time: category === "todo" ? undefined : time, category, unit, kind, importance, note };
}
