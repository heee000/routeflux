import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, JSX, ReactNode } from "react";
import {
  ApiClient,
  type LedgerRecord,
  type ModelRecord,
  type Overview,
  type ProviderRecord,
  type RequestRecord,
  type UserRecord
} from "./api";
import {
  copyFor,
  isLanguage,
  localeFor,
  SUPPORTED_LANGUAGES,
  type Copy,
  type Language
} from "./i18n";

type View = "overview" | "models" | "users" | "requests" | "ledger";

const VIEW_ITEMS: View[] = ["overview", "models", "users", "requests", "ledger"];
const LANGUAGE_STORAGE_KEY = "routeflux_language";
const ADMIN_TOKEN_STORAGE_KEY = "routeflux_admin_token";

const money = (microUsd: string | number | null): string => {
  if (microUsd === null) return "—";
  return `$${(Number(microUsd) / 1_000_000).toFixed(6)}`;
};

const defaultLanguage = (): Language => {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isLanguage(saved)) return saved;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
};

const dateTime = (value: string, language: Language): string => new Intl.DateTimeFormat(localeFor(language), {
  month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
}).format(new Date(value));

function Status({ value, t }: { value: string; t: Copy }): JSX.Element {
  const labels = t.status as Record<string, string>;
  return <span className={`status status-${value}`}>{labels[value] ?? value}</span>;
}

