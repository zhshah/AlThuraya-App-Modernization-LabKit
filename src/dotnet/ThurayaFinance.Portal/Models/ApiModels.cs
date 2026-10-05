namespace ThurayaFinance.Portal.Models
{
    public class DecisionRequest
    {
        public string Decision { get; set; }
        public string Comment { get; set; }
    }

    public class HoldRequest
    {
        public bool Hold { get; set; }
    }

    public class BudgetTransferRequest
    {
        public string From { get; set; }
        public string To { get; set; }
        public decimal? Amount { get; set; }
        public string Justification { get; set; }
    }

    public class AuditEventRequest
    {
        public string Action { get; set; }
        public string Object { get; set; }
        public string Ref { get; set; }
    }

    /// <summary>Result of an approval decision: the records that changed, for the UI to merge.</summary>
    public class DecisionResult
    {
        public InvoiceDto Invoice { get; set; }
        public VendorStatusDto Vendor { get; set; }
        public PaymentRunDto Run { get; set; }
        public BudgetTransferDto Transfer { get; set; }
        public AuditDto Audit { get; set; }
    }

    public class VendorStatusDto
    {
        public string Id { get; set; }
        public string Status { get; set; }
    }

    public class InvoiceResult
    {
        public InvoiceDto Invoice { get; set; }
        public AuditDto Audit { get; set; }
    }

    public class TransferResult
    {
        public BudgetTransferDto Transfer { get; set; }
        public AuditDto Audit { get; set; }
    }
}
