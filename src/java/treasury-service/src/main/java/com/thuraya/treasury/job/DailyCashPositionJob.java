package com.thuraya.treasury.job;

import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.thuraya.treasury.service.CashPositionReportService;

/** Runs inside the web application: every Qatar working day at 07:30 (Sunday to Thursday). */
@Component
public class DailyCashPositionJob {

    private static final Logger log = LoggerFactory.getLogger(DailyCashPositionJob.class);

    private final CashPositionReportService reports;

    public DailyCashPositionJob(CashPositionReportService reports) {
        this.reports = reports;
    }

    @Scheduled(cron = "${treasury.report-cron}", zone = "Asia/Qatar")
    public void run() {
        try {
            Path file = reports.writeDailyReport();
            log.info("Daily cash position report written to {}", file);
        }
        catch (RuntimeException e) {
            log.error("Daily cash position report failed", e);
        }
    }
}
