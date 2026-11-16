package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorSenderAccountLearned;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class SenderAccountLearnedNotices {

    private final DonorRepository donors;
    private final ApplicationEventPublisher events;

    public SenderAccountLearnedNotices(DonorRepository donors, ApplicationEventPublisher events) {
        this.donors = donors;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public void tell(UUID donorId, String accountLastDigits) {
        donors.findById(new DonorId(donorId))
                .filter(Donor::receivesSecurityNotices)
                .ifPresent(donor -> events.publishEvent(new DonorSenderAccountLearned(donorId, donor.email(), donor.preferredLocale(), accountLastDigits)));
    }
}
