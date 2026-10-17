package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

public final class DonorRecord {

    public static final int MAX_NAME_LENGTH = 160;
    public static final int COMPANY_IDENTIFIER_LENGTH = 8;

    private static final Pattern COMPANY_IDENTIFIER = Pattern.compile("[0-9]{" + COMPANY_IDENTIFIER_LENGTH + "}");

    private final DonorReference id;
    private final DonorType type;
    private String name;
    private final String companyIdentifier;
    private PostalAddress address;
    private final VariableSymbol variableSymbol;
    private LocaleCode preferredLocale;
    private final Map<SenderAccount, LearnedSenderAccount> senderAccounts;
    private final Instant registeredAt;
    private Instant updatedAt;

    private DonorRecord(DonorReference id, DonorType type, String name, String companyIdentifier, PostalAddress address,
                        VariableSymbol variableSymbol, LocaleCode preferredLocale, Set<LearnedSenderAccount> senderAccounts,
                        Instant registeredAt, Instant updatedAt) {
        this.id = require(id, "Donor reference");
        this.type = require(type, "Donor type");
        this.name = requireName(name);
        this.companyIdentifier = requireIdentifierMatchingType(this.type, companyIdentifier);
        this.address = require(address, "Address");
        this.variableSymbol = require(variableSymbol, "Variable symbol");
        this.preferredLocale = require(preferredLocale, "Preferred locale");
        this.senderAccounts = new LinkedHashMap<>();
        require(senderAccounts, "Sender accounts").forEach(account -> this.senderAccounts.put(account.account(), account));
        this.registeredAt = require(registeredAt, "Registration time");
        this.updatedAt = require(updatedAt, "Update time");
    }

    public static DonorRecord registerPerson(DonorReference id, String name, PostalAddress address, VariableSymbol variableSymbol,
                                             LocaleCode preferredLocale, Instant registeredAt) {
        return new DonorRecord(id, DonorType.PERSON, name, null, address, variableSymbol, preferredLocale, Set.of(),
                registeredAt, registeredAt);
    }

    public static DonorRecord registerCompany(DonorReference id, String name, String companyIdentifier, PostalAddress address,
                                              VariableSymbol variableSymbol, LocaleCode preferredLocale, Instant registeredAt) {
        if (companyIdentifier == null || companyIdentifier.isBlank()) {
            throw new IllegalArgumentException("A company needs its identification number");
        }
        return new DonorRecord(id, DonorType.COMPANY, name, companyIdentifier, address, variableSymbol, preferredLocale, Set.of(),
                registeredAt, registeredAt);
    }

    public static DonorRecord reconstitute(DonorReference id, DonorType type, String name, String companyIdentifier, PostalAddress address,
                                           VariableSymbol variableSymbol, LocaleCode preferredLocale, Set<LearnedSenderAccount> senderAccounts,
                                           Instant registeredAt, Instant updatedAt) {
        return new DonorRecord(id, type, name, companyIdentifier, address, variableSymbol, preferredLocale, senderAccounts,
                registeredAt, updatedAt);
    }

    public void changeProfile(String newName, PostalAddress newAddress, LocaleCode newLocale, Instant at) {
        String checkedName = requireName(newName);
        PostalAddress checkedAddress = require(newAddress, "Address");
        LocaleCode checkedLocale = require(newLocale, "Preferred locale");
        Instant checkedAt = require(at, "Update time");
        this.name = checkedName;
        this.address = checkedAddress;
        this.preferredLocale = checkedLocale;
        this.updatedAt = checkedAt;
    }

    public boolean claimsBySymbol(BankPayment payment) {
        return require(payment, "Payment").matchingVariableSymbol().filter(variableSymbol::equals).isPresent();
    }

    public boolean paysFrom(SenderAccount account) {
        return senderAccounts.containsKey(account);
    }

    public Optional<LearnedSenderAccount> learnSenderAccountFrom(BankPayment payment, Instant at) {
        if (!claimsBySymbol(payment)) {
            throw new IllegalArgumentException("A sender account is learned only from a payment carrying the donor's variable symbol");
        }
        require(at, "Learning time");
        return payment.sender()
                .filter(account -> !paysFrom(account))
                .map(account -> {
                    LearnedSenderAccount learned = new LearnedSenderAccount(account, payment.id(), at);
                    senderAccounts.put(account, learned);
                    return learned;
                });
    }

    public DonorReference id() {
        return id;
    }

    public DonorType type() {
        return type;
    }

    public String name() {
        return name;
    }

    public Optional<String> companyIdentifier() {
        return Optional.ofNullable(companyIdentifier);
    }

    public PostalAddress address() {
        return address;
    }

    public VariableSymbol variableSymbol() {
        return variableSymbol;
    }

    public LocaleCode preferredLocale() {
        return preferredLocale;
    }

    public Set<SenderAccount> senderAccounts() {
        return Set.copyOf(senderAccounts.keySet());
    }

    public Set<LearnedSenderAccount> learnedSenderAccounts() {
        return Set.copyOf(senderAccounts.values());
    }

    public Instant registeredAt() {
        return registeredAt;
    }

    public Instant updatedAt() {
        return updatedAt;
    }

    private static String requireIdentifierMatchingType(DonorType type, String companyIdentifier) {
        if (type == DonorType.PERSON) {
            if (companyIdentifier != null) {
                throw new IllegalArgumentException("A person has no company identification number");
            }
            return null;
        }
        if (companyIdentifier == null || !COMPANY_IDENTIFIER.matcher(companyIdentifier.trim()).matches()) {
            throw new IllegalArgumentException("A company identification number is eight digits: " + companyIdentifier);
        }
        return companyIdentifier.trim();
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
