# Module 1 – Assess the application

⏱ About 30 minutes. **Goal:** understand what runs "on-premises" today and let GitHub Copilot modernization produce a full assessment.

## 1.1 Tour the current state (10 min)

The lab VM `contoso-onprem-0720c.swedencentral.cloudapp.azure.com` is the customer's "on-premises" server. The application has two parts, both on this VM:

| Part | Address | What it is |
|---|---|---|
| **Portal** | <http://contoso-onprem-0720c.swedencentral.cloudapp.azure.com> | The website the finance team uses – .NET Framework 4.8 on IIS |
| **Treasury service** | <http://contoso-onprem-0720c.swedencentral.cloudapp.azure.com:8080/treasury-service> | The Java service behind the portal (bank accounts, cash, payment runs) – Java 8 on Tomcat, port 8080 |

1. Open the **portal**. Look around: dashboard, **My approvals**, **Payment runs**, **Treasury & cash**, the Arabic UI (**عربي**). Approve an invoice – it is saved in SQL Server.
2. Open the user menu → **About**: Windows Server, IIS 10, .NET Framework 4.8, SQL Server Express, and the treasury service on Java 8 / Spring Boot 2.7 / Tomcat 9.
3. Open the **treasury service** – the Java service's status page.
4. Optional: RDP to the VM (`mstsc /v:contoso-onprem-0720c.swedencentral.cloudapp.azure.com`, user `contosoadmin`) and look at IIS Manager, the `Tomcat9` service, SSMS and `C:\ThurayaData` (bank files, e-mail pickup folder, log files).
5. Record the **behaviour baseline** – the same test proves the migrated app later. It takes the two addresses above:

   ```powershell
   $portal   = 'http://contoso-onprem-0720c.swedencentral.cloudapp.azure.com'
   $treasury = 'http://contoso-onprem-0720c.swedencentral.cloudapp.azure.com:8080/treasury-service'
   ./scripts/Invoke-SmokeTest.ps1 -PortalUrl $portal -TreasuryUrl $treasury
   ```

   Expected: 15 × `[PASS]` and `SMOKE_TEST_PASSED`. The test never changes data: its write checks only send requests the app must refuse. In Module 4 you run it against the two Azure addresses that Copilot deployed in Module 3.

## 1.2 Run the assessment in VS Code (15 min)

1. In VS Code – with `C:\Lab\finance-portal` open – click the **GitHub Copilot modernization** icon in the Activity Bar.
2. Expand **QuickStart**. It asks *How would you like to modernize your multi-language app?* Select **Migrate to Azure**. A new chat, **Migrate application to Azure**, opens with the **`modernize`** agent and sends the prompt *Migrate this application to Azure*. From here on, every step happens in this chat – you don't go back to the panel.
3. The agent asks how to start; the wording varies (in our test: *Which Azure migration path should I start with?*). Choose the option for the whole application marked **(Recommended)** – in our test **Run a full cloud-readiness assessment (Recommended)**.
4. The agent assesses the code. The first run installs the analysis tools (AppCAT), so allow a few minutes. It then opens the **Assessment Report** tab and summarizes the findings in chat.
5. The agent asks its next question – for example *Which Azure hosting target should I use for the migration?* (a question box with options) or *Proceed to planning?* – **don't answer yet.** That decision belongs to the customer (Module 2).

