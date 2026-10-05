package com.thuraya.treasury.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.thuraya.treasury.domain.PaymentInstruction;

public class PaymentInstructionResponse {

    public final String invoiceId;
    public final String vendorId;
    public final String beneficiary;
    public final String bank;
    public final String iban;
    public final BigDecimal amountQar;
    public final LocalDate dueDate;

    public PaymentInstructionResponse(PaymentInstruction instruction) {
        this.invoiceId = instruction.getInvoiceId();
        this.vendorId = instruction.getVendorId();
        this.beneficiary = instruction.getBeneficiary();
        this.bank = instruction.getBeneficiaryBank();
        this.iban = instruction.getIbanMasked();
        this.amountQar = instruction.getAmountQar();
        this.dueDate = instruction.getDueDate();
    }
}
