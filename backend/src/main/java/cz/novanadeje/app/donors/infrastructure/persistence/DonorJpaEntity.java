package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "donor")
public class DonorJpaEntity {

    @Id
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 16)
    private DonorType type;

    @Column(name = "name", nullable = false, length = Donor.MAX_NAME_LENGTH)
    private String name;

    @Column(name = "company_identifier", length = 8)
    private String companyIdentifier;

    @Column(name = "street", nullable = false, length = PostalAddress.MAX_STREET_LENGTH)
    private String street;

    @Column(name = "city", nullable = false, length = PostalAddress.MAX_CITY_LENGTH)
    private String city;

    @Column(name = "postal_code", nullable = false, length = PostalAddress.MAX_POSTAL_CODE_LENGTH)
    private String postalCode;

    @Column(name = "email", nullable = false, length = 254, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "variable_symbol", nullable = false, length = VariableSymbol.MAX_LENGTH, unique = true)
    private String variableSymbol;

    @Column(name = "preferred_locale", nullable = false, length = 2)
    private String preferredLocale;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "donor_role", joinColumns = @JoinColumn(name = "donor_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 16)
    private Set<Role> roles;

    @Column(name = "registered_at", nullable = false)
    private Instant registeredAt;

    @Column(name = "email_verified_at")
    private Instant emailVerifiedAt;

    protected DonorJpaEntity() {
    }

    static DonorJpaEntity fromDomain(Donor donor) {
        DonorJpaEntity entity = new DonorJpaEntity();
        entity.id = donor.id().value();
        entity.type = donor.type();
        entity.name = donor.name();
        entity.companyIdentifier = donor.companyIdentifier().map(CompanyIdentifier::value).orElse(null);
        entity.street = donor.address().street();
        entity.city = donor.address().city();
        entity.postalCode = donor.address().postalCode();
        entity.email = donor.email().value();
        entity.passwordHash = donor.passwordHash().value();
        entity.variableSymbol = donor.variableSymbol().value();
        entity.preferredLocale = donor.preferredLocale().tag();
        entity.roles = EnumSet.copyOf(donor.roles());
        entity.registeredAt = donor.registeredAt();
        entity.emailVerifiedAt = donor.emailVerifiedAt().orElse(null);
        return entity;
    }

    Donor toDomain() {
        return Donor.reconstitute(
                new DonorId(id),
                type,
                name,
                companyIdentifier == null ? null : new CompanyIdentifier(companyIdentifier),
                new PostalAddress(street, city, postalCode),
                new EmailAddress(email),
                new PasswordHash(passwordHash),
                new VariableSymbol(variableSymbol),
                LocaleCode.fromTag(preferredLocale),
                roles,
                registeredAt,
                emailVerifiedAt
        );
    }
}
