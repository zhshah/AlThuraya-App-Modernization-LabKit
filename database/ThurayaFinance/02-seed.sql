-- ThurayaFinance demonstration data. Parameter @data: JSON written by database/seed/generate-dataset.js
-- (the portal's original browser generator, run on the server). Replaces all business data in one transaction;
-- the deployment runs it only for an empty database or when a reset of the demo data is requested.
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DELETE FROM dbo.notification;
DELETE FROM dbo.audit_log;
DELETE FROM dbo.budget_transfer;
DELETE FROM dbo.approval_request;
DELETE FROM dbo.budget_plan;
DELETE FROM dbo.monthly_result;
DELETE FROM dbo.receivable;
DELETE FROM dbo.invoice_approval_step;
DELETE FROM dbo.invoice_line;
DELETE FROM dbo.invoice;
DELETE FROM dbo.customer;
DELETE FROM dbo.vendor_entity;
DELETE FROM dbo.vendor;
DELETE FROM dbo.vendor_category;
DELETE FROM dbo.cost_centre;
DELETE FROM dbo.entity;
DELETE FROM dbo.person;
DELETE FROM dbo.fx_rate;
DELETE FROM dbo.app_setting;
ALTER SEQUENCE dbo.budget_transfer_seq RESTART WITH 32;

DECLARE @personaId NVARCHAR(20) = JSON_VALUE(@data, '$.people.persona.id');

INSERT INTO dbo.app_setting (setting_key, setting_value)
SELECT s.k, s.v
FROM (VALUES
    (N'as_of_date',      JSON_VALUE(@data, '$.today')),
    (N'fiscal_year',     JSON_VALUE(@data, '$.fiscalYear')),
    (N'current_period',  JSON_VALUE(@data, '$.currentPeriod')),
    (N'elapsed_periods', JSON_VALUE(@data, '$.elapsedPeriods')),
    (N'synced_at',       JSON_VALUE(@data, '$.syncedAt')),
    (N'persona_id',      @personaId),
    (N'persona_ip',      ISNULL((SELECT TOP (1) a.ip FROM OPENJSON(@data, '$.audit') WITH ([user] NVARCHAR(20), ip NVARCHAR(45)) AS a WHERE a.[user] = @personaId), N'10.40.12.31')),
    (N'seeded_at',       CONVERT(NVARCHAR(30), SYSUTCDATETIME(), 126))
) AS s(k, v);

INSERT INTO dbo.fx_rate (currency, rate_to_qar)
SELECT f.[key], CAST(f.[value] AS DECIMAL(12,6))
FROM OPENJSON(@data, '$.fx') AS f;

-- Role holders (persona, CFO, CEO, ...) followed by the cost-centre managers.
INSERT INTO dbo.person (person_id, role_key, name, name_ar, title, title_ar, account, initials, is_manager, sort_order)
SELECT p.id, o.[value], p.name, p.nameAr, p.title, p.titleAr, p.account, p.initials, 0, CAST(o.[key] AS INT)
FROM OPENJSON(@data, '$._order.people') AS o
CROSS APPLY OPENJSON(@data, '$.people') AS r
CROSS APPLY OPENJSON(r.[value]) WITH (id NVARCHAR(20), name NVARCHAR(100), nameAr NVARCHAR(100), title NVARCHAR(100), titleAr NVARCHAR(100), account NVARCHAR(60), initials NVARCHAR(4)) AS p
WHERE r.[key] = o.[value];

INSERT INTO dbo.person (person_id, role_key, name, name_ar, title, title_ar, account, initials, is_manager, sort_order)
SELECT m.id, NULL, m.name, m.nameAr, NULL, NULL, NULL, m.initials, 1, 100 + CAST(a.[key] AS INT)
FROM OPENJSON(@data, '$.managers') AS a
CROSS APPLY OPENJSON(a.[value]) WITH (id NVARCHAR(20), name NVARCHAR(100), nameAr NVARCHAR(100), initials NVARCHAR(4)) AS m;

INSERT INTO dbo.entity (entity_id, code, name, name_ar, segment, segment_ar, revenue_plan, opex_plan, profile, color, dso_days, sort_order)
SELECT e.id, e.code, e.name, e.nameAr, e.segment, e.segmentAr, e.revenue, e.opex, e.[profile], e.color, e.dso, CAST(a.[key] AS INT)
FROM OPENJSON(@data, '$.entities') AS a
CROSS APPLY OPENJSON(a.[value]) WITH (
    id NVARCHAR(10), code NVARCHAR(10), name NVARCHAR(100), nameAr NVARCHAR(100), segment NVARCHAR(50), segmentAr NVARCHAR(50),
    revenue DECIMAL(18,2), opex DECIMAL(18,2), [profile] NVARCHAR(20), color CHAR(7), dso INT) AS e;

INSERT INTO dbo.cost_centre (cost_centre_id, entity_id, name, name_ar, annual_budget, manager_id, budget_ytd, actual_ytd, committed_amount, forecast_fy, sort_order)
SELECT c.id, c.entity, c.name, c.nameAr, c.budget, c.managerId, c.budgetYtd, c.actualYtd, c.[committed], c.forecast, CAST(a.[key] AS INT)
FROM OPENJSON(@data, '$.costCentres') AS a
CROSS APPLY OPENJSON(a.[value]) WITH (
    id NVARCHAR(10), entity NVARCHAR(10), name NVARCHAR(100), nameAr NVARCHAR(100), budget DECIMAL(18,2), managerId NVARCHAR(20) '$.manager.id',
    budgetYtd DECIMAL(18,2), actualYtd DECIMAL(18,2), [committed] DECIMAL(18,2), forecast DECIMAL(18,2)) AS c;

INSERT INTO dbo.vendor_category (category_key, name, name_ar, sort_order)
SELECT o.[value], JSON_VALUE(c.[value], '$.name'), JSON_VALUE(c.[value], '$.nameAr'), CAST(o.[key] AS INT)
FROM OPENJSON(@data, '$._order.categories') AS o
CROSS APPLY OPENJSON(@data, '$.categories') AS c
WHERE c.[key] = o.[value];

INSERT INTO dbo.vendor (vendor_id, name, category_key, city, currency, payment_terms, commercial_reg, bank_code, iban_masked, status, risk, since_year, contact, sort_order)
SELECT v.id, v.name, v.category, v.city, v.currency, v.terms, v.cr, v.bank, v.iban, v.status, v.risk, v.since, v.contact, CAST(a.[key] AS INT)
FROM OPENJSON(@data, '$.vendors') AS a
CROSS APPLY OPENJSON(a.[value]) WITH (
    id NVARCHAR(10), name NVARCHAR(200), category NVARCHAR(20), city NVARCHAR(50), currency CHAR(3), terms INT, cr NVARCHAR(30),
    bank NVARCHAR(10), iban NVARCHAR(40), status NVARCHAR(10), risk NVARCHAR(10), since INT, contact NVARCHAR(60)) AS v;

INSERT INTO dbo.vendor_entity (vendor_id, entity_id, sort_order)
SELECT JSON_VALUE(a.[value], '$.id'), s.[value], CAST(s.[key] AS INT)
FROM OPENJSON(@data, '$.vendors') AS a
CROSS APPLY OPENJSON(a.[value], '$.serves') AS s;

INSERT INTO dbo.customer (customer_id, name, entity_id, segment, credit_limit, payment_terms, sort_order)
SELECT c.id, c.name, c.entity, c.segment, c.[limit], c.terms, CAST(a.[key] AS INT)
FROM OPENJSON(@data, '$.customers') AS a
CROSS APPLY OPENJSON(a.[value]) WITH (id NVARCHAR(10), name NVARCHAR(200), entity NVARCHAR(10), segment NVARCHAR(60), [limit] DECIMAL(18,2), terms INT) AS c;

INSERT INTO dbo.invoice (invoice_id, vendor_ref, vendor_id, entity_id, cost_centre_id, category_key, po_number, grn, invoice_date, received_date, due_date,
                         payment_terms, currency, amount, fx_rate, amount_qar, status, prev_status, match_status, paid_date, payment_run_id,
                         hold_reason_en, hold_reason_ar, sort_order)
SELECT i.id, i.vendorRef, i.vendorId, i.entityId, i.ccId, i.category, i.poNumber, i.grn, i.invoiceDate, i.received, i.dueDate,
       i.terms, i.currency, i.amount, i.fxRate, i.amountQar, i.status, NULL, i.[match], i.paidDate, i.paymentRun,
       JSON_VALUE(a.[value], '$.holdReason[0]'), JSON_VALUE(a.[value], '$.holdReason[1]'), CAST(a.[key] AS INT)
FROM OPENJSON(@data, '$.invoices') AS a
CROSS APPLY OPENJSON(a.[value]) WITH (
    id NVARCHAR(20), vendorRef NVARCHAR(30), vendorId NVARCHAR(10), entityId NVARCHAR(10), ccId NVARCHAR(10), category NVARCHAR(20),
    poNumber NVARCHAR(20), grn NVARCHAR(20), invoiceDate DATE, received DATE, dueDate DATE, terms INT, currency CHAR(3),
    amount DECIMAL(18,2), fxRate DECIMAL(12,6), amountQar DECIMAL(18,2), status NVARCHAR(12), [match] NVARCHAR(10),
    paidDate DATE, paymentRun NVARCHAR(20)) AS i;

INSERT INTO dbo.invoice_line (invoice_id, line_no, description, qty, unit_price, amount)
SELECT JSON_VALUE(a.[value], '$.id'), CAST(l.[key] AS INT) + 1, x.[desc], x.qty, x.unit, x.amount
FROM OPENJSON(@data, '$.invoices') AS a
CROSS APPLY OPENJSON(a.[value], '$.lines') AS l
CROSS APPLY OPENJSON(l.[value]) WITH ([desc] NVARCHAR(200), qty INT, unit DECIMAL(18,2), amount DECIMAL(18,2)) AS x;

INSERT INTO dbo.invoice_approval_step (invoice_id, step_no, role_code, approver_id, status, acted_at, since_date, comment)
SELECT JSON_VALUE(a.[value], '$.id'), CAST(s.[key] AS INT) + 1, x.[role], x.approver, x.status,
       CONVERT(DATETIME2(3), CAST(x.[at] AS DATETIMEOFFSET(3))), x.since, x.comment
FROM OPENJSON(@data, '$.invoices') AS a
CROSS APPLY OPENJSON(a.[value], '$.chain') AS s
CROSS APPLY OPENJSON(s.[value]) WITH ([role] NVARCHAR(4), approver NVARCHAR(20), status NVARCHAR(10), [at] NVARCHAR(40), since DATE, comment NVARCHAR(500)) AS x;

INSERT INTO dbo.receivable (receivable_id, customer_id, entity_id, issue_date, due_date, amount, paid_amount, status, reference, sort_order)
SELECT r.id, r.customerId, r.entityId, r.issueDate, r.dueDate, r.amount, r.paid, r.status, r.reference, CAST(a.[key] AS INT)
FROM OPENJSON(@data, '$.receivables') AS a
CROSS APPLY OPENJSON(a.[value]) WITH (
    id NVARCHAR(20), customerId NVARCHAR(10), entityId NVARCHAR(10), issueDate DATE, dueDate DATE,
    amount DECIMAL(18,2), paid DECIMAL(18,2), status NVARCHAR(10), reference NVARCHAR(100)) AS r;

INSERT INTO dbo.monthly_result (entity_id, month_no, revenue, opex, ebitda, budget_revenue, is_mtd)
SELECT e.[key], x.[month], x.revenue, x.opex, x.ebitda, x.budgetRevenue, x.mtd
FROM OPENJSON(@data, '$.monthly') AS e
CROSS APPLY OPENJSON(e.[value]) WITH ([month] INT, revenue DECIMAL(18,2), opex DECIMAL(18,2), ebitda DECIMAL(18,2), budgetRevenue DECIMAL(18,2), mtd BIT) AS x;

INSERT INTO dbo.budget_plan (entity_id, month_no, revenue)
SELECT e.[key], CAST(m.[key] AS INT), CAST(m.[value] AS DECIMAL(18,2))
FROM OPENJSON(@data, '$.budgetPlan') AS e
CROSS APPLY OPENJSON(e.[value]) AS m;

INSERT INTO dbo.approval_request (approval_id, request_type, ref, amount_qar, requested_by, since_date, from_cc, to_cc, vendor_id, status, sort_order)
SELECT x.id, x.[type], x.ref, x.amountQar, x.requestedBy, x.since, x.[from], x.[to], x.vendorId, N'open', CAST(a.[key] AS INT)
FROM OPENJSON(@data, '$.approvals') AS a
CROSS APPLY OPENJSON(a.[value]) WITH (
    id NVARCHAR(30), [type] NVARCHAR(10), ref NVARCHAR(30), amountQar DECIMAL(18,2), requestedBy NVARCHAR(20), since DATE,
    [from] NVARCHAR(10), [to] NVARCHAR(10), vendorId NVARCHAR(10)) AS x;

-- The budget transfer behind the pending budget approval.
INSERT INTO dbo.budget_transfer (transfer_ref, from_cc, to_cc, amount, justification, requested_by, requested_at, status)
SELECT x.ref, x.[from], x.[to], x.amountQar, N'Reallocation of unutilised project budget to accelerate facade works.', x.requestedBy,
       DATEADD(HOUR, 6, CAST(x.since AS DATETIME2(3))), N'submitted'
FROM OPENJSON(@data, '$.approvals') WITH (
    [type] NVARCHAR(10), ref NVARCHAR(30), amountQar DECIMAL(18,2), requestedBy NVARCHAR(20), since DATE, [from] NVARCHAR(10), [to] NVARCHAR(10)) AS x
WHERE x.[type] = N'budget';

INSERT INTO dbo.audit_log (event_at, user_id, action, object_type, ref, source_ip, outcome, sort_order)
SELECT CONVERT(DATETIME2(3), CAST(x.[at] AS DATETIMEOFFSET(3))), x.[user], x.[action], x.[object], x.ref, x.ip, x.outcome, CAST(a.[key] AS INT)
FROM OPENJSON(@data, '$.audit') AS a
CROSS APPLY OPENJSON(a.[value]) WITH (
    [at] NVARCHAR(40), [user] NVARCHAR(20), [action] NVARCHAR(20), [object] NVARCHAR(20), ref NVARCHAR(60), ip NVARCHAR(45), outcome NVARCHAR(10)) AS x;

INSERT INTO dbo.notification (kind, ref, amount_qar, item_count, vendor_id, cost_centre_id, pct, period_no, created_at, sort_order)
SELECT x.kind, x.ref, x.amountQar, x.[count], x.vendorId, x.ccId, x.pct, x.[period], CONVERT(DATETIME2(3), CAST(x.[at] AS DATETIMEOFFSET(3))), CAST(a.[key] AS INT)
FROM OPENJSON(@data, '$.notifications') AS a
CROSS APPLY OPENJSON(a.[value]) WITH (
    kind NVARCHAR(10), ref NVARCHAR(30), amountQar DECIMAL(18,2), [count] INT, vendorId NVARCHAR(10), ccId NVARCHAR(10), pct INT, [period] INT, [at] NVARCHAR(40)) AS x;

COMMIT TRANSACTION;
