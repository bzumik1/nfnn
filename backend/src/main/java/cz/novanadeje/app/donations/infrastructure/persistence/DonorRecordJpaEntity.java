package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.LearnedSenderAccount;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "donor_record")
public class DonorRecordJpaEntity {

    @Id
    @Column(name = "donor_id")
    private UUID donorId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 16)
    private DonorType type;

    @Column(name = "name", nullable = false, length = DonorRecord.MAX_NAME_LENGTH)
    private String name;

    @Column(name = "company_identifier", length = DonorRecord.COMPANY_IDENTIFIER_LENGTH)
    private String companyIdentifier;

    @Column(name = "street", nullable = false, length = PostalAddress.MAX_STREET_LENGTH)
    private String street;

    @Column(name = "city", nullable = false, length = PostalAddress.MAX_CITY_LENGTH)
    private String city;

    @Column(name = "postal_code", nullable = false, length = PostalAddress.MAX_POSTAL_CODE_LENGTH)
    private String postalCode;

    @Column(name = "variable_symbol", nullable = false, length = VariableSymbol.MAX_LENGTH, unique = true)
    private String variableSymbol;

    @Column(name = "preferred_locale", nullable = false, length = 2)
    private String preferredLocale;

    @Column(name = "registered_at", nullable = false)
    private Instant registeredAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected DonorRecordJpaEntity() {
    }

    static DonorRecordJpaEntity fromDomain(DonorRecord record) {
        DonorRecordJpaEntity entity = new DonorRecordJpaEntity();
        entity.donorId = record.id().value();
        entity.type = record.type();
        entity.name = record.name();
        entity.companyIdentifier = record.companyIdentifier().orElse(null);
        entity.street = record.address().street();
        entity.city = record.address().city();
        entity.postalCode = record.address().postalCode();
        entity.variableSymbol = record.variableSymbol().value();
        entity.preferredLocale = record.preferredLocale().tag();
        entity.registeredAt = record.registeredAt();
        entity.updatedAt = record.updatedAt();
        return entity;
    }

    DonorRecord toDomain(Set<LearnedSenderAccount> senderAccounts) {
        return DonorRecord.reconstitute(
                new DonorReference(donorId),
                type,
                name,
                companyIdentifier,
                new PostalAddress(street, city, postalCode),
                new VariableSymbol(variableSymbol),
                LocaleCode.fromTag(preferredLocale),
                senderAccounts,
                registeredAt,
                updatedAt
        );
    }
}
