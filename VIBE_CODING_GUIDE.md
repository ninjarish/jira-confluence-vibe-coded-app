# Vibe Coding Guide — Jira Ticket Manager with Copilot Studio Agent

> A step-by-step guide to recreate this Power Apps Code App using AI-assisted "vibe coding."
> Each step includes the **prompt to give your AI coding agent** and **what to expect**.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **Node.js** | v18+ |
| **PAC CLI** | Power Platform CLI (`winget install Microsoft.PowerPlatformCLI`) |
| **Power Platform Environment** | With Jira and Microsoft Copilot Studio connectors available |
| **Jira Cloud Instance** | With at least one project and some test issues |
| **Copilot Studio Agent** | Published agent in your Power Platform environment |
| **PAC Auth** | Run `pac auth create` to authenticate to your environment |

---

## Phase 1: Project Scaffolding

### Step 1 — Scaffold the Code App

```
Terminal command (run yourself):
npx degit github:microsoft/PowerAppsCodeApps/templates/vite . --force
npm install
```

### Step 2 — Register the App in Power Apps

```
Terminal command (run yourself):
pac code push
```

This creates the app in your Power Platform environment and populates `power.config.json` with the app ID and environment ID.

### Step 3 — Add the Jira Data Source

First, find your Jira connection ID:
```
pac connection list
```
Look for `shared_jira` and copy the connection ID.

```
Terminal command:
pac code add-data-source -a "shared_jira" -c <your-jira-connection-id>
```

This auto-generates `src/generated/services/JiraService.ts` and `src/generated/models/JiraModel.ts`.

> **Key learning:** The generated service methods are typed but auto-generated — never edit them directly.

---

## Phase 2: Build the Jira CRUD App

### Step 4 — Build the Issue List UI

**Prompt:**
```
Look at the generated JiraService.ts and JiraModel.ts files to understand 
what methods and types are available. Then build a React UI in App.tsx that:

1. Loads all Jira projects on mount using ListProjects_V3 with cloud ID 
   "<your-cloud-id>"
2. Shows a project selector dropdown
3. When a project is selected, loads issues using ListIssues with JQL 
   "project = <key> ORDER BY created DESC"
4. Displays issues in a table with columns: Key, Summary, Status, Priority, 
   Type, Assignee
5. Status badges should be color-coded based on the status category

Important API details:
- All V2/V3 methods require the Jira Cloud ID (not URL) as the first param
- ListProjects_V3 returns data in `value` (not `values`) — access via 
  rawProj?.['value']
- JQL project filter must be unquoted: project = KEY not project = "KEY"
- The connector may return issues from all projects despite JQL — add 
  client-side filtering by issue key prefix (e.g., "DEMO-")

Style it with a clean, Jira-inspired theme in App.css.
```

> **What to expect:** A working issue list with project selector. You may need to iterate on the response data shape since the connector's actual responses don't always match the generated types.

### Step 5 — Add Issue Detail View

**Prompt:**
```
Add an issue detail view:
- Clicking an issue key in the table opens a detail panel
- Fetch full issue details using GetIssue_V2(cloudId, issueKey)
- Show: status, priority, type, assignee, reporter, created date, description
- Add a "Back to list" link
- Descriptions may come as ADF (Atlassian Document Format) objects — 
  write a helper to extract plain text from both string and ADF formats
```

### Step 6 — Add Create Issue

**Prompt:**
```
Add a "Create Issue" button and modal form with fields: Issue Type (dropdown 
from ListIssueTypes_V2), Summary (text), Description (textarea), Priority 
(dropdown from ListPriorityTypes_V2).

Use CreateIssue_V3(cloudId, projectKey, issueTypeId, item).

CRITICAL: The `item` body MUST be wrapped as:
{ fields: { summary: "...", description: "...", priority: { id: "..." } } }

This matches the Jira REST API structure. Without the `fields` wrapper, 
you'll get a 400 "fields empty" error.

After creating, wait 1.5 seconds then refresh the issue list (Jira needs 
time to index).
```

> **Key learning:** This was one of the biggest debugging sessions. The generated `CreateIssue_V3` parameter is named `item` but requires the `{ fields: {...} }` wrapper matching the raw Jira REST API. The connector doesn't abstract this away.

