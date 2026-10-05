using System.Collections.Generic;
using Newtonsoft.Json;

namespace ThurayaFinance.Portal.Models
{
    // The portal's single-page UI reads one dataset (window.ATH.data). These classes give it exactly that shape;
    // the finance database supplies most of it and the treasury service (Java) supplies banks, accounts, runs and the forecast.

    public class PortalData
    {
        public string Today { get; set; }
        public int FiscalYear { get; set; }
        public int CurrentPeriod { get; set; }
        public int ElapsedPeriods { get; set; }
        public IDictionary<string, decimal> Fx { get; set; }
        public IDictionary<string, PersonDto> People { get; set; }
        public IList<PersonDto> Managers { get; set; }
        public IList<EntityDto> Entities { get; set; }
        public IList<CostCentreDto> CostCentres { get; set; }
        public IDictionary<string, CategoryDto> Categories { get; set; }
        public IList<VendorDto> Vendors { get; set; }
        public IList<BankDto> Banks { get; set; }
        public IList<AccountDto> Accounts { get; set; }
        public IDictionary<string, IList<MonthlyDto>> Monthly { get; set; }
        public IDictionary<string, IList<decimal>> BudgetPlan { get; set; }
        public IList<InvoiceDto> Invoices { get; set; }
        public IList<PaymentRunDto> PaymentRuns { get; set; }
        public IList<CustomerDto> Customers { get; set; }
        public IList<ReceivableDto> Receivables { get; set; }
        public IList<ForecastWeekDto> Forecast { get; set; }
        public decimal OpeningCash { get; set; }
        public decimal PolicyMinimum { get; set; }
        public IList<ApprovalDto> Approvals { get; set; }
        public IList<AuditDto> Audit { get; set; }
        public IList<NotificationDto> Notifications { get; set; }
        public string SyncedAt { get; set; }
        public IList<BudgetTransferDto> BudgetTransfers { get; set; }
        public PlatformInfo Platform { get; set; }
        public string TreasuryError { get; set; }
    }

