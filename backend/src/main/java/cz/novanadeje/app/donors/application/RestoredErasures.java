package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

@Service
public class RestoredErasures {

    private static final Logger log = LoggerFactory.getLogger(RestoredErasures.class);

    private final DonorRepository donors;
    private final DonorErasureService erasures;

    public RestoredErasures(DonorRepository donors, DonorErasureService erasures) {
        this.donors = donors;
        this.erasures = erasures;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void completeErasuresARestoreBroughtBack() {
        for (Donor donor : donors.findErased()) {
            if (!donor.erasureIncomplete()) {
                continue;
            }
            try {
                erasures.completeRestoredErasure(donor.id());
            } catch (RuntimeException failure) {
                log.warn("Completing the erasure of donor {} that a restore brought back failed ({}); the next start tries again", donor.id(),
                        failure.getClass().getSimpleName());
            }
        }
    }
}
