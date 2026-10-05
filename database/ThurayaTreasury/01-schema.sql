-- ThurayaTreasury schema (Group Treasury service, Java 8 / Spring Boot 2.7). Idempotent.
SET NOCOUNT ON;
GO
IF OBJECT_ID(N'dbo.treasury_setting', N'U') IS NULL
CREATE TABLE dbo.treasury_setting (
    setting_key    NVARCHAR(50)  NOT NULL CONSTRAINT pk_treasury_setting PRIMARY KEY,
    setting_value  NVARCHAR(200) NOT NULL
);
GO
IF OBJECT_ID(N'dbo.bank', N'U') IS NULL
CREATE TABLE dbo.bank (
    bank_id     NVARCHAR(10)  NOT NULL CONSTRAINT pk_bank PRIMARY KEY,
    name        NVARCHAR(100) NOT NULL,
    name_ar     NVARCHAR(100) NOT NULL,
    sort_order  INT           NOT NULL
);
GO
IF OBJECT_ID(N'dbo.bank_account', N'U') IS NULL
CREATE TABLE dbo.bank_account (
    account_id      NVARCHAR(10)  NOT NULL CONSTRAINT pk_bank_account PRIMARY KEY,
    bank_id         NVARCHAR(10)  NOT NULL CONSTRAINT fk_bank_account_bank REFERENCES dbo.bank (bank_id),
    entity_id       NVARCHAR(10)  NOT NULL,
    name            NVARCHAR(100) NOT NULL,
    name_ar         NVARCHAR(100) NOT NULL,
    currency        CHAR(3)       NOT NULL,
    balance         DECIMAL(18,2) NOT NULL,
    balance_qar     DECIMAL(18,2) NOT NULL,
    iban_masked     NVARCHAR(40)  NOT NULL,
    profit_rate     DECIMAL(6,3)  NULL,
    maturity_date   DATE          NULL,
    statement_date  DATE          NOT NULL,
    sort_order      INT           NOT NULL
);
GO
IF OBJECT_ID(N'dbo.account_balance_point', N'U') IS NULL
CREATE TABLE dbo.account_balance_point (
    account_id  NVARCHAR(10)  NOT NULL CONSTRAINT fk_balance_point_account REFERENCES dbo.bank_account (account_id),
    point_no    INT           NOT NULL,
    balance     DECIMAL(18,2) NOT NULL,
    CONSTRAINT pk_account_balance_point PRIMARY KEY (account_id, point_no)
);
GO
IF OBJECT_ID(N'dbo.payment_run', N'U') IS NULL
CREATE TABLE dbo.payment_run (
    run_id                  NVARCHAR(20)  NOT NULL CONSTRAINT pk_payment_run PRIMARY KEY,
    value_date              DATE          NOT NULL,
    status                  NVARCHAR(10)  NOT NULL CONSTRAINT ck_payment_run_status CHECK (status IN (N'executed', N'awaiting', N'draft')),
    payments_count          INT           NOT NULL,
    amount_qar              DECIMAL(18,2) NOT NULL,
    created_by              NVARCHAR(20)  NOT NULL,
    approved_by             NVARCHAR(20)  NULL,
    created_at              DATETIME2(3)  NOT NULL,
    channel                 NVARCHAR(60)  NOT NULL,
    bank_file               NVARCHAR(80)  NOT NULL,
    first_decision          NVARCHAR(10)  NULL CONSTRAINT ck_payment_run_decision CHECK (first_decision IN (N'approve', N'reject')),
    first_decision_by       NVARCHAR(20)  NULL,
    first_decision_at       DATETIME2(3)  NULL,
    first_decision_comment  NVARCHAR(500) NULL,
    sort_order              INT           NOT NULL,
    version                 BIGINT        NOT NULL CONSTRAINT df_payment_run_version DEFAULT (0)
);
GO
IF OBJECT_ID(N'dbo.payment_instruction', N'U') IS NULL
CREATE TABLE dbo.payment_instruction (
    instruction_id  BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_payment_instruction PRIMARY KEY,
    run_id          NVARCHAR(20)  NOT NULL CONSTRAINT fk_payment_instruction_run REFERENCES dbo.payment_run (run_id),
    invoice_id      NVARCHAR(20)  NOT NULL,
    vendor_id       NVARCHAR(10)  NOT NULL,
    beneficiary     NVARCHAR(200) NOT NULL,
    beneficiary_bank NVARCHAR(10) NOT NULL,
    iban_masked     NVARCHAR(40)  NOT NULL,
    amount_qar      DECIMAL(18,2) NOT NULL,
    due_date        DATE          NOT NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_payment_instruction_run' AND object_id = OBJECT_ID(N'dbo.payment_instruction'))
    CREATE INDEX ix_payment_instruction_run ON dbo.payment_instruction (run_id);
GO
IF OBJECT_ID(N'dbo.cash_forecast_week', N'U') IS NULL
CREATE TABLE dbo.cash_forecast_week (
    week_no          INT           NOT NULL CONSTRAINT pk_cash_forecast_week PRIMARY KEY,
    start_date       DATE          NOT NULL,
    inflow           DECIMAL(18,2) NOT NULL,
    outflow          DECIMAL(18,2) NOT NULL,
    closing_balance  DECIMAL(18,2) NOT NULL,
    payroll          BIT           NOT NULL
);
GO
