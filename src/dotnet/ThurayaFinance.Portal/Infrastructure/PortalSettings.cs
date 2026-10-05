using System.Configuration;
using System.Net.Configuration;

namespace ThurayaFinance.Portal.Infrastructure
{
    public static class PortalSettings
    {
        public static string TreasuryServiceUrl => Setting("TreasuryServiceUrl", "http://localhost:8080/treasury-service/");

        public static int TreasuryServiceTimeoutSeconds => int.Parse(Setting("TreasuryServiceTimeoutSeconds", "20"));

        public static string LogDirectory => Setting("LogDirectory", @"C:\ThurayaData\portal\logs");

        public static string MailDomain => Setting("MailDomain", "althuraya.example");

        public static string MailPickupDirectory
        {
            get
            {
                var smtp = ConfigurationManager.GetSection("system.net/mailSettings/smtp") as SmtpSection;
                return smtp == null ? null : smtp.SpecifiedPickupDirectory.PickupDirectoryLocation;
            }
        }

        private static string Setting(string name, string defaultValue)
        {
            var value = ConfigurationManager.AppSettings[name];
            return string.IsNullOrWhiteSpace(value) ? defaultValue : value;
        }
    }
}
