package cz.novanadeje.app.donations.application.donor;

import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;

import java.util.UUID;

public record ChangeDonorRecordProfileCommand(UUID donorId, String name, PostalAddress address, LocaleCode preferredLocale) {
}
