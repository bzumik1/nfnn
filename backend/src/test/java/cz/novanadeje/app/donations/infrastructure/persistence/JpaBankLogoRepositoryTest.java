package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoImageId;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoRepository;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import cz.novanadeje.app.donations.domain.banklogo.StoredBankLogoImage;
import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.List;
import java.util.UUID;

import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaBankLogoRepositoryTest {

    private static final BankCode CSAS = new BankCode("0800");
    private static final BankCode KB = new BankCode("0100");
    private static final BankLogoSource CSAS_ARTWORK = new BankLogoSource(CSAS, "https://is1-ssl.mzstatic.com/a/512x512bb.jpg");
    private static final BankLogoSource CSAS_SITE = new BankLogoSource(CSAS, "https://www.csas.cz/icon.png");
    private static final BankLogoSource KB_ARTWORK = new BankLogoSource(KB, "https://is2-ssl.mzstatic.com/b/512x512bb.jpg");
    private static final byte[] WEBP = {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'};

    @Autowired
    private BankLogoRepository repository;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void forgetSeededSources() {
        jdbc.sql("delete from bank_logo").update();
        jdbc.sql("delete from bank_logo_image").update();
    }

    @Test
    @DisplayName("Given a new code, when its source is inserted twice, then the first insert creates the row without an image and the second changes nothing")
    void should_insert_once_when_inserted_twice_given_new_code() {
        assertThat(repository.insertIfAbsent(CSAS_ARTWORK)).isTrue();
        assertThat(repository.insertIfAbsent(CSAS_SITE)).isFalse();
        flushAndClear();

        assertThat(repository.lockForChange(CSAS)).contains(BankLogo.from(CSAS_ARTWORK));
    }

    @Test
    @DisplayName("Given a locked logo, when it is saved with a new image and source, then reading it back gives the image's sha-256, the times and no failure")
    void should_read_back_image_when_saved_given_locked_logo() {
        repository.insertIfAbsent(CSAS_ARTWORK);
        StoredBankLogoImage image = image("1");
        repository.storeImage(image, WEBP);
        BankLogo locked = repository.lockForChange(CSAS).orElseThrow();
        repository.save(locked.from(CSAS_SITE, image, NOW));
        flushAndClear();

        BankLogo stored = repository.find(CSAS).orElseThrow();

        assertThat(stored).isEqualTo(BankLogo.from(CSAS_SITE).fetched(image, NOW));
        assertThat(repository.imageWebp(image.id())).hasValueSatisfying(bytes -> assertThat(bytes).isEqualTo(WEBP));
    }

    @Test
    @DisplayName("Given logos of several banks, when every logo is listed, then they come by code and the list reads no image bytes")
    void should_list_by_code_without_bytes_when_listed_given_several_logos() {
        storeFetched(KB_ARTWORK, image("2"));
        storeFetched(CSAS_ARTWORK, image("1"));
        repository.insertIfAbsent(new BankLogoSource(new BankCode("2010"), "https://www.fio.cz/icon.png"));
        flushAndClear();
        Statistics statistics = entityManager.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        statistics.clear();

        List<BankLogo> logos = repository.findAll();

        assertThat(logos).extracting(logo -> logo.code().value()).containsExactly("0100", "0800", "2010");
        assertThat(logos.get(1).image()).contains(image("1"));
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
        assertThat(statistics.getEntityLoadCount()).isZero();
    }

    @Test
    @DisplayName("Given a logo, when its check is recorded for the source it has, then one row changes, and for another source none")
    void should_record_check_only_when_recorded_given_the_same_source() {
        storeFetched(CSAS_ARTWORK, image("1"));
        flushAndClear();

        assertThat(repository.recordUnchanged(CSAS_SITE, NOW.plusSeconds(60))).isFalse();
        assertThat(repository.recordFailure(CSAS_SITE, BankLogoFailure.TIMEOUT)).isFalse();
        assertThat(repository.recordFailure(CSAS_ARTWORK, BankLogoFailure.TIMEOUT)).isTrue();
        flushAndClear();
        assertThat(repository.find(CSAS).orElseThrow().lastFailure()).contains(BankLogoFailure.TIMEOUT);

        assertThat(repository.recordUnchanged(CSAS_ARTWORK, NOW.plusSeconds(60))).isTrue();
        flushAndClear();
        BankLogo checked = repository.find(CSAS).orElseThrow();
        assertThat(checked.checkedAt()).contains(NOW.plusSeconds(60));
        assertThat(checked.fetchedAt()).contains(NOW);
        assertThat(checked.lastFailure()).isEmpty();
    }

    @Test
    @DisplayName("Given a logo with its image, when the logo and then its image are deleted, then neither is found")
    void should_find_nothing_when_deleted_given_logo_with_image() {
        StoredBankLogoImage image = image("1");
        storeFetched(CSAS_ARTWORK, image);
        flushAndClear();

        repository.delete(CSAS);
        repository.deleteImage(image.id());
        flushAndClear();

        assertThat(repository.find(CSAS)).isEmpty();
        assertThat(repository.imageWebp(image.id())).isEmpty();
    }

    @Test
    @DisplayName("Given a stored row whose address the allow-list no longer admits, when it is read, found, listed or locked, then it comes back with its address marked as no longer allowed")
    void should_read_back_marked_when_read_given_address_no_longer_allowed() {
        StoredBankLogoImage image = image("1");
        repository.storeImage(image, WEBP);
        jdbc.sql("insert into bank_logo (code, source_url, image_id, fetched_at, checked_at) values ('0800', 'https://www.example.com/old-icon.png', ?, now(), now())")
                .param(image.id().value()).update();
        flushAndClear();

        BankLogoSource offList = BankLogoSource.stored(CSAS, "https://www.example.com/old-icon.png");
        assertThat(repository.find(CSAS)).hasValueSatisfying(logo -> {
            assertThat(logo.source()).isEqualTo(offList);
            assertThat(logo.source().allowed()).isFalse();
            assertThat(logo.image()).contains(image);
        });
        assertThat(repository.findAll()).extracting(BankLogo::source).containsExactly(offList);
        assertThat(repository.lockForChange(CSAS)).map(BankLogo::source).contains(offList);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "insert into bank_logo (code, source_url) values ('800', 'https://www.csas.cz/a.png')",
            "insert into bank_logo (code, source_url) values ('0800', 'http://www.csas.cz/a.png')",
            "insert into bank_logo (code, source_url) values ('0800', 'https://www.csas.cz/a b.png')",
            "insert into bank_logo (code, source_url, last_failure) values ('0800', 'https://www.csas.cz/a.png', 'broken')",
            "insert into bank_logo (code, source_url, fetched_at) values ('0800', 'https://www.csas.cz/a.png', now())",
            "insert into bank_logo_image (id, sha256, webp) values (gen_random_uuid(), 'XYZ', '\\x00')",
            "insert into bank_logo_image (id, sha256, webp) values (gen_random_uuid(), repeat('a', 64), '')",
            "insert into bank_logo_image (id, sha256, webp) values (gen_random_uuid(), repeat('a', 64), decode(repeat('00', 65537), 'hex'))"})
    @DisplayName("Given a row the domain never writes, when it is inserted, then the database refuses it")
    void should_refuse_row_when_inserted_given_broken_invariant(String insert) {
        assertThatThrownBy(() -> jdbc.sql(insert).update()).isInstanceOf(RuntimeException.class);
    }

    @Test
    @DisplayName("Given one image, when two logos point at it, then the database refuses the second")
    void should_refuse_second_logo_when_linked_given_one_image() {
        StoredBankLogoImage image = image("1");
        storeFetched(CSAS_ARTWORK, image);
        flushAndClear();

        assertThatThrownBy(() -> jdbc.sql("insert into bank_logo (code, source_url, image_id, fetched_at) values ('0100', 'https://www.kb.cz/a.png', ?, now())")
                .param(image.id().value()).update()).isInstanceOf(RuntimeException.class);
    }

    private void storeFetched(BankLogoSource source, StoredBankLogoImage image) {
        repository.insertIfAbsent(source);
        repository.storeImage(image, WEBP);
        repository.save(repository.lockForChange(source.bank()).orElseThrow().fetched(image, NOW));
        entityManager.flush();
    }

    private static StoredBankLogoImage image(String digit) {
        return new StoredBankLogoImage(new BankLogoImageId(UUID.nameUUIDFromBytes(digit.getBytes())), digit.repeat(64));
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
