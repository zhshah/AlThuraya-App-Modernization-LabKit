package com.thuraya.treasury.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.thuraya.treasury.domain.BankAccount;
import com.thuraya.treasury.repository.BankAccountRepository;

/** Daily cash position report (CSV) for the treasury team, written to the reports folder. */
@Service
public class CashPositionReportService {

    private static final ZoneId DOHA = ZoneId.of("Asia/Qatar");

    private final BankAccountRepository accounts;
    private final Path directory;
    private final Clock clock;

    public CashPositionReportService(BankAccountRepository accounts, @Value("${treasury.report-dir}") String directory, Clock clock) {
        this.accounts = accounts;
        this.directory = Paths.get(directory);
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Path writeDailyReport() {
        LocalDate today = LocalDate.now(clock.withZone(DOHA));
        List<String> lines = new ArrayList<String>();
        lines.add("Account,Bank,Entity,Account name,Currency,Balance,Balance (QAR),Statement date");
        BigDecimal total = BigDecimal.ZERO;
        for (BankAccount account : accounts.findAllByOrderBySortOrderAsc()) {
            lines.add(String.join(",", csv(account.getId()), csv(account.getBankId()), csv(account.getEntityId()), csv(account.getName()),
                    csv(account.getCurrency()), account.getBalance().toPlainString(), account.getBalanceQar().toPlainString(),
                    account.getStatementDate().toString()));
            total = total.add(account.getBalanceQar());
        }
        lines.add("Total,,,,," + "," + total.toPlainString() + ",");
        try {
            Files.createDirectories(directory);
            Path file = directory.resolve("cash-position-" + today.format(DateTimeFormatter.BASIC_ISO_DATE) + ".csv");
            Files.write(file, lines, StandardCharsets.UTF_8);
            return file;
        }
        catch (IOException e) {
            throw new UncheckedIOException("Could not write the cash position report", e);
        }
    }

    private static String csv(String value) {
        if (value == null) {
            return "";
        }
        return value.contains(",") || value.contains("\"") ? "\"" + value.replace("\"", "\"\"") + "\"" : value;
    }
}
