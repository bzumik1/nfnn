package cz.novanadeje.app.donors.infrastructure.account;

import cz.novanadeje.app.donors.application.AdministratorService;
import cz.novanadeje.app.shared.application.account.AdministratorContact;
import cz.novanadeje.app.shared.application.account.AdministratorContacts;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
class AdministratorContactsAdapter implements AdministratorContacts {

    private final AdministratorService administrators;

    AdministratorContactsAdapter(AdministratorService administrators) {
        this.administrators = administrators;
    }

    @Override
    public List<AdministratorContact> all() {
        return administrators.contacts();
    }
}
