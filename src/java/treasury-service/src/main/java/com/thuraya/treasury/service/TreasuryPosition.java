package com.thuraya.treasury.service;

import java.math.BigDecimal;
import java.util.List;

import com.thuraya.treasury.domain.Bank;
import com.thuraya.treasury.domain.BankAccount;
import com.thuraya.treasury.domain.CashForecastWeek;

/** Group cash position: bank balances (overnight statements) and the 13-week liquidity forecast. */
public class TreasuryPosition {

    private final String asOf;
    private final BigDecimal policyMinimum;
    private final BigDecimal openingCash;
    private final List<Bank> banks;
    private final List<BankAccount> accounts;
    private final List<CashForecastWeek> forecast;

    public TreasuryPosition(String asOf, BigDecimal policyMinimum, BigDecimal openingCash, List<Bank> banks,
                            List<BankAccount> accounts, List<CashForecastWeek> forecast) {
        this.asOf = asOf;
        this.policyMinimum = policyMinimum;
        this.openingCash = openingCash;
        this.banks = banks;
        this.accounts = accounts;
        this.forecast = forecast;
    }

    public String getAsOf() {
        return asOf;
    }

    public BigDecimal getPolicyMinimum() {
        return policyMinimum;
    }

    public BigDecimal getOpeningCash() {
        return openingCash;
    }

    public List<Bank> getBanks() {
        return banks;
    }

    public List<BankAccount> getAccounts() {
        return accounts;
    }

    public List<CashForecastWeek> getForecast() {
        return forecast;
    }
}
