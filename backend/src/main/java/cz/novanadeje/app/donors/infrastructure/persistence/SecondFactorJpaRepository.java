package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

interface SecondFactorJpaRepository extends JpaRepository<SecondFactorJpaEntity, UUID> {

    @Query("select f.donorId from SecondFactorJpaEntity f where f.confirmedAt is not null")
    List<UUID> findDonorIdsWithConfirmedFactor();

    @Modifying(flushAutomatically = true)
    @Query("update SecondFactorJpaEntity f set f.lastUsedStep = :step where f.donorId = :donorId and (f.lastUsedStep is null or f.lastUsedStep < :step)")
    int recordUse(@Param("donorId") UUID donorId, @Param("step") long step);
}
