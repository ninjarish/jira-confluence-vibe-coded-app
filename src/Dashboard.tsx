import { useMemo } from 'react';
import type { FullIssue } from './generated/models/JiraModel';

interface DashboardProps {
  issues: FullIssue[];
  projectName: string;
}

interface CountMap {
  [key: string]: number;
}

function countBy(issues: FullIssue[], accessor: (i: FullIssue) => string): CountMap {
  const map: CountMap = {};
  for (const issue of issues) {
    const val = accessor(issue);
    map[val] = (map[val] || 0) + 1;
  }
  return map;
}

// Color mappings for known Jira status categories
const STATUS_CAT_COLORS: Record<string, string> = {
  'blue-gray': '#42526e',
  new: '#42526e',
  'in-progress': '#0052cc',
  indeterminate: '#0052cc',
  yellow: '#0052cc',
  done: '#00875a',
  green: '#00875a',
};

const PRIORITY_COLORS: Record<string, string> = {
  Highest: '#bf2600',
  High: '#de350b',
  Medium: '#ff8b00',
  Low: '#0065ff',
  Lowest: '#2684ff',
};

function BarChart({ data, colors }: { data: CountMap; colors?: Record<string, string> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="dash-bar-chart">
      {entries.map(([label, count]) => (
        <div key={label} className="dash-bar-row">
          <span className="dash-bar-label">{label}</span>
          <div className="dash-bar-track">
            <div
              className="dash-bar-fill"
              style={{
                width: `${(count / max) * 100}%`,
                background: colors?.[label] ?? '#0052cc',
              }}
            />
          </div>
          <span className="dash-bar-count">{count}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data, colors }: { data: CountMap; colors?: Record<string, string> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return <div className="dash-empty">No data</div>;

  const defaultColors = ['#0052cc', '#00875a', '#ff8b00', '#de350b', '#6554c0', '#42526e', '#00b8d9', '#36b37e'];

  let cumulative = 0;
  const segments = entries.map(([label, count], i) => {
    const pct = (count / total) * 100;
    const start = cumulative;
    cumulative += pct;
    return { label, count, pct, start, color: colors?.[label] ?? defaultColors[i % defaultColors.length] };
  });

  // Build conic-gradient
  const gradientStops = segments
    .map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`)
    .join(', ');

  return (
    <div className="dash-donut-container">
      <div
        className="dash-donut"
        style={{ background: `conic-gradient(${gradientStops})` }}
      >
        <div className="dash-donut-hole">
          <span className="dash-donut-total">{total}</span>
          <span className="dash-donut-label">total</span>
        </div>
      </div>
      <div className="dash-donut-legend">
        {segments.map(s => (
          <div key={s.label} className="dash-legend-item">
            <span className="dash-legend-dot" style={{ background: s.color }} />
            <span className="dash-legend-text">{s.label}</span>
            <span className="dash-legend-count">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ issues, projectName }: DashboardProps) {
  const statusData = useMemo(() => countBy(issues, i => i.fields?.status?.name ?? 'Unknown'), [issues]);
  const priorityData = useMemo(() => countBy(issues, i => i.fields?.priority?.name ?? 'Unknown'), [issues]);
  const typeData = useMemo(() => countBy(issues, i => i.fields?.issuetype?.name ?? 'Unknown'), [issues]);
  const assigneeData = useMemo(() => countBy(issues, i => i.fields?.assignee?.displayName ?? 'Unassigned'), [issues]);

  const statusColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const issue of issues) {
      const name = issue.fields?.status?.name;
      const catKey = issue.fields?.status?.statusCategory?.colorName ?? issue.fields?.status?.statusCategory?.key;
      if (name && catKey) {
        map[name] = STATUS_CAT_COLORS[catKey.toLowerCase().replace(/[\s_]/g, '-')] ?? '#42526e';
      }
    }
    return map;
  }, [issues]);

  // Recent activity: issues created in last 7 / 30 days
  const now = Date.now();
  const createdLast7 = issues.filter(i => i.fields?.created && (now - new Date(i.fields.created).getTime()) < 7 * 86400000).length;
  const createdLast30 = issues.filter(i => i.fields?.created && (now - new Date(i.fields.created).getTime()) < 30 * 86400000).length;
  const updatedLast7 = issues.filter(i => i.fields?.updated && (now - new Date(i.fields.updated).getTime()) < 7 * 86400000).length;

  const unresolved = issues.filter(i => !i.fields?.resolution?.name).length;
  const resolved = issues.length - unresolved;

  return (
    <div className="dashboard">
      <h2 className="dash-title">Dashboard — {projectName}</h2>

      {/* KPI Cards */}
      <div className="dash-kpis">
        <div className="dash-kpi-card">
          <div className="dash-kpi-value">{issues.length}</div>
          <div className="dash-kpi-label">Total Issues</div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-value dash-kpi-open">{unresolved}</div>
          <div className="dash-kpi-label">Unresolved</div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-value dash-kpi-done">{resolved}</div>
          <div className="dash-kpi-label">Resolved</div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-value">{createdLast7}</div>
          <div className="dash-kpi-label">Created (7d)</div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-value">{createdLast30}</div>
          <div className="dash-kpi-label">Created (30d)</div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-value">{updatedLast7}</div>
          <div className="dash-kpi-label">Updated (7d)</div>
        </div>
      </div>

      {/* Charts */}
      <div className="dash-charts">
        <div className="dash-card">
          <h3>By Status</h3>
          <DonutChart data={statusData} colors={statusColors} />
        </div>
        <div className="dash-card">
          <h3>By Priority</h3>
          <DonutChart data={priorityData} colors={PRIORITY_COLORS} />
        </div>
        <div className="dash-card">
          <h3>By Issue Type</h3>
          <BarChart data={typeData} />
        </div>
        <div className="dash-card">
          <h3>By Assignee</h3>
          <BarChart data={assigneeData} />
        </div>
      </div>
    </div>
  );
}