    public class PersonDto
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string NameAr { get; set; }
        public string Title { get; set; }
        public string TitleAr { get; set; }
        public string Account { get; set; }
        public string Initials { get; set; }
    }

    public class EntityDto
    {
        public string Id { get; set; }
        public string Code { get; set; }
        public string Name { get; set; }
        public string NameAr { get; set; }
        public string Segment { get; set; }
        public string SegmentAr { get; set; }
        public decimal Revenue { get; set; }
        public decimal Opex { get; set; }
        public string Profile { get; set; }
        public string Color { get; set; }
        public int Dso { get; set; }
    }

    public class CostCentreDto
    {
        public string Id { get; set; }
        public string Entity { get; set; }
        public string Name { get; set; }
        public string NameAr { get; set; }
        public decimal Budget { get; set; }
        public PersonDto Manager { get; set; }
        public decimal BudgetYtd { get; set; }
        public decimal ActualYtd { get; set; }
        public decimal Committed { get; set; }
        public decimal Forecast { get; set; }
    }

    public class CategoryDto
    {
        public string Name { get; set; }
        public string NameAr { get; set; }
    }

    public class VendorDto
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Category { get; set; }
        public string City { get; set; }
        public string Currency { get; set; }
        public IList<string> Serves { get; set; }
        public int Terms { get; set; }
        public string Cr { get; set; }
        public string Bank { get; set; }
        public string Iban { get; set; }
        public string Status { get; set; }
        public string Risk { get; set; }
        public int Since { get; set; }
        public string Contact { get; set; }
    }

    public class CustomerDto
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Entity { get; set; }
        public string Segment { get; set; }
        public decimal Limit { get; set; }
        public int Terms { get; set; }
    }

    public class InvoiceDto
    {
        public string Id { get; set; }
        public string VendorRef { get; set; }
        public string VendorId { get; set; }
        public string EntityId { get; set; }
        public string CcId { get; set; }
        public string Category { get; set; }
        public string PoNumber { get; set; }
        public string Grn { get; set; }
        public string InvoiceDate { get; set; }
        public string Received { get; set; }
        public string DueDate { get; set; }
        public int Terms { get; set; }
        public string Currency { get; set; }
        public decimal Amount { get; set; }
        public decimal FxRate { get; set; }
        public decimal AmountQar { get; set; }
        public string Status { get; set; }
        public string Match { get; set; }
        public IList<InvoiceLineDto> Lines { get; set; }
        public IList<ChainStepDto> Chain { get; set; }
        public string PaidDate { get; set; }
        public string PaymentRun { get; set; }
        public string[] HoldReason { get; set; }
        public string PrevStatus { get; set; }
    }

    public class InvoiceLineDto
    {
        public string Desc { get; set; }
        public int Qty { get; set; }
        public decimal Unit { get; set; }
        public decimal Amount { get; set; }
    }

    public class ChainStepDto
    {
        public string Role { get; set; }
        public string Approver { get; set; }
        public string Status { get; set; }
        public string At { get; set; }
        public string Since { get; set; }
        public string Comment { get; set; }
    }

    public class ReceivableDto
    {
        public string Id { get; set; }
        public string CustomerId { get; set; }
        public string EntityId { get; set; }
        public string IssueDate { get; set; }
        public string DueDate { get; set; }
        public decimal Amount { get; set; }
        public decimal Paid { get; set; }
        public string Status { get; set; }
        public string Reference { get; set; }
    }

    public class MonthlyDto
    {
        public int Month { get; set; }
        public decimal Revenue { get; set; }
        public decimal Opex { get; set; }
        public decimal Ebitda { get; set; }
        public decimal BudgetRevenue { get; set; }
        public bool Mtd { get; set; }
    }

    public class ApprovalDto
    {
        public string Id { get; set; }
        public string Type { get; set; }
        public string Ref { get; set; }
        public decimal? AmountQar { get; set; }
        public string RequestedBy { get; set; }
        public string Since { get; set; }
        public string From { get; set; }
        public string To { get; set; }
        public string VendorId { get; set; }
    }

    public class AuditDto
    {
        public string At { get; set; }
        public string User { get; set; }
        public string Action { get; set; }
        [JsonProperty("object")]
        public string ObjectType { get; set; }
        public string Ref { get; set; }
        public string Ip { get; set; }
        public string Outcome { get; set; }
    }

    public class NotificationDto
    {
        public string Kind { get; set; }
        public string Ref { get; set; }
        public decimal? AmountQar { get; set; }
        public int? Count { get; set; }
        public string VendorId { get; set; }
        public string CcId { get; set; }
        public int? Pct { get; set; }
        public int? Period { get; set; }
        public string At { get; set; }
    }

    public class BudgetTransferDto
    {
        public string Ref { get; set; }
        public string From { get; set; }
        public string To { get; set; }
        public decimal Amount { get; set; }
        public string Justification { get; set; }
        public string RequestedBy { get; set; }
        public string RequestedAt { get; set; }
        public string Status { get; set; }
    }

    // Owned by the treasury service (Java); the portal passes these through unchanged.

    public class BankDto
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string NameAr { get; set; }
    }

    public class AccountDto
    {
        public string Id { get; set; }
        public string Bank { get; set; }
        public string Entity { get; set; }
        public string Name { get; set; }
        public string NameAr { get; set; }
        public string Currency { get; set; }
        public decimal Balance { get; set; }
        public decimal BalanceQar { get; set; }
        public string Iban { get; set; }
        public decimal? Rate { get; set; }
        public string Maturity { get; set; }
        public string Statement { get; set; }
        public IList<decimal> Trend { get; set; }
    }

    public class ForecastWeekDto
    {
        public int Week { get; set; }
        public string Start { get; set; }
        public decimal Inflow { get; set; }
        public decimal Outflow { get; set; }
        public decimal Closing { get; set; }
        public bool Payroll { get; set; }
    }

    public class PaymentRunDto
    {
        public string Id { get; set; }
        public string Date { get; set; }
        public string Status { get; set; }
        public int Payments { get; set; }
        public decimal AmountQar { get; set; }
        public string CreatedBy { get; set; }
        public string ApprovedBy { get; set; }
        public string CreatedAt { get; set; }
        public string Channel { get; set; }
        public string File { get; set; }
        public RunDecisionDto Decision { get; set; }
    }

    public class RunDecisionDto
    {
        public string Decision { get; set; }
        public string By { get; set; }
        public string At { get; set; }
        public string Comment { get; set; }
    }

    public class TreasuryPositionDto
    {
        public string AsOf { get; set; }
        public decimal PolicyMinimum { get; set; }
        public decimal OpeningCash { get; set; }
        public IList<BankDto> Banks { get; set; }
        public IList<AccountDto> Accounts { get; set; }
        public IList<ForecastWeekDto> Forecast { get; set; }
    }

    public class TreasuryStatusDto
    {
        public string Service { get; set; }
        public string Version { get; set; }
        public string JavaVersion { get; set; }
        public string JavaVendor { get; set; }
        public string SpringBootVersion { get; set; }
        public string Server { get; set; }
        public string Database { get; set; }
        public string DatabaseStatus { get; set; }
        public int? BankAccounts { get; set; }
        public int? PaymentRuns { get; set; }
        public int? AwaitingRelease { get; set; }
    }

    /// <summary>Where the portal runs - shown in the "About" dialog and the /health endpoint.</summary>
    public class PlatformInfo
    {
        public string Server { get; set; }
        public string WebServer { get; set; }
        public string Runtime { get; set; }
        public string AppPoolIdentity { get; set; }
        public string Database { get; set; }
        public string Treasury { get; set; }
    }
}
