package cz.novanadeje.app.donors.infrastructure.account;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.shared.application.account.AccountEmails;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

@Component
class AccountEmailsAdapter implements AccountEmails {

    private final DonorRepository donors;

    AccountEmailsAdapter(DonorRepository donors) {
        this.donors = donors;
    }

    @Override
    public Optional<EmailAddress> emailOf(UUID accountId) {
        return donors.findById(new DonorId(accountId)).map(Donor::email);
    }

    @Override
    public Optional<EmailAddress> verifiedEmailOf(UUID accountId) {
        return donors.findById(new DonorId(accountId)).filter(Donor::isEmailVerified).map(Donor::email);
    }

    @Override
    public boolean belongsToVerifiedAccount(EmailAddress email) {
        return donors.findByEmail(email).filter(Donor::isEmailVerified).isPresent();
    }
}
