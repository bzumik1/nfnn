package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.CompanyIdentifier;
import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.ErasedPersonalData;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;

public final class Donor {

    private final DonorId id;
    private final DonorType type;
    private DonorName name;
    private CompanyIdentifier companyIdentifier;
    private PostalAddress address;
    private EmailAddress email;
    private PasswordHash passwordHash;
    private final VariableSymbol variableSymbol;
    private LocaleCode preferredLocale;
    private final Set<Role> roles;
    private final Instant registeredAt;
    private Instant emailVerifiedAt;
    private Instant erasedAt;

    private Donor(DonorId id, DonorType type, DonorName name, CompanyIdentifier companyIdentifier, PostalAddress address,
                  EmailAddress email, PasswordHash passwordHash, VariableSymbol variableSymbol, LocaleCode preferredLocale,
                  Set<Role> roles, Instant registeredAt, Instant emailVerifiedAt, Instant erasedAt) {
        this.id = require(id, "Donor id");
        this.type = require(type, "Donor type");
        this.name = require(name, "Name");
        this.companyIdentifier = companyIdentifier;
        this.address = require(address, "Address");
        this.email = require(email, "Email");
        this.passwordHash = passwordHash;
        this.variableSymbol = require(variableSymbol, "Variable symbol");
        this.preferredLocale = require(preferredLocale, "Preferred locale");
        this.roles = EnumSet.noneOf(Role.class);
        this.roles.addAll(require(roles, "Roles"));
        this.registeredAt = require(registeredAt, "Registration time");
        this.emailVerifiedAt = emailVerifiedAt;
        this.erasedAt = erasedAt;
    }

    public static Donor register(DonorId id, DonorType type, DonorName name, CompanyIdentifier companyIdentifier, PostalAddress address,
                                 EmailAddress email, PasswordHash passwordHash, VariableSymbol variableSymbol, LocaleCode preferredLocale,
                                 Instant registeredAt) {
        if (type == DonorType.COMPANY && companyIdentifier == null) {
            throw new CompanyIdentifierRequired();
        }
        if (type == DonorType.PERSON && companyIdentifier != null) {
            throw new CompanyIdentifierNotAllowed();
        }
        return new Donor(id, type, name, companyIdentifier, address, email, passwordHash, variableSymbol, preferredLocale,
                EnumSet.of(Role.DONOR), registeredAt, null, null);
    }

    public static Donor reconstitute(DonorId id, DonorType type, DonorName name, CompanyIdentifier companyIdentifier, PostalAddress address,
                                     EmailAddress email, PasswordHash passwordHash, VariableSymbol variableSymbol, LocaleCode preferredLocale,
                                     Set<Role> roles, Instant registeredAt, Instant emailVerifiedAt, Instant erasedAt) {
        return new Donor(id, type, name, companyIdentifier, address, email, passwordHash, variableSymbol, preferredLocale, roles, registeredAt,
                emailVerifiedAt, erasedAt);
    }

    public void erase(Instant at) {
        Instant checkedAt = require(at, "Erasure time");
        if (erasedAt != null) {
            throw new DonorAlreadyErased(id);
        }
        if (isAdministrator()) {
            throw new AdministratorNotErasable(id);
        }
        this.erasedAt = checkedAt;
        replacePersonalData();
    }

    public boolean erasureIncomplete() {
        return erasedAt != null && (!name.equals(ErasedPersonalData.NAME) || companyIdentifier != null || !address.equals(ErasedPersonalData.ADDRESS)
                || !email.equals(ErasedPersonalData.emailFor(id.value())) || passwordHash != null || !roles.isEmpty() || emailVerifiedAt != null);
    }

    public void completeErasure() {
        if (erasedAt == null) {
            throw new IllegalStateException("Donor " + id + " was never erased, so there is no erasure to complete");
        }
        replacePersonalData();
    }

    private void replacePersonalData() {
        this.name = ErasedPersonalData.NAME;
        this.companyIdentifier = null;
        this.address = ErasedPersonalData.ADDRESS;
        this.email = ErasedPersonalData.emailFor(id.value());
        this.passwordHash = null;
        this.roles.clear();
        this.emailVerifiedAt = null;
    }

    public boolean isErased() {
        return erasedAt != null;
    }

    public Optional<Instant> erasedAt() {
        return Optional.ofNullable(erasedAt);
    }

    public void verifyEmail(Instant at) {
        requireNotErased();
        if (emailVerifiedAt != null) {
            throw new EmailAlreadyConfirmed(id);
        }
        this.emailVerifiedAt = require(at, "Verification time");
    }

    public boolean isEmailVerified() {
        return emailVerifiedAt != null;
    }

    public Optional<Instant> emailVerifiedAt() {
        return Optional.ofNullable(emailVerifiedAt);
    }

    public void updateProfile(DonorName newName, PostalAddress newAddress, LocaleCode newLocale) {
        requireNotErased();
        this.name = require(newName, "Name");
        this.address = require(newAddress, "Address");
        this.preferredLocale = require(newLocale, "Preferred locale");
    }

    public void changePassword(PasswordHash newPasswordHash) {
        requireNotErased();
        this.passwordHash = require(newPasswordHash, "Password hash");
    }

    public void removePassword(int passkeys) {
        requireNotErased();
        SignInMethods.of(this, passkeys).withoutPassword();
        this.passwordHash = null;
    }

    public boolean hasPassword() {
        return passwordHash != null;
    }

    public void changeEmail(EmailAddress newEmail) {
        requireNotErased();
        if (emailVerifiedAt == null) {
            throw new EmailNotConfirmed(id);
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

    public DonorName name() {
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

    public Optional<PasswordHash> passwordHash() {
        return Optional.ofNullable(passwordHash);
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

    public void grantAdministration(boolean holdsSecondFactor) {
        requireGrantable();
        if (!holdsSecondFactor) {
            throw new AdministratorWithoutSecondFactor(id);
        }
        roles.add(Role.ADMIN);
    }

    public void grantFirstAdministration() {
        requireGrantable();
        roles.add(Role.ADMIN);
    }

    private void requireGrantable() {
        if (emailVerifiedAt == null) {
            throw new AdministratorEmailNotConfirmed(id);
        }
        if (roles.contains(Role.ADMIN)) {
            throw new AlreadyAdministrator(id);
        }
    }

    public void revokeAdministration() {
        if (!roles.remove(Role.ADMIN)) {
            throw new NotAdministrator(id);
        }
    }

    public Instant registeredAt() {
        return registeredAt;
    }

    private void requireNotErased() {
        if (erasedAt != null) {
            throw new DonorAlreadyErased(id);
        }
    }

    private static <T> T require(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value;
    }
}
