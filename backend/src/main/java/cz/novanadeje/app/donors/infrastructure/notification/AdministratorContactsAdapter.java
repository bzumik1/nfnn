package cz.novanadeje.app.donors.infrastructure.notification;

import cz.novanadeje.app.donors.application.AdministratorService;
import cz.novanadeje.app.shared.application.notification.AdministratorContact;
import cz.novanadeje.app.shared.application.notification.AdministratorContacts;
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