### Step 7 — Add Edit & Comment

**Prompt:**
```
Add edit and comment functionality:
1. An "Edit" button on the detail view that opens a modal pre-filled with 
   current values (summary, description, priority)
2. Use UpdateIssue_V2(cloudId, issueKey, body) with { fields: { ... } } wrapper
3. A comments section on the detail view showing existing comments
4. Comments are nested at fields.comment.comments in the issue data
5. An "Add comment" form using AddComment_V2(cloudId, issueKey, { body: text })
6. After edit/comment, refresh the issue detail
```

### Step 8 — Deploy & Test

**Prompt:**
```
Build and deploy the app:
npm run build
pac code push
```

> **Tip:** Always build before pushing. `pac code push` deploys the `dist/` folder.

---

## Phase 3: Add Copilot Studio Agent

### Step 9 — Create & Publish Your Agent

This is done in **Copilot Studio** (not via code):
1. Go to https://copilotstudio.microsoft.com
2. Create a new agent in your environment
3. Configure topics/knowledge for your use case
4. **Publish** the agent
5. Go to **Channels → Web app** and note the agent name from the URL:
   ```
   https://{id}.environment.api.powerplatform.com/.../bots/{agentName}/conversations
   ```
   The `{agentName}` part (e.g., `copilot_agent_LDkr5`) is what you need.

### Step 10 — Add Copilot Studio Connector

