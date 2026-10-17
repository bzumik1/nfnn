package cz.novanadeje.app.contact.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ContactMessageJpaRepository extends JpaRepository<ContactMessageJpaEntity, UUID> {
}
