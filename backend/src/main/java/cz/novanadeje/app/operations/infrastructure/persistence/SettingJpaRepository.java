package cz.novanadeje.app.operations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

interface SettingJpaRepository extends JpaRepository<SettingJpaEntity, String> {

    @Query("select new cz.novanadeje.app.operations.infrastructure.persistence.SettingRow(s.name, s.value, s.sealed, s.updatedAt) from SettingJpaEntity s")
    List<SettingRow> findAllRows();
}
