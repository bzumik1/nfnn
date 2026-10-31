package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.shared.domain.PrintableText;

final class PrintedInput {

    private PrintedInput() {
    }

    static String of(String raw) {
        return raw == null ? null : PrintableText.of(raw).text();
    }
}
