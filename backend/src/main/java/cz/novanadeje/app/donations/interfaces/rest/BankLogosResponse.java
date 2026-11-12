package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.banklogo.PublishedBankLogo;

import java.util.List;
import java.util.UUID;

record BankLogosResponse(List<Item> items) {

    static BankLogosResponse from(List<PublishedBankLogo> logos) {
        return new BankLogosResponse(logos.stream().map(logo -> new Item(logo.code(), logo.imageId())).toList());
    }

    record Item(String code, UUID imageId) {
    }
}
