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

type View = "overview" | "models" | "users" | "requests" | "ledger";

const money = (microUsd: string | number | null): string => {
  if (microUsd === null) return "—";
  return `$${(Number(microUsd) / 1_000_000).toFixed(6)}`;
};

const dateTime = (value: string): string => new Intl.DateTimeFormat(undefined, {
  month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
}).format(new Date(value));

function Status({ value }: { value: string }): JSX.Element {
  return <span className={`status status-${value}`}>{value}</span>;
}

function Login({ onLogin }: { onLogin: (token: string) => void }): JSX.Element {
  const [token, setToken] = useState("");
  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={(event) => { event.preventDefault(); if (token.trim()) onLogin(token.trim()); }}>
        <div className="mark">RF</div>
        <h1>RouteFlux Console</h1>
        <p>Enter the administrator token configured on the API server.</p>
        <label>Admin token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoFocus /></label>
        <button type="submit">Open console</button>
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
  const [token, setToken] = useState(() => localStorage.getItem("routeflux_admin_token") ?? "");
  const [view, setView] = useState<View>("overview");
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"provider" | "model" | "user" | null>(null);
  const client = useMemo(() => new ApiClient(token), [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [overview, users, providers, models, requests, ledger] = await Promise.all([
        client.overview(), client.users(), client.providers(), client.models(), client.requests(), client.ledger()
      ]);
      setSnapshot({ overview, users: users.data, providers: providers.data, models: models.data, requests: requests.data, ledger: ledger.data });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the console");
    } finally {
      setLoading(false);
    }
  }, [client, token]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!token) return <Login onLogin={(value) => { localStorage.setItem("routeflux_admin_token", value); setToken(value); }} />;

  const logout = (): void => { localStorage.removeItem("routeflux_admin_token"); setToken(""); setSnapshot(EMPTY); };
  const showNotice = (value: string): void => { setNotice(value); window.setTimeout(() => setNotice(""), 6000); };

  const issueKey = async (user: UserRecord): Promise<void> => {
    const name = window.prompt(`Name for ${user.email}'s new key`, "default");
    if (!name) return;
    try {
      const created = await client.issueKey(user.id, name);
      showNotice(`New API key (copy now): ${created.api_key}`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to issue key"); }
  };

  const addCredit = async (user: UserRecord): Promise<void> => {
    const raw = window.prompt(`USD credit for ${user.email}`, "10");
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) { setError("Credit must be a positive number"); return; }
    try { await client.credit(user.id, amount); showNotice(`Added $${amount.toFixed(2)} to ${user.email}`); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to add credit"); }
  };

  return (
    <div className="app-shell">
      <aside>
        <div className="brand"><span className="brand-mark">RF</span><span>RouteFlux</span></div>
        <nav>
          {(["overview", "models", "users", "requests", "ledger"] as View[]).map((item) => (
            <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}</button>
          ))}
        </nav>
        <div className="aside-footer"><span className="health-dot" /> API configured<button onClick={logout}>Sign out</button></div>
      </aside>
      <main className="workspace">
        <header><div><p className="eyebrow">Operator console</p><h1>{view}</h1></div><div className="header-actions"><button className="secondary" onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div></header>
        {error && <div className="alert error"><span>{error}</span><button onClick={() => setError("")}>Dismiss</button></div>}
        {notice && <div className="alert notice"><code>{notice}</code><button onClick={() => setNotice("")}>Dismiss</button></div>}
        {view === "overview" && <OverviewView snapshot={snapshot} />}
        {view === "models" && <ModelsView models={snapshot.models} providers={snapshot.providers} onAddProvider={() => setDialog("provider")} onAddModel={() => setDialog("model")} />}
        {view === "users" && <UsersView users={snapshot.users} onAdd={() => setDialog("user")} onKey={issueKey} onCredit={addCredit} />}
        {view === "requests" && <RequestsTable requests={snapshot.requests} />}
        {view === "ledger" && <LedgerTable entries={snapshot.ledger} />}
      </main>
      {dialog === "provider" && <ProviderDialog client={client} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await refresh(); }} />}
      {dialog === "model" && <ModelDialog client={client} providers={snapshot.providers} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await refresh(); }} />}
      {dialog === "user" && <UserDialog client={client} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await refresh(); }} />}
    </div>
  );
}

function OverviewView({ snapshot }: { snapshot: Snapshot }): JSX.Element {
  const data = snapshot.overview;
  return <>
    <section className="metrics">
      <article><span>Requests · 24h</span><strong>{data?.requests_24h ?? "—"}</strong></article>
      <article><span>Month usage</span><strong>{data ? `$${data.spend_month_usd}` : "—"}</strong></article>
      <article><span>Active users</span><strong>{data?.active_users ?? "—"}</strong></article>
      <article><span>Active models</span><strong>{data?.active_models ?? "—"}</strong></article>
    </section>
    <section className="panel"><div className="panel-title"><div><h2>Recent requests</h2><p>Latest gateway activity and routing decisions</p></div></div><RequestsTable requests={snapshot.requests.slice(0, 12)} compact /></section>
  </>;
}

