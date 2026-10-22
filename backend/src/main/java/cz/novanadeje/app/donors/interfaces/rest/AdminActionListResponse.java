package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdminActionView;
import cz.novanadeje.app.donors.application.AdministratorActivity;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.shared.domain.EmailAddress;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

record AdminActionListResponse(List<Item> items, boolean hasMore) {

    static AdminActionListResponse from(AdministratorActivity activity) {
        return new AdminActionListResponse(activity.items().stream().map(Item::from).toList(), activity.hasMore());
    }

    record Item(UUID id, UUID adminId, String adminName, String adminEmail, String action, UUID subjectId, String details, Instant performedAt) {

        static Item from(AdminActionView view) {
            return new Item(
                    view.id(),
                    view.adminId(),
                    view.admin().map(Donor::name).orElse(null),
                    view.admin().map(Donor::email).map(EmailAddress::value).orElse(null),
                    view.action(),
                    view.subjectId().orElse(null),
                    view.details(),
                    view.performedAt());
        }
    }
}
