package cz.novanadeje.app.donors.application.event;

import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;

import java.time.Instant;
import java.util.UUID;

public record DonorPasswordResetRequested(
        UUID donorId,
        EmailAddress email,
        LocaleCode preferredLocale,
        LinkSecret secret,
        Instant expiresAt
) {
}
