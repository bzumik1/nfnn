package cz.novanadeje.app.donors.application.event;

import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;

import java.util.UUID;

public record DonorEmailChanged(UUID donorId, EmailAddress previousEmail, EmailAddress newEmail, LocaleCode preferredLocale) {
}
