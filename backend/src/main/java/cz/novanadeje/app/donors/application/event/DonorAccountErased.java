package cz.novanadeje.app.donors.application.event;

import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;

import java.util.UUID;

public record DonorAccountErased(UUID donorId, EmailAddress formerEmail, LocaleCode preferredLocale) {
}
