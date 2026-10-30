package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptPage;
import cz.novanadeje.app.donations.domain.receipt.ReceiptQuery;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.Year;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Repository
class JpaDonationReceiptRepository implements DonationReceiptRepository {

    private static final Sort NEWEST_ISSUE_FIRST = Sort.by(Sort.Order.desc("issuedAt"), Sort.Order.desc("number"));

    private final IssuedReceiptJpaRepository jpa;

    JpaDonationReceiptRepository(IssuedReceiptJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Optional<DonationReceipt> findById(DonationReceiptId id) {
        return jpa.findById(id.value()).map(IssuedReceiptJpaEntity::toDomain);
    }

    @Override
    public Optional<DonationReceipt> findActiveForDonation(DonationId donation) {
        return jpa.findByDonationIdAndStatus(donation.value(), ReceiptStatus.ACTIVE).map(IssuedReceiptJpaEntity::toDomain);
    }

    @Override
    public Optional<DonationReceipt> findActiveForYear(DonorReference donor, Year year) {
        return jpa.findByDonorIdAndReceiptYearAndStatus(donor.value(), year.getValue(), ReceiptStatus.ACTIVE)
                .map(IssuedReceiptJpaEntity::toDomain);
    }

    @Override
    public void save(DonationReceipt receipt) {
        jpa.findById(receipt.id().value()).ifPresentOrElse(
                stored -> stored.changedAs(receipt),
                () -> jpa.save(IssuedReceiptJpaEntity.fromDomain(receipt)));
        jpa.flush();
    }

    @Override
    public boolean existsForDonation(DonationId donation) {
        return jpa.existsByDonationId(donation.value());
    }

    @Override
    public boolean existsYearlyIssuedSince(DonorReference donor, Year year, Instant since) {
        return jpa.existsByDonorIdAndKindAndReceiptYearAndIssuedAtGreaterThanEqual(donor.value(), ReceiptKind.YEARLY, year.getValue(), since);
    }

    @Override
    public long countIssuedAfter(DonorReference donor, Instant after) {
        return jpa.countByDonorIdAndIssuedAtAfter(donor.value(), after);
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
        return jpa.findByDonorIdAndKindAndStatus(donor.value(), ReceiptKind.SINGLE, ReceiptStatus.ACTIVE).stream()
                .collect(Collectors.toUnmodifiableMap(row -> new DonationId(row.getDonationId()), row -> new ReceiptNumber(row.getNumber())));
    }

    @Override
    public List<DonationReceipt> findByDonorNewestFirst(DonorReference donor) {
        return jpa.findByDonorIdOrderByIssuedAtDescNumberDesc(donor.value()).stream().map(IssuedReceiptJpaEntity::toDomain).toList();
    }

    @Override
    public boolean showsSignatureImage(DonorReference donor, ContentDigest image) {
        return jpa.existsByDonorIdAndSignatureImageSha256(donor.value(), image.value());
    }

    @Override
    public boolean anyShowsSignatureImage(ContentDigest image) {
        return jpa.existsBySignatureImageSha256(image.value());
    }

    @Override
    public ReceiptPage findNewestFirst(ReceiptQuery query) {
        Pageable page = PageRequest.of(query.page(), query.limit(), NEWEST_ISSUE_FIRST);
        Page<IssuedReceiptJpaEntity> found = query.issuedIn()
                .map(year -> query.donor()
                        .map(donor -> jpa.findByDonorIdAndIssuedOnBetween(donor.value(), year.atDay(1), year.atMonth(12).atEndOfMonth(), page))
                        .orElseGet(() -> jpa.findByIssuedOnBetween(year.atDay(1), year.atMonth(12).atEndOfMonth(), page)))
                .orElseGet(() -> query.donor().map(donor -> jpa.findByDonorId(donor.value(), page)).orElseGet(() -> jpa.findAllBy(page)));
        return new ReceiptPage(found.stream().map(IssuedReceiptJpaEntity::toDomain).toList(), found.getTotalElements());
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
