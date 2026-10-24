package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;

import java.text.Normalizer;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public record PaymentFilter(String text, LocalDate from, LocalDate to, DonorReference donor, int offset, Integer limit) {

    public static final int MAX_TEXT_LENGTH = 100;
    public static final int MAX_LIMIT = 500;

    private static final Pattern COMBINING_MARKS = Pattern.compile("\\p{M}+");
    private static final Pattern SPACES = Pattern.compile("[\\s\\u00a0\\u202f]+");
    private static final long HELLERS_PER_CROWN = 100;
    private static final Pattern CROWNS = Pattern.compile("(\\d{1,12})(?:[.,](\\d{1,2}))?(?:kc|czk)?");

    public PaymentFilter {
        text = text == null || text.isBlank() ? null : plain(text.trim());
        if (text != null && text.length() > MAX_TEXT_LENGTH) {
            throw new IllegalArgumentException("A payment filter text is at most " + MAX_TEXT_LENGTH + " characters");
        }
        if (offset < 0) {
            throw new IllegalArgumentException("A payment filter offset is not negative");
        }
        if (limit != null && (limit < 1 || limit > MAX_LIMIT)) {
            throw new IllegalArgumentException("A payment filter limit is between 1 and " + MAX_LIMIT);
        }
    }

    public static PaymentFilter none() {
        return new PaymentFilter(null, null, null, null, 0, null);
    }

    boolean matches(AdminPaymentView view) {
        BankPayment payment = view.payment();
        if (from != null && payment.bookedOn().isBefore(from) || to != null && payment.bookedOn().isAfter(to)) {
            return false;
        }
        if (donor != null && view.donation().filter(paired -> paired.donation().donor().equals(donor)).isEmpty()) {
            return false;
        }
        return text == null || searchable(view).anyMatch(value -> plain(value).contains(text))
                || amountMinor(text).filter(amount -> amount == payment.amount().amountMinor()).isPresent();
    }

    LocalDate firstDayNotBefore(LocalDate earliest) {
        return from != null && from.isAfter(earliest) ? from : earliest;
    }

    LocalDate lastDayNotAfter(LocalDate latest) {
        return to != null && to.isBefore(latest) ? to : latest;
    }

    List<AdminPaymentView> page(List<AdminPaymentView> matching) {
        Stream<AdminPaymentView> skipped = matching.stream().skip(offset);
        return (limit == null ? skipped : skipped.limit(limit)).toList();
    }

    private static Stream<String> searchable(AdminPaymentView view) {
        BankPayment payment = view.payment();
        Optional<String> account = payment.sender().map(SenderAccount::display)
                .or(() -> payment.counterpartyAccount().map(number -> payment.counterpartyBankCode().map(code -> number + "/" + code).orElse(number)));
        return Stream.of(Optional.of(String.valueOf(payment.transactionId().value())), payment.variableSymbol(), account, payment.counterpartyName(),
                        payment.messageForRecipient(), view.donation().flatMap(PairedDonationView::donor).map(DonorRecord::name))
                .flatMap(Optional::stream);
    }

    private static Optional<Long> amountMinor(String text) {
        Matcher crowns = CROWNS.matcher(SPACES.matcher(text).replaceAll(""));
        if (!crowns.matches()) {
            return Optional.empty();
        }
        String hellers = crowns.group(2) == null ? "00" : (crowns.group(2) + "0").substring(0, 2);
        return Optional.of(Long.parseLong(crowns.group(1)) * HELLERS_PER_CROWN + Long.parseLong(hellers));
    }

    private static String plain(String value) {
        return COMBINING_MARKS.matcher(Normalizer.normalize(value, Normalizer.Form.NFD)).replaceAll("").toLowerCase(Locale.ROOT);
    }
}
