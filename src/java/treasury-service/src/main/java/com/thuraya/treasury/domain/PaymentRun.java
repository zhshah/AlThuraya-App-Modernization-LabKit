package com.thuraya.treasury.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import javax.persistence.Column;
import javax.persistence.Convert;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;
import javax.persistence.Version;

/**
 * A weekly supplier payment run. Release is dual-control: the Group Financial Controller gives the first
 * approval in the finance portal, then Treasury releases the bank file.
 */
@Entity
@Table(name = "payment_run")
public class PaymentRun {

    public static final String APPROVE = "approve";
    public static final String REJECT = "reject";

    @Id
    @Column(name = "run_id", length = 20)
    private String id;

    @Column(name = "value_date", nullable = false)
    private LocalDate valueDate;

    @Convert(converter = RunStatusConverter.class)
    @Column(name = "status", nullable = false, length = 10)
    private RunStatus status;

    @Column(name = "payments_count", nullable = false)
    private int paymentsCount;

    @Column(name = "amount_qar", nullable = false, precision = 18, scale = 2)
    private BigDecimal amountQar;

    @Column(name = "created_by", nullable = false, length = 20)
    private String createdBy;

    @Column(name = "approved_by", length = 20)
    private String approvedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "channel", nullable = false, length = 60)
    private String channel;

    @Column(name = "bank_file", nullable = false, length = 80)
    private String bankFile;

    @Column(name = "first_decision", length = 10)
    private String firstDecision;

    @Column(name = "first_decision_by", length = 20)
    private String firstDecisionBy;

    @Column(name = "first_decision_at")
    private Instant firstDecisionAt;

    @Column(name = "first_decision_comment", length = 500)
    private String firstDecisionComment;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected PaymentRun() {
    }

    public PaymentRun(String id, LocalDate valueDate, RunStatus status, int paymentsCount, BigDecimal amountQar,
                      String createdBy, Instant createdAt, String channel, String bankFile) {
        this.id = id;
        this.valueDate = valueDate;
        this.status = status;
        this.paymentsCount = paymentsCount;
        this.amountQar = amountQar;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
        this.channel = channel;
        this.bankFile = bankFile;
    }

    /** Records the first approval (or rejection) of a run that is awaiting release. */
    public void recordFirstDecision(String decision, String approverId, String comment, Instant at) {
        if (!APPROVE.equals(decision) && !REJECT.equals(decision)) {
            throw new IllegalArgumentException("Decision must be 'approve' or 'reject'");
        }
        if (status != RunStatus.AWAITING) {
            throw new IllegalStateException("Payment run " + id + " is " + status.code() + " and cannot be approved or rejected");
        }
        if (firstDecision != null) {
            throw new IllegalStateException("Payment run " + id + " was already " + (APPROVE.equals(firstDecision) ? "approved" : "rejected") + " by " + firstDecisionBy);
        }
        this.firstDecision = decision;
        this.firstDecisionBy = approverId;
        this.firstDecisionComment = comment;
        this.firstDecisionAt = at;
    }

    public String getId() {
        return id;
    }

    public LocalDate getValueDate() {
        return valueDate;
    }

    public RunStatus getStatus() {
        return status;
    }

    public int getPaymentsCount() {
        return paymentsCount;
    }

    public BigDecimal getAmountQar() {
        return amountQar;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public String getApprovedBy() {
        return approvedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public String getChannel() {
        return channel;
    }

    public String getBankFile() {
        return bankFile;
    }

    public String getFirstDecision() {
        return firstDecision;
    }

    public String getFirstDecisionBy() {
        return firstDecisionBy;
    }

    public Instant getFirstDecisionAt() {
        return firstDecisionAt;
    }

    public String getFirstDecisionComment() {
        return firstDecisionComment;
    }

    public int getSortOrder() {
        return sortOrder;
    }
}
