using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Globalization;
using System.Threading.Tasks;
using ThurayaFinance.Portal.Models;

namespace ThurayaFinance.Portal.Data
{
    /// <summary>Loads the finance part of the portal dataset from ThurayaFinance in a single round trip.</summary>
    public class PortalDataReader
    {
        private const string Sql = @"
SELECT setting_key, setting_value FROM dbo.app_setting;
SELECT currency, rate_to_qar FROM dbo.fx_rate ORDER BY CASE currency WHEN 'QAR' THEN 0 WHEN 'USD' THEN 1 ELSE 2 END, currency;
SELECT person_id, role_key, name, name_ar, title, title_ar, account, initials, is_manager FROM dbo.person ORDER BY sort_order;
SELECT entity_id, code, name, name_ar, segment, segment_ar, revenue_plan, opex_plan, profile, color, dso_days FROM dbo.entity ORDER BY sort_order;
SELECT cost_centre_id, entity_id, name, name_ar, annual_budget, manager_id, budget_ytd, actual_ytd, committed_amount, forecast_fy FROM dbo.cost_centre ORDER BY sort_order;
SELECT category_key, name, name_ar FROM dbo.vendor_category ORDER BY sort_order;
SELECT vendor_id, name, category_key, city, currency, payment_terms, commercial_reg, bank_code, iban_masked, status, risk, since_year, contact FROM dbo.vendor ORDER BY sort_order;
SELECT vendor_id, entity_id FROM dbo.vendor_entity ORDER BY vendor_id, sort_order;
SELECT customer_id, name, entity_id, segment, credit_limit, payment_terms FROM dbo.customer ORDER BY sort_order;
SELECT " + InvoiceSql.Columns + @" FROM dbo.invoice ORDER BY sort_order;
SELECT " + InvoiceSql.LineColumns + @" FROM dbo.invoice_line ORDER BY invoice_id, line_no;
SELECT " + InvoiceSql.StepColumns + @" FROM dbo.invoice_approval_step ORDER BY invoice_id, step_no;
SELECT receivable_id, customer_id, entity_id, issue_date, due_date, amount, paid_amount, status, reference FROM dbo.receivable ORDER BY sort_order;
SELECT m.entity_id, m.month_no, m.revenue, m.opex, m.ebitda, m.budget_revenue, m.is_mtd FROM dbo.monthly_result m JOIN dbo.entity e ON e.entity_id = m.entity_id ORDER BY e.sort_order, m.month_no;
SELECT b.entity_id, b.month_no, b.revenue FROM dbo.budget_plan b JOIN dbo.entity e ON e.entity_id = b.entity_id ORDER BY e.sort_order, b.month_no;
SELECT approval_id, request_type, ref, amount_qar, requested_by, since_date, from_cc, to_cc, vendor_id FROM dbo.approval_request WHERE status = N'open' ORDER BY sort_order;
SELECT event_at, user_id, action, object_type, ref, source_ip, outcome FROM dbo.audit_log ORDER BY event_at DESC, sort_order;
SELECT kind, ref, amount_qar, item_count, vendor_id, cost_centre_id, pct, period_no, created_at FROM dbo.notification ORDER BY sort_order;
SELECT transfer_ref, from_cc, to_cc, amount, justification, requested_by, requested_at, status FROM dbo.budget_transfer ORDER BY requested_at DESC, transfer_ref DESC;";

