package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

interface WrongSecondFactorCodesJpaRepository extends JpaRepository<WrongSecondFactorCodesJpaEntity, UUID> {

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "insert into donor_second_factor_wrong_codes (donor_id, window_started_at, wrong_codes) values (:donorId, :now, 0)"
            + " on conflict (donor_id) do nothing", nativeQuery = true)
    int insertIfMissing(@Param("donorId") UUID donorId, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update WrongSecondFactorCodesJpaEntity w set w.windowStartedAt = :now, w.wrongCodes = 0, w.pausedUntil = null where w.donorId = :donorId"
            + " and ((w.pausedUntil is not null and w.pausedUntil < :now) or (w.pausedUntil is null and w.windowStartedAt < :windowStartsAfter))")
    int restartIfOver(@Param("donorId") UUID donorId, @Param("now") Instant now, @Param("windowStartsAfter") Instant windowStartsAfter);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update WrongSecondFactorCodesJpaEntity w set w.wrongCodes = w.wrongCodes + 1 where w.donorId = :donorId and w.pausedUntil is null"
            + " and w.wrongCodes < :allowed")
    int reserve(@Param("donorId") UUID donorId, @Param("allowed") int allowed);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update WrongSecondFactorCodesJpaEntity w set w.pausedUntil = :until where w.donorId = :donorId and w.pausedUntil is null")
    int pause(@Param("donorId") UUID donorId, @Param("until") Instant until);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update WrongSecondFactorCodesJpaEntity w set w.wrongCodes = w.wrongCodes - 1 where w.donorId = :donorId and w.wrongCodes > 0")
    int release(@Param("donorId") UUID donorId);
}
