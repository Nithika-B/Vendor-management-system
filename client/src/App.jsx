import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = `${import.meta.env.BASE_URL}api/vendors`;
const DAY = 86400000;

/* ---------- helpers ---------- */
const toDay = (value) => (value ? new Date(`${value.slice(0, 10)}T00:00:00`) : null);
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const diffDays = (a, b) => Math.round((a - b) / DAY);
const fmt = (value) =>
  value
    ? toDay(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

/* ---------- supplier history ---------- */
function buildSupplierStats(vendors) {
  const map = {};
  vendors.forEach((v) => {
    const key = v.vendorName;
    map[key] ||= { name: key, orders: 0, delivered: 0, onTime: 0, lateDays: 0, lateCount: 0, pending: 0 };
    const s = map[key];
    s.orders += 1;
    if (v.status === "Delivered" && v.actualDate) {
      s.delivered += 1;
      const delay = diffDays(toDay(v.actualDate), toDay(v.expectedDate));
      if (delay <= 0) s.onTime += 1;
      else {
        s.lateCount += 1;
        s.lateDays += delay;
      }
    } else {
      s.pending += 1;
    }
  });

  return Object.values(map)
    .map((s) => {
      const onTimeRate = s.delivered ? s.onTime / s.delivered : null;
      const avgDelay = s.lateCount ? s.lateDays / s.lateCount : 0;
      const score = onTimeRate === null ? null : Math.max(0, Math.round(onTimeRate * 100 - avgDelay * 4));
      return { ...s, onTimeRate, avgDelay, score };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/* ---------- delay prediction (runs in the browser from existing data) ---------- */
function assess(vendor, stats) {
  const expected = toDay(vendor.expectedDate);
  const history = stats[vendor.vendorName];

  if (vendor.status === "Delivered") {
    const delay = vendor.actualDate ? diffDays(toDay(vendor.actualDate), expected) : 0;
    return {
      stage: "delivered",
      risk: 0,
      level: "done",
      delay,
      label: delay > 0 ? `Arrived ${delay}d late` : delay < 0 ? `Arrived ${-delay}d early` : "Arrived on time",
    };
  }

  const left = diffDays(expected, today());
  const lateRate = history && history.delivered ? 1 - history.onTimeRate : 0;
  let risk = left < 0 ? 100 : left <= 2 ? 65 : left <= 7 ? 35 : 12;
  risk = Math.min(100, Math.round(risk + lateRate * 30));
  const level = risk >= 70 ? "high" : risk >= 40 ? "medium" : "low";
  const predicted = left < 0 ? -left : Math.round(history?.avgDelay * lateRate) || 0;

  return {
    stage: left < 0 ? "overdue" : "pending",
    left,
    risk,
    level,
    delay: predicted,
    label:
      left < 0
        ? `Overdue by ${-left}d`
        : predicted > 0
        ? `Likely ${predicted}d late`
        : left === 0
        ? "Due today"
        : `Due in ${left}d`,
  };
}

/* ---------- small components ---------- */
function Badge({ level, children }) {
  return <span className={`badge badge-${level}`}>{children}</span>;
}

function Kpi({ label, value, note, tone }) {
  return (
    <div className={`kpi ${tone || ""}`}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      <span className="kpi-note">{note}</span>
    </div>
  );
}

export default function App() {
  const [vendors, setVendors] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ vendorName: "", material: "", expectedDate: "" });

  async function loadVendors() {
    try {
      const response = await fetch(API);
      if (!response.ok) throw new Error("Could not load vendors");
      setVendors(await response.json());
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVendors();
  }, []);

  function updateForm(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function addVendor(event) {
    event.preventDefault();
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not add vendor");
      setForm({ vendorName: "", material: "", expectedDate: "" });
      await loadVendors();
    } catch (err) {
      setError(err.message);
    }
  }

  async function markDelivered(vendor) {
    try {
      const response = await fetch(`${API}/${vendor._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Delivered", actualDate: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error("Could not update vendor");
      await loadVendors();
    } catch (err) {
      setError(err.message);
    }
  }

  /* ---------- derived analytics ---------- */
  const supplierList = useMemo(() => buildSupplierStats(vendors), [vendors]);
  const statsByName = useMemo(() => Object.fromEntries(supplierList.map((s) => [s.name, s])), [supplierList]);

  const rows = useMemo(
    () => vendors.map((v) => ({ vendor: v, info: assess(v, statsByName) })),
    [vendors, statsByName]
  );

  const pending = rows.filter((r) => r.info.stage !== "delivered");
  const warnings = pending
    .filter((r) => r.info.level !== "low")
    .sort((a, b) => b.info.risk - a.info.risk);
  const overdue = pending.filter((r) => r.info.stage === "overdue");
  const delivered = rows.filter((r) => r.info.stage === "delivered");
  const onTimeDelivered = delivered.filter((r) => r.info.delay <= 0).length;
  const onTimeRate = delivered.length ? Math.round((onTimeDelivered / delivered.length) * 100) : null;
  const exposureDays = warnings.reduce((sum, r) => sum + Math.max(r.info.delay, 0), 0);
  const affectedMaterials = [...new Set(warnings.map((r) => r.vendor.material))];
  const affectedSuppliers = [...new Set(warnings.map((r) => r.vendor.vendorName))];

  const visible = rows.filter(({ vendor, info }) => {
    const text = `${vendor.vendorName} ${vendor.material}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (filter === "pending") return info.stage !== "delivered";
    if (filter === "risk") return info.level === "high" || info.level === "medium";
    if (filter === "delivered") return info.stage === "delivered";
    return true;
  });

  const filters = [
    ["all", "All orders", rows.length],
    ["pending", "In transit", pending.length],
    ["risk", "At risk", warnings.length],
    ["delivered", "Delivered", delivered.length],
  ];

  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <h1>Vendor Management</h1>
              <p>Delivery delay prediction and supplier performance</p>
            </div>
          </div>
          <time className="today">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </time>
        </div>
      </header>

      <main className="page">
        {error && (
          <div className="notice" role="alert">
            <strong>Something went wrong.</strong> {error}. Check your connection and refresh the page.
          </div>
        )}

        {/* KPIs */}
        <section className="kpis" aria-label="Summary">
          <Kpi label="Open orders" value={pending.length} note={`${delivered.length} delivered so far`} />
          <Kpi
            label="Early warnings"
            value={warnings.length}
            note={warnings.length ? "Need attention soon" : "Nothing flagged"}
            tone={warnings.length ? "warn" : "good"}
          />
          <Kpi
            label="Overdue"
            value={overdue.length}
            note={overdue.length ? "Past expected date" : "All within schedule"}
            tone={overdue.length ? "bad" : "good"}
          />
          <Kpi
            label="On-time delivery"
            value={onTimeRate === null ? "—" : `${onTimeRate}%`}
            note={delivered.length ? `${onTimeDelivered} of ${delivered.length} delivered` : "No deliveries yet"}
            tone={onTimeRate !== null && onTimeRate < 80 ? "warn" : "good"}
          />
        </section>

        {/* Warnings + Supplier performance */}
        <section className="duo">
          <article className="panel">
            <div className="panel-head">
              <h2>Early warnings</h2>
              <span className="muted">Ranked by predicted delay risk</span>
            </div>
            {warnings.length === 0 ? (
              <p className="empty">No open order is at risk right now. New warnings appear here as due dates get closer.</p>
            ) : (
              <ul className="alerts">
                {warnings.map(({ vendor, info }) => (
                  <li key={vendor._id} className={`alert alert-${info.level}`}>
                    <div className="alert-main">
                      <strong>{vendor.vendorName}</strong>
                      <span>
                        {vendor.material} · expected {fmt(vendor.expectedDate)}
                      </span>
                    </div>
                    <div className="alert-side">
                      <Badge level={info.level}>{info.label}</Badge>
                      <div className="meter" title={`Risk score ${info.risk}`}>
                        <i style={{ width: `${info.risk}%` }} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Supplier performance</h2>
              <span className="muted">Based on delivery history</span>
            </div>
            {supplierList.length === 0 ? (
              <p className="empty">Add a vendor to start tracking performance.</p>
            ) : (
              <ul className="suppliers">
                {supplierList.map((s) => {
                  const tone = s.score === null ? "none" : s.score >= 85 ? "good" : s.score >= 60 ? "warn" : "bad";
                  return (
                    <li key={s.name}>
                      <div className="supplier-top">
                        <strong>{s.name}</strong>
                        <span className={`score score-${tone}`}>{s.score === null ? "No history" : `${s.score}/100`}</span>
                      </div>
                      <div className="bar">
                        <i className={`bar-${tone}`} style={{ width: `${s.score ?? 0}%` }} />
                      </div>
                      <span className="muted">
                        {s.orders} {s.orders === 1 ? "order" : "orders"} · {s.delivered} delivered
                        {s.lateCount ? ` · avg ${s.avgDelay.toFixed(1)}d late` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        </section>

        {/* Impact */}
        <section className={`impact ${warnings.length ? "impact-active" : ""}`}>
          <div className="impact-title">
            <h2>Business impact</h2>
            <p>
              {warnings.length
                ? "If these orders slip, production and downstream schedules are exposed."
                : "No supply risk to production schedules at the moment."}
            </p>
          </div>
          <dl className="impact-grid">
            <div>
              <dt>Orders at risk</dt>
              <dd>{warnings.length}</dd>
            </div>
            <div>
              <dt>Suppliers involved</dt>
              <dd>{affectedSuppliers.length}</dd>
            </div>
            <div>
              <dt>Delay exposure</dt>
              <dd>{exposureDays}d</dd>
            </div>
            <div className="wide">
              <dt>Materials affected</dt>
              <dd className="chips">
                {affectedMaterials.length ? affectedMaterials.map((m) => <span key={m}>{m}</span>) : <em>None</em>}
              </dd>
            </div>
          </dl>
        </section>

        {/* Add vendor */}
        <section className="panel">
          <div className="panel-head">
            <h2>Add vendor order</h2>
            <span className="muted">Track a new material delivery</span>
          </div>
          <form className="vendor-form" onSubmit={addVendor}>
            <label>
              Vendor name
              <input name="vendorName" placeholder="e.g. ABC Suppliers" value={form.vendorName} onChange={updateForm} required />
            </label>
            <label>
              Material
              <input name="material" placeholder="e.g. Steel" value={form.material} onChange={updateForm} required />
            </label>
            <label>
              Expected date
              <input name="expectedDate" type="date" value={form.expectedDate} onChange={updateForm} required />
            </label>
            <button type="submit" className="btn-primary">
              Add vendor
            </button>
          </form>
        </section>

        {/* Orders table */}
        <section className="panel">
          <div className="panel-head wrap">
            <h2>Orders</h2>
            <div className="tools">
              <div className="chips-filter" role="group" aria-label="Filter orders">
                {filters.map(([key, name, count]) => (
                  <button
                    key={key}
                    type="button"
                    className={filter === key ? "chip active" : "chip"}
                    onClick={() => setFilter(key)}
                  >
                    {name} <b>{count}</b>
                  </button>
                ))}
              </div>
              <input
                type="search"
                className="search"
                placeholder="Search vendor or material"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search orders"
              />
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Material</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Prediction</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan="8" className="empty-cell">Loading orders…</td>
                  </tr>
                )}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td colSpan="8" className="empty-cell">
                      {vendors.length ? "No orders match this filter. Clear the search or pick another filter." : "No orders yet. Add your first vendor above."}
                    </td>
                  </tr>
                )}
                {visible.map(({ vendor, info }) => (
                  <tr key={vendor._id}>
                    <td className="strong">{vendor.vendorName}</td>
                    <td>{vendor.material}</td>
                    <td>{fmt(vendor.expectedDate)}</td>
                    <td>{fmt(vendor.actualDate)}</td>
                    <td>{info.label}</td>
                    <td>
                      {info.stage === "delivered" ? (
                        <span className="muted">—</span>
                      ) : (
                        <Badge level={info.level}>
                          {info.level === "high" ? "High" : info.level === "medium" ? "Medium" : "Low"} · {info.risk}
                        </Badge>
                      )}
                    </td>
                    <td>
                      <span className={`status ${vendor.status === "Delivered" ? "status-done" : "status-open"}`}>
                        {vendor.status}
                      </span>
                    </td>
                    <td className="right">
                      {vendor.status !== "Delivered" && (
                        <button className="btn-ghost" onClick={() => markDelivered(vendor)}>
                          Mark delivered
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}