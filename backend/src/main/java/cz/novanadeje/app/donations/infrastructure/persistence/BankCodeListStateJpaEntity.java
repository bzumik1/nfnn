package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bankcode.BankCodeListState;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;

@Entity
@Table(name = "bank_code_list_state")
class BankCodeListStateJpaEntity {

    static final short SINGLETON_ID = 1;

    @Id
    private Short id;

    @Column(name = "fetched_at")
    private Instant fetchedAt;

    @Column(name = "source_last_modified", length = BankCodeListState.MAX_LAST_MODIFIED_LENGTH)
    private String sourceLastModified;

    @Column(name = "checked_at")
    private Instant checkedAt;

    protected BankCodeListStateJpaEntity() {
    }

    static BankCodeListStateJpaEntity fromDomain(BankCodeListState state) {
        BankCodeListStateJpaEntity entity = new BankCodeListStateJpaEntity();
        entity.id = SINGLETON_ID;
        entity.fetchedAt = state.fetchedAt().orElse(null);
        entity.sourceLastModified = state.sourceLastModified().orElse(null);
        entity.checkedAt = state.checkedAt().orElse(null);
        return entity;
    }

    BankCodeListState toDomain() {
        return new BankCodeListState(Optional.ofNullable(fetchedAt), Optional.ofNullable(sourceLastModified), Optional.ofNullable(checkedAt));
    }
}
