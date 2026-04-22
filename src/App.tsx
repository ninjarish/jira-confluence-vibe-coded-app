import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { JiraService } from './generated/services/JiraService';
import type { FullIssue, ProjectArrayItem, IssueTypesItem, PriorityListItem } from './generated/models/JiraModel';
import CopilotChat from './CopilotChat';
import Dashboard from './Dashboard';

const JIRA_CLOUD_ID = '27530a7f-61f9-4188-b04e-1db1f9d8cdb0';

// Helper to extract plain text from ADF or string description
function extractText(desc: unknown): string {
  if (!desc) return '';
  if (typeof desc === 'string') return desc;
  if (typeof desc === 'object' && desc !== null && 'content' in desc) {
    const doc = desc as { content?: { content?: { text?: string }[] }[] };
    return doc.content?.map(block =>
      block.content?.map(inline => inline.text ?? '').join('') ?? ''
    ).join('\n') ?? '';
  }
  return String(desc);
}

type View = 'list' | 'detail';
type Tab = 'tickets' | 'dashboard';

function App() {
  const [projects, setProjects] = useState<ProjectArrayItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [issues, setIssues] = useState<FullIssue[]>([]);
  const [priorities, setPriorities] = useState<PriorityListItem[]>([]);
  const [issueTypes, setIssueTypes] = useState<IssueTypesItem[]>([]);

  const [view, setView] = useState<View>('list');
  const [selectedIssue, setSelectedIssue] = useState<FullIssue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ summary: '', description: '', issueTypeId: '', priorityId: '' });
  const [creating, setCreating] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ summary: '', description: '', priorityId: '' });
  const [editing, setEditing] = useState(false);

  const [commentText, setCommentText] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [tab, setTab] = useState<Tab>('tickets');

  // Load projects + priorities on mount
  useEffect(() => {
    (async () => {
      try {
        const [projRes, prioRes] = await Promise.all([
          JiraService.ListProjects_V3(JIRA_CLOUD_ID),
          JiraService.ListPriorityTypes_V2(JIRA_CLOUD_ID),
        ]);
        // API returns "value" (singular) but generated type says "values"
        const rawProj = projRes.data as Record<string, unknown> | undefined;
        const projList = (rawProj?.['value'] ?? rawProj?.['values'] ?? []) as ProjectArrayItem[];
        if (projList.length > 0) {
          setProjects(projList);
          setSelectedProject(projList[0].key ?? '');
        }
        if (prioRes.data) setPriorities(prioRes.data);
      } catch (err) {
        setError('Failed to load projects: ' + String(err));
      }
    })();
  }, []);

  // Load issues when project changes
  const loadIssues = useCallback(async (preserveError = false) => {
    if (!selectedProject) return;
    setLoading(true);
    if (!preserveError) setError(null);
    try {
      const res = await JiraService.ListIssues(
        JIRA_CLOUD_ID,
        `project = ${selectedProject} ORDER BY created DESC`
      );
      // Handle both typed and raw response shapes
      const raw = res.data as Record<string, unknown> | undefined;
      const issueList = (res.data?.issues ?? (raw?.['issues'] as FullIssue[] | undefined)) ?? [];
      // Client-side filter: JQL may not be honored by the connector
      const filtered = issueList.filter(i => {
        const key = i.key ?? '';
        const projKey = (i as Record<string, unknown>)?.['project_key'] as string | undefined;
        return key.startsWith(selectedProject + '-') || projKey === selectedProject;
      });
      setIssues(filtered);
    } catch (err) {
      setError('Failed to load issues: ' + String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => { loadIssues(); }, [loadIssues]);

  // Load issue types when project changes
  useEffect(() => {
    if (!selectedProject) return;
    (async () => {
      try {
        const res = await JiraService.ListIssueTypes_V2(JIRA_CLOUD_ID, selectedProject);
        if (res.data) setIssueTypes(res.data);
      } catch { /* non-critical */ }
    })();
  }, [selectedProject]);

  const viewIssue = async (issue: FullIssue) => {
    setSelectedIssue(issue);
    setView('detail');
    try {
      const res = await JiraService.GetIssue_V2(JIRA_CLOUD_ID, issue.key!);
      if (res.data) setSelectedIssue(res.data);
    } catch { /* use existing data */ }
  };

  const handleCreate = async () => {
    if (!createForm.summary || !createForm.issueTypeId) return;
    setCreating(true);
    setError(null);
    try {
      // Wrap in 'fields' to match Jira REST API / connector expectations
      const item: Record<string, unknown> = {
        fields: {
          summary: createForm.summary,
          ...(createForm.description ? { description: createForm.description } : {}),
          ...(createForm.priorityId ? { priority: { id: createForm.priorityId } } : {}),
        },
      };

      const result = await JiraService.CreateIssue_V3(
        JIRA_CLOUD_ID, selectedProject, createForm.issueTypeId, item
      );

      // Check if the operation actually succeeded
      const raw = result as unknown as Record<string, unknown>;
      if (raw['success'] === false || raw['error']) {
        setError('Create failed: ' + JSON.stringify(raw['error'] ?? raw));
        return;
      }

      setShowCreate(false);
      setCreateForm({ summary: '', description: '', issueTypeId: '', priorityId: '' });
      // Small delay for Jira to index the new issue
      await new Promise(r => setTimeout(r, 1500));
      await loadIssues(true);
    } catch (err) {
      setError('Failed to create issue: ' + String(err));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = () => {
    if (!selectedIssue) return;
    setEditForm({
      summary: selectedIssue.fields?.summary ?? '',
      description: extractText(selectedIssue.fields?.description),
      priorityId: selectedIssue.fields?.priority?.id ?? '',
    });
    setShowEdit(true);
  };

  const handleEdit = async () => {
    if (!selectedIssue?.key) return;
    setEditing(true);
    try {
      await JiraService.UpdateIssue_V2(JIRA_CLOUD_ID, selectedIssue.key, {
        fields: {
          summary: editForm.summary || undefined,
          description: editForm.description || undefined,
          priority: editForm.priorityId ? { id: editForm.priorityId } : undefined,
        },
      });
      setShowEdit(false);
      const res = await JiraService.GetIssue_V2(JIRA_CLOUD_ID, selectedIssue.key);
      if (res.data) setSelectedIssue(res.data);
      await loadIssues();
    } catch (err) {
      setError('Failed to update issue: ' + String(err));
    } finally {
      setEditing(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedIssue?.key || !commentText.trim()) return;
    setAddingComment(true);
    try {
      await JiraService.AddComment_V2(JIRA_CLOUD_ID, selectedIssue.key, { body: commentText });
      setCommentText('');
      const res = await JiraService.GetIssue_V2(JIRA_CLOUD_ID, selectedIssue.key);
      if (res.data) setSelectedIssue(res.data);
    } catch (err) {
      setError('Failed to add comment: ' + String(err));
    } finally {
      setAddingComment(false);
    }
  };

  const statusColorClass = (colorName?: string) => {
    if (!colorName) return '';
    return colorName.replace(/[\s_]/g, '-').toLowerCase();
  };

  const getComments = (issue: FullIssue) => {
    const raw = issue.fields as Record<string, unknown> | undefined;
    if (!raw) return [];
    const commentField = raw['comment'] as { comments?: Array<{
      id?: string;
      body?: unknown;
      author?: { displayName?: string };
      created?: string;
    }> } | undefined;
    return commentField?.comments ?? [];
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Jira Ticket Manager</h1>
        {tab === 'tickets' && view === 'list' && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Create Issue</button>
        )}
      </header>

      <nav className="app-nav">
        <button className={tab === 'tickets' ? 'active' : ''} onClick={() => { setTab('tickets'); setView('list'); setSelectedIssue(null); }}>Tickets</button>
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
      </nav>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {view === 'list' && (
        <div className="project-bar">
          <label>Project</label>
          <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
            {projects.map((p) => (
              <option key={p.key} value={p.key!}>{p.name} ({p.key})</option>
            ))}
          </select>
        </div>
      )}

      {/* DASHBOARD */}
      {tab === 'dashboard' && (
        <Dashboard
          issues={issues}
          projectName={projects.find(p => p.key === selectedProject)?.name ?? selectedProject}
        />
      )}

      {/* ISSUE LIST */}
      {tab === 'tickets' && view === 'list' && (
        <>
          <div className="toolbar">
            <span className="issue-count">{issues.length} issue{issues.length !== 1 ? 's' : ''}</span>
            <button className="btn-secondary btn-sm" onClick={() => loadIssues()} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {loading && issues.length === 0 ? (
            <div className="loading">Loading issues...</div>
          ) : issues.length === 0 ? (
            <div className="empty-state">
              <p>No issues found in this project.</p>
              <button className="btn-primary" onClick={() => setShowCreate(true)}>Create one</button>
            </div>
          ) : (
            <table className="issue-table">
              <thead>
                <tr>
                  <th style={{ width: '100px' }}>Key</th>
                  <th>Summary</th>
                  <th style={{ width: '150px' }}>Status</th>
                  <th style={{ width: '100px' }}>Priority</th>
                  <th style={{ width: '120px' }}>Type</th>
                  <th style={{ width: '140px' }}>Assignee</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <span className="issue-key" onClick={() => viewIssue(issue)}>{issue.key}</span>
                    </td>
                    <td>{issue.fields?.summary}</td>
                    <td>
                      <span className={`status-badge ${statusColorClass(issue.fields?.status?.statusCategory?.colorName ?? issue.fields?.status?.statusCategory?.key)}`}>
                        {issue.fields?.status?.name}
                      </span>
                    </td>
                    <td>
                      {issue.fields?.priority?.iconUrl && (
                        <><img className="priority-icon" src={issue.fields.priority.iconUrl} alt="" />{' '}</>
                      )}
                      {issue.fields?.priority?.name}
                    </td>
                    <td>{issue.fields?.issuetype?.name}</td>
                    <td>{issue.fields?.assignee?.displayName ?? <span style={{ color: '#97a0af' }}>Unassigned</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* ISSUE DETAIL */}
      {tab === 'tickets' && view === 'detail' && selectedIssue && (
        <>
          <button className="back-link" onClick={() => { setView('list'); setSelectedIssue(null); }}>
            &larr; Back to list
          </button>
          <div className="detail-panel">
            <div className="detail-header">
              <h2>
                <span style={{ color: '#0052cc', marginRight: '0.5rem' }}>{selectedIssue.key}</span>
                {selectedIssue.fields?.summary}
              </h2>
              <button className="btn-secondary btn-sm" onClick={openEdit}>Edit</button>
            </div>

            <div className="detail-meta">
              <div className="detail-meta-item">
                <label>Status</label>
                <span className={`status-badge ${statusColorClass(selectedIssue.fields?.status?.statusCategory?.colorName ?? selectedIssue.fields?.status?.statusCategory?.key)}`}>
                  {selectedIssue.fields?.status?.name}
                </span>
              </div>
              <div className="detail-meta-item">
                <label>Priority</label>
                <span>
                  {selectedIssue.fields?.priority?.iconUrl && (
                    <><img className="priority-icon" src={selectedIssue.fields.priority.iconUrl} alt="" />{' '}</>
                  )}
                  {selectedIssue.fields?.priority?.name}
                </span>
              </div>
              <div className="detail-meta-item">
                <label>Type</label>
                <span>{selectedIssue.fields?.issuetype?.name}</span>
              </div>
              <div className="detail-meta-item">
                <label>Assignee</label>
                <span>{selectedIssue.fields?.assignee?.displayName ?? 'Unassigned'}</span>
              </div>
              <div className="detail-meta-item">
                <label>Reporter</label>
                <span>{selectedIssue.fields?.reporter?.displayName ?? 'Unknown'}</span>
              </div>
              <div className="detail-meta-item">
                <label>Created</label>
                <span>{selectedIssue.fields?.created ? new Date(selectedIssue.fields.created).toLocaleDateString() : '—'}</span>
              </div>
            </div>

            <div className="detail-description">
              <h3>Description</h3>
              <p>{extractText(selectedIssue.fields?.description) || 'No description provided.'}</p>
            </div>

            <div className="comments-section">
              <h3>Comments ({getComments(selectedIssue).length})</h3>
              <div className="comment-form">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                />
                <button className="btn-primary btn-sm" onClick={handleAddComment} disabled={addingComment || !commentText.trim()}>
                  {addingComment ? '...' : 'Add'}
                </button>
              </div>
              {getComments(selectedIssue).map((c) => (
                <div key={c.id} style={{ padding: '0.75rem', background: '#f4f5f7', borderRadius: '3px', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b778c', marginBottom: '0.25rem' }}>
                    <strong>{c.author?.displayName}</strong> &middot; {c.created ? new Date(c.created).toLocaleString() : ''}
                  </div>
                  <div style={{ fontSize: '0.875rem' }}>{extractText(c.body)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* CREATE MODAL */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Issue</h2>
              <button className="modal-close" onClick={() => setShowCreate(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Issue Type</label>
                <select value={createForm.issueTypeId} onChange={(e) => setCreateForm({ ...createForm, issueTypeId: e.target.value })}>
                  <option value="">Select type...</option>
                  {issueTypes.map((t) => (
                    <option key={t.id} value={t.id!}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Summary</label>
                <input
                  type="text"
                  value={createForm.summary}
                  onChange={(e) => setCreateForm({ ...createForm, summary: e.target.value })}
                  placeholder="Brief issue title"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows={4}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Detailed description..."
                />
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select value={createForm.priorityId} onChange={(e) => setCreateForm({ ...createForm, priorityId: e.target.value })}>
                  <option value="">Default</option>
                  {priorities.map((p) => (
                    <option key={p.id} value={p.id!}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreate} disabled={creating || !createForm.summary || !createForm.issueTypeId}>
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEdit && (
        <div className="modal-overlay" onClick={() => setShowEdit(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit {selectedIssue?.key}</h2>
              <button className="modal-close" onClick={() => setShowEdit(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Summary</label>
                <input
                  type="text"
                  value={editForm.summary}
                  onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows={4}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select value={editForm.priorityId} onChange={(e) => setEditForm({ ...editForm, priorityId: e.target.value })}>
                  <option value="">Default</option>
                  {priorities.map((p) => (
                    <option key={p.id} value={p.id!}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowEdit(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleEdit} disabled={editing}>
                {editing ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <CopilotChat />
    </div>
  );
}

export default App;
