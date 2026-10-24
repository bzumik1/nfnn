package cz.novanadeje.app.donations.application.admin;

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

    private static final Comparator<AdminPaymentView> NEWEST_FIRST = Comparator
            .comparing((AdminPaymentView view) -> view.payment().bookedOn()).reversed()
            .thenComparing(view -> view.payment().transactionId().value(), Comparator.reverseOrder());

    private final BankPaymentRepository payments;
    private final DonationRepository donations;
    private final DonorRecordRepository donorRecords;
    private final DonationReceiptRepository receipts;

    public AdminPaymentsService(BankPaymentRepository payments, DonationRepository donations, DonorRecordRepository donorRecords,
                                DonationReceiptRepository receipts) {
        this.payments = payments;
        this.donations = donations;
        this.donorRecords = donorRecords;
        this.receipts = receipts;
    }

    public AdminPaymentList listUnpaired(PaymentFilter filter) {
        List<AdminPaymentView> matching = payments.findUnpairedNewestFirst().stream()
                .map(payment -> new AdminPaymentView(payment, Optional.empty()))
                .filter(filter::matches)
                .toList();
        return new AdminPaymentList(Optional.empty(), List.of(), filter.page(matching), matching.size());
    }

    public AdminPaymentList listPaired(Optional<Year> requested, PaymentFilter filter) {
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
        List<AdminPaymentView> matching = paired.stream()
                .map(donation -> new AdminPaymentView(paymentsById.get(donation.bankPayment().orElseThrow()),
                        Optional.of(new PairedDonationView(donation, Optional.ofNullable(donorsById.get(donation.donor())),
                                withReceipt.contains(donation.id())))))
                .filter(filter::matches)
                .sorted(NEWEST_FIRST)
                .toList();
        return new AdminPaymentList(requested, availableYears, filter.page(matching), matching.size());
    }

    public List<DonorRecord> searchDonors(String query) {
        String trimmed = query == null ? "" : query.trim();
        if (trimmed.isEmpty()) {
            return List.of();
        }
        return donorRecords.searchByNameOrSymbol(trimmed, DONOR_SEARCH_LIMIT);
    }
}
