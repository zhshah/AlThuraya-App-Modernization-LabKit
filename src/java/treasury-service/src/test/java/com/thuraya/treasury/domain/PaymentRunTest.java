package com.thuraya.treasury.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

class PaymentRunTest {

    private static final Instant NOW = Instant.parse("2026-10-02T06:30:00Z");

    private static PaymentRun run(RunStatus status) {
        return new PaymentRun("PR-2026-41", LocalDate.parse("2026-10-07"), status, 18, new BigDecimal("4512330.25"),
                "u-rmenon", Instant.parse("2026-10-05T11:05:00Z"), "SWIFT MT101", "PAIN001_ATH_20261007_010.xml");
    }

    @Test
    void firstApprovalOfAnAwaitingRunIsRecorded() {
        PaymentRun run = run(RunStatus.AWAITING);

        run.recordFirstDecision(PaymentRun.APPROVE, "u-mkuwari", "Checked against the cash forecast", NOW);

        assertThat(run.getFirstDecision()).isEqualTo("approve");
        assertThat(run.getFirstDecisionBy()).isEqualTo("u-mkuwari");
        assertThat(run.getFirstDecisionAt()).isEqualTo(NOW);
        assertThat(run.getStatus()).isEqualTo(RunStatus.AWAITING);
    }

    @Test
    void aSecondDecisionIsRefused() {
        PaymentRun run = run(RunStatus.AWAITING);
        run.recordFirstDecision(PaymentRun.APPROVE, "u-mkuwari", null, NOW);

        assertThatThrownBy(() -> run.recordFirstDecision(PaymentRun.REJECT, "u-ksulaiti", "Too late", NOW))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("already approved");
    }

    @Test
    void anExecutedRunCannotBeDecided() {
        PaymentRun run = run(RunStatus.EXECUTED);

        assertThatThrownBy(() -> run.recordFirstDecision(PaymentRun.APPROVE, "u-mkuwari", null, NOW))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("executed");
    }

    @Test
    void onlyApproveOrRejectIsAccepted() {
        PaymentRun run = run(RunStatus.AWAITING);

        assertThatThrownBy(() -> run.recordFirstDecision("release", "u-mkuwari", null, NOW))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(run.getFirstDecision()).isNull();
    }
}
