package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.application.event.DonorProfileChanged;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

@Service
public class DonorProfileService {

    private final DonorRepository donors;
    private final DonorViews views;
    private final ApplicationEventPublisher events;

    public DonorProfileService(DonorRepository donors, DonorViews views, ApplicationEventPublisher events) {
        this.donors = donors;
        this.views = views;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public DonorView profile(DonorId donorId, Set<Role> sessionRoles) {
        return views.forSession(load(donorId), sessionRoles);
    }

    @Transactional
    public DonorView updateProfile(DonorId donorId, Set<Role> sessionRoles, UpdateDonorProfileCommand command) {
        Donor donor = load(donorId);
        String name = command.name() == null ? donor.name() : command.name();
        PostalAddress address = command.street() == null && command.city() == null && command.postalCode() == null
                ? donor.address()
                : new PostalAddress(command.street(), command.city(), command.postalCode());
        LocaleCode locale = command.preferredLocale() == null ? donor.preferredLocale() : LocaleCode.fromTag(command.preferredLocale());
        donor.updateProfile(name, address, locale);
        donors.save(donor);
        events.publishEvent(new DonorProfileChanged(donor.id().value(), donor.name(), donor.address(), donor.preferredLocale()));
        return views.forSession(donor, sessionRoles);
    }

    private Donor load(DonorId donorId) {
        return donors.findById(donorId).orElseThrow(() -> new DonorNotFound(donorId));
    }
}
