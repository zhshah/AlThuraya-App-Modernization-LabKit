package com.thuraya.treasury.web.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

import com.thuraya.treasury.domain.Bank;
import com.thuraya.treasury.domain.CashForecastWeek;
import com.thuraya.treasury.service.TreasuryPosition;

public class TreasuryPositionResponse {

    public final String asOf;
    public final BigDecimal policyMinimum;
    public final BigDecimal openingCash;
    public final List<BankResponse> banks;
    public final List<AccountResponse> accounts;
    public final List<ForecastWeekResponse> forecast;

    public TreasuryPositionResponse(TreasuryPosition position) {
        this.asOf = position.getAsOf();
        this.policyMinimum = position.getPolicyMinimum();
        this.openingCash = position.getOpeningCash();
        this.banks = position.getBanks().stream().map(BankResponse::new).collect(Collectors.toList());
        this.accounts = position.getAccounts().stream().map(AccountResponse::new).collect(Collectors.toList());
        this.forecast = position.getForecast().stream().map(ForecastWeekResponse::new).collect(Collectors.toList());
    }

    public static class BankResponse {
        public final String id;
        public final String name;
        public final String nameAr;

        public BankResponse(Bank bank) {
            this.id = bank.getId();
            this.name = bank.getName();
            this.nameAr = bank.getNameAr();
        }
    }

    public static class ForecastWeekResponse {
        public final int week;
        public final String start;
        public final BigDecimal inflow;
        public final BigDecimal outflow;
        public final BigDecimal closing;
        public final boolean payroll;

        public ForecastWeekResponse(CashForecastWeek week) {
            this.week = week.getWeekNo();
            this.start = week.getStartDate().toString();
            this.inflow = week.getInflow();
            this.outflow = week.getOutflow();
            this.closing = week.getClosingBalance();
            this.payroll = week.isPayroll();
        }
    }
}
