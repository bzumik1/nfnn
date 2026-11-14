package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.application.admincopy.AdminDonationsRows;
import cz.novanadeje.app.shared.application.administration.AdministrationChannel;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.Year;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class AdminPaymentsService {

    public static final int DONOR_SEARCH_LIMIT = 20;

    private static final Comparator<PairedPayment> NEWEST_FIRST = Comparator
            .comparing((PairedPayment paired) -> paired.payment().bookedOn()).reversed()
            .thenComparing(paired -> paired.payment().transactionId().value(), Comparator.reverseOrder());

    private final BankPaymentRepository payments;
    private final DonationRepository donations;
    private final DonorRecordRepository donorRecords;
    private final DonationReceiptRepository receipts;
    private final AdminDonationsRows rows;

    public AdminPaymentsService(BankPaymentRepository payments, DonationRepository donations, DonorRecordRepository donorRecords,
                                DonationReceiptRepository receipts, AdminDonationsRows rows) {
        this.payments = payments;
        this.donations = donations;
        this.donorRecords = donorRecords;
        this.receipts = receipts;
        this.rows = rows;
    }

    public AdminPaymentList listUnpaired(PaymentFilter filter) {
        PaymentFilter.Match match = filter.match();
        List<BankPayment> matching = payments.findUnpairedNewestFirst().stream()
                .filter(payment -> match.test(payment, Optional.empty(), false))
                .toList();
        List<AdminPaymentView> page = filter.page(matching).stream()
                .map(payment -> new AdminPaymentView(payment, Optional.empty(), rows.unpaidPayment(payment).version()))
                .toList();
        return new AdminPaymentList(Optional.empty(), List.of(), page, matching.size());
    }

    public AdminPaymentList listPaired(Optional<Year> requested, PaymentFilter filter) {
        return listPaired(requested, filter, AdministrationChannel.BROWSER);
    }

    public AdminPaymentList listPaired(Optional<Year> requested, PaymentFilter filter, AdministrationChannel channel) {
        List<Year> availableYears = donations.findReceivedYearsNewestFirst();
        if (requested.isEmpty() && availableYears.isEmpty()) {
            return new AdminPaymentList(Optional.empty(), availableYears, List.of(), 0);
        }
        LocalDate firstDay = requested.map(year -> year.atDay(1))
                .orElseGet(() -> filter.firstDayNotBefore(availableYears.getLast().atDay(1)));
        LocalDate lastDay = requested.map(year -> year.atDay(year.length()))
                .orElseGet(() -> filter.lastDayNotAfter(availableYears.getFirst().atDay(availableYears.getFirst().length())));
        if (firstDay.isAfter(lastDay)) {
            return new AdminPaymentList(requested, availableYears, List.of(), 0);
        }
        List<Donation> paired = donations.findReceivedOnBetween(firstDay, lastDay).stream()
                .filter(donation -> donation.bankPayment().isPresent())
                .toList();
        Map<BankPaymentId, BankPayment> paymentsById = payments.findByIds(paired.stream().map(donation -> donation.bankPayment().orElseThrow()).toList())
                .stream()
                .collect(Collectors.toMap(BankPayment::id, Function.identity()));
        Map<DonorReference, DonorRecord> donorsById = donorRecords.findByIds(paired.stream().map(Donation::donor).distinct().toList()).stream()
                .collect(Collectors.toMap(DonorRecord::id, Function.identity()));
        Set<DonationId> withReceipt = receipts.findDonationsWithReceipt(paired.stream().map(Donation::id).toList());
        PaymentFilter.Match match = filter.match();
        List<PairedPayment> matching = paired.stream()
                .map(donation -> pairedPayment(paymentsById.get(donation.bankPayment().orElseThrow()), donation,
                        donorsById.get(donation.donor()), withReceipt.contains(donation.id()), channel))
                .filter(candidate -> match.test(candidate.payment(), Optional.of(candidate.donation()), candidate.payerWithheld()))
                .sorted(NEWEST_FIRST)
                .toList();
        List<AdminPaymentView> page = filter.page(matching).stream().map(this::view).toList();
        return new AdminPaymentList(requested, availableYears, page, matching.size());
    }

    private static PairedPayment pairedPayment(BankPayment payment, Donation donation, DonorRecord giver, boolean receiptIssued,
                                               AdministrationChannel channel) {
        boolean payerWithheld = channel == AdministrationChannel.CONNECTED_APPLICATION && giver.isErased();
        return new PairedPayment(payment, new PairedDonationView(donation, giver, receiptIssued), payerWithheld);
    }

    private AdminPaymentView view(PairedPayment paired) {
        String version = rows.paidPayment(paired.payment(), paired.donation().donation(), paired.donation().donor()).version();
        return new AdminPaymentView(paired.payment(), Optional.of(paired.donation()), version, paired.payerWithheld());
    }

    private record PairedPayment(BankPayment payment, PairedDonationView donation, boolean payerWithheld) {
    }

    public List<DonorRecord> searchDonors(String query) {
        String trimmed = query == null ? "" : query.trim();
        if (trimmed.isEmpty()) {
            return List.of();
        }
        return donorRecords.searchByNameOrSymbol(trimmed, DONOR_SEARCH_LIMIT);
    }
}
