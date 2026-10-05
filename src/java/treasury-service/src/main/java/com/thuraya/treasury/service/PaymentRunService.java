package com.thuraya.treasury.service;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.thuraya.treasury.domain.PaymentInstruction;
import com.thuraya.treasury.domain.PaymentRun;
import com.thuraya.treasury.repository.PaymentInstructionRepository;
import com.thuraya.treasury.repository.PaymentRunRepository;

@Service
public class PaymentRunService {

    private static final Logger log = LoggerFactory.getLogger(PaymentRunService.class);

    private final PaymentRunRepository runs;
    private final PaymentInstructionRepository instructions;
    private final BankFileWriter bankFiles;
    private final Clock clock;

    public PaymentRunService(PaymentRunRepository runs, PaymentInstructionRepository instructions, BankFileWriter bankFiles, Clock clock) {
        this.runs = runs;
        this.instructions = instructions;
        this.bankFiles = bankFiles;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<PaymentRun> findAll() {
        return runs.findAllByOrderBySortOrderAsc();
    }

    @Transactional(readOnly = true)
    public PaymentRun find(String runId) {
        return runs.findById(runId).orElseThrow(() -> new NotFoundException("Unknown payment run " + runId));
    }

    @Transactional(readOnly = true)
    public List<PaymentInstruction> instructionsFor(String runId) {
        find(runId);
        return instructions.findByRunIdOrderByAmountQarDesc(runId);
    }

    /**
     * First approval (dual control) of a run awaiting release. An approval stages the pain.001 bank file
     * for Treasury; a rejection returns the run to Accounts Payable.
     */
    @Transactional
    public PaymentRun decide(String runId, String decision, String approverId, String comment) {
        PaymentRun run = runs.findByIdForUpdate(runId).orElseThrow(() -> new NotFoundException("Unknown payment run " + runId));
        String note = comment == null || comment.trim().isEmpty() ? null : comment.trim();
        try {
            run.recordFirstDecision(decision, approverId, note, Instant.now(clock));
        }
        catch (IllegalStateException e) {
            throw new ConflictException(e.getMessage());
        }
        if (PaymentRun.APPROVE.equals(decision)) {
            Path file = bankFiles.write(run, instructions.findByRunIdOrderByAmountQarDesc(runId));
            log.info("Payment run {} approved by {} (1 of 2); bank file staged at {}", runId, approverId, file);
        }
        else {
            log.info("Payment run {} rejected by {} and returned to Accounts Payable", runId, approverId);
        }
        return run;
    }
}
