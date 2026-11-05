package cz.novanadeje.app.operations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

interface PushKeyJpaRepository extends JpaRepository<PushKeyJpaEntity, Short> {

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "insert into operations_push_key (id, public_key, sealed_private_key, created_at) values (1, :publicKey, :sealedPrivateKey, :createdAt) "
            + "on conflict (id) do nothing", nativeQuery = true)
    int insertIfAbsent(@Param("publicKey") String publicKey, @Param("sealedPrivateKey") String sealedPrivateKey, @Param("createdAt") Instant createdAt);
}
