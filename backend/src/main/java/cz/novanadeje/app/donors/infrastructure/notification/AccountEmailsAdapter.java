package cz.novanadeje.app.donors.infrastructure.notification;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.shared.application.notification.AccountEmails;
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
    public Optional<String> emailOf(UUID accountId) {
        return donors.findById(new DonorId(accountId)).map(Donor::email).map(EmailAddress::value);
    }
}