function LanguageMenu({
  language,
  label,
  onChange
}: {
  language: Language;
  label: string;
  onChange: (language: Language) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const currentLanguage = SUPPORTED_LANGUAGES.find((item) => item.value === language) ?? SUPPORTED_LANGUAGES[0];

  const chooseLanguage = (nextLanguage: Language): void => {
    setOpen(false);
    if (nextLanguage !== language) onChange(nextLanguage);
  };

  return (
    <div
      className={`language-menu${open ? " open" : ""}`}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget;
        if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="language-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="language-glyph" aria-hidden="true"><span>文</span><span>A</span></span>
        <span className="language-button-text">{currentLanguage.label}</span>
        <span className={`language-chevron${open ? " open" : ""}`} aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="language-popover" role="menu">
          {SUPPORTED_LANGUAGES.map((item) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={item.value === language}
              className={`language-option${item.value === language ? " active" : ""}`}
              key={item.value}
              onClick={() => chooseLanguage(item.value)}
            >
              <span><strong>{item.label}</strong><small>{item.value === "zh" ? "简体中文界面" : "English interface"}</small></span>
              {item.value === language && <span className="language-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Login({
  language,
  t,
  onLanguageChange,
  onLogin
}: {
  language: Language;
  t: Copy;
  onLanguageChange: (language: Language) => void;
  onLogin: (token: string) => void;
}): JSX.Element {
  const [token, setToken] = useState("");
  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={(event) => { event.preventDefault(); if (token.trim()) onLogin(token.trim()); }}>
        <div className="login-card-top">
          <div className="mark">RF</div>
          <LanguageMenu language={language} label={t.common.language} onChange={onLanguageChange} />
        </div>
        <h1>{t.login.title}</h1>
        <p>{t.login.description}</p>
        <label>{t.login.adminToken}<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoFocus /></label>
        <button type="submit">{t.login.submit}</button>
      </form>
    </main>
  );
}

interface Snapshot {
  overview: Overview | null;
  users: UserRecord[];
  providers: ProviderRecord[];
  models: ModelRecord[];
  requests: RequestRecord[];
  ledger: LedgerRecord[];
}

const EMPTY: Snapshot = { overview: null, users: [], providers: [], models: [], requests: [], ledger: [] };

export function App(): JSX.Element {
  const [language, setLanguageState] = useState<Language>(defaultLanguage);
  const [token, setToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "");
  const [view, setView] = useState<View>("overview");
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"provider" | "model" | "user" | null>(null);

  const t = copyFor(language);
  const client = useMemo(() => new ApiClient(token), [token]);

  const changeLanguage = (nextLanguage: Language): void => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    setLanguageState(nextLanguage);
  };

  const refresh = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [overview, users, providers, models, requests, ledger] = await Promise.all([
        client.overview(), client.users(), client.providers(), client.models(), client.requests(), client.ledger()
      ]);
      setSnapshot({ overview, users: users.data, providers: providers.data, models: models.data, requests: requests.data, ledger: ledger.data });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.loadConsole);
    }
  }, [client, t.errors.loadConsole, token]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    document.documentElement.lang = localeFor(language);
    document.title = t.login.title;
  }, [language, t.login.title]);

  if (!token) {
    return (
      <Login
        language={language}
        t={t}
        onLanguageChange={changeLanguage}
        onLogin={(value) => {
          localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, value);
          setToken(value);
        }}
      />
    );
  }

  const logout = (): void => {
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    setToken("");
    setSnapshot(EMPTY);
  };
  const showNotice = (value: string): void => { setNotice(value); window.setTimeout(() => setNotice(""), 6000); };

  const issueKey = async (user: UserRecord): Promise<void> => {
    const name = window.prompt(t.prompts.keyName(user.email), "default");
    if (!name) return;
    try {
      const created = await client.issueKey(user.id, name);
      showNotice(t.notices.keyCreated(created.api_key));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.issueKey);
    }
  };

  const addCredit = async (user: UserRecord): Promise<void> => {
    const raw = window.prompt(t.prompts.creditAmount(user.email), "10");
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t.errors.creditPositive);
      return;
    }
    try {
      await client.credit(user.id, amount);
      showNotice(t.notices.creditAdded(amount, user.email));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.addCredit);
    }
  };

  return (
    <div className="app-shell">
      <aside>
        <div className="brand"><span className="brand-mark">RF</span><span>RouteFlux</span></div>
        <nav>
          {VIEW_ITEMS.map((item) => (
            <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{t.nav[item]}</button>
          ))}
        </nav>
        <div className="aside-footer"><span className="health-dot" /> {t.shell.apiConfigured}<button onClick={logout}>{t.shell.signOut}</button></div>
      </aside>
      <main className="workspace">
        <header>
          <div><p className="eyebrow">{t.shell.eyebrow}</p><h1>{t.nav[view]}</h1></div>
          <div className="header-actions">
            <LanguageMenu language={language} label={t.common.language} onChange={changeLanguage} />
          </div>
        </header>
        {error && <div className="alert error"><span>{error}</span><button onClick={() => setError("")}>{t.common.dismiss}</button></div>}
        {notice && <div className="alert notice"><code>{notice}</code><button onClick={() => setNotice("")}>{t.common.dismiss}</button></div>}
        {view === "overview" && <OverviewView snapshot={snapshot} language={language} t={t} />}
        {view === "models" && <ModelsView models={snapshot.models} providers={snapshot.providers} t={t} onAddProvider={() => setDialog("provider")} onAddModel={() => setDialog("model")} />}
        {view === "users" && <UsersView users={snapshot.users} t={t} onAdd={() => setDialog("user")} onKey={issueKey} onCredit={addCredit} />}
        {view === "requests" && <RequestsTable requests={snapshot.requests} language={language} t={t} />}
        {view === "ledger" && <LedgerTable entries={snapshot.ledger} language={language} t={t} />}
      </main>
      {dialog === "provider" && <ProviderDialog client={client} t={t} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await refresh(); }} />}
      {dialog === "model" && <ModelDialog client={client} providers={snapshot.providers} t={t} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await refresh(); }} />}
      {dialog === "user" && <UserDialog client={client} t={t} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await refresh(); }} />}
    </div>
  );
}

