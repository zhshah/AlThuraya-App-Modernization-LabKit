package com.thuraya.treasury.domain;

import java.math.BigDecimal;
import java.time.LocalDate;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

@Entity
@Table(name = "cash_forecast_week")
public class CashForecastWeek {

    @Id
    @Column(name = "week_no")
    private int weekNo;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "inflow", nullable = false, precision = 18, scale = 2)
    private BigDecimal inflow;

    @Column(name = "outflow", nullable = false, precision = 18, scale = 2)
    private BigDecimal outflow;

    @Column(name = "closing_balance", nullable = false, precision = 18, scale = 2)
    private BigDecimal closingBalance;

    @Column(name = "payroll", nullable = false)
    private boolean payroll;

    protected CashForecastWeek() {
    }

    public CashForecastWeek(int weekNo, LocalDate startDate, BigDecimal inflow, BigDecimal outflow, BigDecimal closingBalance, boolean payroll) {
        this.weekNo = weekNo;
        this.startDate = startDate;
        this.inflow = inflow;
        this.outflow = outflow;
        this.closingBalance = closingBalance;
        this.payroll = payroll;
    }

    public int getWeekNo() {
        return weekNo;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public BigDecimal getInflow() {
        return inflow;
    }

    public BigDecimal getOutflow() {
        return outflow;
    }

    public BigDecimal getClosingBalance() {
        return closingBalance;
    }

    public boolean isPayroll() {
        return payroll;
    }
}
