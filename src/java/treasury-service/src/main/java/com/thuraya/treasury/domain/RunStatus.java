package com.thuraya.treasury.domain;

public enum RunStatus {
    EXECUTED("executed"),
    AWAITING("awaiting"),
    DRAFT("draft");

    private final String code;

    RunStatus(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static RunStatus fromCode(String code) {
        for (RunStatus status : values()) {
            if (status.code.equals(code)) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown payment run status " + code);
    }
}