        public async Task<PortalData> ReadAsync()
        {
            var data = new PortalData();
            using (var connection = await Db.OpenAsync().ConfigureAwait(false))
            using (var command = Db.Command(connection, null, Sql))
            using (var r = await command.ExecuteReaderAsync().ConfigureAwait(false))
            {
                var settings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                while (await r.ReadAsync().ConfigureAwait(false)) settings[r.GetString(0)] = r.GetString(1);
                if (!settings.ContainsKey("as_of_date"))
                {
                    throw new InvalidOperationException("The ThurayaFinance database has no data - run the deployment to load the demonstration dataset.");
                }
                data.Today = settings["as_of_date"];
                data.FiscalYear = int.Parse(settings["fiscal_year"], CultureInfo.InvariantCulture);
                data.CurrentPeriod = int.Parse(settings["current_period"], CultureInfo.InvariantCulture);
                data.ElapsedPeriods = int.Parse(settings["elapsed_periods"], CultureInfo.InvariantCulture);
                data.SyncedAt = settings["synced_at"];

                await r.NextResultAsync().ConfigureAwait(false);
                data.Fx = new Dictionary<string, decimal>();
                while (await r.ReadAsync().ConfigureAwait(false)) data.Fx[r.GetString(0)] = r.GetDecimal(1);

                await r.NextResultAsync().ConfigureAwait(false);
                var persons = new Dictionary<string, PersonDto>();
                data.People = new Dictionary<string, PersonDto>();
                data.Managers = new List<PersonDto>();
                while (await r.ReadAsync().ConfigureAwait(false))
                {
                    var person = new PersonDto
                    {
                        Id = r.GetString(0),
                        Name = r.GetString(2),
                        NameAr = r.GetString(3),
                        Title = Db.Str(r, 4),
                        TitleAr = Db.Str(r, 5),
                        Account = Db.Str(r, 6),
                        Initials = r.GetString(7)
                    };
                    persons[person.Id] = person;
                    var role = Db.Str(r, 1);
                    if (role != null) data.People[role] = person;
                    if (r.GetBoolean(8)) data.Managers.Add(person);
                }

                await r.NextResultAsync().ConfigureAwait(false);
                data.Entities = new List<EntityDto>();
                while (await r.ReadAsync().ConfigureAwait(false))
                {
                    data.Entities.Add(new EntityDto
                    {
                        Id = r.GetString(0),
                        Code = r.GetString(1),
                        Name = r.GetString(2),
                        NameAr = r.GetString(3),
                        Segment = r.GetString(4),
                        SegmentAr = r.GetString(5),
                        Revenue = r.GetDecimal(6),
                        Opex = r.GetDecimal(7),
                        Profile = r.GetString(8),
                        Color = r.GetString(9),
                        Dso = r.GetInt32(10)
                    });
                }

                await r.NextResultAsync().ConfigureAwait(false);
                data.CostCentres = new List<CostCentreDto>();
                while (await r.ReadAsync().ConfigureAwait(false))
                {
                    var manager = persons[r.GetString(5)];
                    data.CostCentres.Add(new CostCentreDto
                    {
                        Id = r.GetString(0),
                        Entity = r.GetString(1),
                        Name = r.GetString(2),
                        NameAr = r.GetString(3),
                        Budget = r.GetDecimal(4),
                        Manager = new PersonDto { Id = manager.Id, Name = manager.Name, NameAr = manager.NameAr, Initials = manager.Initials },
                        BudgetYtd = r.GetDecimal(6),
                        ActualYtd = r.GetDecimal(7),
                        Committed = r.GetDecimal(8),
                        Forecast = r.GetDecimal(9)
                    });
                }

                await r.NextResultAsync().ConfigureAwait(false);
                data.Categories = new Dictionary<string, CategoryDto>();
                while (await r.ReadAsync().ConfigureAwait(false)) data.Categories[r.GetString(0)] = new CategoryDto { Name = r.GetString(1), NameAr = r.GetString(2) };

                await r.NextResultAsync().ConfigureAwait(false);
                data.Vendors = new List<VendorDto>();
                var vendors = new Dictionary<string, VendorDto>();
                while (await r.ReadAsync().ConfigureAwait(false))
                {
                    var vendor = new VendorDto
                    {
                        Id = r.GetString(0),
                        Name = r.GetString(1),
                        Category = r.GetString(2),
                        City = r.GetString(3),
                        Currency = r.GetString(4),
                        Terms = r.GetInt32(5),
                        Cr = r.GetString(6),
                        Bank = r.GetString(7),
                        Iban = r.GetString(8),
                        Status = r.GetString(9),
                        Risk = r.GetString(10),
                        Since = r.GetInt32(11),
                        Contact = r.GetString(12),
                        Serves = new List<string>()
                    };
                    vendors[vendor.Id] = vendor;
                    data.Vendors.Add(vendor);
                }

                await r.NextResultAsync().ConfigureAwait(false);
                while (await r.ReadAsync().ConfigureAwait(false)) vendors[r.GetString(0)].Serves.Add(r.GetString(1));

                await r.NextResultAsync().ConfigureAwait(false);
                data.Customers = new List<CustomerDto>();
                while (await r.ReadAsync().ConfigureAwait(false))
                {
                    data.Customers.Add(new CustomerDto
                    {
                        Id = r.GetString(0),
                        Name = r.GetString(1),
                        Entity = r.GetString(2),
                        Segment = r.GetString(3),
                        Limit = r.GetDecimal(4),
                        Terms = r.GetInt32(5)
                    });
                }

                await r.NextResultAsync().ConfigureAwait(false);
                data.Invoices = new List<InvoiceDto>();
                var invoices = new Dictionary<string, InvoiceDto>();
                while (await r.ReadAsync().ConfigureAwait(false))
                {
                    var invoice = InvoiceSql.Read(r);
                    invoices[invoice.Id] = invoice;
                    data.Invoices.Add(invoice);
                }

                await r.NextResultAsync().ConfigureAwait(false);
                while (await r.ReadAsync().ConfigureAwait(false)) invoices[r.GetString(0)].Lines.Add(InvoiceSql.ReadLine(r));

                await r.NextResultAsync().ConfigureAwait(false);
                while (await r.ReadAsync().ConfigureAwait(false)) invoices[r.GetString(0)].Chain.Add(InvoiceSql.ReadStep(r));

                await r.NextResultAsync().ConfigureAwait(false);
                data.Receivables = new List<ReceivableDto>();
                while (await r.ReadAsync().ConfigureAwait(false))
                {
                    data.Receivables.Add(new ReceivableDto
                    {
                        Id = r.GetString(0),
                        CustomerId = r.GetString(1),
                        EntityId = r.GetString(2),
                        IssueDate = Db.Date(r, 3),
                        DueDate = Db.Date(r, 4),
                        Amount = r.GetDecimal(5),
                        Paid = r.GetDecimal(6),
                        Status = r.GetString(7),
                        Reference = r.GetString(8)
                    });
                }

                await r.NextResultAsync().ConfigureAwait(false);
                data.Monthly = new Dictionary<string, IList<MonthlyDto>>();
                while (await r.ReadAsync().ConfigureAwait(false))
                {
                    IList<MonthlyDto> months;
                    if (!data.Monthly.TryGetValue(r.GetString(0), out months))
                    {
                        months = new List<MonthlyDto>();
                        data.Monthly[r.GetString(0)] = months;
                    }
                    months.Add(new MonthlyDto
                    {
                        Month = r.GetInt32(1),
                        Revenue = r.GetDecimal(2),
                        Opex = r.GetDecimal(3),
                        Ebitda = r.GetDecimal(4),
                        BudgetRevenue = r.GetDecimal(5),
                        Mtd = r.GetBoolean(6)
                    });
                }

                await r.NextResultAsync().ConfigureAwait(false);
                data.BudgetPlan = new Dictionary<string, IList<decimal>>();
                while (await r.ReadAsync().ConfigureAwait(false))
                {
                    IList<decimal> plan;
                    if (!data.BudgetPlan.TryGetValue(r.GetString(0), out plan))
                    {
                        plan = new List<decimal>();
                        data.BudgetPlan[r.GetString(0)] = plan;
                    }
                    plan.Add(r.GetDecimal(2));
                }

                await r.NextResultAsync().ConfigureAwait(false);
                data.Approvals = new List<ApprovalDto>();
                while (await r.ReadAsync().ConfigureAwait(false))
                {
                    data.Approvals.Add(new ApprovalDto
                    {
                        Id = r.GetString(0),
                        Type = r.GetString(1),
                        Ref = r.GetString(2),
                        AmountQar = Db.Dec(r, 3),
                        RequestedBy = r.GetString(4),
                        Since = Db.Date(r, 5),
                        From = Db.Str(r, 6),
                        To = Db.Str(r, 7),
                        VendorId = Db.Str(r, 8)
                    });
                }

                await r.NextResultAsync().ConfigureAwait(false);
                data.Audit = new List<AuditDto>();
                while (await r.ReadAsync().ConfigureAwait(false))
                {
                    data.Audit.Add(new AuditDto
                    {
                        At = Db.Utc(r, 0),
                        User = r.GetString(1),
                        Action = r.GetString(2),
                        ObjectType = r.GetString(3),
                        Ref = r.GetString(4),
                        Ip = r.GetString(5),
                        Outcome = r.GetString(6)
                    });
                }

                await r.NextResultAsync().ConfigureAwait(false);
                data.Notifications = new List<NotificationDto>();
                while (await r.ReadAsync().ConfigureAwait(false))
                {
                    data.Notifications.Add(new NotificationDto
                    {
                        Kind = r.GetString(0),
                        Ref = Db.Str(r, 1),
                        AmountQar = Db.Dec(r, 2),
                        Count = Db.Int(r, 3),
                        VendorId = Db.Str(r, 4),
                        CcId = Db.Str(r, 5),
                        Pct = Db.Int(r, 6),
                        Period = Db.Int(r, 7),
                        At = Db.Utc(r, 8)
                    });
                }

                await r.NextResultAsync().ConfigureAwait(false);
                data.BudgetTransfers = new List<BudgetTransferDto>();
                while (await r.ReadAsync().ConfigureAwait(false)) data.BudgetTransfers.Add(FinanceRepository.ReadTransfer(r));
            }
            return data;
        }
    }
}
