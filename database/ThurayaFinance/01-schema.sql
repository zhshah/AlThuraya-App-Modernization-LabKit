-- ThurayaFinance schema (Group Finance Portal). Idempotent.
SET NOCOUNT ON;
GO
IF OBJECT_ID(N'dbo.app_setting', N'U') IS NULL
CREATE TABLE dbo.app_setting (
    setting_key    NVARCHAR(50)  NOT NULL CONSTRAINT pk_app_setting PRIMARY KEY,
    setting_value  NVARCHAR(200) NOT NULL
);
GO
IF OBJECT_ID(N'dbo.fx_rate', N'U') IS NULL
CREATE TABLE dbo.fx_rate (
    currency     CHAR(3)       NOT NULL CONSTRAINT pk_fx_rate PRIMARY KEY,
    rate_to_qar  DECIMAL(12,6) NOT NULL
);
GO
IF OBJECT_ID(N'dbo.person', N'U') IS NULL
CREATE TABLE dbo.person (
    person_id   NVARCHAR(20)  NOT NULL CONSTRAINT pk_person PRIMARY KEY,
    role_key    NVARCHAR(20)  NULL,
    name        NVARCHAR(100) NOT NULL,
    name_ar     NVARCHAR(100) NOT NULL,
    title       NVARCHAR(100) NULL,
    title_ar    NVARCHAR(100) NULL,
    account     NVARCHAR(60)  NULL,
    initials    NVARCHAR(4)   NOT NULL,
    is_manager  BIT           NOT NULL CONSTRAINT df_person_is_manager DEFAULT (0),
    sort_order  INT           NOT NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ux_person_role' AND object_id = OBJECT_ID(N'dbo.person'))
    CREATE UNIQUE INDEX ux_person_role ON dbo.person (role_key) WHERE role_key IS NOT NULL;
GO
IF OBJECT_ID(N'dbo.entity', N'U') IS NULL
CREATE TABLE dbo.entity (
    entity_id     NVARCHAR(10)  NOT NULL CONSTRAINT pk_entity PRIMARY KEY,
    code          NVARCHAR(10)  NOT NULL,
    name          NVARCHAR(100) NOT NULL,
    name_ar       NVARCHAR(100) NOT NULL,
    segment       NVARCHAR(50)  NOT NULL,
    segment_ar    NVARCHAR(50)  NOT NULL,
    revenue_plan  DECIMAL(18,2) NOT NULL,
    opex_plan     DECIMAL(18,2) NOT NULL,
    profile       NVARCHAR(20)  NOT NULL,
    color         CHAR(7)       NOT NULL,
    dso_days      INT           NOT NULL,
    sort_order    INT           NOT NULL
);
GO
IF OBJECT_ID(N'dbo.cost_centre', N'U') IS NULL
CREATE TABLE dbo.cost_centre (
    cost_centre_id    NVARCHAR(10)  NOT NULL CONSTRAINT pk_cost_centre PRIMARY KEY,
    entity_id         NVARCHAR(10)  NOT NULL CONSTRAINT fk_cost_centre_entity REFERENCES dbo.entity (entity_id),
    name              NVARCHAR(100) NOT NULL,
    name_ar           NVARCHAR(100) NOT NULL,
    annual_budget     DECIMAL(18,2) NOT NULL,
    manager_id        NVARCHAR(20)  NOT NULL CONSTRAINT fk_cost_centre_manager REFERENCES dbo.person (person_id),
    budget_ytd        DECIMAL(18,2) NOT NULL,
    actual_ytd        DECIMAL(18,2) NOT NULL,
    committed_amount  DECIMAL(18,2) NOT NULL,
    forecast_fy       DECIMAL(18,2) NOT NULL,
    sort_order        INT           NOT NULL
);
GO
IF OBJECT_ID(N'dbo.vendor_category', N'U') IS NULL
CREATE TABLE dbo.vendor_category (
    category_key  NVARCHAR(20)  NOT NULL CONSTRAINT pk_vendor_category PRIMARY KEY,
    name          NVARCHAR(100) NOT NULL,
    name_ar       NVARCHAR(100) NOT NULL,
    sort_order    INT           NOT NULL
);
GO
IF OBJECT_ID(N'dbo.vendor', N'U') IS NULL
CREATE TABLE dbo.vendor (
    vendor_id       NVARCHAR(10)  NOT NULL CONSTRAINT pk_vendor PRIMARY KEY,
    name            NVARCHAR(200) NOT NULL,
    category_key    NVARCHAR(20)  NOT NULL CONSTRAINT fk_vendor_category REFERENCES dbo.vendor_category (category_key),
    city            NVARCHAR(50)  NOT NULL,
    currency        CHAR(3)       NOT NULL,
    payment_terms   INT           NOT NULL,
    commercial_reg  NVARCHAR(30)  NOT NULL,
    bank_code       NVARCHAR(10)  NOT NULL,
    iban_masked     NVARCHAR(40)  NOT NULL,
    status          NVARCHAR(10)  NOT NULL CONSTRAINT ck_vendor_status CHECK (status IN (N'active', N'review', N'blocked')),
    risk            NVARCHAR(10)  NOT NULL CONSTRAINT ck_vendor_risk CHECK (risk IN (N'low', N'medium', N'high')),
    since_year      INT           NOT NULL,
    contact         NVARCHAR(60)  NOT NULL,
    sort_order      INT           NOT NULL
);
GO
IF OBJECT_ID(N'dbo.vendor_entity', N'U') IS NULL
CREATE TABLE dbo.vendor_entity (
    vendor_id   NVARCHAR(10) NOT NULL CONSTRAINT fk_vendor_entity_vendor REFERENCES dbo.vendor (vendor_id),
    entity_id   NVARCHAR(10) NOT NULL CONSTRAINT fk_vendor_entity_entity REFERENCES dbo.entity (entity_id),
    sort_order  INT          NOT NULL,
    CONSTRAINT pk_vendor_entity PRIMARY KEY (vendor_id, entity_id)
);
GO
IF OBJECT_ID(N'dbo.customer', N'U') IS NULL
CREATE TABLE dbo.customer (
    customer_id    NVARCHAR(10)  NOT NULL CONSTRAINT pk_customer PRIMARY KEY,
    name           NVARCHAR(200) NOT NULL,
    entity_id      NVARCHAR(10)  NOT NULL CONSTRAINT fk_customer_entity REFERENCES dbo.entity (entity_id),
    segment        NVARCHAR(60)  NOT NULL,
    credit_limit   DECIMAL(18,2) NOT NULL,
    payment_terms  INT           NOT NULL,
    sort_order     INT           NOT NULL
);
GO
IF OBJECT_ID(N'dbo.invoice', N'U') IS NULL
CREATE TABLE dbo.invoice (
    invoice_id      NVARCHAR(20)  NOT NULL CONSTRAINT pk_invoice PRIMARY KEY,
    vendor_ref      NVARCHAR(30)  NOT NULL,
    vendor_id       NVARCHAR(10)  NOT NULL CONSTRAINT fk_invoice_vendor REFERENCES dbo.vendor (vendor_id),
    entity_id       NVARCHAR(10)  NOT NULL CONSTRAINT fk_invoice_entity REFERENCES dbo.entity (entity_id),
    cost_centre_id  NVARCHAR(10)  NOT NULL CONSTRAINT fk_invoice_cost_centre REFERENCES dbo.cost_centre (cost_centre_id),
    category_key    NVARCHAR(20)  NOT NULL CONSTRAINT fk_invoice_category REFERENCES dbo.vendor_category (category_key),
    po_number       NVARCHAR(20)  NULL,
    grn             NVARCHAR(20)  NULL,
    invoice_date    DATE          NOT NULL,
    received_date   DATE          NOT NULL,
    due_date        DATE          NOT NULL,
    payment_terms   INT           NOT NULL,
    currency        CHAR(3)       NOT NULL,
    amount          DECIMAL(18,2) NOT NULL,
    fx_rate         DECIMAL(12,6) NOT NULL,
    amount_qar      DECIMAL(18,2) NOT NULL,
    status          NVARCHAR(12)  NOT NULL CONSTRAINT ck_invoice_status CHECK (status IN (N'pending', N'approved', N'scheduled', N'paid', N'hold', N'disputed')),
    prev_status     NVARCHAR(12)  NULL,
    match_status    NVARCHAR(10)  NOT NULL CONSTRAINT ck_invoice_match CHECK (match_status IN (N'matched', N'price', N'qty', N'nopo')),
    paid_date       DATE          NULL,
    payment_run_id  NVARCHAR(20)  NULL,
    hold_reason_en  NVARCHAR(600) NULL,
    hold_reason_ar  NVARCHAR(600) NULL,
    sort_order      INT           NOT NULL,
    row_version     ROWVERSION
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_invoice_status' AND object_id = OBJECT_ID(N'dbo.invoice'))
    CREATE INDEX ix_invoice_status ON dbo.invoice (status) INCLUDE (amount_qar, due_date, entity_id);
GO
IF OBJECT_ID(N'dbo.invoice_line', N'U') IS NULL
CREATE TABLE dbo.invoice_line (
    invoice_id   NVARCHAR(20)  NOT NULL CONSTRAINT fk_invoice_line_invoice REFERENCES dbo.invoice (invoice_id),
    line_no      INT           NOT NULL,
    description  NVARCHAR(200) NOT NULL,
    qty          INT           NOT NULL CONSTRAINT ck_invoice_line_qty CHECK (qty > 0),
    unit_price   DECIMAL(18,2) NOT NULL,
    amount       DECIMAL(18,2) NOT NULL,
    CONSTRAINT pk_invoice_line PRIMARY KEY (invoice_id, line_no)
);
GO
IF OBJECT_ID(N'dbo.invoice_approval_step', N'U') IS NULL
CREATE TABLE dbo.invoice_approval_step (
    invoice_id   NVARCHAR(20)  NOT NULL CONSTRAINT fk_approval_step_invoice REFERENCES dbo.invoice (invoice_id),
    step_no      INT           NOT NULL,
    role_code    NVARCHAR(4)   NOT NULL CONSTRAINT ck_approval_step_role CHECK (role_code IN (N'ccm', N'fc', N'cfo', N'ceo')),
    approver_id  NVARCHAR(20)  NOT NULL CONSTRAINT fk_approval_step_approver REFERENCES dbo.person (person_id),
    status       NVARCHAR(10)  NOT NULL CONSTRAINT ck_approval_step_status CHECK (status IN (N'done', N'current', N'waiting', N'rejected')),
    acted_at     DATETIME2(3)  NULL,
    since_date   DATE          NULL,
    comment      NVARCHAR(500) NULL,
    CONSTRAINT pk_invoice_approval_step PRIMARY KEY (invoice_id, step_no)
);
GO
IF OBJECT_ID(N'dbo.receivable', N'U') IS NULL
CREATE TABLE dbo.receivable (
    receivable_id  NVARCHAR(20)  NOT NULL CONSTRAINT pk_receivable PRIMARY KEY,
    customer_id    NVARCHAR(10)  NOT NULL CONSTRAINT fk_receivable_customer REFERENCES dbo.customer (customer_id),
    entity_id      NVARCHAR(10)  NOT NULL CONSTRAINT fk_receivable_entity REFERENCES dbo.entity (entity_id),
    issue_date     DATE          NOT NULL,
    due_date       DATE          NOT NULL,
    amount         DECIMAL(18,2) NOT NULL,
    paid_amount    DECIMAL(18,2) NOT NULL,
    status         NVARCHAR(10)  NOT NULL CONSTRAINT ck_receivable_status CHECK (status IN (N'open', N'partial', N'paid', N'dispute')),
    reference      NVARCHAR(100) NOT NULL,
    sort_order     INT           NOT NULL
);
GO
IF OBJECT_ID(N'dbo.monthly_result', N'U') IS NULL
CREATE TABLE dbo.monthly_result (
    entity_id       NVARCHAR(10)  NOT NULL CONSTRAINT fk_monthly_result_entity REFERENCES dbo.entity (entity_id),
    month_no        INT           NOT NULL CONSTRAINT ck_monthly_result_month CHECK (month_no BETWEEN 0 AND 11),
    revenue         DECIMAL(18,2) NOT NULL,
    opex            DECIMAL(18,2) NOT NULL,
    ebitda          DECIMAL(18,2) NOT NULL,
    budget_revenue  DECIMAL(18,2) NOT NULL,
    is_mtd          BIT           NOT NULL,
    CONSTRAINT pk_monthly_result PRIMARY KEY (entity_id, month_no)
);
GO
IF OBJECT_ID(N'dbo.budget_plan', N'U') IS NULL
CREATE TABLE dbo.budget_plan (
    entity_id  NVARCHAR(10)  NOT NULL CONSTRAINT fk_budget_plan_entity REFERENCES dbo.entity (entity_id),
    month_no   INT           NOT NULL CONSTRAINT ck_budget_plan_month CHECK (month_no BETWEEN 0 AND 11),
    revenue    DECIMAL(18,2) NOT NULL,
    CONSTRAINT pk_budget_plan PRIMARY KEY (entity_id, month_no)
);
GO
IF OBJECT_ID(N'dbo.approval_request', N'U') IS NULL
CREATE TABLE dbo.approval_request (
    approval_id       NVARCHAR(30)  NOT NULL CONSTRAINT pk_approval_request PRIMARY KEY,
    request_type      NVARCHAR(10)  NOT NULL CONSTRAINT ck_approval_request_type CHECK (request_type IN (N'invoice', N'run', N'budget', N'vendor', N'journal')),
    ref               NVARCHAR(30)  NOT NULL,
    amount_qar        DECIMAL(18,2) NULL,
    requested_by      NVARCHAR(20)  NOT NULL CONSTRAINT fk_approval_request_requester REFERENCES dbo.person (person_id),
    since_date        DATE          NOT NULL,
    from_cc           NVARCHAR(10)  NULL,
    to_cc             NVARCHAR(10)  NULL,
    vendor_id         NVARCHAR(10)  NULL,
    status            NVARCHAR(10)  NOT NULL CONSTRAINT df_approval_request_status DEFAULT (N'open')
                                    CONSTRAINT ck_approval_request_status CHECK (status IN (N'open', N'approved', N'rejected')),
    decided_at        DATETIME2(3)  NULL,
    decided_by        NVARCHAR(20)  NULL,
    decision_comment  NVARCHAR(500) NULL,
    sort_order        INT           NOT NULL
);
GO
IF OBJECT_ID(N'dbo.budget_transfer', N'U') IS NULL
CREATE TABLE dbo.budget_transfer (
    transfer_ref   NVARCHAR(20)  NOT NULL CONSTRAINT pk_budget_transfer PRIMARY KEY,
    from_cc        NVARCHAR(10)  NOT NULL CONSTRAINT fk_budget_transfer_from REFERENCES dbo.cost_centre (cost_centre_id),
    to_cc          NVARCHAR(10)  NOT NULL CONSTRAINT fk_budget_transfer_to REFERENCES dbo.cost_centre (cost_centre_id),
    amount         DECIMAL(18,2) NOT NULL CONSTRAINT ck_budget_transfer_amount CHECK (amount > 0),
    justification  NVARCHAR(400) NOT NULL,
    requested_by   NVARCHAR(20)  NOT NULL CONSTRAINT fk_budget_transfer_requester REFERENCES dbo.person (person_id),
    requested_at   DATETIME2(3)  NOT NULL,
    status         NVARCHAR(10)  NOT NULL CONSTRAINT ck_budget_transfer_status CHECK (status IN (N'submitted', N'approved', N'rejected')),
    decided_at     DATETIME2(3)  NULL,
    CONSTRAINT ck_budget_transfer_centres CHECK (from_cc <> to_cc)
);
GO
IF OBJECT_ID(N'dbo.budget_transfer_seq', N'SO') IS NULL
    CREATE SEQUENCE dbo.budget_transfer_seq AS INT START WITH 32 INCREMENT BY 1;
GO
IF OBJECT_ID(N'dbo.audit_log', N'U') IS NULL
CREATE TABLE dbo.audit_log (
    audit_id     BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_audit_log PRIMARY KEY,
    event_at     DATETIME2(3)  NOT NULL,
    user_id      NVARCHAR(20)  NOT NULL CONSTRAINT fk_audit_log_user REFERENCES dbo.person (person_id),
    action       NVARCHAR(20)  NOT NULL,
    object_type  NVARCHAR(20)  NOT NULL,
    ref          NVARCHAR(60)  NOT NULL,
    source_ip    NVARCHAR(45)  NOT NULL,
    outcome      NVARCHAR(10)  NOT NULL CONSTRAINT ck_audit_log_outcome CHECK (outcome IN (N'success', N'denied')),
    sort_order   INT           NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_audit_log_event_at' AND object_id = OBJECT_ID(N'dbo.audit_log'))
    CREATE INDEX ix_audit_log_event_at ON dbo.audit_log (event_at DESC);
GO
IF OBJECT_ID(N'dbo.notification', N'U') IS NULL
CREATE TABLE dbo.notification (
    notification_id  INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_notification PRIMARY KEY,
    kind             NVARCHAR(10)  NOT NULL CONSTRAINT ck_notification_kind CHECK (kind IN (N'run', N'sla', N'vendor', N'budget', N'close')),
    ref              NVARCHAR(30)  NULL,
    amount_qar       DECIMAL(18,2) NULL,
    item_count       INT           NULL,
    vendor_id        NVARCHAR(10)  NULL,
    cost_centre_id   NVARCHAR(10)  NULL,
    pct              INT           NULL,
    period_no        INT           NULL,
    created_at       DATETIME2(3)  NOT NULL,
    sort_order       INT           NOT NULL
);
GO
