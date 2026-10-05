package com.thuraya.treasury.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import javax.persistence.CollectionTable;
import javax.persistence.Column;
import javax.persistence.ElementCollection;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.OrderColumn;
import javax.persistence.Table;

@Entity
@Table(name = "bank_account")
public class BankAccount {

    @Id
    @Column(name = "account_id", length = 10)
    private String id;

    @Column(name = "bank_id", nullable = false, length = 10)
    private String bankId;

    @Column(name = "entity_id", nullable = false, length = 10)
    private String entityId;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "name_ar", nullable = false, length = 100)
    private String nameAr;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Column(name = "balance", nullable = false, precision = 18, scale = 2)
    private BigDecimal balance;

    @Column(name = "balance_qar", nullable = false, precision = 18, scale = 2)
    private BigDecimal balanceQar;

    @Column(name = "iban_masked", nullable = false, length = 40)
    private String ibanMasked;

    @Column(name = "profit_rate", precision = 6, scale = 3)
    private BigDecimal profitRate;

    @Column(name = "maturity_date")
    private LocalDate maturityDate;

    @Column(name = "statement_date", nullable = false)
    private LocalDate statementDate;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    /** Month-end balances for the last twelve statements, oldest first. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "account_balance_point", joinColumns = @JoinColumn(name = "account_id"))
    @OrderColumn(name = "point_no")
    @Column(name = "balance", precision = 18, scale = 2)
    private List<BigDecimal> trend = new ArrayList<BigDecimal>();

    protected BankAccount() {
    }

    public BankAccount(String id, String bankId, String entityId, String name, String currency, BigDecimal balance, BigDecimal balanceQar, LocalDate statementDate) {
        this.id = id;
        this.bankId = bankId;
        this.entityId = entityId;
        this.name = name;
        this.nameAr = name;
        this.currency = currency;
        this.balance = balance;
        this.balanceQar = balanceQar;
        this.ibanMasked = "QA**";
        this.statementDate = statementDate;
    }

    public boolean isTermDeposit() {
        return profitRate != null;
    }

    public String getId() {
        return id;
    }

    public String getBankId() {
        return bankId;
    }

    public String getEntityId() {
        return entityId;
    }

    public String getName() {
        return name;
    }

    public String getNameAr() {
        return nameAr;
    }

    public String getCurrency() {
        return currency;
    }

    public BigDecimal getBalance() {
        return balance;
    }

    public BigDecimal getBalanceQar() {
        return balanceQar;
    }

    public String getIbanMasked() {
        return ibanMasked;
    }

    public BigDecimal getProfitRate() {
        return profitRate;
    }

    public LocalDate getMaturityDate() {
        return maturityDate;
    }

    public LocalDate getStatementDate() {
        return statementDate;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public List<BigDecimal> getTrend() {
        return trend;
    }
}
