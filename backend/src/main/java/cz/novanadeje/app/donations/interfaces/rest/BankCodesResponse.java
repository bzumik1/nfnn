package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.bankcode.BankCodeListView;

import java.time.Instant;
import java.util.List;

record BankCodesResponse(Instant fetchedAt, List<Item> items) {

    static BankCodesResponse from(BankCodeListView view) {
        return new BankCodesResponse(view.fetchedAt().orElse(null),
                view.banks().stream().map(bank -> new Item(bank.code().value(), bank.name().value())).toList());
    }

    record Item(String code, String name) {
    }
}
