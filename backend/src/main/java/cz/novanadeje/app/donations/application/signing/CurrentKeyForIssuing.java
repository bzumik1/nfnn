package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;

import java.util.Objects;

public record CurrentKeyForIssuing(ReceiptSigningKeyId id, State state) {

    public CurrentKeyForIssuing {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(state, "state");
    }

    public enum State {
        PUBLISHED,
        WITHDRAWN,
        UNPUBLISHED
    }
}
