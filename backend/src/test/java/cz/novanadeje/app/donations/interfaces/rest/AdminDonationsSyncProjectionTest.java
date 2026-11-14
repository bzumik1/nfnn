package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.admincopy.AdminDonationsRows;
import cz.novanadeje.app.donations.application.sync.AdminDonationsSyncSnapshot;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.application.version.RowVersions;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.infrastructure.json.RowVersionsFixture;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunkEntry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.shared.domain.Money.czk;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class AdminDonationsSyncProjectionTest {

    private static final Instant NOW = Instant.parse("2026-03-10T09:00:00Z");

    private final CountingRowVersions versions = new CountingRowVersions(RowVersionsFixture.canonical());
    private final AdminDonationsSyncProjection projection = new AdminDonationsSyncProjection(JsonMapper.builder().build(),
            new AdminDonationsRows(versions, mock(DonationRepository.class), mock(DonorRecordRepository.class)));

    @Test
    @DisplayName("Given unpaired payments of two months, when a device asks for one month's chunk, then only that month's payments are versioned and the chunk equals the one of the whole copy")
    void should_version_only_the_asked_months_payments_when_one_chunk_is_asked_given_payments_of_two_months() {
        AdminDonationsSyncSnapshot snapshot = snapshotOf(Stream.concat(paymentsOf(LocalDate.of(2026, 1, 1), 30, 1000), paymentsOf(LocalDate.of(2026, 2, 1), 12, 2000)).toList());
        List<SyncChunk> whole = projection.chunksOf(snapshot);
        versions.reset();

        List<SyncChunk> asked = projection.chunksOf(snapshot, List.of("payments:2026-02"));

        assertThat(versions.calls()).isEqualTo(12);
        assertThat(asked).containsExactly(whole.stream().filter(chunk -> chunk.id().equals("payments:2026-02")).findFirst().orElseThrow());
    }

    @Test
    @DisplayName("Given unpaired payments of two months, when the manifest is built, then its entries are those of the whole copy's chunks")
    void should_list_the_entries_of_the_whole_copy_when_the_manifest_is_built_given_payments_of_two_months() {
        AdminDonationsSyncSnapshot snapshot = snapshotOf(Stream.concat(paymentsOf(LocalDate.of(2026, 1, 1), 3, 1000), paymentsOf(LocalDate.of(2026, 2, 1), 2, 2000)).toList());

        assertThat(projection.entriesOf(snapshot)).containsExactlyElementsOf(projection.chunksOf(snapshot).stream().map(SyncChunkEntry::of).toList())
                .extracting(SyncChunkEntry::id).containsExactly("payments:2026-01", "payments:2026-02");
    }

    private static Stream<BankPayment> paymentsOf(LocalDate firstDay, int count, long firstTransaction) {
        return IntStream.range(0, count).mapToObj(index -> payment(firstTransaction + index, firstDay.plusDays(index % 28), czk(10000 + index), Optional.empty(), null));
    }

    private static AdminDonationsSyncSnapshot snapshotOf(List<BankPayment> payments) {
        return new AdminDonationsSyncSnapshot(new DonorReference(UuidV7.generate(NOW)), true, LocalDate.ofInstant(NOW, ZoneOffset.UTC), List.of(), payments,
                List.of(), List.of(), List.of(), List.of(), Optional.empty(), Optional.empty());
    }

    private static final class CountingRowVersions implements RowVersions {

        private final RowVersions delegate;
        private final AtomicInteger calls = new AtomicInteger();

        private CountingRowVersions(RowVersions delegate) {
            this.delegate = delegate;
        }

        @Override
        public String versionOf(List<?> rows) {
            calls.incrementAndGet();
            return delegate.versionOf(rows);
        }

        int calls() {
            return calls.get();
        }

        void reset() {
            calls.set(0);
        }
    }
}
