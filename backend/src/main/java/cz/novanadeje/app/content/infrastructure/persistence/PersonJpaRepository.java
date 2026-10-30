package cz.novanadeje.app.content.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

interface PersonJpaRepository extends JpaRepository<PersonJpaEntity, UUID> {

    List<PersonJpaEntity> findAllByOrderByPositionAscCreatedAtAsc();
}
