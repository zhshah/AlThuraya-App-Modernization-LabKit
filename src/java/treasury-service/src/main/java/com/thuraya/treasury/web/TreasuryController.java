package com.thuraya.treasury.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.thuraya.treasury.service.TreasuryPositionService;
import com.thuraya.treasury.web.dto.TreasuryPositionResponse;

@RestController
@RequestMapping("/api/treasury")
public class TreasuryController {

    private final TreasuryPositionService positions;

    public TreasuryController(TreasuryPositionService positions) {
        this.positions = positions;
    }

    @GetMapping("/position")
    public TreasuryPositionResponse position() {
        return new TreasuryPositionResponse(positions.currentPosition());
    }
}
