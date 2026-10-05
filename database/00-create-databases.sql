-- Al Thuraya Holding - Group Finance Portal: databases on the on-premises SQL Server Express instance.
--   ThurayaFinance  : owned by the Group Finance Portal (ASP.NET MVC 5, .NET Framework 4.8, IIS)
--   ThurayaTreasury : owned by the treasury service (Java 8 / Spring Boot 2.7, Tomcat 9)
IF DB_ID(N'ThurayaFinance') IS NULL
    CREATE DATABASE ThurayaFinance;
GO
IF DB_ID(N'ThurayaTreasury') IS NULL
    CREATE DATABASE ThurayaTreasury;
GO
