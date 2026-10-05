# Modernization Plan: Group Treasury Service to Java 21, Spring Boot 3 and Azure

**Project**: Group Treasury service (`src/java/treasury-service`)

---

## Technical Framework

- **Language**: Java 8
- **Framework**: Spring Boot 2.7.18 (Spring Framework 5.3, `javax.*` APIs), packaged as a WAR for Apache Tomcat 9
- **Build Tool**: Maven 3.9 (no Maven Wrapper)
- **Database**: SQL Server 2022 Express, database `ThurayaTreasury`, SQL login `thuraya_treasury` with a password
- **Key Dependencies**: Spring Web, Spring Data JPA (Hibernate 5.6), Bean Validation, Spring Boot Actuator, Microsoft JDBC Driver for SQL Server 10.2.3 (`jre8`), Spring scheduling; JUnit 5 and Mockito unit tests

---

## Overview

> This migration moves the Group Treasury service from Java 8 and Spring Boot 2.7 to Java 21 and Spring Boot 3.x and prepares it for Azure. The service currently connects to SQL Server with a SQL login whose password is kept in configuration, and writes the ISO 20022 bank files and the daily cash-position reports to folders on the server's local disk. The new architecture will:
>
> - Run on a supported Java LTS release and Spring Boot generation
> - Connect to Azure SQL Database without passwords, using its managed identity
> - Store the bank files and cash-position reports in Azure Blob Storage, accessed with its managed identity, so they survive restarts and are shared by all instances
>
> The migration first upgrades Java and Spring Boot, then moves the database connection and file storage one at a time. It then verifies the service against a baseline of its behaviour captured before any change, and runs a dependency vulnerability scan. Finally, it deploys the service to Linux App Service (Tomcat 10.1, Java 21) in the demo environment created by the portal plan (France Central), and runs the end-to-end smoke test against both applications. Issue titles quoted in the tasks come from assessment report Report_20261005122654. The portal has its own plan, which runs first: [group-finance-portal-to-azure](../group-finance-portal-to-azure/plan.md).

---

## Migration Impact Summary

| Application | Original Service | New Azure Service | Auth | Comments |
|-------------|------------------|-------------------|------|----------|
| Treasury | Java 8, Spring Boot 2.7 | Java 21, Spring Boot 3.x | - | - |
| Treasury | SQL Server, SQL login | Azure SQL Database | Managed identity | - |
| Treasury | Bank-file folder | Azure Blob Storage | Managed identity | XML |
| Treasury | Report folder | Azure Blob Storage | Managed identity | CSV |
| Treasury | Tomcat 9 on Windows | App Service (Linux) | - | Tomcat 10.1 |

Not addressed: the assessment issues "No Dockerfile found" and
"Restricted configurations found" apply only to AKS and Container Apps.

---

## Security Compliance

**Description**: Scan all project dependencies for known CVEs and remediate any identified vulnerabilities to ensure the application is secure before deployment.

**Requirements**: Upgrade vulnerable dependencies to the minimum patched version. If a CVE fix requires a major version upgrade, document the affected dependency, the current version, the upgraded major version, and the breaking change risk. Verify that the project builds and all tests pass after remediation.

**Environment Configuration**: Runtime environment established by previous tasks (JDK 21). Build tool established by previous tasks (Maven).

**App Scope**: `src/java/treasury-service`

**Skills**:
  - Skill Name: validate-cves-and-fix
    - Skill Location: builtin

---

## Open Questions & Questionnaire

- [x] Q: Spring Boot 3.x on Java 21 (as requested) or Spring Boot 4.x on Java 25 (latest)? → A: Spring Boot 3.x on Java 21, as requested
- [x] Q: Should the plan provision infrastructure? → A: Yes (updated). It reuses the demo environment created by the portal plan's deployment task (lowest SKUs, public access, France Central)
- [x] Q: Should the plan include integration testing? → A: Yes, Mock mode (tests run before the service is deployed)
- [x] Q: Should the plan include security and CVE remediation? → A: Yes (default)
- [x] Q: Which deployment target? → A: Azure App Service (Linux), lowest SKU (F1), public access, because this is a demo. It runs in France Central; Sweden Central was abandoned after its F1 quota was exhausted, and the user allowed any region
- [x] Q: Should the plan include containerization? → A: No. Not requested
- [x] Q: Hosting and packaging (Spring Boot 3 needs Tomcat 10.1 or later)? → A: Keep the WAR and run it on App Service with Tomcat 10.1 and Java 21
- [ ] The host-to-host banking connector picks up pain.001 files from `C:\ThurayaData\treasury\bank-files` today. It must read them from the Blob container after cut-over.
- [ ] The service still writes its own log to a local file (`logging.file.name`). Moving it to the console or Application Insights was not requested.
- [x] Q: How will the treasury API be protected once the portal reaches it over the network? → A: It stays public for the demo, as requested; protect it before production use
