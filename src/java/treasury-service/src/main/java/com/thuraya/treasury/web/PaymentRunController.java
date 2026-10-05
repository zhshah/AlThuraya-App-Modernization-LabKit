package com.thuraya.treasury.web;

import java.util.List;
import java.util.stream.Collectors;

import javax.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.thuraya.treasury.service.PaymentRunService;
import com.thuraya.treasury.web.dto.DecisionRequest;
import com.thuraya.treasury.web.dto.PaymentInstructionResponse;
import com.thuraya.treasury.web.dto.PaymentRunResponse;

@RestController
@RequestMapping("/api/payment-runs")
public class PaymentRunController {

    private final PaymentRunService runs;

    public PaymentRunController(PaymentRunService runs) {
        this.runs = runs;
    }

    @GetMapping
    public List<PaymentRunResponse> list() {
        return runs.findAll().stream().map(PaymentRunResponse::new).collect(Collectors.toList());
    }

    @GetMapping("/{id}")
    public PaymentRunResponse get(@PathVariable String id) {
        return new PaymentRunResponse(runs.find(id));
    }

    @GetMapping("/{id}/instructions")
    public List<PaymentInstructionResponse> instructions(@PathVariable String id) {
        return runs.instructionsFor(id).stream().map(PaymentInstructionResponse::new).collect(Collectors.toList());
    }

    @PostMapping("/{id}/decision")
    public PaymentRunResponse decide(@PathVariable String id, @Valid @RequestBody DecisionRequest request) {
        return new PaymentRunResponse(runs.decide(id, request.getDecision(), request.getApproverId(), request.getComment()));
    }
}
