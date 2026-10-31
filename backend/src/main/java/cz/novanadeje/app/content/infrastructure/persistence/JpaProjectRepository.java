package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectId;
import cz.novanadeje.app.content.domain.project.ProjectOrder;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import cz.novanadeje.app.content.domain.Slug;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
class JpaProjectRepository implements ProjectRepository {

    private final ProjectJpaRepository jpa;

    JpaProjectRepository(ProjectJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(Project article) {
        jpa.save(ProjectJpaEntity.fromDomain(article));
    }

    @Override
    public Optional<Project> findById(ProjectId id) {
        return jpa.findById(id.value()).map(ProjectJpaEntity::toDomain);
    }

    @Override
    public Optional<Project> findBySlug(Slug slug) {
        return jpa.findBySlug(slug.value()).map(ProjectJpaEntity::toDomain);
    }

    @Override
    public boolean isSlugTakenByAnother(Slug slug, ProjectId except) {
        return jpa.existsBySlugAndIdNot(slug.value(), except.value());
    }

    @Override
    public List<Project> findAllDraftsFirst(ProjectOrder order) {
        return jpa.findAllDraftsFirst(categoryFirst(order), categoryWithinYear(order)).stream().map(ProjectJpaEntity::toDomain).toList();
    }

    @Override
    public List<Project> findVisible(LocalDate today, ProjectOrder order, int offset, int limit) {
        if (offset % limit != 0) {
            throw new IllegalArgumentException("The offset is a multiple of the limit");
        }
        return jpa.findVisible(today, categoryFirst(order), categoryWithinYear(order), PageRequest.of(offset / limit, limit)).stream()
                .map(ProjectJpaEntity::toDomain).toList();
    }

    @Override
    public long countVisible(LocalDate today) {
        return jpa.countByPublishedOnLessThanEqual(today);
    }

    @Override
    public void delete(ProjectId id) {
        jpa.deleteById(id.value());
    }

    private static boolean categoryFirst(ProjectOrder order) {
        return order == ProjectOrder.CATEGORY_THEN_YEAR;
    }

    private static boolean categoryWithinYear(ProjectOrder order) {
        return order == ProjectOrder.YEAR_THEN_CATEGORY;
    }
}
