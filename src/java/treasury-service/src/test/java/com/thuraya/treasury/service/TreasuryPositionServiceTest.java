package com.thuraya.treasury.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collections;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.thuraya.treasury.domain.BankAccount;
import com.thuraya.treasury.domain.CashForecastWeek;
import com.thuraya.treasury.domain.TreasurySetting;
import com.thuraya.treasury.repository.BankAccountRepository;
import com.thuraya.treasury.repository.BankRepository;
import com.thuraya.treasury.repository.CashForecastWeekRepository;
import com.thuraya.treasury.repository.TreasurySettingRepository;

@ExtendWith(MockitoExtension.class)
class TreasuryPositionServiceTest {

    @Mock
    private BankRepository banks;

    @Mock
    private BankAccountRepository accounts;

    @Mock
    private CashForecastWeekRepository forecast;

    @Mock
    private TreasurySettingRepository settings;

    @InjectMocks
    private TreasuryPositionService service;

    @Test
    void openingCashIsTheSumOfTheQarBalances() {
        LocalDate statement = LocalDate.parse("2026-10-01");
        when(accounts.findAllByOrderBySortOrderAsc()).thenReturn(Arrays.asList(
                new BankAccount("ACC-01", "PNB", "ATH", "Main operating account", "QAR", new BigDecimal("148250000.00"), new BigDecimal("148250000.00"), statement),
                new BankAccount("ACC-08", "AGTB", "ATTR", "Trading operating account (USD)", "USD", new BigDecimal("9850000.00"), new BigDecimal("35854000.00"), statement)));
        when(banks.findAllByOrderBySortOrderAsc()).thenReturn(Collections.emptyList());
        when(forecast.findAllByOrderByWeekNoAsc()).thenReturn(Collections.singletonList(
                new CashForecastWeek(1, LocalDate.parse("2026-10-04"), new BigDecimal("80000000"), new BigDecimal("70000000"), new BigDecimal("194104000"), false)));
        when(settings.findById("as_of_date")).thenReturn(Optional.of(new TreasurySetting("as_of_date", "2026-10-02")));
        when(settings.findById("policy_minimum")).thenReturn(Optional.of(new TreasurySetting("policy_minimum", "400000000")));

        TreasuryPosition position = service.currentPosition();

        assertThat(position.getOpeningCash()).isEqualByComparingTo("184104000.00");
        assertThat(position.getPolicyMinimum()).isEqualByComparingTo("400000000");
        assertThat(position.getAsOf()).isEqualTo("2026-10-02");
        assertThat(position.getForecast()).hasSize(1);
    }
}
