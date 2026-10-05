package com.thuraya.treasury.web;

import java.net.InetAddress;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.servlet.ServletContext;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringBootVersion;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.thuraya.treasury.domain.RunStatus;
import com.thuraya.treasury.repository.BankAccountRepository;
import com.thuraya.treasury.repository.PaymentRunRepository;

/** Runtime facts for operators and for the portal's "About" dialog. */
@RestController
public class StatusController {

    private static final Instant STARTED_AT = Instant.now();

    private final JdbcTemplate jdbc;
    private final ServletContext servletContext;
    private final BankAccountRepository accounts;
    private final PaymentRunRepository runs;
    private final String version;

    public StatusController(JdbcTemplate jdbc, ServletContext servletContext, BankAccountRepository accounts, PaymentRunRepository runs,
                            @Value("${treasury.version:dev}") String version) {
        this.jdbc = jdbc;
        this.servletContext = servletContext;
        this.accounts = accounts;
        this.runs = runs;
        this.version = version;
    }

    @GetMapping("/api/status")
    public Map<String, Object> status() {
        Map<String, Object> status = new LinkedHashMap<String, Object>();
        status.put("service", "Group Treasury Service");
        status.put("version", version);
        status.put("javaVersion", System.getProperty("java.version"));
        status.put("javaVendor", System.getProperty("java.vendor"));
        status.put("springBootVersion", SpringBootVersion.getVersion());
        status.put("server", servletContext.getServerInfo());
        status.put("host", hostName());
        status.put("os", System.getProperty("os.name") + " " + System.getProperty("os.version"));
        status.put("startedAt", STARTED_AT);
        try {
            status.put("database", jdbc.queryForObject(
                    "SELECT CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(50)) + N' ' + CAST(SERVERPROPERTY('Edition') AS NVARCHAR(100))", String.class));
            status.put("databaseStatus", "UP");
            status.put("bankAccounts", accounts.count());
            status.put("paymentRuns", runs.count());
            status.put("awaitingRelease", runs.countByStatus(RunStatus.AWAITING));
        }
        catch (RuntimeException e) {
            Throwable root = e;
            while (root.getCause() != null) {
                root = root.getCause();
            }
            status.put("databaseStatus", "DOWN");
            status.put("databaseError", root.getMessage());
        }
        return status;
    }

    private static String hostName() {
        try {
            return InetAddress.getLocalHost().getHostName();
        }
        catch (Exception e) {
            return "unknown";
        }
    }
}
