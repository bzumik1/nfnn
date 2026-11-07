package cz.novanadeje.app.donations.application.bankcode;

import cz.novanadeje.app.donations.domain.bankcode.BankCodeList;

import java.util.Optional;

public sealed interface BankCodeFetch {

    record Fetched(BankCodeList list, Optional<String> lastModified) implements BankCodeFetch {
    }

    record Unchanged() implements BankCodeFetch {
    }
}
