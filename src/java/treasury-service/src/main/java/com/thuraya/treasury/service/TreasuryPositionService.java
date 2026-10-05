package com.thuraya.treasury.service;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.thuraya.treasury.domain.BankAccount;
import com.thuraya.treasury.domain.TreasurySetting;
import com.thuraya.treasury.repository.BankAccountRepository;
import com.thuraya.treasury.repository.BankRepository;
import com.thuraya.treasury.repository.CashForecastWeekRepository;
import com.thuraya.treasury.repository.TreasurySettingRepository;

@Service
public class TreasuryPositionService {

    static final String AS_OF_DATE = "as_of_date";
    static final String POLICY_MINIMUM = "policy_minimum";

    private final BankRepository banks;
    private final BankAccountRepository accounts;
    private final CashForecastWeekRepository forecast;
    private final TreasurySettingRepository settings;

    public TreasuryPositionService(BankRepository banks, BankAccountRepository accounts, CashForecastWeekRepository forecast,
                                   TreasurySettingRepository settings) {
        this.banks = banks;
        this.accounts = accounts;
        this.forecast = forecast;
        this.settings = settings;
    }

    @Transactional(readOnly = true)
    public TreasuryPosition currentPosition() {
        List<BankAccount> accountList = accounts.findAllByOrderBySortOrderAsc();
        BigDecimal openingCash = accountList.stream().map(BankAccount::getBalanceQar).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new TreasuryPosition(setting(AS_OF_DATE), new BigDecimal(setting(POLICY_MINIMUM)), openingCash,
                banks.findAllByOrderBySortOrderAsc(), accountList, forecast.findAllByOrderByWeekNoAsc());
    }

    private String setting(String key) {
        TreasurySetting setting = settings.findById(key).orElse(null);
        if (setting == null) {
            throw new IllegalStateException("Treasury setting '" + key + "' is missing - load the treasury database first");
        }
        return setting.getValue();
    }
}
