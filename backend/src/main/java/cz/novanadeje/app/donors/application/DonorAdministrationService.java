package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@Transactional(readOnly = true)
public class DonorAdministrationService {

    public static final int SEARCH_LIMIT = 20;
    public static final int MAX_SEARCH_LIMIT = 100;

    private final DonorRepository donors;
    private final SecondFactorRepository secondFactors;
    private final PasskeyRepository passkeys;

    public DonorAdministrationService(DonorRepository donors, SecondFactorRepository secondFactors, PasskeyRepository passkeys) {
        this.donors = donors;
        this.secondFactors = secondFactors;
        this.passkeys = passkeys;
    }

    public DonorSearchResult search(String query, int page, int limit) {
        if (page < 0 || limit < 1 || limit > MAX_SEARCH_LIMIT) {
            throw new IllegalArgumentException("A donor search page starts at zero and holds 1 to " + MAX_SEARCH_LIMIT + " donors");
        }
        String trimmed = query == null ? "" : query.trim();
        List<Donor> found = donors.search(trimmed, page * limit, limit + 1);
        List<Donor> shown = found.stream().limit(limit).toList();
        List<DonorId> ids = shown.stream().map(Donor::id).toList();
        Set<DonorId> enabled = secondFactors.findDonorsWithEnabledFactorAmong(ids);
        Map<DonorId, Integer> counts = passkeys.countByDonors(ids);
        return new DonorSearchResult(shown.stream()
                .map(donor -> new DonorAccountView(donor, enabled.contains(donor.id()), counts.getOrDefault(donor.id(), 0)))
                .toList(), found.size() > limit);
    }

    public DonorAccountView view(DonorId donorId) {
        return view(donors.findById(donorId).orElseThrow(() -> new DonorNotFound(donorId)));
    }

    private DonorAccountView view(Donor donor) {
        boolean secondFactorEnabled = secondFactors.findByDonor(donor.id()).filter(SecondFactor::isEnabled).isPresent();
        return new DonorAccountView(donor, secondFactorEnabled, passkeys.countByDonor(donor.id()));
    }
}
