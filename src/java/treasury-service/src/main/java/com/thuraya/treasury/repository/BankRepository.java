package com.thuraya.treasury.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.thuraya.treasury.domain.Bank;

public interface BankRepository extends JpaRepository<Bank, String> {

    List<Bank> findAllByOrderBySortOrderAsc();
}
