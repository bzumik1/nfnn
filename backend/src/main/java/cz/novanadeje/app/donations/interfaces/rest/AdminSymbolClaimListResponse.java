package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.admin.SymbolClaimView;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

record AdminSymbolClaimListResponse(List<Item> items) {

    static AdminSymbolClaimListResponse from(List<SymbolClaimView> views) {
        return new AdminSymbolClaimListResponse(views.stream().map(Item::from).toList());
    }

    record Item(UUID id, UUID donorId, String donorName, String account, String variableSymbol, SymbolClaimAnswer answer, Instant answeredAt,
                long donationCount) {

        static Item from(SymbolClaimView view) {
            return new Item(
                    view.claim().id().value(),
                    view.claim().donor().value(),
                    view.donor().map(DonorRecord::name).orElse(null),
                    view.claim().account().display(),
                    view.claim().symbol().value(),
                    view.claim().answer(),
                    view.claim().answeredAt(),
                    view.donationCount());
        }
    }
}
