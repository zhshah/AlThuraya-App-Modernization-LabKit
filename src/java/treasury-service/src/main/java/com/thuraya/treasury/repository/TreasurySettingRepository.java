package com.thuraya.treasury.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.thuraya.treasury.domain.TreasurySetting;

public interface TreasurySettingRepository extends JpaRepository<TreasurySetting, String> {
}
