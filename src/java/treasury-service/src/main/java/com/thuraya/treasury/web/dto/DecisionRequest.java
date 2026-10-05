package com.thuraya.treasury.web.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;

public class DecisionRequest {

    @NotBlank
    @Pattern(regexp = "approve|reject")
    private String decision;

    @NotBlank
    @Size(max = 20)
    private String approverId;

    @Size(max = 500)
    private String comment;

    public String getDecision() {
        return decision;
    }

    public void setDecision(String decision) {
        this.decision = decision;
    }

    public String getApproverId() {
        return approverId;
    }

    public void setApproverId(String approverId) {
        this.approverId = approverId;
    }

    public String getComment() {
        return comment;
    }

    public void setComment(String comment) {
        this.comment = comment;
    }
}
