# Module 2 – Decide and plan

⏱ About 30 minutes. **Goal:** present the assessment to the customer, get a go/no-go decision, choose the scope, and let Copilot turn the decision into reviewable plans – including the deployment.

## 2.1 The decision gate: present to the customer (10 min)

The `modernize` agent is waiting for an answer in the chat – for example *Which Azure hosting target should I use for the migration?* or *Proceed to planning?*. In a real engagement, this is where you go back to the customer. Your facilitator plays the customer's CIO.

Prepare a 3-minute read-out from the assessment report:

1. **What we found** – 2 applications; for each: the runtime, the number of mandatory findings and the main blockers (Module 1.3).
2. **What it means** – end-of-support runtimes (Java 8, Spring Boot 2.7), dependencies that don't exist on PaaS (Windows authentication, local disk, SMTP relay, Event Log), and secrets in configuration files.
3. **Recommendation** – the target platform and how each blocker is resolved:

   | Today (on-premises) | Target on Azure |
   |---|---|
   | IIS + .NET Framework 4.8 | Azure App Service, **.NET 10** (ASP.NET Core) |
   | Tomcat 9 + Java 8 WAR | Azure App Service, **Java 21** / Spring Boot 3 |
   | SQL Server Express (Windows auth, SQL password) | **Azure SQL Database** with managed identities – no passwords |
   | Bank files and reports on local disk | **Azure Blob Storage** with managed identity |
   | Windows Event Log + log files | **Application Insights** (OpenTelemetry) |
   | SMTP pickup folder | **Azure Communication Services Email** (optional) |

The customer decides:

- **No-go** → stop here. The assessment report is the deliverable: commit `.github/modernize/assessment/` and share it.
- **Go** → continue with 2.2.

## 2.2 Let Copilot plan the migration (10 min)

Reply **in the same chat** with the decision, **the scope and the targets**. If the agent shows a question box, click **Enter custom answer**, paste the text and press **Ctrl+Enter** – don't pick one of its options (in our test the recommended option kept the portal on .NET Framework on Windows). If it asked in plain text, paste into the chat box. Be explicit about **.NET 10**: .NET Framework 4.8 is still supported, so Copilot only adds a .NET upgrade task when you ask for it.

The request decides how much Copilot changes. Choose one scope:

| | **A – Essentials** (lab default) | **B – Complete** |
|---|---|---|
| Copilot changes | Only what the apps and their databases need to run on Azure, then deploys | The same, plus every other finding – security (CWE), potential and optional – and all recommendations, then deploys |
| Security | The CVE task Copilot adds to every plan, kept to patch updates; other security findings become follow-ups | All security findings fixed – run the Custom Assessment with **Security** first, so they are in a report |
| Time | About 3¾ hours from plans to live on Azure (5 October 2026) | Longer – not timed yet |

> **What took the time in our test?** Not security: the CVE task took 3 minutes for the portal (no CVEs) and 8 minutes for the treasury service (29 CVEs, fixed with patch updates). The baselines and integration tests took about an hour, the upgrades and Azure changes about an hour, the deployment about 1¼ hours. The 8 security findings of the Custom Assessment weren't fixed, because the request didn't ask for it.

**Prompt A – Essentials** (another team: replace `team1`):

> Yes, the customer approved the migration. Target: Azure App Service on Linux for both applications, with Azure SQL Database. Scope: only the changes the applications and their databases need to run on Azure. Don't fix other assessment findings, such as the security (CWE) findings – list them as follow-ups. Keep the CVE task to patch-level updates.
> Write one plan per application and stop for my review – don't execute anything yet.
> 1. Group Finance Portal (src/dotnet): upgrade from .NET Framework 4.8 to .NET 10 (ASP.NET Core MVC); remove the Windows-only APIs (registry, Windows identity, Event Log) so it runs on Linux App Service; use Azure SQL Database with passwordless managed identity authentication instead of Windows authentication; replace the SMTP pickup-folder e-mail with Azure Communication Services Email; replace the Windows Event Log and local log files with OpenTelemetry and Application Insights; read the treasury service URL from configuration.
> 2. Treasury service (src/java/treasury-service): upgrade to Java 21 and Spring Boot 3; use Azure SQL Database with passwordless managed identity authentication; move the bank files and cash-position reports from the local disk to Azure Blob Storage with managed identity.
> 3. Deployment, as the last task of each plan – the portal plan runs first: deploy both applications into the existing resource group rg-finance-team1 in swedencentral. One Linux App Service plan, plan-finance-team1 (B1). Web apps app-portal-0720c-team1 (.NET 10) and app-treasury-0720c-team1 (Tomcat 10.1, Java 21, the WAR at the site root). Azure SQL server sql-finance-0720c-team1 with Microsoft Entra-only authentication and the databases ThurayaFinance and ThurayaTreasury (Basic): create the schemas, load the demo data from the database folder and create database users for both managed identities. Storage account stfinance0720cteam1 with the containers the treasury service needs. Application Insights for the portal. Azure Communication Services Email with an Azure-managed domain. System-assigned managed identities, each with only the roles it needs – no passwords or keys. Public access is fine: this is a demo. At the end, run scripts/Invoke-SmokeTest.ps1 against both Azure URLs and show me the URLs.

