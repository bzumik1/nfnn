package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository {

    void save(RefreshToken token);

    Optional<RefreshToken> findBySecretHash(String secretHash);

    Optional<RefreshToken> findById(UUID id);

    Optional<RefreshToken> findBySecretHashForUpdate(String secretHash);

    Optional<DonorId> findDonorOfSecretHash(String secretHash);

    void lockSessionsOf(DonorId donorId);

    void recordSuccessor(UUID tokenId, UUID successorId);

    boolean revokeIfUnused(UUID tokenId, Instant at);

    boolean supersedeIfUnused(UUID tokenId, Instant at);

    boolean markUsed(UUID tokenId, Instant at);

    List<RefreshToken> findUsableClientTokensOf(DonorId donorId, Instant now);

    void lockAllOf(DonorId donorId);

    void revokeAllOf(DonorId donorId, Instant at);

    void revokeAllOfDevice(DeviceId deviceId, Instant at);

    void revokeDevicelessBrowserTokensOf(DonorId donorId, Instant at);

    int deleteSpentBefore(Instant cutoff);
}
