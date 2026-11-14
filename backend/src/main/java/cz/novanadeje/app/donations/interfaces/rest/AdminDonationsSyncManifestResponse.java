package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.sync.AdminDonationsSyncSnapshot;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunkEntry;

import java.util.List;
import java.util.UUID;

record AdminDonationsSyncManifestResponse(UUID subject, boolean administrator, AdminDonationsSyncSummaryResponse summary, List<SyncChunkEntry> chunks) {

    static AdminDonationsSyncManifestResponse from(AdminDonationsSyncSnapshot snapshot, FirstReceiptYear firstReceiptYear, List<SyncChunkEntry> chunks) {
        return new AdminDonationsSyncManifestResponse(snapshot.subject().value(), snapshot.administrator(), AdminDonationsSyncSummaryResponse.from(snapshot, firstReceiptYear),
                chunks);
    }
}
