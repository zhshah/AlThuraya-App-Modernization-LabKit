package com.thuraya.treasury.domain;

import javax.persistence.AttributeConverter;
import javax.persistence.Converter;

/** Stores run statuses as the lower-case codes used by the finance systems ("executed", "awaiting", "draft"). */
@Converter
public class RunStatusConverter implements AttributeConverter<RunStatus, String> {

    @Override
    public String convertToDatabaseColumn(RunStatus status) {
        return status == null ? null : status.code();
    }

    @Override
    public RunStatus convertToEntityAttribute(String code) {
        return code == null ? null : RunStatus.fromCode(code);
    }
}
