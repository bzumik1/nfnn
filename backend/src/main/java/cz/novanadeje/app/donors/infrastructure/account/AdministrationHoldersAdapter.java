package cz.novanadeje.app.donors.infrastructure.account;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.shared.application.account.AdministrationHolders;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
class AdministrationHoldersAdapter implements AdministrationHolders {

    private final DonorRepository donors;

    AdministrationHoldersAdapter(DonorRepository donors) {
        this.donors = donors;
    }

    @Override
    public boolean holdsAdministration(UUID accountId) {
        return donors.findById(new DonorId(accountId)).filter(Donor::isAdministrator).isPresent();
    }
}
