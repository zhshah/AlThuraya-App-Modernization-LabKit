package com.thuraya.treasury.domain;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

@Entity
@Table(name = "bank")
public class Bank {

    @Id
    @Column(name = "bank_id", length = 10)
    private String id;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "name_ar", nullable = false, length = 100)
    private String nameAr;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    protected Bank() {
    }

    public Bank(String id, String name, String nameAr, int sortOrder) {
        this.id = id;
        this.name = name;
        this.nameAr = nameAr;
        this.sortOrder = sortOrder;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getNameAr() {
        return nameAr;
    }

    public int getSortOrder() {
        return sortOrder;
    }
}
