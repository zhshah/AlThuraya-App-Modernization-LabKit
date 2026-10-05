package com.thuraya.treasury.repository;

import java.util.List;
import java.util.Optional;

import javax.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.thuraya.treasury.domain.PaymentRun;
import com.thuraya.treasury.domain.RunStatus;

public interface PaymentRunRepository extends JpaRepository<PaymentRun, String> {

    List<PaymentRun> findAllByOrderBySortOrderAsc();

    long countByStatus(RunStatus status);

    /** Locks the run so two approvers cannot record a decision at the same time. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from PaymentRun r where r.id = :id")
    Optional<PaymentRun> findByIdForUpdate(@Param("id") String id);
}
