package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKey;
import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKeyRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, JpaCarriedSettingsKeyRepository.class})
class JpaCarriedSettingsKeyRepositoryTest {

    @Autowired
    private CarriedSettingsKeyRepository carried;

    @Test
    @DisplayName("Given nothing carried, when the carried key is read, then there is none")
    void should_find_nothing_when_read_given_nothing_carried() {
        assertThat(carried.find()).isEmpty();
    }

    @Test
    @DisplayName("Given a key carried and later another one, when it is read, then the latest comes back")
    void should_round_trip_when_saved_given_a_later_key() {
        carried.save(new CarriedSettingsKey("v1:first", Instant.parse("2026-10-28T08:00:00Z")));
        CarriedSettingsKey later = new CarriedSettingsKey("v1:" + "A".repeat(CarriedSettingsKey.MAX_LENGTH - 3), Instant.parse("2026-10-29T16:00:00Z"));

        carried.save(later);

        assertThat(carried.find()).contains(later);
    }
}
