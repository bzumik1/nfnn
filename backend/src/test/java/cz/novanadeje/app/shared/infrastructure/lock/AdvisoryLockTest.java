package cz.novanadeje.app.shared.infrastructure.lock;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

class AdvisoryLockTest {

    @Test
    @DisplayName("Given every advisory lock of the backend, when their keys are compared, then no two locks share a key")
    void should_find_no_shared_key_when_compared_given_every_advisory_lock() {
        Map<Long, Long> locksPerKey = Arrays.stream(AdvisoryLock.values())
                .collect(Collectors.groupingBy(AdvisoryLock::key, Collectors.counting()));

        assertThat(locksPerKey).allSatisfy((key, locks) -> assertThat(locks).as("locks with the key %d", key).isEqualTo(1L));
    }

    @Test
    @DisplayName("Given the locks the documentation names, when their keys are read, then the pairing, push subscription and report settings locks keep theirs")
    void should_keep_the_documented_keys_when_read_given_the_named_locks() {
        Map<AdvisoryLock, Long> keys = Arrays.stream(AdvisoryLock.values()).collect(Collectors.toMap(Function.identity(), AdvisoryLock::key));

        assertThat(keys).containsEntry(AdvisoryLock.PAIRING, 20261022L)
                .containsEntry(AdvisoryLock.PUSH_SUBSCRIPTION_WRITES, 20261105L)
                .containsEntry(AdvisoryLock.REPORT_SETTINGS_CHANGES, 20261106L)
                .containsEntry(AdvisoryLock.OPERATIONAL_ALERT_CHANGES, 20261107L);
    }
}
