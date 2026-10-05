# Module 3 – Modernize and deploy

⏱ About 3¾ hours, mostly waiting for Copilot. **Goal:** let GitHub Copilot modernization execute both plans – runtime upgrades, Azure migrations and the deployment – while you follow the progress.

Copilot runs the plans **one after the other** in the same chat (agent **modernize**): the portal (.NET) first, then the treasury service (Java). Both plans change the same repository, so never run them at the same time.

1. In the terminal, sign in to Azure again – the deployment at the end uses this sign-in, and in our test an expired one stopped it: `az login`
2. Set the chat's **Permissions** (under the chat box) to **Allow all**, so Copilot doesn't wait for your approvals.
3. In the same chat, send:

   > Execute both plans: first group-finance-portal-to-azure, then treasury-service-to-azure, including their deployment tasks. Commit after each task. At the end, show me the Azure URLs and the smoke test result.

4. Shows Copilot a **Review Plan** card (chat mode *Plan*)? Click **Implement with Autopilot**. Answer any question box with the option that matches your plan.

## How execution works

When you select **Execute the plan** (or reply *"Execute the plan"*), the agent works through the tasks **in order**. For each task it:

1. changes the code (dependencies, configuration, source),
2. **builds** the project and **runs the tests** – and fixes what breaks,
3. runs a **consistency and completeness check** against the original behaviour – in the validation run it caught changed error handling in the new Blob Storage code and fixed it before committing,
4. **commits** the task, so every step is a reviewable Git commit.

The deployment tasks come last: Copilot writes Bicep for all Azure resources (`infra/`), creates them, loads the demo data into Azure SQL, deploys both apps and runs the smoke test against them.

It downloads what it needs on the way: JDK 21 and Maven for Java, the .NET 10 SDK packages for .NET. Your job is to **watch, review and answer** when it asks something. Don't edit files while a task is running.

> **Keep the workstation awake** during execution (power settings), and don't close VS Code. If a run is interrupted, ask the agent to *"continue executing the plan"* – it resumes from the task list.
>
> **Check every task's status, not just the final banner.** In validation, the connection to the Copilot model dropped in the middle of a task: the run ended with *SUCCESS*, but its summary listed that task as **Started** and the remaining ones as **Unknown**, with half-converted files left uncommitted. If you see that, resume as above – the agent picks up the open task.
>
> **The deployment waits for an Azure sign-in?** Run `az login`, then tell Copilot *I signed in again – continue.*

## Follow the progress

GitHub Copilot modernization writes everything into `.github/modernize` – open it in the Explorer. The folder after our run (5 October 2026):

```text
.github/modernize/
├─ assessment/                                     Module 1 – the reports (git ignores this folder)
│  ├─ reports/report-20261005122146/               one folder per report: report.json
│  ├─ engines/appcat/                              AppCAT logs and raw results
│  ├─ engines/security/                            security scan – Custom Assessment only
│  ├─ engines/facts/                               the 6 deep-analysis documents – Full analysis only
│  └─ history/                                     earlier runs
├─ group-finance-portal-to-azure/                  Module 2 – the portal plan
│  ├─ plan.md                                      the plan you reviewed
│  ├─ .metadata/tasks.json                         every task and its status
│  ├─ .metadata/summary.json                       every task's result: tests, risks, follow-ups
│  ├─ 000-setupBaseline-portal/                    baseline-summary.md
│  ├─ 005-integrationTest/                         verification-summary.md – the test results
│  └─ 006-security-cve-remediation/                cve-fix-summary.md
├─ treasury-service-to-azure/                      the treasury plan – same layout
├─ code-migration/                                 Module 3 – one folder per Azure migration task
│  ├─ migration-azure-sql-database-20261005141917/ plan.md, progress.md, summary.md
│  ├─ 003-transform-smtp-to-azure-communication-email/
│  ├─ migration-opentelemetry-azure-20261005143733/
│  ├─ migration-mi-azure-sql-20261005153114/
│  └─ 20261005154428/                              Blob Storage – no built-in skill, so only a time stamp
└─ java-upgrade/                                   logs of the Java tools
```

| Task | Where you see its progress | Our run |
|---|---|---|
| Every task | `.metadata/tasks.json` of its plan – `"status"` turns to `success` – and one git commit per task (**Source Control** view) | 15 tasks, each with its own commit – plus a few commits for deployment fixes |
| 000 Baseline | `<plan>/000-setupBaseline-…/baseline-summary.md` | 28 test cases for the portal, 33 for the treasury service |
| 001 Upgrade | The chat and the task's commit – no folder of its own | .NET 10 in 14 min, Java 21 in 6 min |
| Azure migrations – SQL, e-mail, monitoring, Blob | `code-migration/<task>-<date and time>/progress.md` – a checklist that fills in while Copilot works (✅ done, ⌛ running); `summary.md` when the task is done | 6 to 12 min per task |
| Integration tests | `<plan>/0xx-integrationTest/verification-summary.md` | 28 of 28 and 33 of 33 passed |
| CVE task | `<plan>/0xx-security-cve-remediation/cve-fix-summary.md` | Portal: no CVEs. Treasury: 29 fixed with patch updates |
| Deployment | The chat, and the new files in `infra/` and `.azure/deployment-plan.md` | Bicep plus `infra/scripts/deploy.ps1` |

Our run, from plans to live: plans committed 13:51 → portal tasks 14:03–15:14 → treasury tasks 15:23–16:20 → deployment 16:36–17:38 (Azure sign-in renewed, a start-up bug fixed, region changed) → both apps live, smoke test 15/15.

## Track A – Treasury service (Java)