Find your Copilot Studio connection:
```
pac connection list
```
Look for `shared_microsoftcopilotstudio`. If none exists, create one in the Power Apps maker portal (https://make.powerapps.com → Connections).

```
Terminal command:
pac code add-data-source -a "shared_microsoftcopilotstudio" -c <connection-id>
```

This generates `MicrosoftCopilotStudioService.ts` with the `ExecuteCopilotAsyncV2` method.

> **Key learning:** We initially tried 4 different approaches to embed the agent before landing on the connector approach:
> 1. ❌ CDN-hosted BotFramework WebChat — blocked by Power Apps CSP
> 2. ❌ npm BotFramework WebChat — token endpoint not available for authenticated agents
> 3. ❌ MSAL + DirectLine — agent not available as Entra service principal
> 4. ❌ MSAL + Direct-to-Engine REST API — redirect URI nightmare with Power Apps storageproxy URLs
> 5. ✅ **Power Platform connector** (`shared_microsoftcopilotstudio`) — handles all auth automatically
>
> **The official approach documented at [Connect to Copilot Studio](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-copilot-studio) is by far the simplest and most reliable.**

### Step 11 — Build the Chat Widget

**Prompt:**
```
Create a CopilotChat.tsx component that provides a floating chat widget 
using the Copilot Studio connector. Reference the docs at:
https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-copilot-studio

Requirements:
1. Import MicrosoftCopilotStudioService from the generated services
2. Use ExecuteCopilotAsyncV2 to send messages — it takes:
   - Copilot: the agent schema name (e.g., "copilot_agent_LDkr5")
   - body: { message: "user text", notificationUrl: "https://notificationurlplaceholder", agentName: "<same agent name>" }
   - x_ms_conversation_id: optional, for multi-turn conversations
3. The response may use different property casing — handle conversationId/ConversationId/conversationID, lastResponse/LastResponse, responses/Responses
4. Track the conversationId across messages for multi-turn context
5. UI: floating action button (bottom-right) → popup with message bubbles, typing indicator, input bar
6. No MSAL or token management needed — the connector handles auth

Add styles for the chat widget to App.css: .copilot-fab, .copilot-popup, 
.copilot-header, .copilot-messages, .copilot-msg-bubble, .copilot-typing, 
.copilot-input-bar
```

### Step 12 — Add Markdown Rendering

**Prompt:**
```
The Copilot agent returns responses in markdown format (headings, bold, 
lists, blockquotes, code blocks, emojis, horizontal rules) but they display 
as raw text. 

Install react-markdown and update CopilotChat.tsx to render bot messages 
through <Markdown> while keeping user messages as plain text.

Add CSS for markdown inside bot bubbles: properly sized headings, paragraph 
spacing, styled blockquotes with left border, horizontal rules, inline code 
background, pre blocks, and remove top margin on first child / bottom margin 
on last child.
```

### Step 13 — Wire Into App.tsx

**Prompt:**
```
Import CopilotChat in App.tsx and render <CopilotChat /> inside the app div.
```

---

## Phase 4: Reporting Dashboard

### Step 14 — Build the Dashboard

**Prompt:**
```
Create a Dashboard.tsx component that receives the current issues array and 
project name as props. It should NOT make any API calls — it computes all 
metrics from the issues data.

Include:
1. KPI cards: Total Issues, Unresolved, Resolved, Created (7d), Created (30d), Updated (7d)
2. Donut charts: Issues by Status (color-coded using Jira status category 
   colors — blue-gray for new, blue for in-progress, green for done), 
   Issues by Priority (red for highest/high, orange for medium, blue for low)
3. Bar charts: Issues by Issue Type, Issues by Assignee
4. CSS donut charts using conic-gradient (no chart library needed)
5. Horizontal bar charts with labels, fill bars, and counts

Add all dashboard styles to App.css with .dash- prefix.
```

### Step 15 — Add Navigation Tabs

**Prompt:**
```
Add navigation tabs to App.tsx to switch between "Tickets" (existing CRUD 
view) and "Dashboard" views. The project selector should stay visible on 
both tabs so the dashboard reflects the currently selected project.

Add a Tab type ('tickets' | 'dashboard') to state. Render a nav bar with 
two tab buttons below the header. Gate the issue list/detail views on 
tab === 'tickets' and the Dashboard component on tab === 'dashboard'.
```

### Step 16 — Final Deploy

**Prompt:**
```
Build and deploy:
npm run build
pac code push
```

---

## Common Pitfalls & Solutions

| Problem | Solution |
|---|---|
| **CreateIssue_V3 returns 400 "fields empty"** | Wrap body in `{ fields: { summary, description, priority } }` |
| **Issues from wrong project appear** | Add client-side filter: `key.startsWith(selectedProject + '-')` |
| **ListProjects_V3 returns empty array** | Access `rawProj?.['value']` not `rawProj?.['values']` |
| **V1 methods return 406** | Use V2/V3 methods with Jira Cloud ID (not instance URL) |
| **Copilot WebChat blocked by CSP** | Use the `shared_microsoftcopilotstudio` connector, not WebChat |
| **MSAL redirect URI issues in Power Apps** | Don't use MSAL — use the connector approach instead |
| **Agent response shows raw markdown** | Install `react-markdown`, render bot messages through `<Markdown>` |
| **ExecuteCopilotAsyncV2 response empty** | Check property casing variations (camelCase, PascalCase) |
| **Agent doesn't respond** | Ensure agent is **published** in Copilot Studio and agent name matches exactly |
| **New issue not appearing after create** | Add 1.5s delay before refreshing — Jira needs indexing time |

---

## Final Architecture

```
User → Power Apps Host → React SPA
                            ├── App.tsx (nav + CRUD)
                            ├── Dashboard.tsx (charts from issue data)
                            └── CopilotChat.tsx (agent chat)
                                    │
                    Power Platform Connector Layer
                            ├── shared_jira → Jira Cloud REST API
                            └── shared_microsoftcopilotstudio → Copilot Studio Agent
```

---

## Prompt Strategy Tips

1. **Read the generated code first.** Before writing any prompt, tell the AI to examine `JiraService.ts` and `JiraModel.ts` to understand the available methods and types. This prevents hallucinated API calls.

2. **Include API quirks in your prompt.** The Jira connector has specific behaviors (Cloud ID requirement, `value` vs `values`, `fields` wrapper). Including these upfront saves debugging cycles.

3. **Build incrementally.** Don't try to build everything in one prompt. The progression — list → detail → create → edit → agent → dashboard — lets you validate each piece before adding complexity.

4. **Reference official docs.** For the Copilot Studio integration, pointing to the official Microsoft Learn doc (`connect-to-copilot-studio`) saved us from 4 failed approaches.

5. **Deploy early and often.** `pac code push` is fast. Deploy after each major feature to catch environment-specific issues (CSP, auth, connector routing) that don't show up locally.

6. **Let the connector handle auth.** The single biggest time-saver was abandoning MSAL/DirectLine/WebChat in favor of the `shared_microsoftcopilotstudio` connector. If there's a Power Platform connector for your service, use it.
