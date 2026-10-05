using System;
using System.Net.Mail;
using ThurayaFinance.Portal.Infrastructure;

namespace ThurayaFinance.Portal.Services
{
    /// <summary>
    /// Notifies the requester of an approval decision. Uses the SMTP settings in Web.config: on the server the
    /// messages are dropped into the local pickup folder (C:\ThurayaData\portal\mail-pickup) for the mail relay.
    /// </summary>
    public class EmailNotifier
    {
        private static readonly string[] TypeNames = { "invoice", "supplier invoice", "run", "payment run", "budget", "budget transfer", "vendor", "vendor bank change", "journal", "manual journal" };

        public void SendDecision(string requesterId, string type, string reference, bool approved, string comment)
        {
            try
            {
                var address = (requesterId ?? "group.finance").Replace("u-", string.Empty) + "@" + PortalSettings.MailDomain;
                var what = Describe(type);
                using (var message = new MailMessage())
                using (var client = new SmtpClient())
                {
                    message.To.Add(address);
                    message.Subject = string.Format("{0}{1} {2} {3}", char.ToUpperInvariant(what[0]), what.Substring(1), reference, approved ? "approved" : "rejected");
                    message.Body = string.Format(
                        "Your {0} {1} was {2} by the Group Financial Controller on {3:dd MMM yyyy HH:mm} (Doha).{4}{4}{5}{4}{4}Group Finance Portal - Al Thuraya Holding",
                        what, reference, approved ? "approved" : "rejected", DateTime.UtcNow.AddHours(3), Environment.NewLine,
                        comment == null ? "No comment was added." : "Comment: " + comment);
                    client.Send(message);
                }
            }
            catch (Exception ex)
            {
                PortalLog.Error("Decision notification for " + reference + " could not be written", ex);
            }
        }

        private static string Describe(string type)
        {
            for (var i = 0; i < TypeNames.Length; i += 2)
            {
                if (TypeNames[i] == type) return TypeNames[i + 1];
            }
            return "request";
        }
    }
}
