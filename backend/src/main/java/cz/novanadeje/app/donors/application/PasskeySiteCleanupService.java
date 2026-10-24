package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class PasskeySiteCleanupService {

    private static final Logger log = LoggerFactory.getLogger(PasskeySiteCleanupService.class);

    private final PasskeyRepository passkeys;
    private final PasskeyCeremonies ceremonies;

    public PasskeySiteCleanupService(PasskeyRepository passkeys, PasskeyCeremonies ceremonies) {
        this.passkeys = passkeys;
        this.ceremonies = ceremonies;
    }

    @Transactional
    public int removeKeysOfOtherSites() {
        String site = ceremonies.relyingPartyId();
        int adopted = passkeys.adoptUnmarked(site);
        List<DonorId> donors = passkeys.deleteOfOtherSites(site);
        if (adopted > 0 || !donors.isEmpty()) {
            log.info("Passkeys of other sites removed from {} donors; {} older passkeys counted as made for {}", donors.size(), adopted, site);
        }
        return donors.size();
    }
}
