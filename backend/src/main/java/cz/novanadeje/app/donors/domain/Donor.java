package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;

public final class Donor {

    public static final int MAX_NAME_LENGTH = 160;

    private final DonorId id;
    private final DonorType type;
    private String name;
    private final CompanyIdentifier companyIdentifier;
    private PostalAddress address;
    private EmailAddress email;
    private PasswordHash passwordHash;
    private final VariableSymbol variableSymbol;
    private LocaleCode preferredLocale;
    private final Set<Role> roles;
    private final Instant registeredAt;
    private Instant emailVerifiedAt;

    private Donor(DonorId id, DonorType type, String name, CompanyIdentifier companyIdentifier, PostalAddress address,
                  EmailAddress email, PasswordHash passwordHash, VariableSymbol variableSymbol, LocaleCode preferredLocale,
                  Set<Role> roles, Instant registeredAt, Instant emailVerifiedAt) {
        this.id = require(id, "Donor id");
        this.type = require(type, "Donor type");
        this.name = requireName(name);
        this.companyIdentifier = companyIdentifier;
        this.address = require(address, "Address");
        this.email = require(email, "Email");
        this.passwordHash = require(passwordHash, "Password hash");
        this.variableSymbol = require(variableSymbol, "Variable symbol");
        this.preferredLocale = require(preferredLocale, "Preferred locale");
        this.roles = EnumSet.copyOf(require(roles, "Roles"));
        this.registeredAt = require(registeredAt, "Registration time");
        this.emailVerifiedAt = emailVerifiedAt;
    }

    public static Donor register(DonorId id, DonorType type, String name, CompanyIdentifier companyIdentifier, PostalAddress address,
                                 EmailAddress email, PasswordHash passwordHash, VariableSymbol variableSymbol, LocaleCode preferredLocale,
                                 Instant registeredAt) {
        if (type == DonorType.COMPANY && companyIdentifier == null) {
            throw new CompanyIdentifierRequired();
        }
        if (type == DonorType.PERSON && companyIdentifier != null) {
            throw new CompanyIdentifierNotAllowed();
        }
        return new Donor(id, type, name, companyIdentifier, address, email, passwordHash, variableSymbol, preferredLocale,
                EnumSet.of(Role.DONOR), registeredAt, null);
    }

    public static Donor reconstitute(DonorId id, DonorType type, String name, CompanyIdentifier companyIdentifier, PostalAddress address,
                                     EmailAddress email, PasswordHash passwordHash, VariableSymbol variableSymbol, LocaleCode preferredLocale,
                                     Set<Role> roles, Instant registeredAt, Instant emailVerifiedAt) {
        return new Donor(id, type, name, companyIdentifier, address, email, passwordHash, variableSymbol, preferredLocale, roles, registeredAt,
                emailVerifiedAt);
    }

    public void verifyEmail(Instant at) {
        if (emailVerifiedAt != null) {
            throw new IllegalStateException("The e-mail of donor " + id + " is already verified");
        }
        this.emailVerifiedAt = require(at, "Verification time");
    }

    public boolean isEmailVerified() {
        return emailVerifiedAt != null;
    }

    public Optional<Instant> emailVerifiedAt() {
        return Optional.ofNullable(emailVerifiedAt);
    }

    public void updateProfile(String newName, PostalAddress newAddress, LocaleCode newLocale) {
        this.name = requireName(newName);
        this.address = require(newAddress, "Address");
        this.preferredLocale = require(newLocale, "Preferred locale");
    }

    public void changePassword(PasswordHash newPasswordHash) {
        this.passwordHash = require(newPasswordHash, "Password hash");
    }

    public void changeEmail(EmailAddress newEmail) {
        if (emailVerifiedAt == null) {
            throw new IllegalStateException("The e-mail of donor " + id + " is not verified yet");
        }
        if (require(newEmail, "Email").equals(email)) {
            throw new EmailUnchanged();
        }
        this.email = newEmail;
    }

    public DonorId id() {
        return id;
    }

    public DonorType type() {
        return type;
    }

    public String name() {
        return name;
    }

    public Optional<CompanyIdentifier> companyIdentifier() {
        return Optional.ofNullable(companyIdentifier);
    }

    public PostalAddress address() {
        return address;
    }

    public EmailAddress email() {
        return email;
    }

    public PasswordHash passwordHash() {
        return passwordHash;
    }

    public VariableSymbol variableSymbol() {
        return variableSymbol;
    }

    public LocaleCode preferredLocale() {
        return preferredLocale;
    }

    public Set<Role> roles() {
        return Set.copyOf(roles);
    }

    public Set<Role> sessionRoles(boolean secondFactorVerified) {
        if (secondFactorVerified || !roles.contains(Role.ADMIN)) {
            return roles();
        }
        EnumSet<Role> granted = EnumSet.copyOf(roles);
        granted.remove(Role.ADMIN);
        return Set.copyOf(granted);
    }

    public boolean isAdministrator() {
        return roles.contains(Role.ADMIN);
    }

    public Instant registeredAt() {
        return registeredAt;
    }

    private static String requireName(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Name is required");
        }
        String trimmed = value.trim();
        if (trimmed.length() > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException("Name must not exceed " + MAX_NAME_LENGTH + " characters");
        }
        return trimmed;
    }

    private static <T> T require(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value;
    }
}
