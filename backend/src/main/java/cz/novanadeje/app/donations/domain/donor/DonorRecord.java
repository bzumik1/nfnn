package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

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
    private final Map<SenderAccountLinkId, SenderAccountLink> senderAccountLinks;
    private final Instant registeredAt;
    private Instant updatedAt;

    private DonorRecord(DonorReference id, DonorType type, String name, String companyIdentifier, PostalAddress address,
                        VariableSymbol variableSymbol, LocaleCode preferredLocale, List<SenderAccountLink> senderAccountLinks,
                        Instant registeredAt, Instant updatedAt) {
        this.id = require(id, "Donor reference");
        this.type = require(type, "Donor type");
        this.name = requireName(name);
        this.companyIdentifier = requireIdentifierMatchingType(this.type, companyIdentifier);
        this.address = require(address, "Address");
        this.variableSymbol = require(variableSymbol, "Variable symbol");
        this.preferredLocale = require(preferredLocale, "Preferred locale");
        this.senderAccountLinks = new LinkedHashMap<>();
        require(senderAccountLinks, "Sender account links").forEach(link -> this.senderAccountLinks.put(link.id(), link));
        requireOneLiveLinkPerAccount();
        this.registeredAt = require(registeredAt, "Registration time");
        this.updatedAt = require(updatedAt, "Update time");
    }

    public static DonorRecord registerPerson(DonorReference id, String name, PostalAddress address, VariableSymbol variableSymbol,
                                             LocaleCode preferredLocale, Instant registeredAt) {
        return new DonorRecord(id, DonorType.PERSON, name, null, address, variableSymbol, preferredLocale, List.of(),
                registeredAt, registeredAt);
    }

    public static DonorRecord registerCompany(DonorReference id, String name, String companyIdentifier, PostalAddress address,
                                              VariableSymbol variableSymbol, LocaleCode preferredLocale, Instant registeredAt) {
        if (companyIdentifier == null || companyIdentifier.isBlank()) {
            throw new IllegalArgumentException("A company needs its identification number");
        }
        return new DonorRecord(id, DonorType.COMPANY, name, companyIdentifier, address, variableSymbol, preferredLocale, List.of(),
                registeredAt, registeredAt);
    }

    public static DonorRecord reconstitute(DonorReference id, DonorType type, String name, String companyIdentifier, PostalAddress address,
                                           VariableSymbol variableSymbol, LocaleCode preferredLocale, List<SenderAccountLink> senderAccountLinks,
                                           Instant registeredAt, Instant updatedAt) {
        return new DonorRecord(id, type, name, companyIdentifier, address, variableSymbol, preferredLocale, senderAccountLinks,
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

    public Optional<SenderAccountLink> linkPairingPaymentsFrom(SenderAccount account, LocalDate bookedOn) {
        require(account, "Sender account");
        return senderAccountLinks.values().stream()
                .filter(link -> link.account().equals(account) && link.pairsPaymentsBookedOn(bookedOn))
                .max(Comparator.comparing(SenderAccountLink::createdAt));
    }

    public Optional<SenderAccountLink> learnSenderAccountFrom(BankPayment payment, Optional<LocalDate> takenOverOn,
                                                              ExcludedSenderAccounts excluded, Instant at) {
        if (!claimsBySymbol(payment)) {
            throw new IllegalArgumentException("A sender account is learned only from a payment carrying the donor's variable symbol");
        }
        require(takenOverOn, "Take-over day");
        require(excluded, "Excluded sender accounts");
        require(at, "Learning time");
        Optional<SenderAccount> sender = payment.sender().filter(account -> !excluded.excludes(account));
        if (sender.isEmpty()) {
            return Optional.empty();
        }
        Optional<SenderAccountLink> awaiting = liveLinkOf(sender.get()).filter(link -> !link.isActive());
        if (awaiting.isPresent()) {
            if (!awaiting.get().isProvedBy(payment)) {
                return Optional.empty();
            }
            awaiting.get().prove(payment, at);
            return awaiting;
        }
        if (hasAnyLinkOf(sender.get())) {
            return Optional.empty();
        }
        SenderAccountLink learned = SenderAccountLink.provedBy(SenderAccountLinkId.newId(at), payment, takenOverOn.map(day -> day.plusDays(1)), at);
        senderAccountLinks.put(learned.id(), learned);
        return Optional.of(learned);
    }

    public Optional<LocalDate> releasedSenderAccountOn(SenderAccount account) {
        require(account, "Sender account");
        return senderAccountLinks.values().stream()
                .filter(link -> link.account().equals(account) && link.provedBy().isPresent())
                .flatMap(link -> link.validTo().stream())
                .max(Comparator.naturalOrder());
    }

    public boolean usesSenderAccount(SenderAccount account) {
        return liveLinkOf(require(account, "Sender account")).filter(SenderAccountLink::isActive).isPresent();
    }

    public SenderAccountLink disconnectSenderAccount(SenderAccountLinkId linkId, LocalDate today, Instant at) {
        SenderAccountLink link = linkOf(linkId);
        link.disconnect(today, at);
        return link;
    }

    public SenderAccountLink reconnectSenderAccount(SenderAccountLinkId linkId, LocalDate today, Instant at) {
        SenderAccountLink disconnected = linkOf(linkId);
        if (disconnected.isLive() || liveLinkOf(disconnected.account()).isPresent()) {
            throw new SenderAccountAlreadyConnected(linkId);
        }
        SenderAccountLink awaiting = SenderAccountLink.awaitingPayment(SenderAccountLinkId.newId(at), disconnected.account(), today, at);
        senderAccountLinks.put(awaiting.id(), awaiting);
        return awaiting;
    }

    public Optional<SenderAccountLink> senderAccountLink(SenderAccountLinkId linkId) {
        return Optional.ofNullable(senderAccountLinks.get(require(linkId, "Sender account link id")));
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
        return senderAccountLinks.values().stream().map(SenderAccountLink::account).collect(Collectors.toUnmodifiableSet());
    }

    public List<SenderAccountLink> senderAccountLinks() {
        return List.copyOf(senderAccountLinks.values());
    }

    public Instant registeredAt() {
        return registeredAt;
    }

    public Instant updatedAt() {
        return updatedAt;
    }

    private SenderAccountLink linkOf(SenderAccountLinkId linkId) {
        return senderAccountLink(linkId).orElseThrow(() -> new SenderAccountLinkNotFound(linkId));
    }

    private Optional<SenderAccountLink> liveLinkOf(SenderAccount account) {
        return senderAccountLinks.values().stream().filter(link -> link.account().equals(account) && link.isLive()).findFirst();
    }

    private boolean hasAnyLinkOf(SenderAccount account) {
        return senderAccountLinks.values().stream().anyMatch(link -> link.account().equals(account));
    }

    private void requireOneLiveLinkPerAccount() {
        Map<SenderAccount, Long> live = senderAccountLinks.values().stream()
                .filter(SenderAccountLink::isLive)
                .collect(Collectors.groupingBy(SenderAccountLink::account, Collectors.counting()));
        if (live.values().stream().anyMatch(count -> count > 1)) {
            throw new IllegalArgumentException("A donor has at most one live link per sender account");
        }
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
