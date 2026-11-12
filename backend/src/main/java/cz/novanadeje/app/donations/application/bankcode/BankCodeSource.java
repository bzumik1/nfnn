package cz.novanadeje.app.donations.application.bankcode;

import cz.novanadeje.app.donations.domain.bankcode.BankCodeListState;

public interface BankCodeSource {

    BankCodeFetch fetch(BankCodeListState known);
}
