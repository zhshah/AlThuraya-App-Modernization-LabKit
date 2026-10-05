package com.thuraya.treasury.domain;

import java.math.BigDecimal;
import java.time.LocalDate;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Table;

/** One supplier payment inside a payment run (one line of the pain.001 bank file). */
@Entity
@Table(name = "payment_instruction")
public class PaymentInstruction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "instruction_id")
    private Long id;

    @Column(name = "run_id", nullable = false, length = 20)
    private String runId;

    @Column(name = "invoice_id", nullable = false, length = 20)
    private String invoiceId;

    @Column(name = "vendor_id", nullable = false, length = 10)
    private String vendorId;

    @Column(name = "beneficiary", nullable = false, length = 200)
    private String beneficiary;

    @Column(name = "beneficiary_bank", nullable = false, length = 10)
    private String beneficiaryBank;

    @Column(name = "iban_masked", nullable = false, length = 40)
    private String ibanMasked;

    @Column(name = "amount_qar", nullable = false, precision = 18, scale = 2)
    private BigDecimal amountQar;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    protected PaymentInstruction() {
    }

    public PaymentInstruction(String runId, String invoiceId, String vendorId, String beneficiary, String beneficiaryBank,
                              String ibanMasked, BigDecimal amountQar, LocalDate dueDate) {
        this.runId = runId;
        this.invoiceId = invoiceId;
        this.vendorId = vendorId;
        this.beneficiary = beneficiary;
        this.beneficiaryBank = beneficiaryBank;
        this.ibanMasked = ibanMasked;
        this.amountQar = amountQar;
        this.dueDate = dueDate;
    }

    public Long getId() {
        return id;
    }

    public String getRunId() {
        return runId;
    }

    public String getInvoiceId() {
        return invoiceId;
    }

    public String getVendorId() {
        return vendorId;
    }

    public String getBeneficiary() {
        return beneficiary;
    }

    public String getBeneficiaryBank() {
        return beneficiaryBank;
    }

    public String getIbanMasked() {
        return ibanMasked;
    }

    public BigDecimal getAmountQar() {
        return amountQar;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }
}
