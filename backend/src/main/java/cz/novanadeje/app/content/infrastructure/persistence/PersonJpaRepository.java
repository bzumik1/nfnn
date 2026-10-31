package cz.novanadeje.app.content.infrastructure.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface PersonJpaRepository extends JpaRepository<PersonJpaEntity, UUID> {

    List<PersonJpaEntity> findAllByOrderByPositionAscCreatedAtAsc();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PersonJpaEntity p order by p.position asc, p.createdAt asc")
    List<PersonJpaEntity> findAllInOrderForUpdate();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PersonJpaEntity p where p.id = :id")
    Optional<PersonJpaEntity> findByIdForUpdate(@Param("id") UUID id);

    boolean existsByPortraitMediaId(UUID portraitMediaId);

    boolean existsByWebSignatureMediaId(UUID webSignatureMediaId);
}
