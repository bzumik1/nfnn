package cz.novanadeje.app.shared.domain;

import java.util.UUID;

public final class ErasedPersonalData {

    public static final String NAME = "Vymazaný dárce";
    public static final PostalAddress ADDRESS = new PostalAddress("Vymazáno", "Vymazáno", "00000");

    private ErasedPersonalData() {
    }

    public static EmailAddress emailFor(UUID donorId) {
        return new EmailAddress("erased-" + donorId + "@erased.invalid");
    }
}