function ModelsView({ models, providers, onAddProvider, onAddModel }: { models: ModelRecord[]; providers: ProviderRecord[]; onAddProvider: () => void; onAddModel: () => void }): JSX.Element {
  return <div className="stack"><section className="provider-grid">{providers.map((provider) => <article key={provider.id}><div><strong>{provider.display_name}</strong><small>{provider.base_url}</small></div><Status value={provider.health_status ?? "healthy"} /><dl><div><dt>Latency</dt><dd>{provider.latency_ema_ms ? `${Math.round(Number(provider.latency_ema_ms))} ms` : "—"}</dd></div><div><dt>Failures</dt><dd>{provider.failure_count ?? "0"}</dd></div></dl></article>)}</section><section className="panel"><div className="panel-title"><div><h2>Model catalog</h2><p>{providers.length} providers · {models.length} models</p></div><div className="row-actions"><button className="secondary" onClick={onAddProvider}>Add provider</button><button onClick={onAddModel} disabled={!providers.length}>Add model</button></div></div><div className="table-wrap"><table><thead><tr><th>Model</th><th>Provider</th><th>Context</th><th>Input / 1M</th><th>Output / 1M</th><th>Capabilities</th><th>Status</th></tr></thead><tbody>{models.map((model) => <tr key={model.id}><td><strong>{model.display_name}</strong><small>{model.slug}</small></td><td>{model.provider_name}</td><td>{model.context_window.toLocaleString()}</td><td>${Number(model.input_price_per_million).toFixed(3)}</td><td>${Number(model.output_price_per_million).toFixed(3)}</td><td><div className="tags">{model.supports_tools && <span>tools</span>}{model.supports_vision && <span>vision</span>}{model.supports_json && <span>json</span>}</div></td><td><Status value={model.enabled ? "active" : "disabled"} /></td></tr>)}</tbody></table></div></section></div>;
}

function UsersView({ users, onAdd, onKey, onCredit }: { users: UserRecord[]; onAdd: () => void; onKey: (user: UserRecord) => void; onCredit: (user: UserRecord) => void }): JSX.Element {
  return <section className="panel"><div className="panel-title"><div><h2>Users and balances</h2><p>API access and available wallet funds</p></div><button onClick={onAdd}>Add user</button></div><div className="table-wrap"><table><thead><tr><th>User</th><th>Balance</th><th>Held</th><th>Keys</th><th>Status</th><th></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.display_name}</strong><small>{user.email}</small></td><td>{money(user.balance_micro_usd)}</td><td>{money(user.held_micro_usd)}</td><td>{user.api_key_count}</td><td><Status value={user.status} /></td><td><div className="row-actions"><button className="table-button" onClick={() => void onKey(user)}>Issue key</button><button className="table-button" onClick={() => void onCredit(user)}>Add credit</button></div></td></tr>)}</tbody></table></div></section>;
}

function RequestsTable({ requests, compact = false }: { requests: RequestRecord[]; compact?: boolean }): JSX.Element {
  return <div className="table-wrap"><table><thead><tr><th>Time</th><th>Route</th><th>Domain</th>{!compact && <th>Difficulty</th>}<th>Tokens</th><th>Cost</th><th>Latency</th><th>Status</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td>{dateTime(request.created_at)}</td><td><strong>{request.selected_model ?? request.requested_model}</strong><small>{request.routing_mode}</small></td><td>{request.primary_domain ?? "—"}</td>{!compact && <td>{request.difficulty ? Number(request.difficulty).toFixed(2) : "—"}</td>}<td>{request.prompt_tokens === null ? "—" : `${request.prompt_tokens} + ${request.completion_tokens ?? 0}`}<small>{request.selected_token_budget ? `cap ${request.selected_token_budget}` : ""}</small></td><td>{money(request.cost_micro_usd)}</td><td>{request.latency_ms === null ? "—" : `${request.latency_ms} ms`}</td><td><Status value={request.status} /></td></tr>)}</tbody></table>{!requests.length && <div className="empty">No requests recorded yet.</div>}</div>;
}

