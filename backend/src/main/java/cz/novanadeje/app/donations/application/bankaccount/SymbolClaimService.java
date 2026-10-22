package cz.novanadeje.app.donations.application.bankaccount;

import cz.novanadeje.app.donations.application.pairing.ConfirmedSymbolPairing;
import cz.novanadeje.app.donations.application.pairing.PairingLock;
import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkNotFound;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAlreadyAnswered;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.donor.SymbolOfferNotAvailable;
import cz.novanadeje.app.donations.domain.pairing.SymbolClaimOffer;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.Year;
import java.util.List;

@Service
public class SymbolClaimService {

    private static final Logger log = LoggerFactory.getLogger(SymbolClaimService.class);

    private final DonorRecordRepository donorRecords;
    private final DonationRepository donations;
    private final SymbolClaimRepository claims;
    private final DonationReceiptRepository receipts;
    private final SymbolClaimOffers offers;
    private final PaymentPairingService pairing;
    private final PairingLock lock;
    private final FirstReceiptYear firstYear;
    private final Clock clock;

    public SymbolClaimService(DonorRecordRepository donorRecords, DonationRepository donations, SymbolClaimRepository claims,
                              DonationReceiptRepository receipts, SymbolClaimOffers offers, PaymentPairingService pairing, PairingLock lock,
                              FirstReceiptYear firstYear, Clock clock) {
        this.donorRecords = donorRecords;
        this.donations = donations;
        this.claims = claims;
        this.receipts = receipts;
        this.offers = offers;
        this.pairing = pairing;
        this.lock = lock;
        this.firstYear = firstYear;
        this.clock = clock;
    }

    @Transactional
    public SymbolClaimConfirmation confirm(DonorReference donor, SenderAccountLinkId linkId, VariableSymbol symbol) {
        SymbolClaim claim = answer(donor, linkId, symbol, SymbolClaimAnswer.CONFIRMED);
        ConfirmedSymbolPairing paired = pairing.pairConfirmedSymbol(claim, claim.answeredAt());
        List<Year> changedYearlyReceipts = paired.years().stream()
                .filter(firstYear::admits)
                .filter(year -> receipts.findActiveForYear(donor, year).isPresent())
                .sorted()
                .toList();
        log.info("Donor {} confirmed symbol claim {} at sender account link {}: {} payments paired", donor, claim.id(), linkId, paired.count());
        return new SymbolClaimConfirmation(paired.count(), changedYearlyReceipts);
    }

    @Transactional
    public void decline(DonorReference donor, SenderAccountLinkId linkId, VariableSymbol symbol) {
        SymbolClaim claim = answer(donor, linkId, symbol, SymbolClaimAnswer.DECLINED);
        log.info("Donor {} declined symbol claim {} at sender account link {}", donor, claim.id(), linkId);
    }

    private SymbolClaim answer(DonorReference donor, SenderAccountLinkId linkId, VariableSymbol symbol, SymbolClaimAnswer answer) {
        lock.acquire();
        Instant now = clock.instant();
        DonorRecord record = donorRecords.findById(donor).orElseThrow(() -> new SenderAccountLinkNotFound(linkId));
        SenderAccountLink link = record.senderAccountLink(linkId).orElseThrow(() -> new SenderAccountLinkNotFound(linkId));
        if (claims.findByDonor(donor).stream().anyMatch(claim -> claim.answers(link.account(), symbol))) {
            throw new SymbolClaimAlreadyAnswered(linkId);
        }
        SymbolClaimOffer offer = offers.offerAt(record, link, donations.findByDonorNewestFirst(donor),
                        donorRecords.findBySenderAccount(link.account()), FoundationCalendar.today(clock))
                .filter(offered -> offered.symbol().equals(symbol))
                .orElseThrow(() -> new SymbolOfferNotAvailable(linkId));
        SymbolClaim claim = SymbolClaim.answer(SymbolClaimId.newId(now), donor, offer.account(), offer.symbol(), answer, now);
        if (!claims.saveIfAbsent(claim)) {
            throw new SymbolClaimAlreadyAnswered(linkId);
        }
        return claim;
    }
}