1. Runs after the portal plan.
2. Expect these tasks (an earlier CLI validation run took **72 minutes** for the six code tasks, including the JDK and Maven downloads):

   | Task | What you'll see |
   |---|---|
   | Behaviour baseline | Test cases and test data that describe today's behaviour (bank files, cash reports, database access) – the reference for the integration tests at the end |
   | Java 21 + Spring Boot 3 | `pom.xml` → Java 21 and Spring Boot 3.x; `javax.*` → `jakarta.*` in the entities and controllers; build + unit tests green |
   | Azure SQL with managed identity | `spring-cloud-azure-starter`; JDBC URL with `authentication=ActiveDirectoryMSI`; the **password is gone** from `application.properties`; server and database come from environment variables |
   | Blob Storage with managed identity | Bank files and reports written to Blob containers instead of the local disk |
   | CVE scan | Vulnerable dependencies upgraded – in validation Spring Boot went to 3.5.x, with patched Jackson, Netty, Tomcat and Log4j |
   | Integration tests | Post-migration tests against the baseline, with the Azure services mocked – in validation 24 integration tests plus the 11 original unit tests, all green |
   | Deployment | `infra/scripts/deploy.ps1`: creates the Azure resources, loads the demo data, deploys both apps and waits until they answer; then the smoke test against both Azure URLs – 15/15 in our run |

3. When it finishes, review: `git log --oneline` – one commit per task – and open a few diffs: `pom.xml`, `application.properties`, `BankFileWriter.java`. Each Azure migration task also leaves `plan.md`, `progress.md` and `summary.md` in its folder under `.github/modernize/code-migration/` – what changed, how it was verified, and the build and test results.

## Track B – Group Finance Portal (.NET)

1. Runs first. Its baseline task comes first, then the **.NET Framework 4.8 → .NET 10** upgrade; the Azure tasks follow on the upgraded code.
2. Expect these tasks (an earlier CLI validation run took about **105 minutes** for eight code tasks, including one interruption that was resumed as described above):

   | Task | What you'll see |
   |---|---|
   | Behaviour baseline | 34 test cases for the portal's APIs, data access, e-mail and logging |
   | .NET 10 upgrade | SDK-style `.csproj` (`net10.0`), `Program.cs` instead of `Global.asax` and `App_Start`, `appsettings.json` instead of `Web.config`, ASP.NET Core MVC controllers, `PackageReference` instead of `packages.config` |
   | Azure SQL with managed identity | `Microsoft.Data.SqlClient`, connection string with `Authentication=Active Directory Default` – no Windows authentication |
   | Azure Communication Services Email | `EmailNotifier` sends through ACS with the managed identity; in validation, a failed e-mail is logged and doesn't block the approval |
   | OpenTelemetry | `PortalLog` writes through OpenTelemetry instead of the Event Log and local files; export to Azure Monitor is switched on by a connection-string setting (in validation: `ApplicationInsights:ConnectionString`) |
   | Configuration | Treasury service URL and timeout only from configuration – the app stops with a clear error if they are missing (in the VS Code run part of the .NET 10 task) |
   | Integration tests | Post-migration tests against the baseline. In validation they **caught a regression from the upgrade** – requests without the CSRF token got *500* instead of *403* – and the agent fixed it. Only 6 of the 34 cases ran: the 28 that need the database require a local SQL Server or Docker (see [Module 0](00-setup.md)) |
   | CVE scan | In validation: no known vulnerabilities in the 13 NuGet packages |
   | Deployment | Bicep for all Azure resources of both apps (`infra/`) and `infra/scripts/DbInit.cs` for the schemas, demo data and database users. In our run Copilot created the resources and deployed both apps at the end, after the treasury plan |

3. Review the branch the same way. Build and test it yourself: `dotnet build src/dotnet` and `dotnet test src/dotnet`.

### Alternative for the .NET upgrade: the guided `@upgrade` agent

To see the .NET upgrade in depth, run it with **GitHub Copilot upgrade** before executing the Azure tasks:

1. In Copilot Chat, select the **Upgrade** agent (or type `@upgrade`) and ask: *Upgrade the ThurayaFinance.Portal solution in src/dotnet to .NET 10.*
2. Answer the setup questions: target **.NET 10**, create a new branch, workflow mode **Guided** (it pauses after every stage).
3. Review each stage in `.github/upgrades/<scenario>/`: `assessment.md` (breaking changes, API issues), `upgrade-options.md` (strategy – confirm or change), `plan.md`, then `tasks.md`, which updates live while it works. Tell it to *proceed to planning*, *proceed to execution* and *start the upgrade*.
4. Then return to the `modernize` agent and ask it to execute the portal plan **without** its .NET upgrade task: *"Execute the portal plan; skip the .NET 10 upgrade task – it is already done."*

## Checkpoint

Before Module 4, both tracks should have:

- every task in the plan marked as completed, and a commit per task;
- a successful build (`dotnet build src/dotnet`, and the Maven build the agent ran);
- no secrets in configuration files – only names of servers, databases, containers and endpoints;
- both apps running on Azure: Copilot's final summary shows the two URLs and the smoke test result.

Something failed? Read the agent's summary, paste the error into chat (*"The build fails with … – fix it"*), and let it continue. In our run the first deployment crash-looped because the upgraded portal's `assets` folder was missing from the published app; Copilot fixed it and redeployed. On the free F1 tier those restarts locked the apps – that's why prompts A and B ask for B1.

### Optional: execute with the Modernize CLI

```powershell
modernize plan execute --plan-name treasury-to-azure --source src/java/treasury-service --language java
modernize plan execute --plan-name portal-to-azure --source src/dotnet --language dotnet
```

---
Next: [Module 4 – Test on Azure](04-deploy-and-verify.md)
