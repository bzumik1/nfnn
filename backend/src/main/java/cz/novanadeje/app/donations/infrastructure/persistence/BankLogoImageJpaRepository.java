package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

interface BankLogoImageJpaRepository extends JpaRepository<BankLogoImageJpaEntity, UUID> {

    @Query("select image.sha256 from BankLogoImageJpaEntity image where image.id = :id")
    Optional<String> findSha256(@Param("id") UUID id);

    @Query("select image.webp from BankLogoImageJpaEntity image where image.id = :id")
    Optional<byte[]> findWebp(@Param("id") UUID id);

    @Modifying(flushAutomatically = true)
    @Query("delete from BankLogoImageJpaEntity image where image.id = :id")
    int deleteImage(@Param("id") UUID id);
}
