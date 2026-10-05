package com.thuraya.treasury.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.thuraya.treasury.domain.PaymentInstruction;

public interface PaymentInstructionRepository extends JpaRepository<PaymentInstruction, Long> {

    List<PaymentInstruction> findByRunIdOrderByAmountQarDesc(String runId);
}
