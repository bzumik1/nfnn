package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.application.bankaccount.DonorBankAccountsService;
import cz.novanadeje.app.donations.application.overview.DonationOverview;
import cz.novanadeje.app.donations.application.overview.DonorDonationsService;
import cz.novanadeje.app.donations.application.pairing.PairingLock;
import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordNotFound;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountAlreadyConnected;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkHasReceipt;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkNotFound;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Transactional
public class AdminDonorAccountsService {

    static final String DISCONNECT_ACTION = "DISCONNECT_SENDER_ACCOUNT";
    static final String RECONNECT_ACTION = "RECONNECT_SENDER_ACCOUNT";
    static final String REMOVE_ACTION = "REMOVE_SENDER_ACCOUNT_LINK";

    private static final Logger log = LoggerFactory.getLogger(AdminDonorAccountsService.class);

    private final DonorRecordRepository donorRecords;
    private final DonationRepository donations;
    private final DonationReceiptRepository receipts;
    private final SymbolClaimRepository claims;
    private final DonorBankAccountsService bankAccounts;
    private final DonorDonationsService donorDonations;
    private final PairingLock lock;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public AdminDonorAccountsService(DonorRecordRepository donorRecords, DonationRepository donations, DonationReceiptRepository receipts,
                                     SymbolClaimRepository claims, DonorBankAccountsService bankAccounts, DonorDonationsService donorDonations,
                                     PairingLock lock, ApplicationEventPublisher events, Clock clock) {
        this.donorRecords = donorRecords;
        this.donations = donations;
        this.receipts = receipts;
        this.claims = claims;
        this.bankAccounts = bankAccounts;
        this.donorDonations = donorDonations;
        this.lock = lock;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public AdminDonorView view(DonorReference donor) {
        DonorRecord record = donorRecords.findById(donor).orElseThrow(() -> new DonorRecordNotFound(donor));
        DonationOverview overview = donorDonations.listDonations(donor, Optional.empty());
        Map<DonationId, LocalDate> receivedDays = overview.list().items().stream()
                .collect(Collectors.toMap(Donation::id, Donation::receivedOn));
        return new AdminDonorView(record, bankAccounts.listBankAccounts(donor), overview, receipts.findByDonorNewestFirst(donor), receivedDays);
    }

    public void disconnect(UUID adminId, DonorReference donor, SenderAccountLinkId linkId) {
        DonorRecord record = recordOf(donor);
        Instant now = clock.instant();
        SenderAccountLink link = record.disconnectSenderAccount(linkId, FoundationCalendar.today(clock), now);
        donorRecords.saveSenderAccountLink(donor, link);
        events.publishEvent(new AdminActionPerformed(adminId, DISCONNECT_ACTION, Optional.of(donor.value()),
                "Párování z účtu " + link.account().display() + " (propojení " + linkId + ") dárce " + donor + " vypnuto", now));
        log.info("Admin {} disconnected sender account link {} of donor {}", adminId, linkId, donor);
    }

    public void reconnect(UUID adminId, DonorReference donor, SenderAccountLinkId linkId) {
        DonorRecord record = recordOf(donor);
        Instant now = clock.instant();
        SenderAccountLink awaiting = record.reconnectSenderAccount(linkId, FoundationCalendar.today(clock), now);
        if (!donorRecords.saveSenderAccountLink(donor, awaiting)) {
            throw new SenderAccountAlreadyConnected(linkId);
        }
        events.publishEvent(new AdminActionPerformed(adminId, RECONNECT_ACTION, Optional.of(donor.value()),
                "Párování z účtu " + awaiting.account().display() + " (propojení " + linkId + ") dárce " + donor
                        + " znovu zapnuto jako propojení " + awaiting.id() + ", čeká na platbu se symbolem", now));
        log.info("Admin {} asked to reconnect sender account link {} of donor {} as {}", adminId, linkId, donor, awaiting.id());
    }

    public void remove(UUID adminId, DonorReference donor, SenderAccountLinkId linkId) {
        lock.acquire();
        Instant now = clock.instant();
        DonorRecord record = recordOf(donor);
        SenderAccountLink link = record.senderAccountLink(linkId).orElseThrow(() -> new SenderAccountLinkNotFound(linkId));
        receipts.lockDonor(donor);
        List<Donation> paired = donations.findBySenderAccountLink(linkId);
        if (ReceiptCoverage.anyReceiptCovers(receipts, donor, paired)) {
            throw new SenderAccountLinkHasReceipt(linkId);
        }
        paired.forEach(donation -> donations.delete(donation.id()));
        List<SymbolClaim> answers = claims.findByDonor(donor).stream().filter(claim -> claim.account().equals(link.account())).toList();
        answers.forEach(claim -> claims.delete(claim.id()));
        record.removeSenderAccountLink(linkId);
        donorRecords.deleteSenderAccountLink(donor, linkId);
        events.publishEvent(new AdminActionPerformed(adminId, REMOVE_ACTION, Optional.of(donor.value()),
                "Účet " + link.account().display() + " (propojení " + linkId + ", " + link.status() + ") odebrán dárci " + donor + "; smazané dary spárované přes něj: "
                        + paired.size() + ", smazané odpovědi o starších symbolech: " + answers.size(), now));
        log.info("Admin {} removed sender account link {} of donor {}: {} donations and {} symbol claims deleted", adminId, linkId, donor,
                paired.size(), answers.size());
    }

    private DonorRecord recordOf(DonorReference donor) {
        return donorRecords.findById(donor).orElseThrow(() -> new DonorRecordNotFound(donor));
    }
}
