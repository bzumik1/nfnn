package cz.novanadeje.app.donations.application.bankaccount;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountAlreadyConnected;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkNotFound;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.pairing.SymbolClaimOffer;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.BinaryOperator;
import java.util.stream.Collectors;

@Service
public class DonorBankAccountsService {

    private static final Logger log = LoggerFactory.getLogger(DonorBankAccountsService.class);
    private static final Comparator<SenderAccountLink> LIVE_FIRST_NEWEST_FIRST = Comparator
            .comparing((SenderAccountLink link) -> !link.isLive())
            .thenComparing(SenderAccountLink::createdAt, Comparator.reverseOrder());

    private final DonorRecordRepository donorRecords;
    private final DonationRepository donations;
    private final BankPaymentRepository payments;
    private final SymbolClaimRepository claims;
    private final SymbolClaimOffers offers;
    private final ExcludedSenderAccounts excluded;
    private final Clock clock;

    public DonorBankAccountsService(DonorRecordRepository donorRecords, DonationRepository donations, BankPaymentRepository payments,
                                    SymbolClaimRepository claims, SymbolClaimOffers offers, ExcludedSenderAccounts excluded, Clock clock) {
        this.donorRecords = donorRecords;
        this.donations = donations;
        this.payments = payments;
        this.claims = claims;
        this.offers = offers;
        this.excluded = excluded;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<BankAccountView> listBankAccounts(DonorReference donor) {
        Optional<DonorRecord> found = donorRecords.findById(donor);
        if (found.isEmpty()) {
            return List.of();
        }
        DonorRecord record = found.get();
        LocalDate today = FoundationCalendar.today(clock);
        List<Donation> donorDonations = donations.findByDonorNewestFirst(donor);
        Map<SenderAccountLinkId, List<Donation>> byLink = donorDonations.stream()
                .filter(Donation::isReceived)
                .filter(donation -> donation.pairedBy().filter(PairingMethod.SENDER_ACCOUNT::equals).isPresent())
                .filter(donation -> donation.pairedThrough().isPresent())
                .collect(Collectors.groupingBy(donation -> donation.pairedThrough().orElseThrow()));
        Map<SenderAccount, List<VariableSymbol>> confirmedSymbols = claims.findByDonor(donor).stream()
                .filter(SymbolClaim::isConfirmed)
                .collect(Collectors.groupingBy(SymbolClaim::account, Collectors.mapping(SymbolClaim::symbol, Collectors.toList())));
        Map<SenderAccount, LocalDate> verificationDays = verificationDays(donorDonations);
        Map<SenderAccount, List<DonorRecord>> owners = new HashMap<>();
        Set<SenderAccount> listed = new HashSet<>();
        List<BankAccountView> views = new ArrayList<>();
        for (SenderAccountLink link : record.senderAccountLinks().stream().sorted(LIVE_FIRST_NEWEST_FIRST).toList()) {
            SenderAccount account = link.account();
            boolean pairingExcluded = excluded.excludes(account);
            boolean pairing = link.isActive() && !pairingExcluded;
            List<DonorRecord> accountOwners = pairing ? owners.computeIfAbsent(account, donorRecords::findBySenderAccount) : List.of();
            boolean shared = pairing && isShared(donor, account, accountOwners);
            Optional<SymbolClaimOffer> offer = pairing && !shared && verificationDays.containsKey(account)
                    ? offers.offerAt(record, link, donorDonations, accountOwners, today)
                    : Optional.empty();
            List<VariableSymbol> confirmed = listed.add(account) ? confirmedSymbols.getOrDefault(account, List.of()) : List.of();
            views.add(view(link, byLink.getOrDefault(link.id(), List.of()), shared, pairingExcluded, offer, confirmed,
                    Optional.ofNullable(verificationDays.get(account))));
        }
        return List.copyOf(views);
    }

    @Transactional
    public void disconnect(DonorReference donor, SenderAccountLinkId linkId) {
        DonorRecord record = donorRecords.findById(donor).orElseThrow(() -> new SenderAccountLinkNotFound(linkId));
        Instant now = clock.instant();
        SenderAccountLink link = record.disconnectSenderAccount(linkId, FoundationCalendar.today(clock), now);
        donorRecords.saveSenderAccountLink(donor, link);
        log.info("Donor {} disconnected sender account link {}", donor, linkId);
    }

    @Transactional
    public void reconnect(DonorReference donor, SenderAccountLinkId linkId) {
        DonorRecord record = donorRecords.findById(donor).orElseThrow(() -> new SenderAccountLinkNotFound(linkId));
        SenderAccountLink awaiting = record.reconnectSenderAccount(linkId, FoundationCalendar.today(clock), clock.instant());
        if (!donorRecords.saveSenderAccountLink(donor, awaiting)) {
            throw new SenderAccountAlreadyConnected(linkId);
        }
        log.info("Donor {} asked to reconnect sender account link {} as {}", donor, linkId, awaiting.id());
    }

    private Map<SenderAccount, LocalDate> verificationDays(List<Donation> donorDonations) {
        Set<BankPaymentId> verifications = SymbolClaimOffers.verificationPayments(donorDonations);
        if (verifications.isEmpty()) {
            return Map.of();
        }
        return payments.findByIds(verifications).stream()
                .filter(payment -> payment.sender().isPresent())
                .collect(Collectors.toMap(payment -> payment.sender().orElseThrow(), BankPayment::bookedOn,
                        BinaryOperator.maxBy(Comparator.naturalOrder())));
    }

    private static BankAccountView view(SenderAccountLink link, List<Donation> paired, boolean shared, boolean pairingExcluded,
                                        Optional<SymbolClaimOffer> offer, List<VariableSymbol> confirmedSymbols,
                                        Optional<LocalDate> verificationPaymentOn) {
        Money total = paired.stream().map(Donation::amount).reduce(Money.zero(Currency.CZK), Money::plus);
        Optional<LocalDate> last = paired.stream().map(Donation::receivedOn).max(Comparator.naturalOrder());
        return new BankAccountView(link, paired.size(), total, last, shared, pairingExcluded, offer, confirmedSymbols, verificationPaymentOn);
    }

    private static boolean isShared(DonorReference donor, SenderAccount account, List<DonorRecord> owners) {
        return owners.stream().anyMatch(other -> !other.id().equals(donor) && other.usesSenderAccount(account));
    }
}
