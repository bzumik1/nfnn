package cz.novanadeje.app.content.infrastructure.persistence;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface NewsArticleJpaRepository extends JpaRepository<NewsArticleJpaEntity, UUID> {

    Optional<NewsArticleJpaEntity> findBySlug(String slug);

    boolean existsBySlugAndIdNot(String slug, UUID id);

    boolean existsByCoverMediaId(UUID coverMediaId);

    @Query("select a from NewsArticleJpaEntity a order by case when a.publishedOn is null then 0 else 1 end, a.publishedOn desc, a.updatedAt desc")
    List<NewsArticleJpaEntity> findAllDraftsFirst();

    @Query("select a from NewsArticleJpaEntity a where a.publishedOn <= :today order by a.publishedOn desc, a.createdAt desc")
    List<NewsArticleJpaEntity> findVisible(LocalDate today, Pageable pageable);

    long countByPublishedOnLessThanEqual(LocalDate today);
}