function OverviewView({ snapshot, language, t }: { snapshot: Snapshot; language: Language; t: Copy }): JSX.Element {
  const data = snapshot.overview;
  return <>
    <section className="metrics">
      <article><span>{t.overview.requests24h}</span><strong>{data?.requests_24h ?? t.common.empty}</strong></article>
      <article><span>{t.overview.monthUsage}</span><strong>{data ? `$${data.spend_month_usd}` : t.common.empty}</strong></article>
      <article><span>{t.overview.activeUsers}</span><strong>{data?.active_users ?? t.common.empty}</strong></article>
      <article><span>{t.overview.activeModels}</span><strong>{data?.active_models ?? t.common.empty}</strong></article>
    </section>
    <section className="panel">
      <div className="panel-title"><div><h2>{t.overview.recentRequests}</h2><p>{t.overview.recentRequestsDescription}</p></div></div>
      <RequestsTable requests={snapshot.requests.slice(0, 12)} compact language={language} t={t} />
    </section>
  </>;
}

function ModelsView({
  models,
  providers,
  t,
  onAddProvider,
  onAddModel
}: {
  models: ModelRecord[];
  providers: ProviderRecord[];
  t: Copy;
  onAddProvider: () => void;
  onAddModel: () => void;
}): JSX.Element {
  return (
    <div className="stack">
      <section className="provider-grid">
        {providers.map((provider) => (
          <article key={provider.id}>
            <div><strong>{provider.display_name}</strong><small>{provider.base_url}</small></div>
            <Status value={provider.health_status ?? "healthy"} t={t} />
            <dl>
              <div><dt>{t.models.latency}</dt><dd>{provider.latency_ema_ms ? `${Math.round(Number(provider.latency_ema_ms))} ms` : t.common.empty}</dd></div>
              <div><dt>{t.models.failures}</dt><dd>{provider.failure_count ?? "0"}</dd></div>
            </dl>
          </article>
        ))}
      </section>
      <section className="panel">
        <div className="panel-title">
          <div><h2>{t.models.catalog}</h2><p>{t.models.catalogSummary(providers.length, models.length)}</p></div>
          <div className="row-actions">
            <button className="secondary" onClick={onAddProvider}>{t.models.addProvider}</button>
            <button onClick={onAddModel} disabled={!providers.length}>{t.models.addModel}</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t.models.table.model}</th><th>{t.models.table.provider}</th><th>{t.models.table.context}</th><th>{t.models.table.input}</th><th>{t.models.table.output}</th><th>{t.models.table.capabilities}</th><th>{t.models.table.status}</th></tr></thead>
            <tbody>{models.map((model) => <tr key={model.id}><td><strong>{model.display_name}</strong><small>{model.slug}</small></td><td>{model.provider_name}</td><td>{model.context_window.toLocaleString()}</td><td>${Number(model.input_price_per_million).toFixed(3)}</td><td>${Number(model.output_price_per_million).toFixed(3)}</td><td><div className="tags">{model.supports_tools && <span>{t.models.capabilities.tools}</span>}{model.supports_vision && <span>{t.models.capabilities.vision}</span>}{model.supports_json && <span>{t.models.capabilities.json}</span>}</div></td><td><Status value={model.enabled ? "active" : "disabled"} t={t} /></td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function UsersView({
  users,
  t,
  onAdd,
  onKey,
  onCredit
}: {
  users: UserRecord[];
  t: Copy;
  onAdd: () => void;
  onKey: (user: UserRecord) => void;
  onCredit: (user: UserRecord) => void;
}): JSX.Element {
  return (
    <section className="panel">
      <div className="panel-title"><div><h2>{t.users.title}</h2><p>{t.users.description}</p></div><button onClick={onAdd}>{t.users.addUser}</button></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t.users.table.user}</th><th>{t.users.table.balance}</th><th>{t.users.table.held}</th><th>{t.users.table.keys}</th><th>{t.users.table.status}</th><th></th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.display_name}</strong><small>{user.email}</small></td><td>{money(user.balance_micro_usd)}</td><td>{money(user.held_micro_usd)}</td><td>{user.api_key_count}</td><td><Status value={user.status} t={t} /></td><td><div className="row-actions"><button className="table-button" onClick={() => void onKey(user)}>{t.users.issueKey}</button><button className="table-button" onClick={() => void onCredit(user)}>{t.users.addCredit}</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function RequestsTable({ requests, language, t, compact = false }: { requests: RequestRecord[]; language: Language; t: Copy; compact?: boolean }): JSX.Element {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>{t.requests.table.time}</th><th>{t.requests.table.route}</th><th>{t.requests.table.domain}</th>{!compact && <th>{t.requests.table.difficulty}</th>}<th>{t.requests.table.tokens}</th><th>{t.requests.table.cost}</th><th>{t.requests.table.latency}</th><th>{t.requests.table.status}</th></tr></thead>
        <tbody>{requests.map((request) => <tr key={request.id}><td>{dateTime(request.created_at, language)}</td><td><strong>{request.selected_model ?? request.requested_model}</strong><small>{request.routing_mode}</small></td><td>{request.primary_domain ?? t.common.empty}</td>{!compact && <td>{request.difficulty ? Number(request.difficulty).toFixed(2) : t.common.empty}</td>}<td>{request.prompt_tokens === null ? t.common.empty : `${request.prompt_tokens} + ${request.completion_tokens ?? 0}`}<small>{request.selected_token_budget ? `${t.requests.cap} ${request.selected_token_budget}` : ""}</small></td><td>{money(request.cost_micro_usd)}</td><td>{request.latency_ms === null ? t.common.empty : `${request.latency_ms} ms`}</td><td><Status value={request.status} t={t} /></td></tr>)}</tbody>
      </table>
      {!requests.length && <div className="empty">{t.requests.empty}</div>}
    </div>
  );
}

function LedgerTable({ entries, language, t }: { entries: LedgerRecord[]; language: Language; t: Copy }): JSX.Element {
  return (
    <section className="panel">
      <div className="panel-title"><div><h2>{t.ledger.title}</h2><p>{t.ledger.description}</p></div></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t.ledger.table.time}</th><th>{t.ledger.table.user}</th><th>{t.ledger.table.type}</th><th>{t.ledger.table.description}</th><th>{t.ledger.table.amount}</th><th>{t.ledger.table.balanceAfter}</th></tr></thead>
          <tbody>{entries.map((entry) => <tr key={entry.id}><td>{dateTime(entry.created_at, language)}</td><td>{entry.email}</td><td><Status value={entry.kind} t={t} /></td><td>{entry.description}</td><td className={Number(entry.amount_micro_usd) >= 0 ? "positive" : "negative"}>{money(entry.amount_micro_usd)}</td><td>{money(entry.balance_after_micro_usd)}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function Dialog({ title, children, closeLabel, onClose }: { title: string; children: ReactNode; closeLabel: string; onClose: () => void }): JSX.Element {
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head"><h2>{title}</h2><button className="icon-button" aria-label={closeLabel} onClick={onClose}>×</button></div>
        {children}
      </section>
    </div>
  );
}

function ProviderDialog({ client, t, onClose, onSaved }: { client: ApiClient; t: Copy; onClose: () => void; onSaved: () => Promise<void> }): JSX.Element {
  const [error, setError] = useState("");
  const d = t.dialogs.provider;
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await client.createProvider({ slug: data.get("slug"), display_name: data.get("display_name"), base_url: data.get("base_url"), api_key: data.get("api_key"), priority: Number(data.get("priority")), timeout_ms: Number(data.get("timeout_ms")) });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.saveProvider);
    }
  };
  return (
    <Dialog title={d.title} closeLabel={t.common.closeDialog} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        {error && <p className="form-error">{error}</p>}
        <div className="form-grid">
          <label>{d.slug}<input name="slug" required placeholder="openai" /></label>
          <label>{d.displayName}<input name="display_name" required placeholder="OpenAI" /></label>
          <label className="wide">{d.baseUrl}<input name="base_url" type="url" required placeholder="https://api.example.com/v1" /></label>
          <label className="wide">{d.apiKey}<input name="api_key" type="password" required /></label>
          <label>{d.priority}<input name="priority" type="number" defaultValue="100" min="0" /></label>
          <label>{d.timeout}<input name="timeout_ms" type="number" defaultValue="60000" min="1000" /></label>
        </div>
        <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>{t.common.cancel}</button><button type="submit">{d.save}</button></div>
      </form>
    </Dialog>
  );
}

function ModelDialog({ client, providers, t, onClose, onSaved }: { client: ApiClient; providers: ProviderRecord[]; t: Copy; onClose: () => void; onSaved: () => Promise<void> }): JSX.Element {
  const [error, setError] = useState("");
  const d = t.dialogs.model;
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const domains = Object.fromEntries(String(data.get("domains") ?? "").split(",").map((value) => value.trim()).filter(Boolean).map((value) => [value, 1]));
    try {
      await client.createModel({ provider_id: data.get("provider_id"), slug: data.get("slug"), upstream_model: data.get("upstream_model"), display_name: data.get("display_name"), context_window: Number(data.get("context_window")), max_output_tokens: Number(data.get("max_output_tokens")), input_price_per_million: Number(data.get("input_price")), output_price_per_million: Number(data.get("output_price")), supports_tools: data.get("supports_tools") === "on", supports_vision: data.get("supports_vision") === "on", supports_json: data.get("supports_json") === "on", domains, metadata: { qualityScore: Number(data.get("quality")), difficultyCapacity: Number(data.get("difficulty")), latencyMs: Number(data.get("latency")) } });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.saveModel);
    }
  };
  return (
    <Dialog title={d.title} closeLabel={t.common.closeDialog} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        {error && <p className="form-error">{error}</p>}
        <div className="form-grid">
          <label>{d.provider}<select name="provider_id" required>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.display_name}</option>)}</select></label>
          <label>{d.publicSlug}<input name="slug" required placeholder="openai/gpt-model" /></label>
          <label>{d.displayName}<input name="display_name" required /></label>
          <label>{d.upstreamModel}<input name="upstream_model" required /></label>
          <label>{d.contextWindow}<input name="context_window" type="number" defaultValue="128000" required /></label>
          <label>{d.maxOutputTokens}<input name="max_output_tokens" type="number" defaultValue="8192" required /></label>
          <label>{d.inputPrice}<input name="input_price" type="number" step="0.000001" defaultValue="0" required /></label>
          <label>{d.outputPrice}<input name="output_price" type="number" step="0.000001" defaultValue="0" required /></label>
          <label>{d.qualityScore}<input name="quality" type="number" min="0" max="1" step="0.01" defaultValue="0.55" /></label>
          <label>{d.difficultyCapacity}<input name="difficulty" type="number" min="0" max="1" step="0.01" defaultValue="0.55" /></label>
          <label>{d.latencyEstimate}<input name="latency" type="number" defaultValue="5000" /></label>
          <label>{d.domains}<input name="domains" placeholder="coding, math" /></label>
          <div className="checks wide">
            <label><input name="supports_tools" type="checkbox" /> {t.models.capabilities.tools}</label>
            <label><input name="supports_vision" type="checkbox" /> {t.models.capabilities.vision}</label>
            <label><input name="supports_json" type="checkbox" defaultChecked /> {t.models.capabilities.json}</label>
          </div>
        </div>
        <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>{t.common.cancel}</button><button type="submit">{d.save}</button></div>
      </form>
    </Dialog>
  );
}

function UserDialog({ client, t, onClose, onSaved }: { client: ApiClient; t: Copy; onClose: () => void; onSaved: () => Promise<void> }): JSX.Element {
  const [error, setError] = useState("");
  const d = t.dialogs.user;
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await client.createUser(String(data.get("email")), String(data.get("display_name")));
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.createUser);
    }
  };
  return (
    <Dialog title={d.title} closeLabel={t.common.closeDialog} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        {error && <p className="form-error">{error}</p>}
        <div className="form-grid">
          <label>{d.displayName}<input name="display_name" required /></label>
          <label>{d.email}<input name="email" type="email" required /></label>
        </div>
        <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>{t.common.cancel}</button><button type="submit">{d.create}</button></div>
      </form>
    </Dialog>
  );
}
