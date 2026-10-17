package cz.novanadeje.app.contact.infrastructure.persistence;

import cz.novanadeje.app.contact.domain.ContactMessage;
import cz.novanadeje.app.contact.domain.ContactMessageRepository;
import org.springframework.stereotype.Repository;

@Repository
class JpaContactMessageRepository implements ContactMessageRepository {

    private final ContactMessageJpaRepository jpa;

    JpaContactMessageRepository(ContactMessageJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(ContactMessage message) {
        jpa.save(ContactMessageJpaEntity.fromDomain(message));
    }
}
