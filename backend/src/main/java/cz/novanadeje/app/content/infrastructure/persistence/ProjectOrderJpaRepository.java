package cz.novanadeje.app.content.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

interface ProjectOrderJpaRepository extends JpaRepository<ProjectOrderJpaEntity, Short> {
}
