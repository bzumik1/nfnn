package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.application.pairing.PairingLock;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimHasReceipt;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimNotFound;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimStillConfirmed;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional
public class AdminSymbolClaimsService {

    static final String REVERSE_ACTION = "REVERSE_SYMBOL_CLAIM";
    static final String RESET_ACTION = "RESET_SYMBOL_CLAIM";

    private static final Logger log = LoggerFactory.getLogger(AdminSymbolClaimsService.class);

    private final SymbolClaimRepository claims;
    private final DonationRepository donations;
    private final DonorRecordRepository donorRecords;
    private final DonationReceiptRepository receipts;
    private final PairingLock lock;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public AdminSymbolClaimsService(SymbolClaimRepository claims, DonationRepository donations, DonorRecordRepository donorRecords,
                                    DonationReceiptRepository receipts, PairingLock lock, ApplicationEventPublisher events, Clock clock) {
        this.claims = claims;
        this.donations = donations;
        this.donorRecords = donorRecords;
        this.receipts = receipts;
        this.lock = lock;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<SymbolClaimView> list() {
        List<SymbolClaim> all = claims.findAllNewestFirst();
        Map<DonorReference, DonorRecord> donorsById = donorRecords.findByIds(all.stream().map(SymbolClaim::donor).distinct().toList()).stream()
                .collect(Collectors.toMap(DonorRecord::id, Function.identity()));
        Map<SymbolClaimId, Long> counts = donations.countBySymbolClaims(all.stream().map(SymbolClaim::id).toList());
        return all.stream()
                .map(claim -> new SymbolClaimView(claim, Optional.ofNullable(donorsById.get(claim.donor())), counts.getOrDefault(claim.id(), 0L)))
                .toList();
    }

    public void reverse(UUID adminId, SymbolClaimId claimId) {
        lock.acquire();
        Instant now = clock.instant();
        SymbolClaim claim = claims.findById(claimId).orElseThrow(() -> new SymbolClaimNotFound(claimId));
        SymbolClaim reversed = claim.reverse(now);
        receipts.lockDonor(claim.donor());
        List<Donation> paired = donations.findBySymbolClaim(claimId);
        if (ReceiptCoverage.anyReceiptCovers(receipts, claim.donor(), paired)) {
            throw new SymbolClaimHasReceipt(claimId);
        }
        paired.forEach(donation -> donations.delete(donation.id()));
        claims.save(reversed);
        events.publishEvent(new AdminActionPerformed(adminId, REVERSE_ACTION, Optional.of(claimId.value()),
                "Confirmed symbol claim " + claimId + " of donor " + claim.donor() + " for symbol " + claim.symbol().value()
                        + " reversed to DECLINED; " + paired.size() + " donation(s) paired through it deleted", now));
        log.info("Admin {} reversed symbol claim {} of donor {}: {} donations deleted", adminId, claimId, claim.donor(), paired.size());
    }

    public void reset(UUID adminId, SymbolClaimId claimId) {
        lock.acquire();
        Instant now = clock.instant();
        SymbolClaim claim = claims.findById(claimId).orElseThrow(() -> new SymbolClaimNotFound(claimId));
        if (claim.isConfirmed()) {
            throw new SymbolClaimStillConfirmed(claimId);
        }
        claims.delete(claimId);
        events.publishEvent(new AdminActionPerformed(adminId, RESET_ACTION, Optional.of(claimId.value()),
                "Declined symbol claim " + claimId + " of donor " + claim.donor() + " for symbol " + claim.symbol().value()
                        + " deleted; the account may ask the donor again", now));
        log.info("Admin {} deleted declined symbol claim {} of donor {}", adminId, claimId, claim.donor());
    }
}
