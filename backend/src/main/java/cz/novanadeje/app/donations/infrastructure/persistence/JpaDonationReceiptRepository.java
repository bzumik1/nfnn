package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import org.springframework.stereotype.Repository;

import java.time.Year;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Repository
class JpaDonationReceiptRepository implements DonationReceiptRepository {

    private final DonationReceiptJpaRepository jpa;

    JpaDonationReceiptRepository(DonationReceiptJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Optional<DonationReceipt> findActiveForDonation(DonationId donation) {
        return jpa.findByDonationIdAndSupersededAtIsNull(donation.value()).map(DonationReceiptJpaEntity::toDomain);
    }

    @Override
    public Optional<DonationReceipt> findActiveForYear(DonorReference donor, Year year) {
        return jpa.findByDonorIdAndReceiptYearAndSupersededAtIsNull(donor.value(), year.getValue()).map(DonationReceiptJpaEntity::toDomain);
    }

    @Override
    public void save(DonationReceipt receipt) {
        jpa.findById(receipt.id().value()).ifPresentOrElse(
                stored -> stored.supersededAs(receipt),
                () -> jpa.save(DonationReceiptJpaEntity.fromDomain(receipt)));
        jpa.flush();
    }

    @Override
    public boolean existsForDonation(DonationId donation) {
        return jpa.existsByDonationId(donation.value());
    }

    @Override
    public Set<DonationId> findDonationsWithReceipt(Collection<DonationId> donations) {
        if (donations.isEmpty()) {
            return Set.of();
        }
        return jpa.findDonationIdsWithReceipt(donations.stream().map(DonationId::value).collect(Collectors.toSet())).stream()
                .map(DonationId::new)
                .collect(Collectors.toUnmodifiableSet());
    }

    @Override
    public Map<DonationId, ReceiptNumber> findActiveSingleNumbersFor(DonorReference donor) {
        return jpa.findByDonorIdAndKindAndSupersededAtIsNull(donor.value(), ReceiptKind.SINGLE).stream()
                .collect(Collectors.toUnmodifiableMap(row -> new DonationId(row.getDonationId()), row -> new ReceiptNumber(row.getNumber())));
    }

    @Override
    public long nextSerial() {
        return jpa.nextSerial();
    }

    @Override
    public void lockDonor(DonorReference donor) {
        jpa.lockDonorRecord(donor.value());
    }
}
