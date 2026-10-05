package com.thuraya.treasury.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import com.thuraya.treasury.domain.BankAccount;

/** Bank account in the shape used by the Group Finance Portal. */
public class AccountResponse {

    public final String id;
    public final String bank;
    public final String entity;
    public final String name;
    public final String nameAr;
    public final String currency;
    public final BigDecimal balance;
    public final BigDecimal balanceQar;
    public final String iban;
    public final BigDecimal rate;
    public final LocalDate maturity;
    public final LocalDate statement;
    public final List<BigDecimal> trend;

    public AccountResponse(BankAccount account) {
        this.id = account.getId();
        this.bank = account.getBankId();
        this.entity = account.getEntityId();
        this.name = account.getName();
        this.nameAr = account.getNameAr();
        this.currency = account.getCurrency();
        this.balance = account.getBalance();
        this.balanceQar = account.getBalanceQar();
        this.iban = account.getIbanMasked();
        this.rate = account.getProfitRate();
        this.maturity = account.getMaturityDate();
        this.statement = account.getStatementDate();
        this.trend = account.getTrend();
    }
}
