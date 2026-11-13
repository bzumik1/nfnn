package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.admincopy.AdminDonationsRows;
import cz.novanadeje.app.donations.application.admincopy.AdminSyncRows.DonationRow;
import cz.novanadeje.app.donations.application.sync.AdminDonationsSyncSnapshot;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.report.StoredReportSettings;
import cz.novanadeje.app.donations.interfaces.rest.AdminDonorDetailResponse.AdminDonorRecordResponse;
import cz.novanadeje.app.donations.interfaces.rest.AdminReceiptListResponse.AdminReceiptItemResponse;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunkEntry;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunkRows;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.time.YearMonth;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

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
            .thenComparing(link -> link.id().value().toString());

    private static final Comparator<DonorRecord> OLDER_REGISTRATION_FIRST = Comparator.comparing(DonorRecord::registeredAt)
            .thenComparing(record -> record.id().value().toString());

    private final JsonMapper json;
    private final AdminDonationsRows rows;

    AdminDonationsSyncProjection(JsonMapper json, AdminDonationsRows rows) {
        this.json = json;
        this.rows = rows;
    }

    List<SyncChunk> chunksOf(AdminDonationsSyncSnapshot snapshot) {
        return rowsOf(snapshot, SyncChunkRows.every()).chunks(json);
    }

    List<SyncChunkEntry> entriesOf(AdminDonationsSyncSnapshot snapshot) {
        return rowsOf(snapshot, SyncChunkRows.every()).entries(json);
    }

    List<SyncChunk> chunksOf(AdminDonationsSyncSnapshot snapshot, List<String> ids) {
        return rowsOf(snapshot, SyncChunkRows.only(ids)).chunks(json);
    }

    private SyncChunkRows rowsOf(AdminDonationsSyncSnapshot snapshot, SyncChunkRows chunks) {
        Map<DonorReference, DonorRecord> giversById = snapshot.donorRecords().stream().collect(Collectors.toMap(DonorRecord::id, Function.identity()));
        Map<BankPaymentId, Donation> gifts = snapshot.donations().stream().filter(donation -> donation.bankPayment().isPresent())
                .collect(Collectors.toMap(donation -> donation.bankPayment().orElseThrow(), Function.identity()));
        snapshot.payments().forEach(payment -> chunks.add(PAYMENTS + YearMonth.from(payment.bookedOn()),
                () -> Optional.ofNullable(gifts.get(payment.id())).map(gift -> rows.paidPayment(payment, gift, giversById.get(gift.donor())))
                        .orElseGet(() -> rows.unpaidPayment(payment))));
        snapshot.donations().forEach(donation -> chunks.add(DONATIONS + YearMonth.from(donation.receivedOn()), () -> DonationRow.from(donation)));
        snapshot.donorRecords().stream().sorted(OLDER_REGISTRATION_FIRST).forEach(record -> {
            YearMonth registered = SyncChunk.monthOf(record.registeredAt());
            chunks.add(DONOR_RECORDS + registered, () -> AdminDonorRecordResponse.from(record));
            linksOf(record).forEach(link -> chunks.add(LINKS + registered, () -> rows.link(record, link)));
        });
        snapshot.symbolClaims().forEach(claim -> chunks.add(SYMBOL_CLAIMS, () -> rows.symbolClaim(claim)));
        snapshot.receipts().forEach(receipt -> chunks.add(RECEIPTS + receipt.certifiedYear().getValue(), () -> AdminReceiptItemResponse.from(receipt)));
        snapshot.importState().ifPresent(state -> chunks.add(IMPORT_STATE, () -> ImportStateRow.from(state)));
        snapshot.report().ifPresent(report -> chunks.add(REPORT_SETTINGS, () -> rows.reportSettings(
                new StoredReportSettings(report.settings(), report.changedAt()), report.sentReports(), report.nextReport(), report.lastEndedMonth())));
        return chunks;
    }

    private static List<SenderAccountLink> linksOf(DonorRecord record) {
        return record.senderAccountLinks().stream().sorted(OLDER_LINK_FIRST).toList();
    }

}
