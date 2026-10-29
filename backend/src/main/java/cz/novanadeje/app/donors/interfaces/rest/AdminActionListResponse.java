package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdminActionView;
import cz.novanadeje.app.donors.application.AdministratorActivity;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.shared.domain.EmailAddress;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

record AdminActionListResponse(List<Item> items, boolean hasMore) {

    static AdminActionListResponse from(AdministratorActivity activity, AdminActionSummaries summaries, Locale locale) {
        return new AdminActionListResponse(activity.items().stream().map(view -> Item.from(view, summaries.summary(view, locale))).toList(),
                activity.hasMore());
    }

    record Item(UUID id, UUID adminId, String adminName, String adminEmail, String action, UUID subjectId, UUID donorId, String summary,
                String details, Instant performedAt, String client) {

        static Item from(AdminActionView view, String summary) {
            return new Item(
                    view.id(),
                    view.adminId(),
                    view.admin().map(Donor::name).orElse(null),
                    view.admin().map(Donor::email).map(EmailAddress::value).orElse(null),
                    view.action(),
                    view.subjectId().orElse(null),
                    view.donorId().orElse(null),
                    summary,
                    view.details(),
                    view.performedAt(),
                    view.client().orElse(null));
        }
    }
}
