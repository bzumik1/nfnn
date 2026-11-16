package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorSenderAccountLearned;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
public class SenderAccountLearnedNotices {

    private static final Logger log = LoggerFactory.getLogger(SenderAccountLearnedNotices.class);

    private final DonorRepository donors;
    private final ApplicationEventPublisher events;

    public SenderAccountLearnedNotices(DonorRepository donors, ApplicationEventPublisher events) {
        this.donors = donors;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public void tell(UUID donorId, String accountLastDigits) {
        DonorId id = new DonorId(donorId);
        Optional<Donor> donor = donors.findById(id).filter(Donor::receivesSecurityNotices);
        if (donor.isEmpty()) {
            log.debug("Donor {} is not told about a learned sender account: no confirmed account", id);
            return;
        }
        events.publishEvent(new DonorSenderAccountLearned(donorId, donor.get().email(), donor.get().preferredLocale(), accountLastDigits));
    }
}