**Prompt B – Complete:** the same text, with the scope sentence replaced by:

> Scope: everything – fix all findings of the assessment reports, security and non-security (mandatory, potential and optional), apply all their recommendations, and fix all CVEs in the dependencies. Add a task for each group of findings.

> **Azure Policy:** if a policy in the subscription switches off public network access, add the exemption to the prompt – our test added *Tag every resource SecurityControl=Ignore.*

The agent may ask questions in a box – in our test *Spring Boot 3.x on Java 21 or Spring Boot 4.x on Java 25?* (choose **Spring Boot 3.x on Java 21, as requested (Recommended)**), whether to include integration tests (choose the **(Recommended)** option, mock mode) and which Azure subscription to use. It writes **one plan per application** – a plan covers one language – as `plan.md` plus the task list `.metadata/tasks.json` in `.github/modernize/group-finance-portal-to-azure/` and `.github/modernize/treasury-service-to-azure/`. It ends with *"To start, ask me to run either plan"*, or asks **"The plan is ready. What would you like to do?"** → choose **Review the plan first**. Planning took about 15 minutes in our test.

### Review the plan

Check that:

- every **mandatory** finding from Module 1 is covered by a task;
- the portal plan **starts** with the upgrade to .NET 10;
- there are tasks for Azure SQL (managed identity), Blob Storage, Application Insights / OpenTelemetry and e-mail;
- a **CVE scan** and, usually, a **behaviour baseline + integration tests** (mock mode) are included;
- each plan ends with a **deployment** task with your names (`rg-finance-team1`, `app-portal-0720c-team1`, …).

Plans from the VS Code run (5 October 2026) – the full files are in [sample-plans](sample-plans/group-finance-portal-to-azure/plan.md). That run let Copilot choose its own names and region; with prompt A or B your plans use your names:

| `group-finance-portal-to-azure` (.NET, 8 tasks) | `treasury-service-to-azure` (Java, 7 tasks) |
|---|---|
| 000 Baseline – today's behaviour, for the integration tests | 000 Baseline – today's behaviour, for the integration tests |
| 001 Upgrade to .NET 10 ASP.NET Core MVC – also removes registry, Windows identity and IIS calls; treasury URL from configuration | 001 Spring Boot 3.x on Java 21 (still a WAR) |
| 002 Azure SQL Database with managed identity | 002 Azure SQL Database with managed identity – password and `localhost` connection removed |
| 003 SMTP pickup folder → Azure Communication Services Email | 003 Bank files and reports → Azure Blob Storage with managed identity |
| 004 Event Log / log files → OpenTelemetry + Application Insights | 004 Integration tests (Azure services mocked) |
| 005 Integration tests (Azure services mocked) | 005 CVE scan and fixes |
| 006 CVE scan and fixes | 006 Deployment of the treasury service, then the smoke test against both Azure URLs |
| 007 Deployment – Bicep for all Azure resources, the databases with demo data, and the portal | |

Each plan ends with **Open Questions & Questionnaire**: decided items `[x]` and open items `[ ]` – in our run: the bank connector must read the bank files from Blob Storage, and the treasury service still writes its own log to a local file.

The plan files are plain Markdown and JSON: **edit them** if the customer wants something different (for example, drop the e-mail task) before you execute.

### Optional: plans with the Modernize CLI

```powershell
modernize plan create "<the portal part of the reply above>" --source src/dotnet --language dotnet --plan-name portal-to-azure
modernize plan create "<the treasury part of the reply above>" --source src/java/treasury-service --language java --plan-name treasury-to-azure
```

Add `--assess-file-path <path to report.json>` to base a plan on a specific assessment report.

---
Next: [Module 3 – Modernize and deploy](03-modernize.md)
