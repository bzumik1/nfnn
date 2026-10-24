package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface PasskeyJpaRepository extends JpaRepository<PasskeyJpaEntity, UUID> {

    Optional<PasskeyJpaEntity> findByCredentialId(String credentialId);

    List<PasskeyJpaEntity> findByDonorIdOrderByCreatedAtAscIdAsc(UUID donorId);

    int countByDonorId(UUID donorId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from PasskeyJpaEntity passkey where passkey.donorId = :donorId")
    int deleteAllByDonorId(@Param("donorId") UUID donorId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PasskeyJpaEntity passkey set passkey.relyingPartyId = :relyingPartyId where passkey.relyingPartyId is null")
    int adoptUnmarked(@Param("relyingPartyId") String relyingPartyId);

    @Query("select distinct passkey.donorId from PasskeyJpaEntity passkey where passkey.relyingPartyId <> :relyingPartyId order by passkey.donorId")
    List<UUID> findDonorsWithKeysOfOtherSites(@Param("relyingPartyId") String relyingPartyId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from PasskeyJpaEntity passkey where passkey.relyingPartyId <> :relyingPartyId")
    int deleteOfOtherSites(@Param("relyingPartyId") String relyingPartyId);
}
