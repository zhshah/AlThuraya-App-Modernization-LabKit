package com.thuraya.treasury.web.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.thuraya.treasury.domain.PaymentRun;

/** Payment run in the shape used by the Group Finance Portal. */
public class PaymentRunResponse {

    public final String id;
    public final String date;
    public final String status;
    public final int payments;
    public final BigDecimal amountQar;
    public final String createdBy;
    public final String approvedBy;
    public final Instant createdAt;
    public final String channel;
    public final String file;
    public final RunDecision decision;

    public PaymentRunResponse(PaymentRun run) {
        this.id = run.getId();
        this.date = run.getValueDate().toString();
        this.status = run.getStatus().code();
        this.payments = run.getPaymentsCount();
        this.amountQar = run.getAmountQar();
        this.createdBy = run.getCreatedBy();
        this.approvedBy = run.getApprovedBy();
        this.createdAt = run.getCreatedAt();
        this.channel = run.getChannel();
        this.file = run.getBankFile();
        this.decision = run.getFirstDecision() == null ? null
                : new RunDecision(run.getFirstDecision(), run.getFirstDecisionBy(), run.getFirstDecisionAt(), run.getFirstDecisionComment());
    }

    public static class RunDecision {
        public final String decision;
        public final String by;
        public final Instant at;
        public final String comment;

        public RunDecision(String decision, String by, Instant at, String comment) {
            this.decision = decision;
            this.by = by;
            this.at = at;
            this.comment = comment;
        }
    }
}
