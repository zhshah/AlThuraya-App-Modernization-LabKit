package com.thuraya.treasury.web;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.thuraya.treasury.service.ConflictException;
import com.thuraya.treasury.service.NotFoundException;
import com.thuraya.treasury.web.dto.ErrorResponse;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResponse> notFound(NotFoundException e) {
        return error(HttpStatus.NOT_FOUND, "NOT_FOUND", e.getMessage(), null);
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ErrorResponse> conflict(ConflictException e) {
        return error(HttpStatus.CONFLICT, "INVALID_STATE", e.getMessage(), null);
    }

    @ExceptionHandler({ ObjectOptimisticLockingFailureException.class, PessimisticLockingFailureException.class })
    public ResponseEntity<ErrorResponse> concurrentUpdate(RuntimeException e) {
        log.warn("Concurrent payment run update: {}", e.getMessage());
        return error(HttpStatus.CONFLICT, "CONCURRENT_UPDATE", "The payment run was changed by another user - please refresh.", null);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> validation(MethodArgumentNotValidException e) {
        List<String> details = new ArrayList<String>();
        for (FieldError fieldError : e.getBindingResult().getFieldErrors()) {
            details.add(fieldError.getField() + ": " + fieldError.getDefaultMessage());
        }
        return error(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "The request is invalid.", details);
    }

    @ExceptionHandler({ IllegalArgumentException.class, HttpMessageNotReadableException.class })
    public ResponseEntity<ErrorResponse> badRequest(Exception e) {
        return error(HttpStatus.BAD_REQUEST, "BAD_REQUEST", e.getMessage(), null);
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ErrorResponse> unexpected(RuntimeException e) {
        log.error("Unhandled error", e);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "An unexpected error occurred in the treasury service.", null);
    }

    private static ResponseEntity<ErrorResponse> error(HttpStatus status, String code, String message, List<String> details) {
        return ResponseEntity.status(status).body(new ErrorResponse(status.value(), code, message, details));
    }
}
