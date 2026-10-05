package com.thuraya.treasury.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.thuraya.treasury.domain.CashForecastWeek;

public interface CashForecastWeekRepository extends JpaRepository<CashForecastWeek, Integer> {

    List<CashForecastWeek> findAllByOrderByWeekNoAsc();
}
