package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.PersonReference;

import java.time.Instant;

public record ChosenSignatoryView(PersonReference person, String name, String receiptRole, Instant chosenAt, boolean hasPortrait,
                                  boolean hasSignature) {
}
