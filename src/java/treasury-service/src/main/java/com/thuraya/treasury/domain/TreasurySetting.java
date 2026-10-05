package com.thuraya.treasury.domain;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

@Entity
@Table(name = "treasury_setting")
public class TreasurySetting {

    @Id
    @Column(name = "setting_key", length = 50)
    private String key;

    @Column(name = "setting_value", nullable = false, length = 200)
    private String value;

    protected TreasurySetting() {
    }

    public TreasurySetting(String key, String value) {
        this.key = key;
        this.value = value;
    }

    public String getKey() {
        return key;
    }

    public String getValue() {
        return value;
    }
}
