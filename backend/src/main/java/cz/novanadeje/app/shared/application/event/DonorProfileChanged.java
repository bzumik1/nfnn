package cz.novanadeje.app.shared.application.event;

import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;

import java.util.UUID;

public record DonorProfileChanged(UUID donorId, DonorName name, PostalAddress address, LocaleCode preferredLocale) {
}
