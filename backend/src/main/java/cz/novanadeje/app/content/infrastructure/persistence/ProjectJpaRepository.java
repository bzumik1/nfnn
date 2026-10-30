package cz.novanadeje.app.content.infrastructure.persistence;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface ProjectJpaRepository extends JpaRepository<ProjectJpaEntity, UUID> {

    Optional<ProjectJpaEntity> findBySlug(String slug);

    boolean existsBySlugAndIdNot(String slug, UUID id);

    String CATEGORY_PRIORITY = "case a.category when 'CHILDREN' then 0 when 'ADULTS' then 1 when 'ANIMALS' then 2 else 3 end";

    @Query("select a from ProjectJpaEntity a order by case when a.publishedOn is null then 0 else 1 end, a.year desc, " + CATEGORY_PRIORITY
            + ", a.publishedOn desc, a.updatedAt desc, a.createdAt desc")
    List<ProjectJpaEntity> findAllDraftsFirst();

    @Query("select a from ProjectJpaEntity a where a.publishedOn <= :today order by a.year desc, " + CATEGORY_PRIORITY + ", a.publishedOn desc, a.createdAt desc")
    List<ProjectJpaEntity> findVisible(LocalDate today, Pageable pageable);

    long countByPublishedOnLessThanEqual(LocalDate today);
}
