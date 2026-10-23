package cz.novanadeje.app.donors.application.event;

import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;

import java.util.UUID;

public record DonorPasskeysRemoved(UUID donorId, EmailAddress email, LocaleCode preferredLocale) {
}