Chat settings (bottom of the chat box): agent **modernize**; model – the newest **Claude Sonnet** (Microsoft's recommendation for GitHub Copilot modernization), or **Auto**; mode **Interactive** (not *Plan*); permissions **Default permissions** (click **Allow** when asked), or **Allow all** for the long execution in Module 3.

> **Tips**
> - QuickStart shows only **Open Folder** ("To start modernization, open a folder with supported languages")? No folder is open: click **Open Folder** and choose `C:\Lab\finance-portal`. **Migrate to Azure** appears only when the open folder contains Java or .NET code.
> - The **Tasks** list below QuickStart holds individual migration tasks – the lab doesn't use it.
> - In the report, set **Target Service** to **Azure App Service** (the default is AKS). Don't use **Create Plan** – the plans come from the chat after the customer's decision.
> - In our test the VS Code assessment covered only the treasury service (Java): for a repository with both languages it analyses the Java code. The portal's issues (table below) come from a separate .NET assessment; Copilot reads the portal code itself when it plans. To also get the portal's AppCAT report, ask in the chat: *"Also assess the .NET portal in src/dotnet"* – it needs MSBuild from the Build Tools (Module 0); not yet tested from VS Code.
> - The standard assessment is **Issue only**: it fills the **Issues** tab. The **Architecture, API Contracts, Configuration, Business Workflows, Dependencies** and **Data Model** tabs stay empty – they are 6 AI deep-analysis documents that only a **Custom Assessment** (Assessment Reports tab) with **Analysis Coverage: Full analysis** generates. That takes 30+ minutes; in our test it stayed at 99% and was cancelled (**Stop Running** keeps the findings). Not needed for the lab.
> - Alternative entry points (not used in the lab): QuickStart → **Start Assessment** opens the assessment page instead of the chat; Command Palette → **GitHub Copilot modernization: Run Assessment**.

### Optional: the same assessment with the Modernize CLI

```powershell
modernize assess --source . --format markdown --no-tty
```

Or run `modernize` without arguments for the interactive menu (**Assess** → *Current folder* → keep the defaults → *Assess locally*). The CLI finds both applications and writes:

- `.github/modernize/assessment/reports-<timestamp>/index.md` – the aggregate view: apps, upgrades needed, mandatory blockers and a **migration wave plan**;
- `.github/modernize/assessment/reports-<timestamp>/repos/<app>/report.md` – the findings per application, with the affected files and lines.

## 1.3 Read the findings (10 min)

These are the findings from the validation runs. Your numbers can differ slightly with newer tool versions.

**What the VS Code report showed (5 October 2026):** the treasury service only – for **Azure App Service**: *Local JDBC Calls* (Mandatory), *Password found in configuration file* and *Microsoft SQL database found* (Potential); AKS adds *No Dockerfile found*, Container Apps also *Restricted configurations found*. Effort S. The full (custom) assessment added *Java Version Has Reached the End of Support* and 8 security (CWE) findings.

The tables below come from the Modernize CLI run (2 October 2026), which assessed both applications with more rules.

**Treasury service (Java)** – JDK 1.8, Spring Boot + Spring, Maven. Suggested targets: App Service, Container Apps, AKS.

| Finding | Criticality | Where |
|---|---|---|
| Java version has reached end of support | Mandatory (upgrade) | `pom.xml` |
| Spring Boot version has reached end of OSS support | Mandatory (upgrade) | `pom.xml` |
| Spring Framework version has reached end of OSS support | Mandatory (upgrade) | `pom.xml` |
| File system – Java NIO (11 places) | Mandatory | `BankFileWriter`, `CashPositionReportService`, `DailyCashPositionJob` |
| Local JDBC calls | Mandatory | `application.properties` |
| No Dockerfile found | Mandatory | – |
| Password found in configuration file | Potential | `application.properties` |
| Microsoft SQL database found | Potential | `application.properties` |
| Restricted configurations found | Potential | `application.properties` |
| Usage of JPA (Jakarta Persistence) APIs | Potential | `pom.xml` |
| Environment variables / system properties | Optional | `StatusController` |

**Group Finance Portal (.NET)** – .NET Framework 4.8, C#, MSBuild. 15 issues, 92 occurrences.

| Finding | Criticality | Where |
|---|---|---|
| Windows authentication detected (3) | Mandatory | `Web.config` |
| Windows local system features usage (2) | Mandatory | `SystemStatusService` |
| Hard-coded local or network paths | Mandatory | `PortalSettings` |
| Logging to local or network paths | Mandatory | `Web.config` |
| SMTP connections detected (4) | Potential | `EmailNotifier` |
| Access to external resources via HTTP (3) | Potential | `TreasuryServiceClient` |
| Local OS environment access (3) | Potential | `Global.asax.cs` |
| Hard-coded URLs | Potential | `PortalSettings` |
| Local or network I/O operations | Potential | `HomeController` |
| SQL database connection | Potential | `Web.config` |
| `System.Data.SqlClient` dependency (66) | Optional | data access code |
| Connection strings without configuration builders | Optional | `Web.config` |
| Synchronous API usage | Optional | `PortalDataService` |
| Static content | Optional | project |
| Writing to the Windows Event Log | Optional | `PortalLog` |

**Discuss in your team:** why is each *mandatory* finding a blocker on PaaS? For example: there is no Windows domain for integrated authentication, the local disk isn't durable storage, there's no mail relay and no Event Log. Which Azure service replaces each dependency?

---
Next: [Module 2 – Decide and plan](02-decide-and-plan.md)
