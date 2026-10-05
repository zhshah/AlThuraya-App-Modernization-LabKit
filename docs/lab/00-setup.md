# Module 0 – Set up your workstation

⏱ About 30 minutes. **Do this before the event** – the downloads are large.

## Accounts

| You need | Why |
|---|---|
| A **GitHub account with GitHub Copilot** (Business, Enterprise, Pro or Pro+) | All modernization agents run on Copilot. They use premium models: a free plan runs out of requests quickly. |
| An **Azure subscription** where you are **Owner** of a resource group (or Contributor + User Access Administrator) | Copilot's deployment (Module 3) creates App Service, Azure SQL Database and Storage, and assigns roles to managed identities. |
| The **lab details** from your facilitator | Your team name (`team1`, `team2`, …), the VM password, and access to the code repository on GitHub. All addresses are already in the commands of [lab-guide.html](lab-guide.html). |

> If your GitHub organization restricts Copilot features (agent mode, MCP servers, preview features), ask your GitHub admin to allow them for the lab.

## Workstation: Windows 10 or 11

The legacy portal is a **.NET Framework 4.8** project. Assessing and building it needs Windows with Visual Studio's MSBuild.

| Install | Command / how | Validated reason |
|---|---|---|
| **Visual Studio Code** | `winget install Microsoft.VisualStudioCode` | |
| **GitHub Copilot modernization** extension | `code --install-extension vscjava.migrate-java-to-azure` | Assessment, plans, Azure migrations, deployment |
| **GitHub Copilot upgrade** extension | `code --install-extension ms-dotnettools.upgrade-agent` | The `@upgrade` agent for .NET Framework → .NET 10 |
| **C# Dev Kit** extension | `code --install-extension ms-dotnettools.csdevkit` | Editing and building the upgraded project |
| **.NET 10 SDK** | `winget install Microsoft.DotNet.SDK.10` | Runs the .NET assessment tool (AppCAT) and builds .NET 10 |
| **Visual Studio 2026** with *ASP.NET and web development* **or** Build Tools (below) | Visual Studio Installer | Without it the .NET assessment fails with **"Msbuild was not found"** |
| **Git**, **Azure CLI**, **Azure Developer CLI** | `winget install Git.Git`, `winget install Microsoft.AzureCLI`, `winget install Microsoft.Azd` | Branches/commits, Azure sign-in, deployment |
| **Node.js** (LTS) | `winget install OpenJS.NodeJS.LTS` | Copilot's deployment ran `database/seed/generate-dataset.js` to load the demo data into Azure SQL |

If you don't have Visual Studio, install just the Build Tools with the two components the lab needs (the same ones the "on-premises" server uses):

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.WebBuildTools;includeRecommended --add Microsoft.Net.Component.4.8.TargetingPack"
```

**Java:** you don't need to install a JDK or Maven. GitHub Copilot modernization downloads and uses JDK 21 and Maven on its own (validated).

**Optional – a local database engine for the portal's tests.** In Module 3 the agent writes post-migration tests for the portal. In validation, the workstation had no SQL Server, LocalDB or running Docker engine, so the agent ran only the 6 of 34 test cases that don't need the database. If you have Docker Desktop or SQL Server Express/LocalDB, have it running before Module 3 so the agent can try the database cases too (that path wasn't part of the validation).

**Optional – Modernize CLI** (assessment and plans from the terminal):

```powershell
winget install GitHub.Copilot.modernization.agent   # or: iex (irm 'https://raw.githubusercontent.com/microsoft/modernize-cli/main/scripts/install.ps1')
winget install GitHub.cli
gh auth login
```

Open a **new** terminal (or restart VS Code) afterwards – otherwise `modernize` isn't on the PATH yet.

## Network

The agents download tools and packages while they work. These must be reachable (directly or through your proxy):

| Endpoint | Used for |
|---|---|
| `api.nuget.org` | The .NET assessment tool (AppCAT) and NuGet packages |
| `repo.maven.apache.org` | Java dependencies |
| `aka.ms/download-jdk`, `dlcdn.apache.org` | The JDK and Maven the agent installs |
| `github.com`, `*.githubcopilot.com` | Copilot and the Modernize CLI |
| `management.azure.com`, `*.database.windows.net`, `*.azurewebsites.net` | Modules 3 and 4 |

> **Use a stable connection.** Module 3 runs for an hour or more and needs the Copilot API the whole time. In validation, a few minutes of failed DNS lookups for `api.enterprise.githubcopilot.com` on a Wi-Fi network stopped the run. A wired or reliable network avoids this; if it happens, resume the run as described in Module 3.

> **Corporate NuGet policy?** If `api.nuget.org` is blocked but your company has an approved NuGet feed, install AppCAT from that feed into the folder the tools use, then re-run the assessment:
> ```powershell
> dotnet tool install --tool-path "$env:LOCALAPPDATA\Microsoft\VisualStudio\AppModernizationExtension\Tools" dotnet-appcat
> ```

## Get the code

```powershell
mkdir C:\Lab -Force
cd C:\Lab
git clone https://github.com/zhshah/AlThuraya-App-Modernization-Lab.git finance-portal
cd finance-portal
git checkout -b modernize/team1                   # your team name
code .
```

The repository holds the application exactly as it runs on the lab VM: `src/` (portal and treasury service), `database/` and the `scripts/` you use in the lab. It is private: your facilitator gives your GitHub account access, or your team its own copy. Don't push to `main` – it stays in its "before" state for the next session.

`code .` opens `C:\Lab\finance-portal` in VS Code. Work in this window for the whole lab: GitHub Copilot modernization works on the folder that is open (with no folder open, its QuickStart shows only **Open Folder**). When VS Code asks, choose **Yes, I trust the authors** (the agents can't run in Restricted Mode). Sign in to GitHub Copilot (Accounts menu, bottom left) and to Azure: `az login`.

## Check your workstation

```powershell
./scripts/Test-LabWorkstation.ps1
```

It changes nothing; it lists what is missing and how to fix it. Continue when it ends with **`WORKSTATION_READY`**. Items marked `INFO` are optional.

---
Next: [Module 1 – Assess the application](01-assess.md)
