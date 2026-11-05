package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.sync.AdminDonationsSyncSnapshot;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.interfaces.rest.AdminDonorDetailResponse.AdminDonorRecordResponse;
import cz.novanadeje.app.donations.interfaces.rest.AdminReceiptListResponse.AdminReceiptItemResponse;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;

@Component
class AdminDonationsSyncProjection {

    static final String PAYMENTS = "payments:";
    static final String DONATIONS = "donations:";
    static final String DONOR_RECORDS = "donor-records:";
    static final String LINKS = "links:";
    static final String RECEIPTS = "receipts:";
    static final String SYMBOL_CLAIMS = "symbol-claims";
    static final String IMPORT_STATE = "import-state";
    static final String REPORT_SETTINGS = "report-settings";

    private static final Comparator<SenderAccountLink> OLDER_LINK_FIRST = Comparator.comparing(SenderAccountLink::createdAt)
            .thenComparing(link -> link.id().value());

    private static final Comparator<DonorRecord> OLDER_REGISTRATION_FIRST = Comparator.comparing(DonorRecord::registeredAt)
            .thenComparing(record -> record.id().value());

    private final JsonMapper json;

    AdminDonationsSyncProjection(JsonMapper json) {
        this.json = json;
    }

    List<SyncChunk> chunksOf(AdminDonationsSyncSnapshot snapshot) {
        SortedMap<String, List<Object>> chunks = new TreeMap<>();
        snapshot.payments().forEach(payment -> rowsOf(chunks, PAYMENTS + YearMonth.from(payment.bookedOn())).add(AdminSyncRows.PaymentRow.from(payment)));
        snapshot.donations().forEach(donation -> rowsOf(chunks, DONATIONS + YearMonth.from(donation.receivedOn()))
                .add(AdminSyncRows.DonationRow.from(donation)));
        snapshot.donorRecords().stream().sorted(OLDER_REGISTRATION_FIRST).forEach(record -> {
            YearMonth registered = SyncChunk.monthOf(record.registeredAt());
            rowsOf(chunks, DONOR_RECORDS + registered).add(AdminDonorRecordResponse.from(record));
            linksOf(record).forEach(link -> rowsOf(chunks, LINKS + registered).add(AdminSyncRows.LinkRow.from(record, link)));
        });
        snapshot.symbolClaims().forEach(claim -> rowsOf(chunks, SYMBOL_CLAIMS).add(AdminSyncRows.SymbolClaimRow.from(claim)));
        snapshot.receipts().forEach(receipt -> rowsOf(chunks, RECEIPTS + DonorSyncProjection.yearOf(receipt).getValue())
                .add(AdminReceiptItemResponse.from(receipt)));
        snapshot.importState().ifPresent(state -> rowsOf(chunks, IMPORT_STATE).add(ImportStateResponse.from(state)));
        snapshot.report().ifPresent(report -> rowsOf(chunks, REPORT_SETTINGS).add(AdminSyncRows.ReportSettingsRow.from(report)));
        return SyncChunk.allOf(chunks, json);
    }

    private static List<SenderAccountLink> linksOf(DonorRecord record) {
        return record.senderAccountLinks().stream().sorted(OLDER_LINK_FIRST).toList();
    }

    private static List<Object> rowsOf(SortedMap<String, List<Object>> chunks, String id) {
        return chunks.computeIfAbsent(id, ignored -> new ArrayList<>());
    }
}
