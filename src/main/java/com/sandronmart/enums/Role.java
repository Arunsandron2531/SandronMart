package com.sandronmart.enums;

public enum Role {
    BUYER,
    SELLER;

    public String withAuthority() {
        return "ROLE_" + this.name();
    }
}