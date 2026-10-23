package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class DonorAdministrationService {

    public static final int SEARCH_LIMIT = 20;

    private final DonorRepository donors;
    private final SecondFactorRepository secondFactors;

    public DonorAdministrationService(DonorRepository donors, SecondFactorRepository secondFactors) {
        this.donors = donors;
        this.secondFactors = secondFactors;
    }

    public List<DonorAccountView> search(String query) {
        String trimmed = query == null ? "" : query.trim();
        if (trimmed.isEmpty()) {
            return List.of();
        }
        return donors.search(trimmed, SEARCH_LIMIT).stream().map(this::view).toList();
    }

    public DonorAccountView view(DonorId donorId) {
        return view(donors.findById(donorId).orElseThrow(() -> new DonorNotFound(donorId)));
    }

    private DonorAccountView view(Donor donor) {
        boolean secondFactorEnabled = secondFactors.findByDonor(donor.id()).filter(SecondFactor::isEnabled).isPresent();
        return new DonorAccountView(donor, secondFactorEnabled);
    }
}
