package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

public final class Passkey {

    public static final int MAX_NAME_LENGTH = 64;
    public static final int MAX_CREDENTIAL_ID_LENGTH = 1366;
    public static final int MAX_RELYING_PARTY_ID_LENGTH = 253;
    public static final Set<String> KNOWN_TRANSPORTS = Set.of("usb", "nfc", "ble", "smart-card", "hybrid", "internal");

    private static final Pattern CREDENTIAL_ID = Pattern.compile("^[A-Za-z0-9_-]{1," + MAX_CREDENTIAL_ID_LENGTH + "}$");
    private static final Pattern CONTROL_CHARACTERS = Pattern.compile("\\p{Cntrl}");

    private final PasskeyId id;
    private final DonorId donorId;
    private final String credentialId;
    private final byte[] credentialData;
    private final List<String> transports;
    private String name;
    private final String relyingPartyId;
    private final Instant createdAt;
    private long signCount;
    private Instant lastUsedAt;

    private Passkey(PasskeyId id, DonorId donorId, String credentialId, byte[] credentialData, long signCount, List<String> transports,
                    String name, String relyingPartyId, Instant createdAt, Instant lastUsedAt) {
        if (id == null || donorId == null || createdAt == null) {
            throw new IllegalArgumentException("A passkey needs an id, its donor and the time it was created");
        }
        if (credentialId == null || !CREDENTIAL_ID.matcher(credentialId).matches()) {
            throw new IllegalArgumentException("A passkey credential id is 1 to " + MAX_CREDENTIAL_ID_LENGTH + " base64url characters");
        }
        if (credentialData == null || credentialData.length == 0) {
            throw new IllegalArgumentException("A passkey needs its public key");
        }
        if (signCount < 0) {
            throw new IllegalArgumentException("A passkey signature counter is never negative");
        }
        this.id = id;
        this.donorId = donorId;
        this.credentialId = credentialId;
        this.credentialData = credentialData.clone();
        this.signCount = signCount;
        this.transports = knownTransports(transports);
        this.name = validName(name);
        this.relyingPartyId = relyingPartyId;
        this.createdAt = createdAt;
        this.lastUsedAt = lastUsedAt;
    }

    public static Passkey register(DonorId donorId, String credentialId, byte[] credentialData, long signCount, Collection<String> transports,
                                   String name, String relyingPartyId, Instant at) {
        if (relyingPartyId == null || relyingPartyId.isBlank()) {
            throw new IllegalArgumentException("A passkey is registered for the host of the site");
        }
        return new Passkey(PasskeyId.newId(at), donorId, credentialId, credentialData, signCount, List.copyOf(transports), name, relyingPartyId,
                at, null);
    }

    public static Passkey reconstitute(PasskeyId id, DonorId donorId, String credentialId, byte[] credentialData, long signCount,
                                       List<String> transports, String name, String relyingPartyId, Instant createdAt, Instant lastUsedAt) {
        return new Passkey(id, donorId, credentialId, credentialData, signCount, transports, name, relyingPartyId, createdAt, lastUsedAt);
    }

    public void recordSignIn(long newSignCount, Instant at) {
        if (newSignCount < 0) {
            throw new IllegalArgumentException("A passkey signature counter is never negative");
        }
        signCount = newSignCount;
        lastUsedAt = at;
    }

    public void rename(String newName) {
        name = validName(newName);
    }

    public boolean belongsTo(DonorId donor) {
        return donorId.equals(donor);
    }

    public PasskeyId id() {
        return id;
    }

    public DonorId donorId() {
        return donorId;
    }

    public String credentialId() {
        return credentialId;
    }

    public byte[] credentialData() {
        return credentialData.clone();
    }

    public long signCount() {
        return signCount;
    }

    public List<String> transports() {
        return transports;
    }

    public String name() {
        return name;
    }

    public Optional<String> relyingPartyId() {
        return Optional.ofNullable(relyingPartyId);
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Optional<Instant> lastUsedAt() {
        return Optional.ofNullable(lastUsedAt);
    }

    private static List<String> knownTransports(List<String> transports) {
        if (transports == null) {
            return List.of();
        }
        return transports.stream().filter(KNOWN_TRANSPORTS::contains).distinct().toList();
    }

    private static String validName(String name) {
        String trimmed = name == null ? "" : name.strip();
        if (trimmed.isEmpty() || trimmed.length() > MAX_NAME_LENGTH || CONTROL_CHARACTERS.matcher(trimmed).find()) {
            throw new IllegalArgumentException("A passkey name is 1 to " + MAX_NAME_LENGTH + " characters without control characters");
        }
        return trimmed;
    }

    @Override
    public String toString() {
        return "Passkey[" + id + ", donor " + donorId + "]";
    }
}
