# Modernization Plan: Group Finance Portal to .NET 10 and Azure

**Project**: Group Finance Portal (`src/dotnet/ThurayaFinance.Portal`)

---

## Technical Framework

- **Language**: C# on .NET Framework 4.8
- **Framework**: ASP.NET MVC 5.2.9 (System.Web) with Razor 3.2.9, hosted on IIS 10 (Windows Server 2022)
- **Build Tool**: MSBuild with a non-SDK-style project and NuGet `packages.config`
- **Database**: SQL Server 2022 Express, database `ThurayaFinance`, Windows integrated authentication (IIS application pool identity)
- **Key Dependencies**: ADO.NET (`System.Data.SqlClient`), Newtonsoft.Json 13.0.3, System.Net.Mail (SMTP pickup folder), System.Diagnostics trace log file and Windows Event Log, Windows registry and `WindowsIdentity`, `HttpClient` REST client for the treasury service

---

## Overview

> This migration moves the Group Finance Portal from ASP.NET MVC 5 on .NET Framework 4.8, hosted on IIS on the server CONTOSO-WEB01, to ASP.NET Core MVC on .NET 10. The application currently depends on Windows-only features (registry, Windows identity, Event Log), connects to SQL Server with Windows authentication, drops e-mails into an SMTP pickup folder and writes its log to the local disk. The new architecture will:
>
> - Run cross-platform on .NET 10 (LTS), so the portal can be hosted on Linux App Service
> - Connect to Azure SQL Database without passwords, using its managed identity
> - Send approval-decision e-mails through Azure Communication Services Email
> - Send logs, traces and metrics to Application Insights through OpenTelemetry, for central monitoring
> - Take the treasury service address from configuration, so each environment can point to its own treasury service
>
> The migration first upgrades the runtime, then replaces database access, e-mail and logging one at a time. It then verifies the portal against a baseline of its behaviour captured before any change, and runs a dependency vulnerability scan. Finally, it creates a low-cost demo environment (lowest SKUs, public access), shared with the treasury service, and deploys the portal to Linux App Service. The environment runs in France Central; Sweden Central was requested first and abandoned after its F1 quota was exhausted. The treasury service has its own plan, which runs after this one: [treasury-service-to-azure](../treasury-service-to-azure/plan.md).

---

## Migration Impact Summary

| Application | Original Service | New Azure Service | Auth | Comments |
|-------------|------------------|-------------------|------|----------|
| Portal | .NET Framework 4.8 / IIS | .NET 10 ASP.NET Core MVC | - | Linux |
| Portal | Windows-auth SQL Server | Azure SQL Database | Managed identity | - |
| Portal | SMTP pickup folder | ACS Email | Managed identity | Approvals |
| Portal | Event Log, log files | App Insights (OTel) | Managed identity | - |
| Portal | Treasury URL, Web.config | App configuration | - | No localhost |
| Portal | IIS on Windows | App Service (Linux) | - | F1, France Central |

ACS = Azure Communication Services. OTel = OpenTelemetry.

---

## Security Compliance

**Description**: Scan all project dependencies for known CVEs and remediate any identified vulnerabilities to ensure the application is secure before deployment.

**Requirements**: Upgrade vulnerable dependencies to the minimum patched version. If a CVE fix requires a major version upgrade, document the affected dependency, the current version, the upgraded major version, and the breaking change risk. Verify that the project builds and all tests pass after remediation.

**Environment Configuration**: Runtime environment established by previous tasks (.NET 10 SDK). Build tool established by previous tasks (dotnet CLI).

**App Scope**: `src/dotnet`

**Skills**:
  - Skill Name: validate-cves-and-fix
    - Skill Location: builtin

---

## Open Questions & Questionnaire

- [x] Q: Which .NET version should the portal target? → A: .NET 10 (LTS) with ASP.NET Core MVC, as requested
- [x] Q: Should the plan provision infrastructure? → A: Yes (updated). The deployment task creates a demo environment with the lowest SKUs and public access, shared with the treasury service
- [x] Q: Should the plan include integration testing? → A: Yes, Mock mode (tests run before the Azure resources exist)
- [x] Q: Should the plan include security and CVE remediation? → A: Yes (default)
- [x] Q: Which deployment target? → A: Azure App Service (Linux), lowest SKU (F1), public access, because this is a demo. Sweden Central was requested first; after a start-up crash loop exhausted that F1 plan's hourly restart quota, the user allowed any region and the demo runs in France Central
- [x] Q: Should the plan include containerization? → A: No. Not requested, and App Service runs the portal without a container
- [x] Q: Which sender domain will Azure Communication Services Email use? → A: An Azure-managed domain, because `althuraya.example` is fictitious and cannot be verified
- [x] Q: Will calls to the treasury service need authentication once it runs on its own host? → A: No, not for the demo; public access was requested
- [x] Q: The execution coordinator documents `setupBaseline` and `integrationTest` routing for Java plans only. How will tasks 000 and 005 run? → A: They are run directly with the test-baseline skills during execution
