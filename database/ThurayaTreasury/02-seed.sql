-- ThurayaTreasury demonstration data. Parameter @data: the same JSON dataset as ThurayaFinance/02-seed.sql.
-- Replaces all treasury data in one transaction (empty database or explicit reset only).
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DELETE FROM dbo.payment_instruction;
DELETE FROM dbo.payment_run;
DELETE FROM dbo.cash_forecast_week;
DELETE FROM dbo.account_balance_point;
DELETE FROM dbo.bank_account;
DELETE FROM dbo.bank;
DELETE FROM dbo.treasury_setting;

INSERT INTO dbo.treasury_setting (setting_key, setting_value)
SELECT s.k, s.v
FROM (VALUES
    (N'as_of_date',     JSON_VALUE(@data, '$.today')),
    (N'policy_minimum', JSON_VALUE(@data, '$.policyMinimum')),
    (N'seeded_at',      CONVERT(NVARCHAR(30), SYSUTCDATETIME(), 126))
) AS s(k, v);

INSERT INTO dbo.bank (bank_id, name, name_ar, sort_order)
SELECT b.id, b.name, b.nameAr, CAST(a.[key] AS INT)
FROM OPENJSON(@data, '$.banks') AS a
CROSS APPLY OPENJSON(a.[value]) WITH (id NVARCHAR(10), name NVARCHAR(100), nameAr NVARCHAR(100)) AS b;

INSERT INTO dbo.bank_account (account_id, bank_id, entity_id, name, name_ar, currency, balance, balance_qar, iban_masked, profit_rate, maturity_date, statement_date, sort_order)
SELECT x.id, x.bank, x.entity, x.name, x.nameAr, x.currency, x.balance, x.balanceQar, x.iban, x.rate, x.maturity, x.statement, CAST(a.[key] AS INT)
FROM OPENJSON(@data, '$.accounts') AS a
CROSS APPLY OPENJSON(a.[value]) WITH (
    id NVARCHAR(10), bank NVARCHAR(10), entity NVARCHAR(10), name NVARCHAR(100), nameAr NVARCHAR(100), currency CHAR(3),
    balance DECIMAL(18,2), balanceQar DECIMAL(18,2), iban NVARCHAR(40), rate DECIMAL(6,3), maturity DATE, statement DATE) AS x;

INSERT INTO dbo.account_balance_point (account_id, point_no, balance)
SELECT JSON_VALUE(a.[value], '$.id'), CAST(t.[key] AS INT), CAST(t.[value] AS DECIMAL(18,2))
FROM OPENJSON(@data, '$.accounts') AS a
CROSS APPLY OPENJSON(a.[value], '$.trend') AS t;

INSERT INTO dbo.payment_run (run_id, value_date, status, payments_count, amount_qar, created_by, approved_by, created_at, channel, bank_file, sort_order)
SELECT r.id, r.[date], r.status, r.payments, r.amountQar, r.createdBy, r.approvedBy,
       CONVERT(DATETIME2(3), CAST(r.createdAt AS DATETIMEOFFSET(3))), r.channel, r.[file], CAST(a.[key] AS INT)
FROM OPENJSON(@data, '$.paymentRuns') AS a
CROSS APPLY OPENJSON(a.[value]) WITH (
    id NVARCHAR(20), [date] DATE, status NVARCHAR(10), payments INT, amountQar DECIMAL(18,2), createdBy NVARCHAR(20),
    approvedBy NVARCHAR(20), createdAt NVARCHAR(40), channel NVARCHAR(60), [file] NVARCHAR(80)) AS r;

-- One payment instruction per invoice assigned to a run (payee details from the vendor master).
INSERT INTO dbo.payment_instruction (run_id, invoice_id, vendor_id, beneficiary, beneficiary_bank, iban_masked, amount_qar, due_date)
SELECT i.paymentRun, i.id, i.vendorId, v.name, v.bank, v.iban, i.amountQar, i.dueDate
FROM OPENJSON(@data, '$.invoices') WITH (
    id NVARCHAR(20), vendorId NVARCHAR(10), amountQar DECIMAL(18,2), dueDate DATE, paymentRun NVARCHAR(20)) AS i
JOIN OPENJSON(@data, '$.vendors') WITH (id NVARCHAR(10), name NVARCHAR(200), bank NVARCHAR(10), iban NVARCHAR(40)) AS v ON v.id = i.vendorId
WHERE i.paymentRun IS NOT NULL;

INSERT INTO dbo.cash_forecast_week (week_no, start_date, inflow, outflow, closing_balance, payroll)
SELECT f.week, f.[start], f.inflow, f.outflow, f.closing, f.payroll
FROM OPENJSON(@data, '$.forecast') WITH (week INT, [start] DATE, inflow DECIMAL(18,2), outflow DECIMAL(18,2), closing DECIMAL(18,2), payroll BIT) AS f;

COMMIT TRANSACTION;
