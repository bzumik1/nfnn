package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.ConfirmationRequired;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.PasskeyConfirmationRejected;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.WrongPassword;
import cz.novanadeje.app.shared.domain.error.RuleViolation;

import java.util.Optional;

record ConfirmedCredentials(DonorId donor, Optional<PasswordHash> passwordHash, Method method) {

    enum Method {
        PASSWORD,
        PASSKEY,
        NOTHING
    }

    static ConfirmedCredentials byPassword(Donor donor) {
        return new ConfirmedCredentials(donor.id(), donor.passwordHash(), Method.PASSWORD);
    }

    static ConfirmedCredentials byPasskey(Donor donor) {
        return new ConfirmedCredentials(donor.id(), donor.passwordHash(), Method.PASSKEY);
    }

    static ConfirmedCredentials unconfirmed(Donor donor) {
        return new ConfirmedCredentials(donor.id(), donor.passwordHash(), Method.NOTHING);
    }

    void requireUnchangedIn(Donor current) {
        if (!current.id().equals(donor) || !current.passwordHash().equals(passwordHash)) {
            throw refusal();
        }
    }

    private RuleViolation refusal() {
        return switch (method) {
            case PASSWORD -> new WrongPassword();
            case PASSKEY -> new PasskeyConfirmationRejected();
            case NOTHING -> new ConfirmationRequired();
        };
    }
}
