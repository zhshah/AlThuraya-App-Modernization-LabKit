package com.thuraya.treasury.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.thuraya.treasury.domain.BankAccount;

public interface BankAccountRepository extends JpaRepository<BankAccount, String> {

    List<BankAccount> findAllByOrderBySortOrderAsc();
}
