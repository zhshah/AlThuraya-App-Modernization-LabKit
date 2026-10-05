package com.thuraya.treasury.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.nio.file.Paths;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.thuraya.treasury.domain.PaymentInstruction;
import com.thuraya.treasury.domain.PaymentRun;
import com.thuraya.treasury.domain.RunStatus;
import com.thuraya.treasury.repository.PaymentInstructionRepository;
import com.thuraya.treasury.repository.PaymentRunRepository;

@ExtendWith(MockitoExtension.class)
class PaymentRunServiceTest {

    @Mock
    private PaymentRunRepository runs;

    @Mock
    private PaymentInstructionRepository instructions;

    @Mock
    private BankFileWriter bankFiles;

    private PaymentRunService service;

    @BeforeEach
    void setUp() {
        service = new PaymentRunService(runs, instructions, bankFiles, Clock.fixed(Instant.parse("2026-10-02T06:30:00Z"), ZoneOffset.UTC));
    }

    private static PaymentRun awaitingRun() {
        return new PaymentRun("PR-2026-41", LocalDate.parse("2026-10-07"), RunStatus.AWAITING, 2, new BigDecimal("250000.00"),
                "u-rmenon", Instant.parse("2026-10-05T11:05:00Z"), "SWIFT MT101", "PAIN001_ATH_20261007_010.xml");
    }

    @Test
    void approvalStagesTheBankFile() {
        PaymentRun run = awaitingRun();
        List<PaymentInstruction> lines = Arrays.asList(
                new PaymentInstruction("PR-2026-41", "AP-26-01530", "V-1006", "Doha Digital Systems W.L.L.", "PNB", "QA** 1234", new BigDecimal("150000.00"), LocalDate.parse("2026-10-08")),
                new PaymentInstruction("PR-2026-41", "AP-26-01533", "V-1009", "Al Wakrah Fresh Produce Trading W.L.L.", "AMIB", "QA** 5678", new BigDecimal("100000.00"), LocalDate.parse("2026-10-09")));
        when(runs.findByIdForUpdate("PR-2026-41")).thenReturn(Optional.of(run));
        when(instructions.findByRunIdOrderByAmountQarDesc("PR-2026-41")).thenReturn(lines);
        when(bankFiles.write(run, lines)).thenReturn(Paths.get("PAIN001_ATH_20261007_010.xml"));

        PaymentRun decided = service.decide("PR-2026-41", "approve", "u-mkuwari", "  Within forecast  ");

        assertThat(decided.getFirstDecision()).isEqualTo("approve");
        assertThat(decided.getFirstDecisionComment()).isEqualTo("Within forecast");
        assertThat(decided.getFirstDecisionAt()).isEqualTo(Instant.parse("2026-10-02T06:30:00Z"));
        verify(bankFiles).write(run, lines);
    }

    @Test
    void rejectionDoesNotStageABankFile() {
        PaymentRun run = awaitingRun();
        when(runs.findByIdForUpdate("PR-2026-41")).thenReturn(Optional.of(run));

        PaymentRun decided = service.decide("PR-2026-41", "reject", "u-mkuwari", "Duplicate payee detected");

        assertThat(decided.getFirstDecision()).isEqualTo("reject");
        verify(bankFiles, never()).write(any(PaymentRun.class), anyList());
    }

    @Test
    void aRunThatWasAlreadyDecidedIsAConflict() {
        PaymentRun run = awaitingRun();
        run.recordFirstDecision("approve", "u-mkuwari", null, Instant.parse("2026-10-01T08:00:00Z"));
        when(runs.findByIdForUpdate("PR-2026-41")).thenReturn(Optional.of(run));

        assertThatThrownBy(() -> service.decide("PR-2026-41", "approve", "u-mkuwari", null))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void anUnknownRunIsNotFound() {
        when(runs.findByIdForUpdate("PR-2026-99")).thenReturn(Optional.<PaymentRun>empty());

        assertThatThrownBy(() -> service.decide("PR-2026-99", "approve", "u-mkuwari", null))
                .isInstanceOf(NotFoundException.class);
    }
}
