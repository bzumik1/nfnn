package cz.novanadeje.app.donations.application.bankaccount;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountAlreadyConnected;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkNotFound;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class DonorBankAccountsService {

    private static final Logger log = LoggerFactory.getLogger(DonorBankAccountsService.class);
    private static final Comparator<SenderAccountLink> LIVE_FIRST_NEWEST_FIRST = Comparator
            .comparing((SenderAccountLink link) -> !link.isLive())
            .thenComparing(SenderAccountLink::createdAt, Comparator.reverseOrder());

    private final DonorRecordRepository donorRecords;
    private final DonationRepository donations;
    private final ExcludedSenderAccounts excluded;
    private final Clock clock;

    public DonorBankAccountsService(DonorRecordRepository donorRecords, DonationRepository donations, ExcludedSenderAccounts excluded,
                                    Clock clock) {
        this.donorRecords = donorRecords;
        this.donations = donations;
        this.excluded = excluded;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<BankAccountView> listBankAccounts(DonorReference donor) {
        Optional<DonorRecord> record = donorRecords.findById(donor);
        if (record.isEmpty()) {
            return List.of();
        }
        Map<SenderAccountLinkId, List<Donation>> byLink = donations.findByDonorNewestFirst(donor).stream()
                .filter(Donation::isReceived)
                .filter(donation -> donation.pairedThrough().isPresent())
                .collect(Collectors.groupingBy(donation -> donation.pairedThrough().orElseThrow()));
        return record.get().senderAccountLinks().stream()
                .sorted(LIVE_FIRST_NEWEST_FIRST)
                .map(link -> view(donor, link, byLink.getOrDefault(link.id(), List.of())))
                .toList();
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

    private BankAccountView view(DonorReference donor, SenderAccountLink link, List<Donation> paired) {
        Money total = paired.stream().map(Donation::amount).reduce(Money.zero(Currency.CZK), Money::plus);
        Optional<LocalDate> last = paired.stream().map(Donation::receivedOn).max(Comparator.naturalOrder());
        boolean pairingExcluded = excluded.excludes(link.account());
        return new BankAccountView(link, paired.size(), total, last, link.isActive() && !pairingExcluded && isShared(donor, link),
                pairingExcluded);
    }

    private boolean isShared(DonorReference donor, SenderAccountLink link) {
        return donorRecords.findBySenderAccount(link.account()).stream()
                .anyMatch(other -> !other.id().equals(donor) && other.usesSenderAccount(link.account()));
    }
}