function LedgerTable({ entries }: { entries: LedgerRecord[] }): JSX.Element {
  return <section className="panel"><div className="panel-title"><div><h2>Wallet ledger</h2><p>Append-only credits, usage, refunds, and adjustments</p></div></div><div className="table-wrap"><table><thead><tr><th>Time</th><th>User</th><th>Type</th><th>Description</th><th>Amount</th><th>Balance after</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{dateTime(entry.created_at)}</td><td>{entry.email}</td><td><Status value={entry.kind} /></td><td>{entry.description}</td><td className={Number(entry.amount_micro_usd) >= 0 ? "positive" : "negative"}>{money(entry.amount_micro_usd)}</td><td>{money(entry.balance_after_micro_usd)}</td></tr>)}</tbody></table></div></section>;
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }): JSX.Element {
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="dialog" role="dialog" aria-modal="true" aria-label={title}><div className="dialog-head"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button></div>{children}</section></div>;
}

function ProviderDialog({ client, onClose, onSaved }: { client: ApiClient; onClose: () => void; onSaved: () => void }): JSX.Element {
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try { await client.createProvider({ slug: data.get("slug"), display_name: data.get("display_name"), base_url: data.get("base_url"), api_key: data.get("api_key"), priority: Number(data.get("priority")), timeout_ms: Number(data.get("timeout_ms")) }); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save provider"); }
  };
  return <Dialog title="Add provider" onClose={onClose}><form onSubmit={(event) => void submit(event)}>{error && <p className="form-error">{error}</p>}<div className="form-grid"><label>Slug<input name="slug" required placeholder="openai" /></label><label>Display name<input name="display_name" required placeholder="OpenAI" /></label><label className="wide">Base URL<input name="base_url" type="url" required placeholder="https://api.example.com/v1" /></label><label className="wide">API key<input name="api_key" type="password" required /></label><label>Priority<input name="priority" type="number" defaultValue="100" min="0" /></label><label>Timeout (ms)<input name="timeout_ms" type="number" defaultValue="60000" min="1000" /></label></div><div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit">Save provider</button></div></form></Dialog>;
}

function ModelDialog({ client, providers, onClose, onSaved }: { client: ApiClient; providers: ProviderRecord[]; onClose: () => void; onSaved: () => void }): JSX.Element {
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const domains = Object.fromEntries(String(data.get("domains") ?? "").split(",").map((value) => value.trim()).filter(Boolean).map((value) => [value, 1]));
    try { await client.createModel({ provider_id: data.get("provider_id"), slug: data.get("slug"), upstream_model: data.get("upstream_model"), display_name: data.get("display_name"), context_window: Number(data.get("context_window")), max_output_tokens: Number(data.get("max_output_tokens")), input_price_per_million: Number(data.get("input_price")), output_price_per_million: Number(data.get("output_price")), supports_tools: data.get("supports_tools") === "on", supports_vision: data.get("supports_vision") === "on", supports_json: data.get("supports_json") === "on", domains, metadata: { qualityScore: Number(data.get("quality")), difficultyCapacity: Number(data.get("difficulty")), latencyMs: Number(data.get("latency")) } }); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save model"); }
  };
  return <Dialog title="Add model" onClose={onClose}><form onSubmit={(event) => void submit(event)}>{error && <p className="form-error">{error}</p>}<div className="form-grid"><label>Provider<select name="provider_id" required>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.display_name}</option>)}</select></label><label>Public slug<input name="slug" required placeholder="openai/gpt-model" /></label><label>Display name<input name="display_name" required /></label><label>Upstream model<input name="upstream_model" required /></label><label>Context window<input name="context_window" type="number" defaultValue="128000" required /></label><label>Max output tokens<input name="max_output_tokens" type="number" defaultValue="8192" required /></label><label>Input $ / 1M<input name="input_price" type="number" step="0.000001" defaultValue="0" required /></label><label>Output $ / 1M<input name="output_price" type="number" step="0.000001" defaultValue="0" required /></label><label>Quality score<input name="quality" type="number" min="0" max="1" step="0.01" defaultValue="0.55" /></label><label>Difficulty capacity<input name="difficulty" type="number" min="0" max="1" step="0.01" defaultValue="0.55" /></label><label>Latency estimate (ms)<input name="latency" type="number" defaultValue="5000" /></label><label>Domains<input name="domains" placeholder="coding, math" /></label><div className="checks wide"><label><input name="supports_tools" type="checkbox" /> Tools</label><label><input name="supports_vision" type="checkbox" /> Vision</label><label><input name="supports_json" type="checkbox" defaultChecked /> JSON</label></div></div><div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit">Save model</button></div></form></Dialog>;
}

function UserDialog({ client, onClose, onSaved }: { client: ApiClient; onClose: () => void; onSaved: () => void }): JSX.Element {
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try { await client.createUser(String(data.get("email")), String(data.get("display_name"))); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create user"); }
  };
  return <Dialog title="Add user" onClose={onClose}><form onSubmit={(event) => void submit(event)}>{error && <p className="form-error">{error}</p>}<div className="form-grid"><label>Display name<input name="display_name" required /></label><label>Email<input name="email" type="email" required /></label></div><div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit">Create user</button></div></form></Dialog>;
}
