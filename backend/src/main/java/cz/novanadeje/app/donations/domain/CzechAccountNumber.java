package cz.novanadeje.app.donations.domain;

import cz.novanadeje.app.shared.domain.Iban;

public record CzechAccountNumber(String value) {

    public Iban toIban() {
        throw new UnsupportedOperationException("not yet");
    }
}
