package cz.novanadeje.app.shared.application.people;

import java.util.UUID;

public interface ReceiptSignatoryLookup {

    boolean signsReceipts(UUID personId);
}
