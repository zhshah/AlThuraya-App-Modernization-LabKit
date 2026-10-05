package com.thuraya.treasury.web.dto;

import java.time.LocalDateTime;
import java.util.List;

public class ErrorResponse {

    public final int status;
    public final String code;
    public final String message;
    public final List<String> details;
    public final LocalDateTime timestamp = LocalDateTime.now();

    public ErrorResponse(int status, String code, String message, List<String> details) {
        this.status = status;
        this.code = code;
        this.message = message;
        this.details = details;
    }
}
