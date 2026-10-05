# Facilitator guide

For the people who run the hackathon or the customer demo. Participants follow [the lab](README.md).

The lab kit – guide, lab scripts and application – is the private repository [zhshah/AlThuraya-App-Modernization-LabKit](https://github.com/zhshah/AlThuraya-App-Modernization-LabKit). Clone it and run the presenter commands from its root.

## 1. Prepare the environment

### The "on-premises" server (per team, or shared)

The lab VM already exists: `vm-contoso-web01` in resource group `rg-contoso-onprem-swc` – portal <http://contoso-onprem-0720c.swedencentral.cloudapp.azure.com>, treasury service <http://contoso-onprem-0720c.swedencentral.cloudapp.azure.com:8080/treasury-service>. Only to rebuild it (35–50 minutes; same subscription and resource group give the same names and addresses):

```powershell
./onprem-vm/Deploy-Lab.ps1 -ResourceGroup rg-contoso-onprem-swc -VnetResourceGroup sweden-central-vnet -VnetName Sweden-vNet -SubnetName default
```

- **Before every event:** `./onprem-vm/Update-LabApp.ps1 -ResourceGroup rg-contoso-onprem-swc -ResetDemoData` – fresh data, and the latest `scripts/` on the VM (`C:\ContosoSetup\src\scripts`, used by the optional data copy in Module 4).
- **Give each team:** its team name (`team1`, `team2`, …) and the RDP password (`az keyvault secret show --vault-name kv-contoso-onprem-0720c -n vm-admin-password --query value -o tsv`). All addresses are already in [lab-guide.html](lab-guide.html).
- **One VM for several teams?** It works: teams only browse the portal and run the smoke test against it – Copilot's deployment loads demo data, not the VM's data. Only the optional real-data path in Module 4 needs RDP; Windows Server allows two concurrent sessions, so teams take turns (about 15 minutes each).
- The NSG only admits the presenter's internet address (RDP, 80, 8080). On the day, allow the venue's address with the commands in [lab-guide.html](lab-guide.html), step 1.5 – no redeployment needed.

### Participants' Azure

- One resource group per team, with **Owner** (or Contributor + User Access Administrator): managed identities need role assignments.
- Check **App Service quota** (Linux B1) and Azure SQL availability in the region beforehand – some subscriptions have zero App Service quota. Use B1, not F1: in validation the free F1 plan locked both apps after a few crash-loop restarts.
- **Azure Policy:** if a policy switches off public network access, add the exemption to the plan prompt (validation: *Tag every resource SecurityControl=Ignore.*).
- Microsoft Entra-only Azure SQL needs participants to be able to sign in with Entra ID (the Query editor uses it).

### GitHub Copilot

- Licenses with **premium requests** for every participant. A full run (assessment, two plans, two executions, deployment) uses a lot of them.
- Organization policies: agent mode, MCP servers and preview features must be allowed.
- Repository: participants clone [zhshah/AlThuraya-App-Modernization-Lab](https://github.com/zhshah/AlThuraya-App-Modernization-Lab) – the application exactly as it runs on the lab VM (`src/`, `database/`, the smoke test and the workstation check; verified byte-identical). It is private: add participants as collaborators (read access is enough to clone), or give each team its own copy. Keep `main` in its clean "before" state – no `.github/modernize` or `.github/upgrades` folders, and teams don't push to it. When you change the application in this kit, update that repository too, so the VM and the repository run the same code.

### Workstations

Ask participants to complete [Module 0](00-setup.md) **before** the event and to send you the output of `scripts/Test-LabWorkstation.ps1`. The two blockers seen in validation were **no MSBuild** (Visual Studio / Build Tools missing) and **nuget.org blocked** by a corporate proxy. Participants on macOS or Linux need a Windows dev VM or Dev Box.

**Venue network:** the run in Module 3 takes almost 4 hours and needs the Copilot API throughout. In validation, a few minutes of DNS failures on Wi-Fi stopped a run (resuming worked). Prefer a wired or reliable network.

## 2. Run the day

| Time | Module | Facilitator focus | Done when |
|---|---|---|---|
| 0:00 | Intro (15 min) | The story: CFO wants PaaS; humans stay in the loop | Teams formed, URLs shared |
| 0:15 | [1 – Assess](01-assess.md) | Help with tool downloads; point out the mandatory findings | The agent asks *"Proceed to planning?"*; baseline smoke test passed |
| 0:45 | [2 – Decide and plan](02-decide-and-plan.md) (30 min) | **Play the customer:** ask about risks, effort, the target and the scope (A or B); then approve | Plans reviewed, each ending with a deployment task |
| 1:15 | [3 – Modernize and deploy](03-modernize.md) (about 3¾ hours, lunch included) | Check every team ran `az login` and set **Allow all**; keep teams from editing code during runs; collect "surprises" | All tasks completed; Copilot's summary shows both Azure URLs and the smoke test |
| 5:00 | [4 – Test on Azure](04-deploy-and-verify.md) (20 min) | Smoke test on Azure; show the managed identities | `SMOKE_TEST_PASSED` against Azure |
| 5:20 | Read-out (20 min) | Each team: what Copilot did, where they stepped in, open risks | – |

## 3. Customer demo script (30–40 minutes)

Live execution takes too long for a meeting, so run it "cooking show" style: prepare a **finished branch** and a **deployed Azure environment** the day before (run the lab yourself), and show the live parts where the customer makes decisions.

1. **The customer's reality (3 min).** Open the on-premises portal, approve an invoice, open **About**: IIS, .NET Framework 4.8, SQL Server, Tomcat, Java 8. *"Thousands of apps look like this."*
2. **The code (3 min).** In VS Code: `Web.config` (Windows authentication, SMTP pickup folder, local log file), `PortalLog.cs` (Event Log), `application.properties` (password), `BankFileWriter.java` (local disk).
3. **Assess – live (7 min).** QuickStart → **Migrate to Azure** → the **(Recommended)** full-assessment option. While it runs, explain AppCAT and the rule sets. In the report, set **Target Service** to Azure App Service and walk through the mandatory findings. If you ran a Custom Assessment with **Full analysis** the day before, show its Architecture and Data Model tabs.
4. **The decision (3 min).** The agent asks *"Proceed to planning?"* – **turn to the customer**: *"Based on this, do you want to move it to Azure?"* This is the human-in-the-loop moment.
5. **Plan – live (5 min).** Explain scope A and B, then send prompt A ([Module 2.2](02-decide-and-plan.md#22-let-copilot-plan-the-migration-10-min)). Planning takes about 15 minutes – continue with your prepared plans: ordered tasks, each mapped to findings, editable, ending with the deployment.
6. **Execution – the prepared branch (7 min).** Show `git log`: one commit per task. Open a `progress.md` in `.github/modernize/code-migration` and a `verification-summary.md`. Diffs: `pom.xml` (Java 21, Spring Boot 3), `application.properties` (no password, managed identity), the SDK-style `.csproj`, `Program.cs`, `appsettings.json`, and the new `infra/` folder. Mention that the agent built and tested after every task – and found and fixed its own mistakes: a regression from the .NET upgrade (missing CSRF token answered with 500 instead of 403) and, in the deployment, the `assets` folder missing from the published portal.
7. **Running on Azure (5 min).** The deployed portal; **About** shows Linux / .NET 10 / Azure SQL; `/health` answers `Healthy`; run `Invoke-SmokeTest.ps1` against Azure; show the managed identities, and the bank file in Blob Storage after approving the payment run.
8. **Close (2 min).** Assessment → decision → plan → reviewed changes → PaaS, for both stacks, with an audit trail of commits.

## 4. Troubleshooting (issues seen during validation)

| Symptom | Cause | Fix |
|---|---|---|
| *Failed to install .NET AppCAT tool … Unable to load the service index for source https://api.nuget.org/v3/index.json* | nuget.org blocked by a proxy or NuGet policy | Allow nuget.org, or install AppCAT from an approved feed: `dotnet tool install --tool-path "$env:LOCALAPPDATA\Microsoft\VisualStudio\AppModernizationExtension\Tools" dotnet-appcat`, then re-run |
| .NET assessment: *Report file is not generated*; AppCAT log: *Did not find a Visual Studio instance … Msbuild was not found* | No Visual Studio / Build Tools | Install VS 2026 (ASP.NET and web development) or Build Tools with the web workload and the .NET Framework 4.8 targeting pack ([Module 0](00-setup.md)) |
| `modernize` is not recognized right after installing | PATH only updates in new sessions | Open a new terminal or restart VS Code |
| The plan has no .NET upgrade task | .NET Framework 4.8 is still supported, so Copilot only adds the upgrade on request | Ask for .NET 10 explicitly (the [Module 2.2](02-decide-and-plan.md) reply does) |
| Data migration (optional path): *Client with IP address … is not allowed* | Azure SQL firewall | Add a firewall rule for the lab VM's public IP |
| Data migration (optional path) stops: *already contains tables* | Protection against overwriting – for example, Copilot's deployment already loaded the demo data | Delete the Azure database (or the whole SQL server) and run again |
| App error: *Login failed for user '<token-identified principal>'* | No database user for the app's managed identity | Tell Copilot the error, or run the SQL in [Module 4](04-deploy-and-verify.md#give-the-apps-access-to-their-databases) for the identity the app really uses (system- or user-assigned) |
| The deployment stops waiting for an Azure sign-in; Azure CLI: *AADSTS70043* | The Azure CLI token expired during the long run | `az login`, then tell Copilot *I signed in again – continue.* |
| Portal on Azure crash-loops after the first deployment; the publish output has no `assets` folder | Upgrade bug in the publish step | Tell Copilot; in validation it fixed the publish step itself and redeployed |
| Both apps stopped and won't start on the F1 plan | F1 limits CPU time and restarts; a crash loop uses them up | Use B1 (prompts A and B do), or let Copilot redeploy elsewhere |
| Creating a budget transfer fails with a permission error | The portal needs `UPDATE` on the sequence for `NEXT VALUE FOR` | `GRANT UPDATE ON OBJECT::dbo.budget_transfer_seq TO [<portal identity>]` |
| Portal in Azure shows no data (`DATA_UNAVAILABLE`); log: *No such host is known* | The connection string still holds the `<your-sql-server-name>` placeholder from `appsettings.json` | Set the portal's connection-string setting (validated code: `ConnectionStrings__ThurayaFinanceDb`) to the Azure SQL server and restart |
| No data in Application Insights | The code switches on the Azure Monitor exporter only when its own setting is present | Set `ApplicationInsights__ConnectionString` (validated code) and restart – `APPLICATIONINSIGHTS_CONNECTION_STRING` alone isn't enough |
| The agent stops mid-way or VS Code was closed | Long run interrupted | *"Continue executing the plan"* – the task list records progress |
| Execution ends with *SUCCESS*, but the summary shows a task as **Started** and later ones as **Unknown**; uncommitted changes remain | The workstation lost the connection to the Copilot API during a task. The CLI log (`%USERPROFILE%\.modernize\logs`) shows *Failed to get response from the AI model; retried 5 times*; in validation the cause was *dns error: No such host is known* for `api.enterprise.githubcopilot.com` on Wi-Fi | Fix the network first (`Resolve-DnsName api.enterprise.githubcopilot.com`), then resume: *"Continue executing the plan"* (CLI: `modernize plan execute "Continue executing the plan from where it stopped" --plan-name <plan> --source <app folder> --language <language>`) |

## 5. Validation record

Validated on **2026-10-02** against the lab in this repository, in throw-away copies of the code (the lab's own code stays in its legacy state).

| Tool | Version |
|---|---|
| VS Code / GitHub Copilot modernization extension | 1.140.0 / 1.24.0 |
| Modernize CLI (Copilot CLI, default model) | 1.0.76 (1.0.83, Claude Sonnet 5) |
| AppCAT for .NET | 1.0.1127 |
| SqlPackage | 170.4.83.3 |

| Step | How it was validated | Result |
|---|---|---|
| Workstation check | `Test-LabWorkstation.ps1` in PowerShell 7 and Windows PowerShell 5.1 | Reports exactly the blockers listed above |
| Assessment – Java | `modernize assess --source . --format markdown --no-tty` | 11 findings (8 cloud readiness, 3 upgrade); about 3 min on first run including tool download |
| Assessment – .NET | AppCAT with the arguments the tools use, on the Windows x64 lab VM with Build Tools | 15 issues, 92 occurrences (table in Module 1.3); fails as described above without MSBuild |
| Plans | `modernize plan create` per application | Java: 5–6 tasks, .NET: 8 tasks; about 2–3 min each |
| Execution – Java | `modernize plan execute` (no-deploy plan, Azure CLI isolated) | **All 6 tasks succeeded in 72 min**, one commit each: baseline; Java 21 + Spring Boot 3 (`jakarta.*`); Azure SQL with managed identity (password removed); Blob Storage with managed identity; CVE fixes (Spring Boot 3.5.16 and patched Jackson, Netty, Tomcat, Log4j); 24 post-migration integration tests. The consistency check caught a change in error handling and the agent fixed it before committing. Independent rebuild with JDK 21: `mvn clean verify` green – 11 unit + 24 integration tests, 0 failures |
| Execution – .NET | `modernize plan execute` (no-deploy plan, Azure CLI isolated) | **All 8 tasks succeeded in about 105 min** (two sessions: the first was cut off by DNS failures, see Troubleshooting; the resume finished the open task and the rest), one commit each: baseline (34 test cases); .NET 10 / ASP.NET Core MVC; Azure SQL with managed identity; ACS Email; OpenTelemetry + Azure Monitor; treasury URL from configuration; post-migration tests, which caught and fixed a regression from the upgrade (missing CSRF token → 500 instead of 403) – 6 of 34 cases ran, the 28 database cases had no local SQL engine; CVE scan: none in 13 packages. Independent check: `dotnet build` 0 warnings, 0 errors; `dotnet test` 6/6; the app starts on .NET 10 – pages and assets 200, POST without CSRF token 403 |
| Data migration | `scripts/Copy-DatabasesToAzureSql.ps1` on the lab VM → Entra-only Azure SQL | 19 tables / 1,902 rows and 7 tables / 279 rows identical; about 4 min |

Validated again on **2026-10-05** – the whole VS Code path, in a clone of the lab repository (GitHub Copilot modernization 1.24.0, Claude Opus 5.5):

| Step | Result |
|---|---|
| Assessment | QuickStart → **Migrate to Azure**: 5 findings in the treasury service in a few minutes (the .NET part needs MSBuild). Custom Assessment with Full analysis and Security: 14 issues; the six deep-analysis documents didn't arrive – cancelled at 99% |
| Plans | Two plans, 8 and 7 tasks, each ending with a deployment task (deployment was added before the run) – see [sample-plans](sample-plans/group-finance-portal-to-azure/plan.md) |
| Execution | Plan mode → **Implement with Autopilot**, permissions Allow all: all 15 tasks succeeded, one commit each. Portal 28/28 integration tests; treasury 12 unit + 33 integration tests; 29 CVEs fixed (patch updates); 8 CWE findings not fixed, because the request didn't ask for it |
| Deployment | Copilot wrote Bicep (`infra/`), `infra/scripts/DbInit.cs` (schemas, demo data via `node database/seed/generate-dataset.js`, database users) and `infra/scripts/deploy.ps1`. It needed an `az login` mid-run, fixed a crash loop (portal `assets` missing from the publish output), and – after F1 locked the apps – redeployed in another region. Both apps live; smoke test 15/15; `/health` Healthy |
| Duration | About 3¾ hours from plans to live (13:51–17:38) |

**Not yet validated – do one full dry run before the first event:**

- the VS Code click path on a participant-spec workstation (validated on a presenter laptop);
- the `@upgrade` guided path (Module 3, alternative);
- the portal's 28 database test cases with a local SQL Server or Docker (Module 0, optional);
- prompts A and B word for word – the validated run let Copilot choose its own names and region; the prompts fix the names, B1 and an existing resource group – and how long prompt B's extra security work takes;
- the manual deployment prompt of the optional real-data path (Module 4, A.3).

## 6. Reset and clean up

```powershell
./onprem-vm/Update-LabApp.ps1 -ResourceGroup rg-contoso-onprem-swc -ResetDemoData   # between sessions: fresh demo data
az group delete -n rg-finance-team1 --yes --no-wait                                 # each team's Azure resources - repeat for team2, team3, ...
./onprem-vm/Remove-Lab.ps1 -ResourceGroup rg-contoso-onprem-swc                     # after the event: the on-premises lab
```
